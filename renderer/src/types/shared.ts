// Shared domain types — used by main process, preload, and renderer.
// Keep this file framework-agnostic (no Electron or React imports).

export type MediaKind = "anime" | "movie";
export type WatchStatus = "watching" | "completed" | "planned" | "dropped";

export interface Episode {
  id: string;
  seasonId: string;
  number: number;
  title: string | null;
  watched: boolean;
  rating: number | null; // 0-10
}

export interface Season {
  id: string;
  mediaId: string;
  number: number;
  title: string | null;
  episodeCount: number;
  rating: number | null; // 0-10
  externalId: string | null;
  episodes: Episode[];
}

export type ExternalSource = "anilist" | "jikan" | "wikidata" | "tmdb" | "manual";

export interface MediaItem {
  id: string;
  kind: MediaKind;
  title: string;
  posterUrl: string | null;
  overview: string | null;
  status: WatchStatus;
  rating: number | null; // overall rating 0-10
  watched: boolean; // for movies
  externalSource: ExternalSource | null;
  externalId: string | null;
  createdAt: string;
  updatedAt: string;
  seasons: Season[]; // empty for movies
}

export interface SearchResultItem {
  externalSource: "anilist" | "jikan" | "wikidata";
  externalId: string;
  kind: MediaKind;
  title: string;
  posterUrl: string | null;
  overview: string | null;
  year: number | null;
  episodeCount: number | null; // best-guess episode count for anime
}

export type TrailerSite = "youtube" | "dailymotion";

export interface Trailer {
  site: TrailerSite;
  videoId: string;
  watchUrl: string;
}

export const BROWSE_GENRES = [
  "Action",
  "Adventure",
  "Comedy",
  "Drama",
  "Fantasy",
  "Horror",
  "Mecha",
  "Music",
  "Mystery",
  "Psychological",
  "Romance",
  "Sci-Fi",
  "Slice of Life",
  "Sports",
  "Supernatural",
  "Thriller",
] as const;

export type BrowseGenre = (typeof BROWSE_GENRES)[number];

export interface AddMediaResult {
  item: MediaItem;
  alreadyInLibrary: boolean;
}

export interface AppSettings {
  savePath: string;
  usingCustomDir: boolean;
}

// ---- IPC contract ----
// Every renderer -> main call and its expected return shape lives here so
// preload.ts and the renderer's api client stay in sync.

export interface AnimeTrackerAPI {
  library: {
    list(): Promise<MediaItem[]>;
    get(id: string): Promise<MediaItem | null>;
    remove(id: string): Promise<void>;
  };
  search: {
    query(term: string, kind: MediaKind): Promise<SearchResultItem[]>;
    details(source: string, id: string): Promise<SearchResultItem>;
  };
  add: {
    fromSearchResult(result: SearchResultItem): Promise<AddMediaResult>;
  };
  episode: {
    markWatched(episodeId: string, watched: boolean): Promise<MediaItem>;
    rate(episodeId: string, rating: number | null): Promise<MediaItem>;
  };
  season: {
    rate(seasonId: string, rating: number | null): Promise<MediaItem>;
    markEpisodesWatched(seasonId: string, watched: boolean): Promise<MediaItem>;
  };
  media: {
    rate(mediaId: string, rating: number | null): Promise<MediaItem>;
    markWatched(mediaId: string, watched: boolean): Promise<MediaItem>;
    setStatus(mediaId: string, status: WatchStatus): Promise<MediaItem>;
  };
  settings: {
    get(): Promise<AppSettings>;
    showSaveFile(): Promise<void>;
    chooseLibraryDir(): Promise<AppSettings | null>;
    resetLibraryDir(): Promise<AppSettings>;
  };
  suggestions: {
    forYou(): Promise<SearchResultItem[]>;
    trending(): Promise<SearchResultItem[]>;
    byGenre(genre: string): Promise<SearchResultItem[]>;
  };
  trailer: {
    lookup(source: string, id: string): Promise<Trailer | null>;
  };
}
