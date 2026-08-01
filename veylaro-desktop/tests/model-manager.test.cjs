const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { developmentCatalog, resolveModelCatalog, resolveReleaseModel } = require("../electron/modelManager.cjs");

const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");

function releaseFixture(t) {
  const resourcesPath = fs.mkdtempSync(path.join(os.tmpdir(), "veylaro-catalog-resources-"));
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "veylaro-catalog-user-"));
  t.after(() => {
    fs.rmSync(resourcesPath, { recursive: true, force: true });
    fs.rmSync(userDataPath, { recursive: true, force: true });
  });
  const runtimeRoot = path.join(resourcesPath, "runtime-release");
  fs.mkdirSync(runtimeRoot, { recursive: true });
  const ready = {
    checkpoint: "google/gemma-4-e2b-it",
    minimum_ram_gb: 8,
    release_status: "ready",
    artifact: {
      manifest_url: "https://downloads.veylaroai.com/lite.json",
      manifest_sha256: digest("lite-manifest"),
      total_bytes: 2 * 1024 * 1024,
    },
    license: { spdx: "Apache-2.0", notice: "licenses/Apache-2.0.txt" },
  };
  const gated = (checkpoint, ram) => ({
    checkpoint,
    minimum_ram_gb: ram,
    release_status: "gated",
    gate_reason: "No verified production checkpoint is published.",
  });
  fs.writeFileSync(path.join(runtimeRoot, "release-manifest.json"), JSON.stringify({
    schema_version: 1,
    release_id: "catalog-test",
    engine: {
      protocol: "openai-v1",
      variants: {
        "darwin-arm64": {
          executable: "engine/veylaro",
          arguments: ["serve"],
          files: [{ path: "engine/veylaro", sha256: digest("engine"), bytes: 6 }],
        },
      },
    },
    models: {
      lite: ready,
      med: gated("google/gemma-4-12b-it", 16),
      max: gated("mistralai/devstral-24b", 24),
    },
  }));
  return { resourcesPath, userDataPath, ready };
}

test("development catalog gates every tier instead of advertising placeholders", () => {
  const catalog = developmentCatalog();
  assert.equal(catalog.productionReady, false);
  assert.deepEqual(catalog.models.map((item) => item.releaseStatus), ["gated", "gated", "gated"]);
});

test("packaged catalog exposes only manifest-ready tiers", (t) => {
  const fixture = releaseFixture(t);
  const options = { packaged: true, ...fixture, platform: "darwin", arch: "arm64" };
  const catalog = resolveModelCatalog(options);
  assert.equal(catalog.releaseId, "catalog-test");
  assert.equal(catalog.models.find((item) => item.tier === "lite").releaseStatus, "ready");
  assert.equal(catalog.models.find((item) => item.tier === "med").releaseStatus, "gated");
  assert.equal(catalog.models.find((item) => item.tier === "max").installed, false);
  assert.equal(resolveReleaseModel(options, "lite").entry.checkpoint, fixture.ready.checkpoint);
  assert.throws(() => resolveReleaseModel(options, "med"), /No verified/);
});
