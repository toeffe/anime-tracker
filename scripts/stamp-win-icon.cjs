const fs = require("fs");
const path = require("path");
const { NtExecutable, NtExecutableResource, Data, Resource } = require("resedit");

const ROOT = path.join(__dirname, "..");
const ICON = path.join(ROOT, "build", "icon.ico");
const OUTPUT_DIRS = ["release", "out", "release-fresh"];

function stampExe(exePath, iconPath = ICON) {
  try {
    const buf = fs.readFileSync(exePath);
    const exe = NtExecutable.from(buf, { ignoreCert: true });
    const res = NtExecutableResource.from(exe);
    const iconFile = Data.IconFile.from(fs.readFileSync(iconPath));
    const icons = iconFile.icons.map((item) => item.data);
    const groups = Resource.IconGroupEntry.fromEntries(res.entries);
    if (groups.length === 0) {
      Resource.IconGroupEntry.replaceIconsForResource(res.entries, 1, 1033, icons);
    } else {
      for (const group of groups) {
        Resource.IconGroupEntry.replaceIconsForResource(
          res.entries,
          group.id,
          group.lang,
          icons
        );
      }
    }
    res.outputResource(exe);
    fs.writeFileSync(exePath, Buffer.from(exe.generate()));
    console.log(`stamped icon → ${exePath}`);
  } catch (err) {
    if (err && err.code === "EBUSY") {
      console.warn(`skip stamp (file locked) → ${exePath}`);
      return;
    }
    throw err;
  }
}

function isStampableExe(name) {
  const lower = name.toLowerCase();
  return lower.endsWith(".exe") && lower !== "elevate.exe";
}

function stampDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (!isStampableExe(name)) continue;
    stampExe(path.join(dir, name));
  }
  const unpacked = path.join(dir, "win-unpacked");
  if (!fs.existsSync(unpacked)) return;
  for (const name of fs.readdirSync(unpacked)) {
    if (!isStampableExe(name)) continue;
    stampExe(path.join(unpacked, name));
  }
}

function stampPackageOutputs() {
  if (!fs.existsSync(ICON)) {
    throw new Error(`Missing ${ICON}`);
  }
  for (const dir of OUTPUT_DIRS) {
    stampDir(path.join(ROOT, dir));
  }
}

module.exports = { stampExe, stampPackageOutputs, ICON };

if (require.main === module) {
  stampPackageOutputs();
}
