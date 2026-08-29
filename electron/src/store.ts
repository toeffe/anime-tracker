import { randomUUID } from "crypto";
import type {
  AddMediaResult,
  AppSettings,
  Episode,
  MediaItem,
  MediaKind,
  SearchResultItem,
  Season,
  Trailer,
  WatchStatus,
} from "../types/shared";
import { getDb, getDbPath, withTransaction } from "./db";
import {
  episodeCountFor,
  fetchAnime,
  fetchAniListRecommendations,
  fetchAniListDetails,
  pickCover,
  pickTitle,
  searchAniListMovies,
  searchAnime,
  stripHtml,
  walkSeasonChain,
  type AniListMedia,
} from "./providers/anilist";
import {
  fetchJikanAnime,
  fetchJikanRecommendations,
  searchJikanAnime,
  searchJikanMovies,
} from "./providers/jikan";
import { raceSources } from "./providers/merge";
import { lookupTrailer as fetchTrailer } from "./providers/trailer";
import { searchWikidataFilms, fetchWikidataFilm } from "./providers/wikidata";

interface MediaRow {
  id: string;
  kind: MediaKind;
  title: string;
  poster_url: string | null;
  overview: string | null;
  status: WatchStatus;
  rating: number | null;
  watched: number;
  external_source: MediaItem["externalSource"];
  external_id: string | null;
  created_at: string;
  updated_at: string;
}

interface SeasonRow {
  id: string;
  media_id: string;
  number: number;
  title: string | null;
  episode_count: number;
  rating: number | null;
  external_id: string | null;
}

interface EpisodeRow {
  id: string;
  season_id: string;
  number: number;
  title: string | null;
  watched: number;
  rating: number | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function rowToMedia(row: MediaRow, seasons: Season[]): MediaItem {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    posterUrl: row.poster_url,
    overview: row.overview,
    status: row.status,
    rating: row.rating,
    watched: row.watched === 1,
    externalSource: row.external_source,
    externalId: row.external_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    seasons,
  };
}

function assembleSeasons(seasonRows: SeasonRow[], episodeRows: EpisodeRow[]): Map<string, Season[]> {
  const episodesBySeason = new Map<string, Episode[]>();
  for (const ep of episodeRows) {
    const list = episodesBySeason.get(ep.season_id) ?? [];
    list.push({
      id: ep.id,
      seasonId: ep.season_id,
      number: ep.number,
      title: ep.title,
      watched: ep.watched === 1,
      rating: ep.rating,
    });
    episodesBySeason.set(ep.season_id, list);
  }

  const seasonsByMedia = new Map<string, Season[]>();
  for (const s of seasonRows) {
    const episodes = (episodesBySeason.get(s.id) ?? []).sort((a, b) => a.number - b.number);
    const season: Season = {
      id: s.id,
      mediaId: s.media_id,
      number: s.number,
      title: s.title,
      episodeCount: s.episode_count,
      rating: s.rating,
      externalId: s.external_id,
      episodes,
    };
    const list = seasonsByMedia.get(s.media_id) ?? [];
    list.push(season);
    seasonsByMedia.set(s.media_id, list);
  }
  for (const list of seasonsByMedia.values()) {
    list.sort((a, b) => a.number - b.number);
  }
  return seasonsByMedia;
}

function hydrateAll(): MediaItem[] {
  const db = getDb();
  const mediaRows = db.prepare("SELECT * FROM media ORDER BY updated_at DESC").all() as MediaRow[];
  const seasonRows = db.prepare("SELECT * FROM seasons ORDER BY number ASC").all() as SeasonRow[];
  const episodeRows = db.prepare("SELECT * FROM episodes ORDER BY number ASC").all() as EpisodeRow[];
  const seasonsByMedia = assembleSeasons(seasonRows, episodeRows);
  return mediaRows.map((row) => rowToMedia(row, seasonsByMedia.get(row.id) ?? []));
}

function hydrateOne(id: string): MediaItem | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM media WHERE id = ?").get(id) as MediaRow | undefined;
  if (!row) return null;
  const seasonRows = db.prepare("SELECT * FROM seasons WHERE media_id = ? ORDER BY number ASC").all(id) as SeasonRow[];
  const ids = seasonRows.map((s) => s.id);
  let episodeRows: EpisodeRow[] = [];
  if (ids.length > 0) {
    const placeholders = ids.map(() => "?").join(", ");
    episodeRows = db
      .prepare(`SELECT * FROM episodes WHERE season_id IN (${placeholders}) ORDER BY number ASC`)
      .all(...ids) as EpisodeRow[];
  }
  const seasonsByMedia = assembleSeasons(seasonRows, episodeRows);
  return rowToMedia(row, seasonsByMedia.get(id) ?? []);
}

