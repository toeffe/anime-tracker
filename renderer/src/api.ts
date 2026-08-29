// Thin accessor so components import from one place instead of touching
// `window` directly everywhere.
export const api = () => window.animeTracker;
