import type { AnimeTrackerAPI } from "./shared";

declare global {
  interface Window {
    animeTracker: AnimeTrackerAPI;
  }
}

export {};
