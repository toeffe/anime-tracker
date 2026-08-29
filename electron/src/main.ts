import { app, BrowserWindow, dialog, ipcMain, session, shell, type OpenDialogOptions } from "electron";
import * as path from "path";
import { closeDb, getDbPath, initDb, resetLibraryDir, setLibraryDir } from "./db";
import { store } from "./store";
import type { SearchResultItem, MediaKind, WatchStatus } from "../types/shared";

const isDev = !app.isPackaged;

if (isDev) {
  // Vite needs eval in development. Packaged builds use a CSP without it.
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = "true";
}

function iconPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "icon.ico")
    : path.join(app.getAppPath(), "build", "icon.ico");
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: "Anime Tracker",
    backgroundColor: "#111318",
    icon: iconPath(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("will-attach-webview", (event, webPreferences, params) => {
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.autoplayPolicy = "document-user-activation-required";
    webPreferences.preload = path.join(__dirname, "youtube-guest-preload.js");
    const src = params.src ?? "";
    if (!isAllowedTrailerSrc(src)) {
      event.preventDefault();
    }
  });

  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error("Failed to load UI:", code, desc, url);
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    // app.getAppPath() is the project root in `electron .`, and the asar root when packaged.
    // Do not resolve relative to __dirname (electron/dist/src) — that misses renderer/dist.
    win.loadFile(path.join(app.getAppPath(), "renderer", "dist", "index.html"));
  }
}

function isAllowedTrailerSrc(src: string): boolean {
  try {
    const host = new URL(src).hostname.replace(/^www\./, "");
    return (
      host === "youtube.com" ||
      host === "youtu.be" ||
      host === "youtube-nocookie.com" ||
      host === "dailymotion.com"
    );
  } catch {
    return false;
  }
}

function configureYoutubeSession() {
  const ses = session.fromPartition("persist:youtube");
  const filter = {
    urls: [
      "https://*.youtube.com/*",
      "https://*.youtu.be/*",
      "https://*.youtube-nocookie.com/*",
      "https://*.googlevideo.com/*",
      "https://*.ytimg.com/*",
      "https://*.ggpht.com/*",
    ],
  };

  ses.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    const requestHeaders = { ...details.requestHeaders };
    requestHeaders.Referer = "https://www.youtube.com/";
    callback({ requestHeaders });
  });

  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === "media" || permission === "fullscreen");
  });
}

function rendererCsp(): string {
  const shared = [
    "default-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' https: data: blob:",
    "frame-src https://www.dailymotion.com https://www.youtube.com",
    "media-src 'self' https: blob:",
    "object-src 'none'",
    "base-uri 'self'",
  ];
  if (isDev) {
    return [
      ...shared,
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:5173",
      "connect-src 'self' ws://localhost:5173 http://localhost:5173 https:",
    ].join("; ");
  }
  return [...shared, "script-src 'self'", "connect-src 'self'"].join("; ");
}

function applyRendererCsp() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const isRendererDoc =
      details.resourceType === "mainFrame" &&
      (details.url.startsWith("http://localhost:5173") || details.url.startsWith("file://"));
    if (!isRendererDoc) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [rendererCsp()],
      },
    });
  });
}

function allowDailymotionEmbeds() {
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ["https://*.dailymotion.com/*"] },
    (details, callback) => {
      const requestHeaders = { ...details.requestHeaders };
      if (!requestHeaders.Referer && !requestHeaders.referer) {
        requestHeaders.Referer = "https://www.dailymotion.com/";
      }
      callback({ requestHeaders });
    }
  );
}

app.whenReady().then(() => {
  applyRendererCsp();
  configureYoutubeSession();
  allowDailymotionEmbeds();
  initDb();
  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  closeDb();
});

function registerIpcHandlers() {
  ipcMain.handle("library:list", () => store.list());
  ipcMain.handle("library:get", (_e, id: string) => store.get(id));
  ipcMain.handle("library:remove", (_e, id: string) => store.remove(id));

  ipcMain.handle("search:query", (_e, term: string, kind: MediaKind) => store.search(term, kind));
  ipcMain.handle("search:details", (_e, source: string, id: string) => store.getDetails(source, id));

  ipcMain.handle("add:fromSearchResult", (_e, result: SearchResultItem) =>
    store.addFromSearchResult(result)
  );

  ipcMain.handle("episode:markWatched", (_e, episodeId: string, watched: boolean) =>
    store.markEpisodeWatched(episodeId, watched)
  );
  ipcMain.handle("episode:rate", (_e, episodeId: string, rating: number | null) =>
    store.rateEpisode(episodeId, rating)
  );

  ipcMain.handle("season:rate", (_e, seasonId: string, rating: number | null) =>
    store.rateSeason(seasonId, rating)
  );
  ipcMain.handle("season:markEpisodesWatched", (_e, seasonId: string, watched: boolean) =>
    store.markSeasonEpisodesWatched(seasonId, watched)
  );

  ipcMain.handle("media:rate", (_e, mediaId: string, rating: number | null) =>
    store.rateMedia(mediaId, rating)
  );
  ipcMain.handle("media:markWatched", (_e, mediaId: string, watched: boolean) =>
    store.markMediaWatched(mediaId, watched)
  );
  ipcMain.handle("media:setStatus", (_e, mediaId: string, status: WatchStatus) =>
    store.setStatus(mediaId, status)
  );

  ipcMain.handle("settings:get", () => store.getSettings());
  ipcMain.handle("settings:showSaveFile", () => {
    shell.showItemInFolder(getDbPath());
  });
  ipcMain.handle("settings:chooseLibraryDir", async () => {
    const win = BrowserWindow.getFocusedWindow();
    const options: OpenDialogOptions = {
      title: "Library folder",
      defaultPath: path.dirname(getDbPath()),
      properties: ["openDirectory", "createDirectory"],
    };
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths[0]) return null;
    setLibraryDir(result.filePaths[0]);
    return store.getSettings();
  });
  ipcMain.handle("settings:resetLibraryDir", () => {
    resetLibraryDir();
    return store.getSettings();
  });
  ipcMain.handle("suggestions:forYou", () => store.suggestionsForYou());
  ipcMain.handle("suggestions:trending", () => store.suggestionsTrending());
  ipcMain.handle("suggestions:byGenre", (_e, genre: string) => store.suggestionsByGenre(genre));
  ipcMain.handle("trailer:lookup", (_e, source: string, id: string) => store.lookupTrailer(source, id));
}
