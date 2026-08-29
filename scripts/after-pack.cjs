const path = require("path");
const { stampExe } = require("./stamp-win-icon.cjs");

async function afterPack(context) {
  if (context.electronPlatformName !== "win32") return;
  const exe = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.exe`
  );
  stampExe(exe);
}

module.exports = afterPack;
module.exports.afterPack = afterPack;
module.exports.default = afterPack;