function requireMedia(id: string): MediaItem {
  const item = hydrateOne(id);
  if (!item) throw new Error(`Media ${id} not found`);
  return item;
}

function findEpisode(episodeId: string): { media: MediaItem; season: Season; episode: Episode } {
  const db = getDb();
  const ep = db.prepare("SELECT * FROM episodes WHERE id = ?").get(episodeId) as EpisodeRow | undefined;
  if (!ep) throw new Error(`Episode ${episodeId} not found`);
  const season = db.prepare("SELECT * FROM seasons WHERE id = ?").get(ep.season_id) as SeasonRow | undefined;
  if (!season) throw new Error(`Season ${ep.season_id} not found`);
  const media = requireMedia(season.media_id);
  const seasonObj = media.seasons.find((s) => s.id === season.id);
  const episodeObj = seasonObj?.episodes.find((e) => e.id === episodeId);
  if (!seasonObj || !episodeObj) throw new Error(`Episode ${episodeId} not found`);
  return { media, season: seasonObj, episode: episodeObj };
}

function recomputeAndPersist(mediaId: string) {
  const media = requireMedia(mediaId);
  if (media.status === "dropped") {
    getDb().prepare("UPDATE media SET updated_at = ? WHERE id = ?").run(nowIso(), mediaId);
    return;
  }

  let status: WatchStatus = media.status;
  let watched = media.watched;
  if (media.kind === "movie") {
    status = media.watched ? "completed" : "planned";
  } else {
    const all = media.seasons.flatMap((s) => s.episodes);
    if (all.length > 0) {
      const watchedCount = all.filter((e) => e.watched).length;
      if (watchedCount === 0) status = "planned";
      else if (watchedCount === all.length) status = "completed";
      else status = "watching";
    }
    watched = status === "completed";
  }

  getDb()
    .prepare("UPDATE media SET status = ?, watched = ?, updated_at = ? WHERE id = ?")
    .run(status, watched ? 1 : 0, nowIso(), mediaId);
}

function findByExternalIds(source: string, ids: string[]): MediaItem | null {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return null;
  const db = getDb();
  const placeholders = unique.map(() => "?").join(", ");
  const row = db
    .prepare(
      `SELECT id FROM media
       WHERE (external_source = ? AND external_id IN (${placeholders}))
          OR id IN (SELECT media_id FROM seasons WHERE external_id IN (${placeholders}))
       LIMIT 1`
    )
    .get(source, ...unique, ...unique) as { id: string } | undefined;
  return row ? hydrateOne(row.id) : null;
}

