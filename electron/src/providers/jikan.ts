import type { SearchResultItem, Trailer } from "../../types/shared";
import { fetchJson } from "./http";
import { trailerFromSite } from "./trailerFormat";

const BASE = "https://api.jikan.moe/v4";

interface JikanAnime {
  mal_id: number;
  title: string;
  title_english: string | null;
  year: number | null;
  aired?: { from: string | null };
  images?: { jpg?: { large_image_url?: string; image_url?: string } };
  synopsis: string | null;
  episodes: number | null;
  type: string | null;
}

function yearOf(a: JikanAnime): number | null {
  if (a.year) return a.year;
  const from = a.aired?.from;
  if (!from) return null;
  const y = Number(from.slice(0, 4));
  return y || null;
}

function toResult(a: JikanAnime, kind: SearchResultItem["kind"]): SearchResultItem {
  return {
    externalSource: "jikan",
    externalId: String(a.mal_id),
    kind,
    title: a.title_english || a.title,
    posterUrl: a.images?.jpg?.large_image_url || a.images?.jpg?.image_url || null,
    overview: a.synopsis,
    year: yearOf(a),
    episodeCount: a.episodes,
  };
}

async function search(term: string, extra: string, kind: SearchResultItem["kind"]): Promise<SearchResultItem[]> {
  const url = `${BASE}/anime?q=${encodeURIComponent(term)}&limit=10&sfw=true${extra}`;
  const data = await fetchJson<{ data?: JikanAnime[] }>(url);
  return (data.data ?? []).map((a) => toResult(a, kind));
}

export async function searchJikanAnime(term: string): Promise<SearchResultItem[]> {
  return search(term, "", "anime");
}

export async function searchJikanMovies(term: string): Promise<SearchResultItem[]> {
  return search(term, "&type=movie", "movie");
}

export async function fetchJikanTrailer(id: string): Promise<Trailer | null> {
  const data = await fetchJson<{
    data?: { trailer?: { youtube_id?: string | null } };
  }>(`${BASE}/anime/${encodeURIComponent(id)}`);
  const fromAnime = trailerFromSite("youtube", data.data?.trailer?.youtube_id);
  if (fromAnime) return fromAnime;

  try {
    const videos = await fetchJson<{
      data?: { promo?: { trailer?: { youtube_id?: string | null } }[] };
    }>(`${BASE}/anime/${encodeURIComponent(id)}/videos`);
    const promoId = videos.data?.promo?.find((p) => p.trailer?.youtube_id)?.trailer?.youtube_id;
    return trailerFromSite("youtube", promoId);
  } catch {
    return null;
  }
}

export async function fetchJikanAnime(id: string): Promise<SearchResultItem> {
  const data = await fetchJson<{ data?: JikanAnime }>(`${BASE}/anime/${encodeURIComponent(id)}`);
  if (!data.data) throw new Error("MyAnimeList title not found.");
  const kind: SearchResultItem["kind"] = data.data.type === "Movie" ? "movie" : "anime";
  return toResult(data.data, kind);
}

export async function fetchJikanRecommendations(
  id: string
): Promise<{ item: SearchResultItem; strength: number }[]> {
  const data = await fetchJson<{
    data?: {
      votes?: number;
      entry?: {
        mal_id: number;
        title: string;
        images?: { jpg?: { large_image_url?: string; image_url?: string } };
      };
    }[];
  }>(`${BASE}/anime/${encodeURIComponent(id)}/recommendations`);

  return (data.data ?? [])
    .filter((row) => row.entry?.mal_id)
    .slice(0, 10)
    .map((row) => {
      const entry = row.entry!;
      return {
        strength: Math.max(1, row.votes ?? 1),
        item: {
          externalSource: "jikan" as const,
          externalId: String(entry.mal_id),
          kind: "anime" as const,
          title: entry.title,
          posterUrl: entry.images?.jpg?.large_image_url || entry.images?.jpg?.image_url || null,
          overview: null,
          year: null,
          episodeCount: null,
        },
      };
    });
}
