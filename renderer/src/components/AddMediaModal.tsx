import { useState } from "react";
import { api } from "../api";
import { ipcErrorMessage } from "../lib/errors";
import { TrailerModal } from "./TrailerModal";
import type { MediaKind, SearchResultItem } from "../types/shared";

interface Props {
  onClose: () => void;
  onAdded: () => void;
}

const SOURCE_LABEL: Record<SearchResultItem["externalSource"], string> = {
  anilist: "AniList",
  jikan: "MyAnimeList",
  wikidata: "Wikidata",
};

export function AddMediaModal({ onClose, onAdded }: Props) {
  const [kind, setKind] = useState<MediaKind>("anime");
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [preview, setPreview] = useState<SearchResultItem | null>(null);

  function switchKind(next: MediaKind) {
    setKind(next);
    setResults([]);
    setHasSearched(false);
    setError(null);
    setInfo(null);
  }

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!term.trim()) return;
    setLoading(true);
    setError(null);
    setInfo(null);
    setHasSearched(true);
    try {
      const res = await api().search.query(term, kind);
      setResults(res);
    } catch (err) {
      setResults([]);
      setError(ipcErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function addResult(result: SearchResultItem) {
    setAdding(`${result.externalSource}-${result.externalId}`);
    setError(null);
    setInfo(null);
    try {
      const { alreadyInLibrary } = await api().add.fromSearchResult(result);
      onAdded();
      setPreview(null);
      if (alreadyInLibrary) {
        setInfo(`“${result.title}” is already in your library.`);
      } else {
        onClose();
      }
    } catch (err) {
      setError(ipcErrorMessage(err));
    } finally {
      setAdding(null);
    }
  }

  return (
    <>
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add to library</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="kind-toggle">
          <button
            className={kind === "anime" ? "active" : ""}
            onClick={() => switchKind("anime")}
          >
            Anime
          </button>
          <button
            className={kind === "movie" ? "active" : ""}
            onClick={() => switchKind("movie")}
          >
            Movie
          </button>
        </div>

        <form onSubmit={runSearch} className="search-form">
          <input
            autoFocus
            placeholder={`Search for ${kind === "anime" ? "an anime" : "a movie"}…`}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
          <button type="submit" className="primary" disabled={loading || Boolean(adding)}>
            Search
          </button>
        </form>

        {error && (
          <div className="banner-error">
            <p className="error-text">{error}</p>
          </div>
        )}
        {info && <p className="ok-text">{info}</p>}

        <div className="search-results">
          {loading && <p className="dim">Searching…</p>}
          {!loading && hasSearched && results.length === 0 && !error && (
            <p className="dim">No results.</p>
          )}
          {results.map((r) => {
            const rowKey = `${r.externalSource}-${r.externalId}`;
            return (
              <div className="search-result" key={rowKey}>
                <button
                  type="button"
                  className="search-result-preview"
                  onClick={() => setPreview(r)}
                >
                  <div className="search-result-poster">
                    {r.posterUrl ? (
                      <img src={r.posterUrl} alt="" />
                    ) : (
                      <div className="poster-placeholder small" />
                    )}
                  </div>
                  <div className="search-result-info">
                    <strong>{r.title}</strong>
                    <span className="dim">
                      {SOURCE_LABEL[r.externalSource]}
                      {" · "}
                      {r.year ?? "Unknown year"}
                      {r.episodeCount ? ` · ${r.episodeCount} episodes` : ""}
                      {" · Trailer"}
                    </span>
                  </div>
                </button>
                <button
                  className="primary"
                  disabled={adding !== null}
                  onClick={() => addResult(r)}
                >
                  {adding === rowKey ? "Adding…" : "Add"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
    {preview && (
      <TrailerModal
        item={preview}
        adding={adding === `${preview.externalSource}-${preview.externalId}`}
        addDisabled={adding !== null}
        onClose={() => setPreview(null)}
        onAdd={addResult}
      />
    )}
    </>
  );
}
