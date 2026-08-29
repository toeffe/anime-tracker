import { useEffect, useState, type ReactNode } from "react";
import { api } from "../api";
import { ipcErrorMessage } from "../lib/errors";
import type { Trailer } from "../types/shared";
import { YouTubeWatchWebview } from "./YouTubeWatchWebview";

interface Props {
  source: string | null;
  externalId: string | null;
}

function TrailerFrame({ children }: { children: ReactNode }) {
  return <div className="trailer-frame">{children}</div>;
}

function TrailerPlaceholder({ children }: { children: ReactNode }) {
  return <p className="dim trailer-placeholder">{children}</p>;
}

export function TrailerPlayer({ source, externalId }: Props) {
  const skipLookup = !source || !externalId || source === "manual" || source === "tmdb";
  const [trailer, setTrailer] = useState<Trailer | null>(null);
  const [loading, setLoading] = useState(!skipLookup);
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

  let frame: ReactNode;
  if (loading) {
    frame = (
      <TrailerFrame>
        <TrailerPlaceholder>Looking up trailer…</TrailerPlaceholder>
      </TrailerFrame>
    );
  } else if (error) {
    frame = (
      <TrailerFrame>
        <TrailerPlaceholder>{error}</TrailerPlaceholder>
      </TrailerFrame>
    );
  } else if (!trailer) {
    frame = (
      <TrailerFrame>
        <TrailerPlaceholder>No trailer listed for this title.</TrailerPlaceholder>
      </TrailerFrame>
    );
  } else if (trailer.site === "youtube") {
    frame = <YouTubeWatchWebview videoId={trailer.videoId} />;
  } else {
    frame = (
      <TrailerFrame>
        <iframe
          src={`https://www.dailymotion.com/embed/video/${encodeURIComponent(trailer.videoId)}?autoplay=0`}
          title="Trailer"
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </TrailerFrame>
    );
  }

  return (
    <div className="trailer-block">
      <h2>Trailer</h2>
      {frame}
      {trailer ? (
        <a className="trailer-external" href={trailer.watchUrl} target="_blank" rel="noreferrer">
          Open on {trailer.site === "youtube" ? "YouTube" : "Dailymotion"}
        </a>
      ) : (
        <span className="trailer-external trailer-external-slot" aria-hidden="true" />
      )}
    </div>
  );
}
