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

async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query, variables }),
    });
  } catch {
    throw new Error("Couldn't reach AniList. Try again.");
  }
  if (!res.ok) {
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

  return (data.Page.media ?? []).map((m) => ({
    externalSource: "anilist" as const,
    externalId: String(m.id),
    kind: "anime" as const,
    title: pickTitle(m.title),
    posterUrl: pickCover(m),
    overview: stripHtml(m.description),
    year: pickYear(m),
    episodeCount: m.episodes,
  }));
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

  return (data.Page.media ?? []).map((m) => ({
    externalSource: "anilist" as const,
    externalId: String(m.id),
    kind: "movie" as const,
    title: pickTitle(m.title),
    posterUrl: pickCover(m),
    overview: stripHtml(m.description),
    year: pickYear(m),
    episodeCount: null,
  }));
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

export async function fetchAnime(id: number): Promise<AniListMedia> {
  const data = await graphql<{ Media: AniListMedia | null }>(
    `query ($id: Int) {
      Media(id: $id, type: ANIME) { ${MEDIA_FIELDS} }
    }`,
    { id }
  );
  if (!data.Media) {
    throw new Error("AniList title not found.");
  }
  return data.Media;
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

  const cache = new Map<number, AniListMedia>();
  cache.set(start.id, start);

  async function get(id: number): Promise<AniListMedia> {
    const hit = cache.get(id);
    if (hit) return hit;
    const media = await fetchAnime(id);
    cache.set(id, media);
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
