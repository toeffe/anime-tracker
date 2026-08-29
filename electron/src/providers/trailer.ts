import type { Trailer } from "../../types/shared";
import { fetchAniListTrailer } from "./anilist";
import { fetchJikanTrailer } from "./jikan";
import { fetchWikidataTrailer } from "./wikidata";

const cache = new Map<string, Trailer | null>();

export async function lookupTrailer(source: string, id: string): Promise<Trailer | null> {
  const key = `${source}:${id}`;
  if (cache.has(key)) return cache.get(key) ?? null;

  let trailer: Trailer | null = null;
  if (source === "anilist") {
    trailer = await fetchAniListTrailer(id);
  } else if (source === "jikan") {
    trailer = await fetchJikanTrailer(id);
  } else if (source === "wikidata") {
    trailer = await fetchWikidataTrailer(id);
  }

  cache.set(key, trailer);
  return trailer;
}
