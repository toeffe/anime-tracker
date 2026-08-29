import { useEffect, useState } from "react";
import { api } from "../api";
import { ipcErrorMessage } from "../lib/errors";

interface Props {
  onClose: () => void;
}

export function SettingsModal({ onClose }: Props) {
  const [savePath, setSavePath] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api()
      .settings.get()
      .then((s) => {
        if (!cancelled) setSavePath(s.savePath);
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
  }, []);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {loading ? (
          <p className="dim">Loading…</p>
        ) : (
          <div className="settings-form">
            <label className="settings-label">Library save</label>
            <p className="dim settings-help">
              Your list is one file. Copy it to back up, or keep it next to the app when you move the folder.
            </p>
            <code className="save-path">{savePath || "—"}</code>
            {error && <p className="error-text">{error}</p>}
            <div className="settings-actions">
              <button
                type="button"
                disabled={!savePath}
                onClick={() => api().settings.showSaveFile()}
              >
                Show in folder
              </button>
            </div>
            <p className="dim settings-help">
              Search uses public AniList, MyAnimeList (Jikan), and Wikidata.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
