import type { SearchResultItem, Trailer } from "../../types/shared";
import { trailerFromSite } from "./trailerFormat";

const ENDPOINT = "https://graphql.anilist.co";
const TV_FORMATS = new Set(["TV", "TV_SHORT", "OVA", "ONA"]);
const CHAIN_CAP = 15;

export interface AniListTitle {
  romaji: string | null;
  english: string | null;
}

export interface AniListMedia {
  id: number;
  title: AniListTitle;
  coverImage: { extraLarge: string | null; large: string | null } | null;
  description: string | null;
  episodes: number | null;
  format: string | null;
  seasonYear: number | null;
  startDate: { year: number | null } | null;
  streamingEpisodes: { title: string | null }[] | null;
  relations: {
    edges: {
      relationType: string;
      node: {
        id: number;
        type: string;
        format: string | null;
        title: AniListTitle;
        episodes: number | null;
        coverImage: { large: string | null } | null;
        seasonYear: number | null;
        startDate: { year: number | null } | null;
      } | null;
    }[];
  } | null;
}

const MEDIA_FIELDS = `
  id
  title { romaji english }
  coverImage { extraLarge large }
  description(asHtml: false)
  episodes
  format
  seasonYear
  startDate { year }
  streamingEpisodes { title }
  relations {
    edges {
      relationType
      node {
        id
        type
        format
        title { romaji english }
        episodes
        coverImage { large }
        seasonYear
        startDate { year }
      }
    }
  }
`;

const REQUEST_GAP_MS = 350;
const ATTEMPT_TIMEOUT_MS = 12_000;
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = [1000, 2000, 4000];
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
const BUSY_MESSAGE = "AniList is busy. Wait a few seconds and try again.";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryAfterMs(res: Response, fallback: number): number {
  const raw = res.headers.get("Retry-After");
  if (!raw) return fallback;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.max(fallback, seconds * 1000);
  const date = Date.parse(raw);
  if (!Number.isNaN(date)) return Math.max(fallback, date - Date.now());
  return fallback;
}

class RetryableAniListError extends Error {
  retryAfterMs: number;
  status: number | null;

  constructor(message: string, retryAfterMs: number, status: number | null) {
    super(message);
    this.name = "RetryableAniListError";
    this.retryAfterMs = retryAfterMs;
    this.status = status;
  }
}

let graphqlQueue: Promise<void> = Promise.resolve();
let lastGraphqlStart = 0;

function enqueueGraphql<T>(task: () => Promise<T>): Promise<T> {
  const run = async () => {
    const wait = Math.max(0, REQUEST_GAP_MS - (Date.now() - lastGraphqlStart));
    if (wait) await delay(wait);
    lastGraphqlStart = Date.now();
    return task();
  };
  const result = graphqlQueue.then(run, run);
  graphqlQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

async function graphqlOnce<T>(
  query: string,
  variables: Record<string, unknown>,
  closeConnection: boolean
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (closeConnection) headers.Connection = "close";

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    throw new RetryableAniListError(
      timedOut ? BUSY_MESSAGE : "Couldn't reach AniList. Try again.",
      RETRY_BACKOFF_MS[0],
      timedOut ? 504 : null
    );
  }

  if (!res.ok) {
    if (RETRYABLE_STATUS.has(res.status)) {
      throw new RetryableAniListError(BUSY_MESSAGE, retryAfterMs(res, RETRY_BACKOFF_MS[0]), res.status);
    }
    throw new Error(`AniList request failed (${res.status}).`);
  }

  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) {
    throw new Error(json.errors[0]?.message || "AniList returned an error.");
  }
  if (!json.data) {
    throw new Error("AniList returned no data.");
  }
  return json.data;
}

async function graphqlWithRetry<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await graphqlOnce<T>(query, variables, attempt > 0);
    } catch (err) {
      lastError = err;
      const retryable = err instanceof RetryableAniListError;
      if (!retryable || attempt === MAX_RETRIES) break;
      const backoff = RETRY_BACKOFF_MS[Math.min(attempt, RETRY_BACKOFF_MS.length - 1)];
      await delay(Math.max(backoff, err.retryAfterMs));
    }
  }
  if (lastError instanceof RetryableAniListError) {
    throw new Error(lastError.message);
  }
  if (lastError instanceof Error) throw lastError;
  throw new Error(BUSY_MESSAGE);
}

async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  return enqueueGraphql(() => graphqlWithRetry(query, variables));
}

export function pickTitle(title: AniListTitle): string {
  return title.english || title.romaji || "Untitled";
}

export function pickYear(media: Pick<AniListMedia, "seasonYear" | "startDate">): number | null {
  return media.seasonYear ?? media.startDate?.year ?? null;
}

export function pickCover(media: Pick<AniListMedia, "coverImage">): string | null {
  return media.coverImage?.extraLarge || media.coverImage?.large || null;
}

