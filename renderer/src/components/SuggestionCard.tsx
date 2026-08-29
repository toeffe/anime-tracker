import { useState } from "react";
import { Link } from "react-router-dom";
import type { SearchResultItem } from "../types/shared";

const SOURCE_LABEL: Record<SearchResultItem["externalSource"], string> = {
  anilist: "AniList",
  jikan: "MyAnimeList",
  wikidata: "Wikidata",
};

interface Props {
  item: SearchResultItem;
  status: "idle" | "queued" | "adding";
  onAdd: (item: SearchResultItem) => void;
}

export function SuggestionCard({ item, status, onAdd }: Props) {
  const [imgFailed, setImgFailed] = useState(false);
  const busy = status !== "idle";
  const label = status === "adding" ? "Adding…" : status === "queued" ? "Queued" : "Add";

  return (
    <div className="suggestion-card">
      <Link
        to={`/suggest/${item.externalSource}/${encodeURIComponent(item.externalId)}`}
        state={{ item }}
        className="suggestion-preview"
      >
        <div className="poster-card-image">
          {item.posterUrl && !imgFailed ? (
            <img src={item.posterUrl} alt="" onError={() => setImgFailed(true)} />
          ) : (
            <div className="poster-placeholder">
              <span>{item.title.slice(0, 1)}</span>
            </div>
          )}
        </div>
        <div className="poster-card-body">
          <h3 className="poster-card-title">{item.title}</h3>
          <p className="poster-card-progress">{SOURCE_LABEL[item.externalSource]}</p>
        </div>
      </Link>
      <div className="suggestion-card-actions">
        <button
          className="primary suggestion-add"
          disabled={busy}
          onClick={() => onAdd(item)}
        >
          {label}
        </button>
      </div>
    </div>
  );
}
