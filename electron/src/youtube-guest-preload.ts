import { webFrame } from "electron";

declare global {
  interface Window {
    __atHushYoutube?: boolean;
  }
}

const hushYoutubeNoise = `
(() => {
  if (window.__atHushYoutube) return;
  window.__atHushYoutube = true;
  window.addEventListener("error", (event) => {
    const msg = String(event.message || "");
    if (msg.includes("startTime") || msg.includes("reportAllChanges")) {
      event.preventDefault();
    }
  }, true);
})();
`;

try {
  process.once("loaded", () => {
    void webFrame.executeJavaScript(hushYoutubeNoise, true);
  });
} catch {
  try {
    void webFrame.executeJavaScript(hushYoutubeNoise, true);
  } catch {
    /* guest may not be ready */
  }
}