export function stripHtml(html: string | null): string | null {
  if (!html) return null;
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text || null;
}

export function isTvLike(format: string | null | undefined): boolean {
  return !!format && TV_FORMATS.has(format);
}

export async function searchAnime(term: string): Promise<SearchResultItem[]> {
  const data = await graphql<{
    Page: { media: AniListMedia[] | null };
  }>(
    `query ($search: String) {
      Page(page: 1, perPage: 10) {
        media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
          ${MEDIA_FIELDS}
        }
      }
    }`,
    { search: term }
  );

  return (data.Page.media ?? []).map((m) => {
    rememberMedia(m);
    return {
      externalSource: "anilist" as const,
      externalId: String(m.id),
      kind: "anime" as const,
      title: pickTitle(m.title),
      posterUrl: pickCover(m),
      overview: stripHtml(m.description),
      year: pickYear(m),
      episodeCount: m.episodes,
    };
  });
}

export async function searchAniListMovies(term: string): Promise<SearchResultItem[]> {
  const data = await graphql<{
    Page: { media: AniListMedia[] | null };
  }>(
    `query ($search: String) {
      Page(page: 1, perPage: 10) {
        media(search: $search, type: ANIME, format: MOVIE, sort: SEARCH_MATCH) {
          ${MEDIA_FIELDS}
        }
      }
    }`,
    { search: term }
  );

  return (data.Page.media ?? []).map((m) => {
    rememberMedia(m);
    return {
      externalSource: "anilist" as const,
      externalId: String(m.id),
      kind: "movie" as const,
      title: pickTitle(m.title),
      posterUrl: pickCover(m),
      overview: stripHtml(m.description),
      year: pickYear(m),
      episodeCount: null,
    };
  });
}

export async function fetchAniListTrailer(id: string): Promise<Trailer | null> {
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) return null;
  const data = await graphql<{
    Media: { trailer: { id: string | null; site: string | null } | null } | null;
  }>(
    `query ($id: Int) {
      Media(id: $id) { trailer { id site } }
    }`,
    { id: numericId }
  );
  return trailerFromSite(data.Media?.trailer?.site, data.Media?.trailer?.id);
}

export function mediaToSearchResult(m: AniListMedia): SearchResultItem {
  const isMovie = m.format === "MOVIE";
  return {
    externalSource: "anilist",
    externalId: String(m.id),
    kind: isMovie ? "movie" : "anime",
    title: pickTitle(m.title),
    posterUrl: pickCover(m),
    overview: stripHtml(m.description),
    year: pickYear(m),
    episodeCount: isMovie ? null : m.episodes,
  };
}

export async function fetchAniListDetails(id: string): Promise<SearchResultItem> {
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    throw new Error("AniList title not found.");
  }
  const media = await fetchAnime(numericId);
  return mediaToSearchResult(media);
}

const mediaCache = new Map<number, AniListMedia>();

function rememberMedia(media: AniListMedia): AniListMedia {
  mediaCache.set(media.id, media);
  return media;
}

export async function fetchAnime(id: number): Promise<AniListMedia> {
  const hit = mediaCache.get(id);
  if (hit) return hit;
  const data = await graphql<{ Media: AniListMedia | null }>(
    `query ($id: Int) {
      Media(id: $id, type: ANIME) { ${MEDIA_FIELDS} }
    }`,
    { id }
  );
  if (!data.Media) {
    throw new Error("AniList title not found.");
  }
  return rememberMedia(data.Media);
}

const TREE_DEPTH = 10;

interface ChainNode {
  id: number;
  type: string | null;
  format: string | null;
  relations: {
    edges: {
      relationType: string;
      node: ChainNode | null;
    }[];
  } | null;
}

function relationSelection(depth: number): string {
  if (depth <= 0) return "id type format";
  return `id type format
    relations {
      edges {
        relationType
        node { ${relationSelection(depth - 1)} }
      }
    }`;
}

function relatedNode(node: ChainNode, type: "PREQUEL" | "SEQUEL"): ChainNode | null {
  const match = (node.relations?.edges ?? []).find(
    (e) => e.relationType === type && e.node?.type === "ANIME" && isTvLike(e.node.format)
  );
  return match?.node ?? null;
}

function orderedTvChainIds(start: ChainNode): number[] {
  let root = start;
  for (let i = 0; i < CHAIN_CAP; i++) {
    const pre = relatedNode(root, "PREQUEL");
    if (!pre || pre.id === root.id) break;
    root = pre;
  }
  const ids = [root.id];
  let current = root;
  while (ids.length < CHAIN_CAP) {
    const seq = relatedNode(current, "SEQUEL");
    if (!seq || ids.includes(seq.id)) break;
    ids.push(seq.id);
    current = seq;
  }
  return ids;
}

async function fetchRelationTree(startId: number): Promise<ChainNode> {
  const data = await graphql<{ Media: ChainNode | null }>(
    `query ($id: Int) {
      Media(id: $id, type: ANIME) { ${relationSelection(TREE_DEPTH)} }
    }`,
    { id: startId }
  );
  if (!data.Media) throw new Error("AniList title not found.");
  return data.Media;
}

