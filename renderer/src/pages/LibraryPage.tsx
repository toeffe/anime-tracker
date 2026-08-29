import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { api } from "../api";
import { PosterCard } from "../components/PosterCard";
import { AddMediaModal } from "../components/AddMediaModal";
import { SettingsModal } from "../components/SettingsModal";
import { SuggestionCard } from "../components/SuggestionCard";
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
  const [addingKey, setAddingKey] = useState<string | null>(null);

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

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const list = await api().library.list();
      setItems(list);
    } catch (err) {
      setError(ipcErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem("library-tab", filter);
    } catch {
      /* ignore */
    }
  }, [filter]);

  useEffect(() => {
    if (items.length === 0) {
      setSuggestions([]);
      return;
    }
    loadSuggestions();
  }, [items]);

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

  async function addSuggestion(item: SearchResultItem) {
    const key = `${item.externalSource}-${item.externalId}`;
    setAddingKey(key);
    try {
      await api().add.fromSearchResult(item);
      await refresh();
    } catch (err) {
      setSuggestionsError(ipcErrorMessage(err));
    } finally {
      setAddingKey(null);
    }
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

      {showForYou ? (
        <section className="for-you">
          {loading || suggestionsLoading ? (
            <p className="dim">Finding titles that match your ratings…</p>
          ) : suggestionsError ? (
            <p className="dim">{suggestionsError}</p>
          ) : suggestions.length > 0 ? (
            <div className="poster-grid">
              {suggestions.map((item) => {
                const key = `${item.externalSource}-${item.externalId}`;
                return (
                  <SuggestionCard
                    key={key}
                    item={item}
                    adding={addingKey === key}
                    disabled={addingKey !== null}
                    onAdd={addSuggestion}
                  />
                );
              })}
            </div>
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
          onLibraryChanged={refresh}
        />
      )}
    </div>
  );
}
