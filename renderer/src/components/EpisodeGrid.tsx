import { RatingStars } from "./RatingStars";
import type { Episode } from "../types/shared";

interface Props {
  episodes: Episode[];
  onToggle: (episodeId: string, watched: boolean) => void;
  onRate: (episodeId: string, rating: number | null) => void;
}

export function EpisodeGrid({ episodes, onToggle, onRate }: Props) {
  return (
    <div className="episode-grid">
      {episodes.map((ep) => (
        <div key={ep.id} className={`episode-cell ${ep.watched ? "watched" : ""}`}>
          <button
            className="episode-toggle"
            onClick={() => onToggle(ep.id, !ep.watched)}
            title={ep.title ?? (ep.watched ? "Mark as unwatched" : "Mark as watched")}
          >
            <span className="episode-check">{ep.watched ? "\u2713" : "\u25CB"}</span>
            <span className="episode-number">{String(ep.number).padStart(2, "0")}</span>
          </button>
          {ep.watched && (
            <RatingStars
              rating={ep.rating}
              size="xs"
              interactive
              onChange={(rating) => onRate(ep.id, rating)}
            />
          )}
        </div>
      ))}
    </div>
  );
}