async function fetchAnimeMany(ids: number[]): Promise<AniListMedia[]> {
  const unique = [...new Set(ids)].filter((id) => Number.isInteger(id) && id > 0);
  if (unique.length === 0) return [];
  if (unique.length === 1) return [await fetchAnime(unique[0])];

  const aliases = unique
    .map((id, i) => `m${i}: Media(id: ${id}, type: ANIME) { ${MEDIA_FIELDS} }`)
    .join("\n");
  const data = await graphql<Record<string, AniListMedia | null>>(`query { ${aliases} }`, {});
  const out: AniListMedia[] = [];
  for (let i = 0; i < unique.length; i++) {
    const media = data[`m${i}`];
    if (media) out.push(rememberMedia(media));
  }
  return out;
}

function related(
  media: AniListMedia,
  type: "PREQUEL" | "SEQUEL"
): { id: number; format: string | null } | null {
  const edges = media.relations?.edges ?? [];
  const match = edges.find(
    (e) =>
      e.relationType === type &&
      e.node?.type === "ANIME" &&
      isTvLike(e.node.format)
  );
  return match?.node ? { id: match.node.id, format: match.node.format } : null;
}

export async function walkSeasonChain(startId: number): Promise<AniListMedia[]> {
  const start = await fetchAnime(startId);
  if (!isTvLike(start.format)) {
    return [start];
  }

  const byId = new Map<number, AniListMedia>();
  byId.set(start.id, start);

  const hasNeighbor = related(start, "PREQUEL") || related(start, "SEQUEL");
  if (hasNeighbor) {
    try {
      const tree = await fetchRelationTree(start.id);
      const ids = orderedTvChainIds(tree);
      const missing = ids.filter((id) => !byId.has(id));
      if (missing.length > 0) {
        for (const media of await fetchAnimeMany(missing)) {
          byId.set(media.id, media);
        }
      }
      const batched = ids.map((id) => byId.get(id));
      if (batched.every((m): m is AniListMedia => Boolean(m)) && batched.length > 0) {
        let current = batched[batched.length - 1];
        while (current && batched.length < CHAIN_CAP) {
          const seq = related(current, "SEQUEL");
          if (!seq || batched.some((m) => m.id === seq.id)) break;
          const full = await fetchAnime(seq.id);
          batched.push(full);
          current = full;
        }
        return batched;
      }
    } catch {
      /* sequential fallback below */
    }
  }

  async function get(id: number): Promise<AniListMedia> {
    const hit = byId.get(id);
    if (hit) return hit;
    const media = await fetchAnime(id);
    byId.set(id, media);
    return media;
  }

  let root = start;
  for (let i = 0; i < CHAIN_CAP; i++) {
    const pre = related(root, "PREQUEL");
    if (!pre || !isTvLike(pre.format) || pre.id === root.id) break;
    root = await get(pre.id);
  }

  const chain: AniListMedia[] = [root];
  let current = root;
  while (chain.length < CHAIN_CAP) {
    const seq = related(current, "SEQUEL");
    if (!seq || !isTvLike(seq.format)) break;
    if (chain.some((m) => m.id === seq.id)) break;
    const full = await get(seq.id);
    chain.push(full);
    current = full;
  }
  return chain;
}

export async function fetchAniListRecommendations(id: string): Promise<{ item: SearchResultItem; strength: number }[]> {
  const data = await graphql<{
    Media: {
      recommendations: {
        nodes: {
          rating: number | null;
          mediaRecommendation: AniListMedia | null;
        }[] | null;
      } | null;
    } | null;
  }>(
    `query ($id: Int) {
      Media(id: $id) {
        recommendations(sort: RATING_DESC, page: 1, perPage: 10) {
          nodes {
            rating
            mediaRecommendation {
              ${MEDIA_FIELDS}
            }
          }
        }
      }
    }`,
    { id: Number(id) }
  );

  const nodes = data.Media?.recommendations?.nodes ?? [];
  const out: { item: SearchResultItem; strength: number }[] = [];
  for (const node of nodes) {
    const m = node.mediaRecommendation;
    if (!m) continue;
    rememberMedia(m);
    const isMovie = m.format === "MOVIE";
    out.push({
      strength: Math.max(1, node.rating ?? 1),
      item: {
        externalSource: "anilist",
        externalId: String(m.id),
        kind: isMovie ? "movie" : "anime",
        title: pickTitle(m.title),
        posterUrl: pickCover(m),
        overview: stripHtml(m.description),
        year: pickYear(m),
        episodeCount: isMovie ? null : m.episodes,
      },
    });
  }
  return out;
}

export function episodeCountFor(media: AniListMedia): number {
  return media.episodes ?? media.streamingEpisodes?.length ?? 12;
}
