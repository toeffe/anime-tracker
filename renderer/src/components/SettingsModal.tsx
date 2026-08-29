import { useEffect, useState } from "react";
import { api } from "../api";
import { ipcErrorMessage } from "../lib/errors";
import type { AppSettings } from "../types/shared";

interface Props {
  onClose: () => void;
  onLibraryChanged?: () => void;
}

export function SettingsModal({ onClose, onLibraryChanged }: Props) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api()
      .settings.get()
      .then((s) => {
        if (!cancelled) setSettings(s);
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

  async function apply(next: AppSettings) {
    setSettings(next);
    onLibraryChanged?.();
  }

  async function chooseFolder() {
    setBusy(true);
    setError(null);
    try {
      const next = await api().settings.chooseLibraryDir();
      if (next) await apply(next);
    } catch (err) {
      setError(ipcErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function useDefault() {
    setBusy(true);
    setError(null);
    try {
      await apply(await api().settings.resetLibraryDir());
    } catch (err) {
      setError(ipcErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

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
            <label className="settings-label">Library folder</label>
            <p className="dim settings-help">
              {settings?.usingCustomDir
                ? "Using a custom folder. If that folder already has a tracker.db, that library is opened. Otherwise the current file is copied there."
                : "Default location. Change it if you want tracker.db on another drive or in a shared folder."}
            </p>
            <code className="save-path">{settings?.savePath || "—"}</code>
            {error && <p className="error-text">{error}</p>}
            <div className="settings-actions">
              <button
                type="button"
                disabled={!settings?.savePath || busy}
                onClick={() => api().settings.showSaveFile()}
              >
                Show in folder
              </button>
              <button type="button" disabled={busy} onClick={chooseFolder}>
                {busy ? "Working…" : "Change folder"}
              </button>
              {settings?.usingCustomDir && (
                <button type="button" disabled={busy} onClick={useDefault}>
                  Use default folder
                </button>
              )}
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
