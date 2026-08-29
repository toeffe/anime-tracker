import { webFrame } from "electron";

declare global {
  interface Window {
    __atHushYoutube?: boolean;
    __atNoAutoplay?: boolean;
  }
}

const guestBoot = `
(() => {
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
})();
`;

try {
  process.once("loaded", () => {
    void webFrame.executeJavaScript(guestBoot, true);
  });
} catch {
  try {
    void webFrame.executeJavaScript(guestBoot, true);
  } catch {
    /* guest may not be ready */
  }
}
