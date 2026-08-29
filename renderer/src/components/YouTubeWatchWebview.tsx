import { useEffect, useRef, useState } from "react";

const YOUTUBE_PLAYER_CSS = `
  ytd-app #masthead-container,
  ytd-app #secondary,
  ytd-app #below,
  ytd-app #comments,
  ytd-app #related,
  ytd-app ytd-watch-metadata,
  ytd-app tp-yt-app-drawer,
  ytd-app #chat,
  ytd-app #chat-container,
  ytd-merch-shelf-renderer,
  .ytp-pause-overlay,
  .ytp-ce-element,
  .ytp-endscreen-content {
    display: none !important;
  }
  html, body, ytd-app {
    overflow: hidden !important;
    background: #000 !important;
    margin: 0 !important;
  }
  #player, #player-container-outer, #player-container-inner, #player-container, ytd-player {
    position: fixed !important;
    inset: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    max-width: none !important;
    margin: 0 !important;
  }
`;

function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&autoplay=0`;
}

function isAllowedYoutubeUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return (
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "youtu.be" ||
      host === "youtube-nocookie.com" ||
      host === "consent.youtube.com"
    );
  } catch {
    return false;
  }
}

function eventUrl(event: Event): string {
  return (event as Event & { url?: string }).url ?? "";
}

export function YouTubeWatchWebview({ videoId }: { videoId: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    setFailed(false);
    setReady(false);
    const src = watchUrl(videoId);
    const webview = document.createElement("webview");
    webview.setAttribute("partition", "persist:youtube");
    webview.setAttribute("src", src);
    webview.setAttribute("allowpopups", "false");
    webview.setAttribute("httpreferrer", "https://www.youtube.com/");
    webview.style.width = "100%";
    webview.style.height = "100%";
    webview.style.border = "0";
    webview.style.background = "#000";
    webview.style.display = "inline-flex";

    const guest = webview as HTMLElement & {
      insertCSS?: (css: string) => Promise<unknown>;
      executeJavaScript?: (code: string) => Promise<unknown>;
    };

    const onReady = () => {
      setReady(true);
      void guest.insertCSS?.(YOUTUBE_PLAYER_CSS);
      void guest.executeJavaScript?.(`(() => {
        if (!window.__atHushYoutube) {
          window.__atHushYoutube = true;
          window.addEventListener("error", (event) => {
            const msg = String(event.message || "");
            if (msg.includes("startTime") || msg.includes("reportAllChanges")) {
              event.preventDefault();
            }
          }, true);
        }
        if (window.__atNoAutoplay) return;
        window.__atNoAutoplay = true;
        let allowPlay = false;
        const pauseIfAuto = (video) => {
          if (allowPlay || !video || video.tagName !== "VIDEO") return;
          video.autoplay = false;
          video.pause();
        };
        document.addEventListener("play", (event) => pauseIfAuto(event.target), true);
        document.addEventListener("playing", (event) => pauseIfAuto(event.target), true);
        document.addEventListener("pointerdown", () => { allowPlay = true; }, true);
        document.addEventListener("keydown", (event) => {
          if (event.code === "Space" || event.key === "k" || event.key === "K") allowPlay = true;
        }, true);
      })()`);
    };

    const onNavigate = (event: Event) => {
      const url = eventUrl(event);
      if (url && !isAllowedYoutubeUrl(url)) {
        event.preventDefault();
        webview.setAttribute("src", src);
      }
    };

    const onFail = (event: Event) => {
      const detail = event as Event & { isMainFrame?: boolean; errorCode?: number };
      if (detail.isMainFrame !== false && detail.errorCode && detail.errorCode !== -3) {
        setFailed(true);
      }
    };

    webview.addEventListener("dom-ready", onReady);
    webview.addEventListener("will-navigate", onNavigate);
    webview.addEventListener("did-fail-load", onFail);
    host.replaceChildren(webview);

    return () => {
      webview.removeEventListener("dom-ready", onReady);
      webview.removeEventListener("will-navigate", onNavigate);
      webview.removeEventListener("did-fail-load", onFail);
      webview.remove();
    };
  }, [videoId]);

  return (
    <div className="trailer-frame">
      <div className="trailer-webview-host" ref={hostRef} />
      {!ready && !failed && <p className="dim trailer-placeholder">Loading player…</p>}
      {failed && (
        <p className="dim trailer-webview-error">Couldn’t load the in-app player. Use Open on YouTube.</p>
      )}
    </div>
  );
}
