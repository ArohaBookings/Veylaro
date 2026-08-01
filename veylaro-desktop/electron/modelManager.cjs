const path = require("node:path");

const { TIERS, loadReleaseManifest } = require("../build/releaseBundle.cjs");
const { installedBundleLooksValid } = require("./engineRuntime.cjs");

function developmentCatalog(reason = "No signed model bundle is embedded in this development preview.") {
  return {
    ok: true,
    releaseId: null,
    productionReady: false,
    models: TIERS.map((tier) => ({
      tier,
      releaseStatus: "gated",
      installed: false,
      gateReason: reason,
    })),
  };
}

function resolveModelCatalog(options = {}) {
  if (!options.packaged) return developmentCatalog();
  const runtimeRoot = path.join(options.resourcesPath, "runtime-release");
  const validated = loadReleaseManifest(runtimeRoot, {
    platform: options.platform,
    arch: options.arch,
  });
  const models = TIERS.map((tier) => {
    const entry = validated.manifest.models[tier];
    const installedRoot = path.join(options.userDataPath, "models", tier);
    const ready = entry.release_status === "ready";
    return {
      tier,
      checkpoint: entry.checkpoint,
      minimumRamGB: entry.minimum_ram_gb,
      releaseStatus: entry.release_status,
      installed: ready && installedBundleLooksValid(installedRoot, tier, entry),
      bytes: ready ? entry.artifact.total_bytes : undefined,
      gateReason: ready ? undefined : entry.gate_reason,
    };
  });
  return {
    ok: true,
    releaseId: validated.manifest.release_id,
    productionReady: models.some((item) => item.releaseStatus === "ready"),
    models,
  };
}

function resolveReleaseModel(options, tier) {
  if (!TIERS.includes(tier)) throw new Error("unknown model tier");
  if (!options.packaged) throw new Error("model installation is unavailable in development builds");
  const runtimeRoot = path.join(options.resourcesPath, "runtime-release");
  const validated = loadReleaseManifest(runtimeRoot, {
    platform: options.platform,
    arch: options.arch,
  });
  const entry = validated.manifest.models[tier];
  if (entry.release_status !== "ready") throw new Error(entry.gate_reason || `${tier} is not release-ready`);
  return { entry, releaseId: validated.manifest.release_id };
}

module.exports = {
  developmentCatalog,
  resolveModelCatalog,
  resolveReleaseModel,
};
