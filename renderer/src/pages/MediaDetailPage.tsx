import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { RatingStars } from "../components/RatingStars";
import { EpisodeGrid } from "../components/EpisodeGrid";
import { ipcErrorMessage } from "../lib/errors";
import { TrailerPlayer } from "../components/TrailerPlayer";
import type { MediaItem, WatchStatus } from "../types/shared";

const STATUSES: { value: WatchStatus; label: string }[] = [
  { value: "planned", label: "Planned" },
  { value: "watching", label: "Watching" },
  { value: "completed", label: "Completed" },
  { value: "dropped", label: "Dropped" },
];

export function MediaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [item, setItem] = useState<MediaItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh(showSpinner = false) {
    if (!id) return;
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const media = await api().library.get(id);
      setItem(media);
    } catch (err) {
      setError(ipcErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) return <div className="detail-page"><p className="dim">Loading…</p></div>;
  if (error) {
    return (
      <div className="detail-page">
        <p className="error-text">{error}</p>
        <button onClick={() => navigate("/")}>Back to library</button>
      </div>
    );
  }
  if (!item) {
    return (
      <div className="detail-page">
        <p className="dim">This title doesn't exist anymore.</p>
        <button onClick={() => navigate("/")}>Back to library</button>
      </div>
    );
  }

  return (
    <div className="detail-page">
      <div className="detail-top">
        <button className="back-link" onClick={() => navigate("/")}>
          ← Library
        </button>
        <button
          className="danger-button"
          onClick={async () => {
            if (!confirm(`Remove “${item.title}” from your library?`)) return;
            try {
              await api().library.remove(item.id);
              navigate("/");
            } catch (err) {
              setError(ipcErrorMessage(err));
            }
          }}
        >
          Remove
        </button>
      </div>
      {item.kind === "movie" ? (
        <MovieDetail item={item} onChange={() => refresh(false)} />
      ) : (
        <AnimeDetail item={item} onChange={() => refresh(false)} />
      )}
    </div>
  );
}

function Poster({ item }: { item: MediaItem }) {
  return (
    <div className="detail-poster">
      {item.posterUrl ? (
        <img src={item.posterUrl} alt="" />
      ) : (
        <div className="poster-placeholder large">
          <span>{item.title.slice(0, 1)}</span>
        </div>
      )}
    </div>
  );
}

function StatusSelect({ item, onChange }: { item: MediaItem; onChange: () => void }) {
  async function setStatus(status: WatchStatus) {
    await api().media.setStatus(item.id, status);
    onChange();
  }

  return (
    <label className="status-select">
      <span className="rate-row-label">Status</span>
      <select
        value={item.status}
        onChange={(e) => setStatus(e.target.value as WatchStatus)}
      >
        {STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function MovieDetail({ item, onChange }: { item: MediaItem; onChange: () => void }) {
  async function toggleWatched() {
    await api().media.markWatched(item.id, !item.watched);
    onChange();
  }

  async function setRating(rating: number | null) {
    await api().media.rate(item.id, rating);
    onChange();
  }

  return (
    <div className="detail-layout">
      <Poster item={item} />
      <div className="detail-info">
        <h1 className="detail-title">{item.title}</h1>
        {item.overview && <p className="detail-overview">{item.overview}</p>}
        <TrailerPlayer source={item.externalSource} externalId={item.externalId} />

        <StatusSelect item={item} onChange={onChange} />

        <button
          className={`watch-toggle ${item.watched ? "watched" : ""}`}
          onClick={toggleWatched}
        >
          {item.watched ? "✓ Watched" : "Mark as watched"}
        </button>

        <RatingStars
          label="Your rating"
          rating={item.rating}
          size="lg"
          interactive
          onChange={setRating}
        />
      </div>
    </div>
  );
}

function nextUnwatched(item: MediaItem) {
  const seasons = [...item.seasons].sort((a, b) => a.number - b.number);
  for (const season of seasons) {
    const episodes = [...season.episodes].sort((a, b) => a.number - b.number);
    const ep = episodes.find((e) => !e.watched);
    if (ep) return ep;
  }
  return null;
}

function AnimeDetail({ item, onChange }: { item: MediaItem; onChange: () => void }) {
  const [seasonId, setSeasonId] = useState(item.seasons[0]?.id ?? "");
  const season = item.seasons.find((s) => s.id === seasonId) ?? item.seasons[0];
  const episodes = season?.episodes ?? [];
  const watchedCount = episodes.filter((e) => e.watched).length;
  const nextEpisode = nextUnwatched(item);

  useEffect(() => {
    if (!item.seasons.some((s) => s.id === seasonId)) {
      setSeasonId(item.seasons[0]?.id ?? "");
    }
  }, [item, seasonId]);

  async function toggleEpisode(episodeId: string, watched: boolean) {
    await api().episode.markWatched(episodeId, watched);
    onChange();
  }

  async function rateEpisode(episodeId: string, rating: number | null) {
    await api().episode.rate(episodeId, rating);
    onChange();
  }

  async function rateSeason(rating: number | null) {
    if (!season) return;
    await api().season.rate(season.id, rating);
    onChange();
  }

  async function rateShow(rating: number | null) {
    await api().media.rate(item.id, rating);
    onChange();
  }

  async function continueWatching() {
    if (!nextEpisode) return;
    setSeasonId(nextEpisode.seasonId);
    await toggleEpisode(nextEpisode.id, true);
  }

  return (
    <div className="detail-layout">
      <Poster item={item} />
      <div className="detail-info">
        <h1 className="detail-title">{item.title}</h1>
        {item.overview && <p className="detail-overview">{item.overview}</p>}
        <TrailerPlayer source={item.externalSource} externalId={item.externalId} />

        <StatusSelect item={item} onChange={onChange} />

        {item.seasons.length > 1 && (
          <div className="season-tabs">
            {item.seasons.map((s) => (
              <button
                key={s.id}
                className={s.id === season?.id ? "active" : ""}
                onClick={() => setSeasonId(s.id)}
              >
                {s.title ?? `Season ${s.number}`}
              </button>
            ))}
          </div>
        )}

        {season && (
          <div className="season-block">
            <div className="season-header">
              <h2>{season.title ?? `Season ${season.number}`}</h2>
              <span className="progress-text">
                {watchedCount} / {episodes.length} episodes
              </span>
            </div>

            <button
              className="primary continue-button"
              onClick={continueWatching}
              disabled={!nextEpisode}
            >
              {nextEpisode
                ? `▶ Continue Watching — S${item.seasons.find((s) => s.id === nextEpisode.seasonId)?.number ?? 1} Ep. ${nextEpisode.number}`
                : "All episodes watched"}
            </button>

            <RatingStars
              label="Season rating"
              rating={season.rating}
              interactive
              onChange={rateSeason}
            />
          </div>
        )}

        <RatingStars
          label="Overall rating"
          rating={item.rating}
          size="lg"
          interactive
          onChange={rateShow}
        />
      </div>

      {season && (
        <div className="episodes-section">
          <h2>Episodes</h2>
          <EpisodeGrid
            episodes={episodes}
            onToggle={toggleEpisode}
            onRate={rateEpisode}
          />
        </div>
      )}
    </div>
  );
}
