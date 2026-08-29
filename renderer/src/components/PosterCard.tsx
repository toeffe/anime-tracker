import { Link } from "react-router-dom";
import { RatingStars } from "./RatingStars";
import type { MediaItem } from "../types/shared";

function progressLabel(item: MediaItem): string {
  if (item.kind === "movie") {
    return item.watched ? "Watched" : "Not watched";
  }
  const episodes = item.seasons.flatMap((s) => s.episodes);
  const watched = episodes.filter((e) => e.watched).length;
  return `${watched} / ${episodes.length} episodes`;
}

export function PosterCard({ item }: { item: MediaItem }) {
  return (
    <Link to={`/media/${item.id}`} className="poster-card">
      <div className="poster-card-image">
        {item.posterUrl ? (
          <img src={item.posterUrl} alt="" />
        ) : (
          <div className="poster-placeholder">
            <span>{item.title.slice(0, 1)}</span>
          </div>
        )}
        <span className={`status-chip status-${item.status}`}>{item.status}</span>
      </div>
      <div className="poster-card-body">
        <h3 className="poster-card-title">{item.title}</h3>
        <p className="poster-card-progress">{progressLabel(item)}</p>
        {item.rating !== null && <RatingStars rating={item.rating} size="sm" />}
      </div>
    </Link>
  );
}