function insertMedia(item: {
  id: string;
  kind: MediaKind;
  title: string;
  posterUrl: string | null;
  overview: string | null;
  status: WatchStatus;
  rating: number | null;
  watched: boolean;
  externalSource: MediaItem["externalSource"];
  externalId: string | null;
  createdAt: string;
  updatedAt: string;
}) {
  getDb()
    .prepare(
      `INSERT INTO media (
        id, kind, title, poster_url, overview, status, rating, watched,
        external_source, external_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      item.id,
      item.kind,
      item.title,
      item.posterUrl,
      item.overview,
      item.status,
      item.rating,
      item.watched ? 1 : 0,
      item.externalSource,
      item.externalId,
      item.createdAt,
      item.updatedAt
    );
}

function insertSeason(season: {
  id: string;
  mediaId: string;
  number: number;
  title: string | null;
  episodeCount: number;
  rating: number | null;
  externalId: string | null;
}) {
  getDb()
    .prepare(
      `INSERT INTO seasons (id, media_id, number, title, episode_count, rating, external_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      season.id,
      season.mediaId,
      season.number,
      season.title,
      season.episodeCount,
      season.rating,
      season.externalId
    );
}

function insertEpisode(episode: {
  id: string;
  seasonId: string;
  number: number;
  title: string | null;
  watched: boolean;
  rating: number | null;
}) {
  getDb()
    .prepare(
      `INSERT INTO episodes (id, season_id, number, title, watched, rating)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      episode.id,
      episode.seasonId,
      episode.number,
      episode.title,
      episode.watched ? 1 : 0,
      episode.rating
    );
}

function insertAnimeFromChain(chain: AniListMedia[]): MediaItem {
  const root = chain[0];
  if (!root) throw new Error("AniList returned no seasons for this title.");
  const now = nowIso();
  const mediaId = randomUUID();
  insertMedia({
    id: mediaId,
    kind: "anime",
    title: pickTitle(root.title),
    posterUrl: pickCover(root),
    overview: stripHtml(root.description),
    status: "planned",
    rating: null,
    watched: false,
    externalSource: "anilist",
    externalId: String(root.id),
    createdAt: now,
    updatedAt: now,
  });

  chain.forEach((media, index) => {
    const seasonId = randomUUID();
    const count = episodeCountFor(media);
    insertSeason({
      id: seasonId,
      mediaId,
      number: index + 1,
      title: pickTitle(media.title),
      episodeCount: count,
      rating: null,
      externalId: String(media.id),
    });
    const titles = media.streamingEpisodes ?? [];
    for (let i = 0; i < count; i++) {
      insertEpisode({
        id: randomUUID(),
        seasonId,
        number: i + 1,
        title: titles[i]?.title ?? null,
        watched: false,
        rating: null,
      });
    }
  });

  return requireMedia(mediaId);
}

function insertMovieFromResult(result: SearchResultItem): MediaItem {
  const now = nowIso();
  const mediaId = randomUUID();
  insertMedia({
    id: mediaId,
    kind: "movie",
    title: result.title,
    posterUrl: result.posterUrl,
    overview: result.overview,
    status: "planned",
    rating: null,
    watched: false,
    externalSource: result.externalSource,
    externalId: result.externalId,
    createdAt: now,
    updatedAt: now,
  });
  return requireMedia(mediaId);
}

function insertAnimeSingleSeason(result: SearchResultItem, episodeCount: number): MediaItem {
  const now = nowIso();
  const mediaId = randomUUID();
  const count = Math.max(1, episodeCount);
  insertMedia({
    id: mediaId,
    kind: "anime",
    title: result.title,
    posterUrl: result.posterUrl,
    overview: result.overview,
    status: "planned",
    rating: null,
    watched: false,
    externalSource: result.externalSource,
    externalId: result.externalId,
    createdAt: now,
    updatedAt: now,
  });
  const seasonId = randomUUID();
  insertSeason({
    id: seasonId,
    mediaId,
    number: 1,
    title: "Season 1",
    episodeCount: count,
    rating: null,
    externalId: result.externalId,
  });
  for (let i = 0; i < count; i++) {
    insertEpisode({
      id: randomUUID(),
      seasonId,
      number: i + 1,
      title: null,
      watched: false,
      rating: null,
    });
  }
  return requireMedia(mediaId);
}

export const store = {
  list(): MediaItem[] {
    return hydrateAll();
  },

  get(id: string): MediaItem | null {
    return hydrateOne(id);
  },

  remove(id: string): void {
    getDb().prepare("DELETE FROM media WHERE id = ?").run(id);
  },

  async search(term: string, kind: MediaKind): Promise<SearchResultItem[]> {
    const q = term.trim();
    if (!q) return [];
    if (kind === "anime") {
      return raceSources([searchAnime(q), searchJikanAnime(q)]);
    }
    return raceSources([searchAniListMovies(q), searchJikanMovies(q), searchWikidataFilms(q)]);
  },

  async addFromSearchResult(result: SearchResultItem): Promise<AddMediaResult> {
    if (result.kind === "anime" && result.externalSource === "anilist") {
      const chain = await walkSeasonChain(Number(result.externalId));
      const ids = chain.map((m) => String(m.id));
      const existing = findByExternalIds("anilist", ids);
      if (existing) return { item: existing, alreadyInLibrary: true };
      const item = withTransaction(() => insertAnimeFromChain(chain));
      return { item, alreadyInLibrary: false };
    }

    if (result.kind === "anime" && result.externalSource === "jikan") {
      const existing = findByExternalIds("jikan", [result.externalId]);
      if (existing) return { item: existing, alreadyInLibrary: true };
      const details = await fetchJikanAnime(result.externalId);
      const count = details.episodeCount ?? result.episodeCount ?? 12;
      const item = withTransaction(() => insertAnimeSingleSeason({ ...result, ...details, kind: "anime" }, count));
      return { item, alreadyInLibrary: false };
    }

    let details = result;
    if (result.externalSource === "anilist") {
      try {
        const media = await fetchAnime(Number(result.externalId));
        details = {
          ...result,
          title: pickTitle(media.title),
          posterUrl: pickCover(media) ?? result.posterUrl,
          overview: stripHtml(media.description) ?? result.overview,
          year: result.year,
        };
      } catch {
        details = result;
      }
    } else if (result.externalSource === "jikan") {
      try {
        details = { ...result, ...(await fetchJikanAnime(result.externalId)), kind: "movie" };
      } catch {
        details = result;
      }
    }

    const existing = findByExternalIds(details.externalSource, [details.externalId]);
    if (existing) return { item: existing, alreadyInLibrary: true };
    const item = withTransaction(() => insertMovieFromResult(details));
    return { item, alreadyInLibrary: false };
  },

  markEpisodeWatched(episodeId: string, watched: boolean): MediaItem {
    const found = findEpisode(episodeId);
    getDb().prepare("UPDATE episodes SET watched = ? WHERE id = ?").run(watched ? 1 : 0, episodeId);
    recomputeAndPersist(found.media.id);
    return requireMedia(found.media.id);
  },

  rateEpisode(episodeId: string, rating: number | null): MediaItem {
    const found = findEpisode(episodeId);
    getDb().prepare("UPDATE episodes SET rating = ? WHERE id = ?").run(rating, episodeId);
    getDb().prepare("UPDATE media SET updated_at = ? WHERE id = ?").run(nowIso(), found.media.id);
    return requireMedia(found.media.id);
  },

  rateSeason(seasonId: string, rating: number | null): MediaItem {
    const season = getDb().prepare("SELECT media_id FROM seasons WHERE id = ?").get(seasonId) as
      | { media_id: string }
      | undefined;
    if (!season) throw new Error(`Season ${seasonId} not found`);
    getDb().prepare("UPDATE seasons SET rating = ? WHERE id = ?").run(rating, seasonId);
    getDb().prepare("UPDATE media SET updated_at = ? WHERE id = ?").run(nowIso(), season.media_id);
    return requireMedia(season.media_id);
  },

  rateMedia(mediaId: string, rating: number | null): MediaItem {
    requireMedia(mediaId);
    getDb().prepare("UPDATE media SET rating = ?, updated_at = ? WHERE id = ?").run(rating, nowIso(), mediaId);
    return requireMedia(mediaId);
  },

  markMediaWatched(mediaId: string, watched: boolean): MediaItem {
    requireMedia(mediaId);
    getDb().prepare("UPDATE media SET watched = ?, updated_at = ? WHERE id = ?").run(watched ? 1 : 0, nowIso(), mediaId);
    recomputeAndPersist(mediaId);
    return requireMedia(mediaId);
  },

  setStatus(mediaId: string, status: WatchStatus): MediaItem {
    requireMedia(mediaId);
    const watched = status === "completed" ? 1 : 0;
    getDb()
      .prepare("UPDATE media SET status = ?, watched = ?, updated_at = ? WHERE id = ?")
      .run(status, watched, nowIso(), mediaId);
    return requireMedia(mediaId);
  },

  getSettings(): AppSettings {
    return { savePath: getDbPath() };
  },

  async suggestionsForYou(): Promise<SearchResultItem[]> {
    const library = hydrateAll();
    const rated = library
      .filter((item) => item.status !== "dropped" && item.rating !== null)
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    const high = rated.filter((item) => (item.rating ?? 0) >= 7).slice(0, 5);
    const seeds = high.length > 0 ? high : rated.slice(0, 3);

    const inLibraryIds = new Set<string>();
    const inLibraryTitles = new Set<string>();
    for (const item of library) {
      if (item.externalSource && item.externalId) {
        inLibraryIds.add(`${item.externalSource}:${item.externalId}`);
      }
      inLibraryTitles.add(normalizeTitle(item.title));
      for (const season of item.seasons) {
        if (season.externalId && item.externalSource) {
          inLibraryIds.add(`${item.externalSource}:${season.externalId}`);
        }
      }
    }

    const jobs = seeds.map((seed, index) => (async () => {
      if (!seed.externalId || seed.rating === null) return [] as { item: SearchResultItem; score: number }[];
      if (seed.externalSource === "jikan") {
        await delay(index * 400);
        const recs = await fetchJikanRecommendations(seed.externalId);
        return recs.map((r) => ({ item: r.item, score: seed.rating! * r.strength }));
      }
      if (seed.externalSource === "anilist") {
        const recs = await fetchAniListRecommendations(seed.externalId);
        return recs.map((r) => ({ item: r.item, score: seed.rating! * r.strength }));
      }
      return [];
    })());

    const settled = await Promise.allSettled(jobs);
    const scores = new Map<string, { item: SearchResultItem; score: number }>();
    for (const result of settled) {
      if (result.status !== "fulfilled") continue;
      for (const rec of result.value) {
        const idKey = `${rec.item.externalSource}:${rec.item.externalId}`;
        if (inLibraryIds.has(idKey)) continue;
        if (inLibraryTitles.has(normalizeTitle(rec.item.title))) continue;
        const prev = scores.get(idKey);
        if (prev) prev.score += rec.score;
        else scores.set(idKey, { item: rec.item, score: rec.score });
      }
    }

    return [...scores.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map((row) => row.item);
  },

  lookupTrailer(source: string, id: string): Promise<Trailer | null> {
    return fetchTrailer(source, id);
  },

  async getDetails(source: string, id: string): Promise<SearchResultItem> {
    if (source === "anilist") return fetchAniListDetails(id);
    if (source === "jikan") return fetchJikanAnime(id);
    if (source === "wikidata") return fetchWikidataFilm(id);
    throw new Error("Couldn't load that title.");
  },
};
