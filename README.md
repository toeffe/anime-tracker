# Anime Tracker

Local desktop library for anime and movies. No account. No API keys.

Search [AniList](https://anilist.co), [MyAnimeList](https://myanimelist.net) (via Jikan), and [Wikidata](https://www.wikidata.org). Track episodes, rate with stars, get **For you** suggestions, and play trailers.

The Windows portable build is one `.exe` plus `tracker.db` next to it.

## Requirements

- Node.js 22+
- Windows (packaging targets a portable `.exe`)
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the **Desktop development with C++** workload (needed once, so `better-sqlite3` can compile for Electron)

## Develop

```bash
npm install
npm --prefix renderer install
npm run dev
```

## Package (Windows portable)

```bash
npm run package
```

Output:

- `release/Anime Tracker 0.1.0.exe`
- `release/win-unpacked/Anime Tracker.exe` (folder build)

## Data

| Mode | Save file |
| --- | --- |
| Dev | `data/tracker.db` |
| Portable exe | `tracker.db` beside the exe |

That file is gitignored. Do not commit it.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite UI + Electron |
| `npm run typecheck` | Compile Electron + renderer |
| `npm run package` | Production exe |

Metadata comes from public APIs. Your list never leaves this machine.
