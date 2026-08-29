const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { stampPackageOutputs } = require("./stamp-win-icon.cjs");

const ROOT = path.join(__dirname, "..");

function runBuilder(outputDir) {
  const args = ["electron-builder"];
  if (outputDir) {
    args.push(`--config.directories.output=${outputDir}`);
  }
  return spawnSync("npx", args, {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
  });
}

function looksBusy(status) {
  return status !== 0;
}

function copyPortableToRelease() {
  const version = require(path.join(ROOT, "package.json")).version;
  const fileName = `AnimeTracker-${version}.exe`;
  const sources = [
    path.join(ROOT, "out", fileName),
    path.join(ROOT, "release", fileName),
    path.join(ROOT, "out", `Anime Tracker ${version}.exe`),
    path.join(ROOT, "release", `Anime Tracker ${version}.exe`),
  ];
  const src = sources.find((p) => fs.existsSync(p));
  if (!src) return null;
  const dest = path.join(ROOT, "release", fileName);
  if (path.resolve(src) === path.resolve(dest)) return dest;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try {
    fs.copyFileSync(src, dest);
    return dest;
  } catch {
    const fallback = path.join(ROOT, "release", `AnimeTracker-${version}-new.exe`);
    fs.copyFileSync(src, fallback);
    return fallback;
  }
}

let result = runBuilder();
if (looksBusy(result.status)) {
  console.warn(
    "electron-builder failed (often EBUSY on release/win-unpacked). Retrying into out/"
  );
  result = runBuilder("out");
}

try {
  stampPackageOutputs();
} catch (err) {
  console.warn(`icon stamp: ${err.message}`);
}
let copied = null;
try {
  copied = copyPortableToRelease();
} catch (err) {
  console.warn(`copy portable: ${err.message}`);
}
if (copied) {
  console.log(`portable exe → ${copied}`);
}

process.exit(result.status ?? 1);
