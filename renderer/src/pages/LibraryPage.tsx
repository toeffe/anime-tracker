import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useLocation } from "react-router-dom";
import { api } from "../api";
import { PosterCard } from "../components/PosterCard";
import { AddMediaModal } from "../components/AddMediaModal";
import { SettingsModal } from "../components/SettingsModal";
import { SuggestionCard } from "../components/SuggestionCard";
import {
  enqueueAdd,
  getAddQueueSnapshot,
  subscribeAddQueue,
  suggestionKey,
} from "../lib/addQueue";
import { ipcErrorMessage } from "../lib/errors";
import type { MediaItem, SearchResultItem } from "../types/shared";

type FilterKey = "foryou" | "all" | "watching" | "planned" | "completed" | "dropped" | "movies";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "foryou", label: "For you" },
  { key: "all", label: "All" },
  { key: "watching", label: "Watching" },
  { key: "planned", label: "Planned" },
  { key: "completed", label: "Completed" },
  { key: "dropped", label: "Dropped" },
  { key: "movies", label: "Movies" },
];

function isFilterKey(value: string | null | undefined): value is FilterKey {
  return FILTERS.some((f) => f.key === value);
}

function suggestionInLibrary(library: MediaItem[], suggestion: SearchResultItem): boolean {
  return library.some((item) => {
    if (item.externalSource === suggestion.externalSource && item.externalId === suggestion.externalId) {
      return true;
    }
    return (
      item.externalSource === suggestion.externalSource &&
      item.seasons.some((season) => season.externalId === suggestion.externalId)
    );
  });
}

function initialFilter(tab: unknown): FilterKey {
  if (typeof tab === "string" && isFilterKey(tab)) return tab;
  try {
    const saved = sessionStorage.getItem("library-tab");
    if (isFilterKey(saved)) return saved;
  } catch {
    /* ignore */
  }
  return "all";
}

export function LibraryPage() {
  const location = useLocation();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [filter, setFilter] = useState<FilterKey>(() =>
    initialFilter((location.state as { tab?: unknown } | null)?.tab)
  );
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<SearchResultItem[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const suggestionsFetched = useRef(false);
  const addQueue = useSyncExternalStore(subscribeAddQueue, getAddQueueSnapshot, getAddQueueSnapshot);
  const queuedKeySet = useMemo(() => new Set(addQueue.queuedKeys), [addQueue.queuedKeys]);

  async function loadSuggestions() {
    setSuggestionsLoading(true);
    setSuggestionsError(null);
    try {
      const recs = await api().suggestions.forYou();
      setSuggestions(recs);
    } catch (err) {
      setSuggestions([]);
      setSuggestionsError(ipcErrorMessage(err));
    } finally {
      setSuggestionsLoading(false);
    }
  }

  async function refresh(quiet = false) {
    if (!quiet) {
      setLoading(true);
      setError(null);
    }
    try {
      const list = await api().library.list();
      setItems(list);
      setSuggestions((prev) => prev.filter((s) => !suggestionInLibrary(list, s)));
    } catch (err) {
      setError(ipcErrorMessage(err));
    } finally {
      if (!quiet) setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (addQueue.lastError) setError(addQueue.lastError);
    else if (addQueue.completed > 0) setError(null);
  }, [addQueue.lastError, addQueue.completed]);

  useEffect(() => {
    if (addQueue.completed === 0) return;
    void refresh(true);
  }, [addQueue.completed]);

  useEffect(() => {
    try {
      sessionStorage.setItem("library-tab", filter);
    } catch {
      /* ignore */
    }
  }, [filter]);

  useEffect(() => {
    if (filter !== "foryou") return;
    if (loading) return;
    if (items.length === 0) {
      setSuggestions([]);
      suggestionsFetched.current = false;
      return;
    }
    if (suggestionsFetched.current) return;
    suggestionsFetched.current = true;
    void loadSuggestions();
  }, [filter, items.length, loading]);

  const filtered = useMemo(() => {
    let list = items;
    if (filter === "watching") list = list.filter((i) => i.status === "watching");
    if (filter === "planned") list = list.filter((i) => i.status === "planned");
    if (filter === "completed") list = list.filter((i) => i.status === "completed");
    if (filter === "dropped") list = list.filter((i) => i.status === "dropped");
    if (filter === "movies") list = list.filter((i) => i.kind === "movie");
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((i) => i.title.toLowerCase().includes(q));
    }
    return list;
  }, [items, filter, search]);

  const showForYou = filter === "foryou";
  const hasHighRating = items.some((i) => i.status !== "dropped" && (i.rating ?? 0) >= 7);
  const hasAnyRating = items.some((i) => i.status !== "dropped" && i.rating !== null);

  function addSuggestion(item: SearchResultItem) {
    setError(null);
    enqueueAdd(item);
  }

  return (
    <div className="library-page">
      <header className="library-header">
        <h1 className="library-title">Library</h1>
        <div className="library-header-actions">
          <button
            className="icon-button settings-button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
            title="Settings"
          >
            ⚙
          </button>
          <button className="primary add-button" onClick={() => setModalOpen(true)}>
            + Add
          </button>
        </div>
      </header>

      <div className="library-controls">
        <div className="filter-tabs">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={filter === f.key ? "active" : ""}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        {filter !== "foryou" && (
          <input
            className="library-search"
            placeholder="Search your library…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}
      </div>

      {error && <p className="error-text">{error}</p>}
      {addQueue.pending > 0 && (
        <p className="dim">
          Adding {addQueue.pending} {addQueue.pending === 1 ? "title" : "titles"} in the background…
        </p>
      )}

      {showForYou ? (
        <section className="for-you">
          {suggestionsLoading ? (
            <p className="dim">Finding titles that match your ratings…</p>
          ) : suggestionsError && suggestions.length === 0 ? (
            <p className="dim">{suggestionsError}</p>
          ) : suggestions.length > 0 ? (
            <>
              <div className="poster-grid">
                {suggestions.map((item) => {
                  const key = suggestionKey(item);
                  const status =
                    addQueue.addingKey === key
                      ? "adding"
                      : queuedKeySet.has(key)
                        ? "queued"
                        : "idle";
                  return (
                    <SuggestionCard
                      key={key}
                      item={item}
                      status={status}
                      onAdd={addSuggestion}
                    />
                  );
                })}
              </div>
            </>
          ) : (
            <div className="empty-state">
              <p>
                {items.length === 0
                  ? "Add and rate titles in your library to get suggestions."
                  : hasHighRating || hasAnyRating
                    ? "No extra suggestions right now — try rating more titles."
                    : "Rate a few titles 7 or higher to get suggestions."}
              </p>
            </div>
          )}
        </section>
      ) : loading ? (
        <p className="dim">Loading library…</p>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <p>{items.length === 0 ? "Nothing here yet." : "Nothing matches this filter."}</p>
          {items.length === 0 && (
            <button className="primary" onClick={() => setModalOpen(true)}>
              + Add your first title
            </button>
          )}
        </div>
      ) : (
        <div className="poster-grid">
          {filtered.map((item) => (
            <PosterCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {modalOpen && (
        <AddMediaModal
          onClose={() => setModalOpen(false)}
          onAdded={refresh}
        />
      )}
      {settingsOpen && (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          onLibraryChanged={() => {
            suggestionsFetched.current = false;
            void refresh();
          }}
        />
      )}
    </div>
  );
}
