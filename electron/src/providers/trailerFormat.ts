import type { Trailer } from "../../types/shared";

function extractYoutubeId(raw: string): string | null {
  const trimmed = raw.trim();
  const fromUrl = trimmed.match(/(?:v=|\/embed\/|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (fromUrl?.[1]) return fromUrl[1];
  const cleaned = trimmed.replace(/[^\w-]/g, "");
  if (/^[A-Za-z0-9_-]{11}$/.test(cleaned)) return cleaned;
  const eleven = cleaned.slice(0, 11);
  return /^[A-Za-z0-9_-]{11}$/.test(eleven) ? eleven : null;
}

export function trailerFromSite(site: string | null | undefined, id: string | null | undefined): Trailer | null {
  if (!site || !id) return null;
  const normalized = site.toLowerCase().trim();

  if (normalized === "youtube") {
    const videoId = extractYoutubeId(id);
    if (!videoId) return null;
    return {
      site: "youtube",
      videoId,
      watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
    };
  }

  if (normalized === "dailymotion") {
    const videoId = id.trim();
    if (!videoId) return null;
    return {
      site: "dailymotion",
      videoId,
      watchUrl: `https://www.dailymotion.com/video/${videoId}`,
    };
  }

  return null;
}
