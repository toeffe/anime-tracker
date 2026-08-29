const { stampExe } = require("./stamp-win-icon.cjs");

async function afterAllArtifactBuild(buildResult) {
  for (const artifact of buildResult.artifactPaths) {
    if (artifact.toLowerCase().endsWith(".exe")) {
      stampExe(artifact);
    }
  }
}

module.exports = afterAllArtifactBuild;
module.exports.afterAllArtifactBuild = afterAllArtifactBuild;
module.exports.default = afterAllArtifactBuild;
