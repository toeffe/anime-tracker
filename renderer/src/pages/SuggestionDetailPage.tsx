import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { TrailerPlayer } from "../components/TrailerPlayer";
import { ipcErrorMessage } from "../lib/errors";
import type { SearchResultItem } from "../types/shared";

const SOURCE_LABEL: Record<SearchResultItem["externalSource"], string> = {
  anilist: "AniList",
  jikan: "MyAnimeList",
  wikidata: "Wikidata",
};

function isSearchResult(value: unknown): value is SearchResultItem {
  if (!value || typeof value !== "object") return false;
  const item = value as SearchResultItem;
  return Boolean(item.externalSource && item.externalId && item.title);
}

function metaLine(item: SearchResultItem): string {
  const parts = [
    item.kind === "movie" ? "Movie" : "Anime",
    SOURCE_LABEL[item.externalSource],
    item.year ? String(item.year) : null,
    item.episodeCount ? `${item.episodeCount} episodes` : null,
  ];
  return parts.filter(Boolean).join(" · ");
}

export function SuggestionDetailPage() {
  const { source, id } = useParams<{ source: string; id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const seeded = isSearchResult((location.state as { item?: unknown } | null)?.item)
    ? (location.state as { item: SearchResultItem }).item
    : null;

  const [item, setItem] = useState<SearchResultItem | null>(seeded);
  const [loading, setLoading] = useState(!seeded);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const externalId = id ? decodeURIComponent(id) : "";
    if (!source || !externalId) {
      setError("This title doesn't exist anymore.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    if (!seeded) setLoading(true);
    setError(null);

    api()
      .search.details(source, externalId)
      .then((details) => {
        if (!cancelled) setItem(details);
      })
      .catch((err) => {
        if (!cancelled && !seeded) setError(ipcErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // Seeded card payload is only used as a fallback if this fetch fails.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, id]);

  function back() {
    navigate("/", { state: { tab: "foryou" } });
  }

  async function addToLibrary() {
    if (!item) return;
    setAdding(true);
    setError(null);
    try {
      const { item: added } = await api().add.fromSearchResult(item);
      navigate(`/media/${added.id}`);
    } catch (err) {
      setError(ipcErrorMessage(err));
      setAdding(false);
    }
  }

  if (loading) return <div className="detail-page"><p className="dim">Loading…</p></div>;
  if (error && !item) {
    return (
      <div className="detail-page">
        <p className="error-text">{error}</p>
        <button onClick={back}>Back to For you</button>
      </div>
    );
  }
  if (!item) {
    return (
      <div className="detail-page">
        <p className="dim">This title doesn't exist anymore.</p>
        <button onClick={back}>Back to For you</button>
      </div>
    );
  }

  return (
    <div className="detail-page">
      <div className="detail-top">
        <button className="back-link" onClick={back}>
          ← For you
        </button>
        <button className="primary" disabled={adding} onClick={addToLibrary}>
          {adding ? "Adding…" : "Add to library"}
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="detail-layout">
        <div className="detail-poster">
          {item.posterUrl ? (
            <img src={item.posterUrl} alt="" />
          ) : (
            <div className="poster-placeholder large">
              <span>{item.title.slice(0, 1)}</span>
            </div>
          )}
        </div>
        <div className="detail-info">
          <h1 className="detail-title">{item.title}</h1>
          <p className="dim">{metaLine(item)}</p>
          {item.overview && <p className="detail-overview">{item.overview}</p>}
          <TrailerPlayer source={item.externalSource} externalId={item.externalId} />
        </div>
      </div>
    </div>
  );
}
