<p align="center">
  <img src="docs/banner.jpg" alt="Anime Tracker" width="840">
</p>

<p align="center">
  <b>A local desktop library for anime and movies.</b><br>
  No account. No API keys. Your list stays on your machine.
</p>

<p align="center">
  <a href="https://github.com/toeffe/anime-tracker/releases/latest"><img src="https://img.shields.io/github/v/release/toeffe/anime-tracker?style=flat-square&label=release&color=c9a0b8" alt="Latest release"></a>
  <a href="https://github.com/toeffe/anime-tracker/releases"><img src="https://img.shields.io/badge/platform-Windows-0078D4?style=flat-square" alt="Windows"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-5c5f6e?style=flat-square" alt="MIT License"></a>
</p>

<p align="center">
  <a href="https://github.com/toeffe/anime-tracker/releases/latest"><b>Download the portable .exe</b></a>
  ·
  <a href="https://github.com/toeffe/anime-tracker/releases">All releases</a>
</p>

## Features

- Search AniList, MyAnimeList, and Wikidata
- Track seasons and episodes, with star ratings
- **For you** suggestions based on what you rated
- In-app trailers
- One portable Windows build — `tracker.db` lives next to the `.exe`

## Download

Prebuilt binaries are published under **[Releases](https://github.com/toeffe/anime-tracker/releases)**. Use the latest Windows portable `.exe`. No installer: put it in a folder and run it. The library file (`tracker.db`) is created beside the executable.

## Privacy

Metadata is fetched from public APIs (AniList, Jikan/MAL, Wikidata). Your watch list, ratings, and progress never leave this computer.

| Mode | Library file |
| --- | --- |
| Packaged app | `tracker.db` next to the `.exe` |
| Development | `data/tracker.db` |

That database is gitignored.

## Development

Requires Node.js 22+ and [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (C++ workload) so `better-sqlite3` can compile for Electron.

```bash
npm install
npm --prefix renderer install
npm run dev
```

```bash
npm run package
```

## License

[MIT](LICENSE)
