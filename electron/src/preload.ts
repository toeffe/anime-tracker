import { contextBridge, ipcRenderer } from "electron";
import type {
  AnimeTrackerAPI,
  MediaKind,
  SearchResultItem,
  WatchStatus,
} from "../types/shared";

const api: AnimeTrackerAPI = {
  library: {
    list: () => ipcRenderer.invoke("library:list"),
    get: (id: string) => ipcRenderer.invoke("library:get", id),
    remove: (id: string) => ipcRenderer.invoke("library:remove", id),
  },
  search: {
    query: (term: string, kind: MediaKind) => ipcRenderer.invoke("search:query", term, kind),
    details: (source: string, id: string) => ipcRenderer.invoke("search:details", source, id),
  },
  add: {
    fromSearchResult: (result: SearchResultItem) =>
      ipcRenderer.invoke("add:fromSearchResult", result),
  },
  episode: {
    markWatched: (episodeId: string, watched: boolean) =>
      ipcRenderer.invoke("episode:markWatched", episodeId, watched),
    rate: (episodeId: string, rating: number | null) =>
      ipcRenderer.invoke("episode:rate", episodeId, rating),
  },
  season: {
    rate: (seasonId: string, rating: number | null) =>
      ipcRenderer.invoke("season:rate", seasonId, rating),
    markEpisodesWatched: (seasonId: string, watched: boolean) =>
      ipcRenderer.invoke("season:markEpisodesWatched", seasonId, watched),
  },
  media: {
    rate: (mediaId: string, rating: number | null) =>
      ipcRenderer.invoke("media:rate", mediaId, rating),
    markWatched: (mediaId: string, watched: boolean) =>
      ipcRenderer.invoke("media:markWatched", mediaId, watched),
    setStatus: (mediaId: string, status: WatchStatus) =>
      ipcRenderer.invoke("media:setStatus", mediaId, status),
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    showSaveFile: () => ipcRenderer.invoke("settings:showSaveFile"),
    chooseLibraryDir: () => ipcRenderer.invoke("settings:chooseLibraryDir"),
    resetLibraryDir: () => ipcRenderer.invoke("settings:resetLibraryDir"),
  },
  suggestions: {
    forYou: () => ipcRenderer.invoke("suggestions:forYou"),
    trending: () => ipcRenderer.invoke("suggestions:trending"),
    byGenre: (genre: string) => ipcRenderer.invoke("suggestions:byGenre", genre),
  },
  trailer: {
    lookup: (source: string, id: string) => ipcRenderer.invoke("trailer:lookup", source, id),
  },
};

contextBridge.exposeInMainWorld("animeTracker", api);
