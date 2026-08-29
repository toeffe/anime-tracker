import type { SearchResultItem } from "../types/shared";
import { TrailerPlayer } from "./TrailerPlayer";

const SOURCE_LABEL: Record<SearchResultItem["externalSource"], string> = {
  anilist: "AniList",
  jikan: "MyAnimeList",
  wikidata: "Wikidata",
};

interface Props {
  item: SearchResultItem;
  adding?: boolean;
  addDisabled?: boolean;
  onClose: () => void;
  onAdd?: (item: SearchResultItem) => void;
}

export function TrailerModal({ item, adding, addDisabled, onClose, onAdd }: Props) {
  return (
    <div
      className="modal-backdrop trailer-backdrop"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="modal trailer-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{item.title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p className="dim trailer-meta">
          {SOURCE_LABEL[item.externalSource]}
          {item.year ? ` · ${item.year}` : ""}
          {item.episodeCount ? ` · ${item.episodeCount} episodes` : ""}
        </p>
        {item.overview && <p className="detail-overview">{item.overview}</p>}
        <TrailerPlayer source={item.externalSource} externalId={item.externalId} />
        {onAdd && (
          <div className="trailer-actions">
            <button
              className="primary"
              disabled={addDisabled}
              onClick={() => onAdd(item)}
            >
              {adding ? "Adding…" : "Add to library"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
