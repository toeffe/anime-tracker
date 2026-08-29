import { useEffect, useState } from "react";
import { api } from "../api";
import { ipcErrorMessage } from "../lib/errors";
import type { Trailer } from "../types/shared";
import { YouTubeWatchWebview } from "./YouTubeWatchWebview";

interface Props {
  source: string | null;
  externalId: string | null;
}

export function TrailerPlayer({ source, externalId }: Props) {
  const [trailer, setTrailer] = useState<Trailer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!source || !externalId || source === "manual" || source === "tmdb") {
      setTrailer(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setTrailer(null);

    api()
      .trailer.lookup(source, externalId)
      .then((found) => {
        if (!cancelled) setTrailer(found);
      })
      .catch((err) => {
        if (!cancelled) setError(ipcErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [source, externalId]);

  if (!source || !externalId || source === "manual" || source === "tmdb") return null;

  if (loading) {
    return (
      <div className="trailer-block">
        <h2>Trailer</h2>
        <p className="dim">Looking up trailer…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="trailer-block">
        <h2>Trailer</h2>
        <p className="dim">{error}</p>
      </div>
    );
  }

  if (!trailer) {
    return (
      <div className="trailer-block">
        <h2>Trailer</h2>
        <p className="dim">No trailer listed for this title.</p>
      </div>
    );
  }

  return (
    <div className="trailer-block">
      <h2>Trailer</h2>
      {trailer.site === "youtube" ? (
        <YouTubeWatchWebview videoId={trailer.videoId} />
      ) : (
        <div className="trailer-frame">
          <iframe
            src={`https://www.dailymotion.com/embed/video/${encodeURIComponent(trailer.videoId)}`}
            title="Trailer"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      )}
      <a className="trailer-external" href={trailer.watchUrl} target="_blank" rel="noreferrer">
        Open on {trailer.site === "youtube" ? "YouTube" : "Dailymotion"}
      </a>
    </div>
  );
}
