const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  loadReleaseManifest,
  validateReleaseManifest,
  verifyEnginePayload,
} = require("../build/releaseBundle.cjs");

const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "veylaro-release-"));
  fs.mkdirSync(path.join(root, "engine", "bin"), { recursive: true });
  const executable = path.join(root, "engine", "bin", "veylaro-engine");
  fs.writeFileSync(executable, "engine-fixture");
  fs.chmodSync(executable, 0o755);
  fs.mkdirSync(path.join(root, "licenses"), { recursive: true });
  fs.writeFileSync(path.join(root, "licenses", "Apache-2.0.txt"), "Apache License 2.0\n" + "license fixture ".repeat(12));
  const hash = digest("engine-fixture");
  const artifactHash = digest("artifact");
  const bundleHash = digest("bundle-manifest");
  const model = (checkpoint, minimumRam, releaseStatus = "ready") => ({
    checkpoint,
    minimum_ram_gb: minimumRam,
    release_status: releaseStatus,
    ...(releaseStatus === "ready" ? {
      artifact: {
        manifest_url: `https://downloads.veylaroai.com/${checkpoint.split("/").pop()}.json`,
        manifest_sha256: bundleHash,
        total_bytes: 2 * 1024 * 1024,
      },
      license: { spdx: "Apache-2.0", notice: "licenses/Apache-2.0.txt" },
    } : { gate_reason: "checkpoint has not passed release verification" }),
  });
  const manifest = {
    schema_version: 1,
    release_id: "test-release",
    engine: {
      protocol: "openai-v1",
      variants: {
        "darwin-arm64": {
          executable: "engine/bin/veylaro-engine",
          arguments: ["serve"],
          files: [{ path: "engine/bin/veylaro-engine", sha256: hash, bytes: 14 }],
        },
      },
    },
    models: {
      lite: model("google/gemma-4-e2b-it", 8),
      med: model("google/gemma-4-12b-it", 16, "gated"),
      max: model("mistralai/Devstral-Small-2-24B-Instruct", 24, "gated"),
    },
  };
  fs.writeFileSync(path.join(root, "release-manifest.json"), JSON.stringify(manifest));
  return { root, manifest, executable };
}

test("a complete release manifest and engine payload pass", (t) => {
  const { root, executable } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const validated = loadReleaseManifest(root, { platform: "darwin", arch: "arm64" });
  assert.equal(validated.readyModels, 1);
  assert.equal(verifyEnginePayload(root, validated), fs.realpathSync(executable));
});

test("placeholder hashes, insecure URLs, and metadata-only releases fail closed", (t) => {
  const { root, manifest } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  manifest.models.lite.artifact.manifest_sha256 = "0".repeat(64);
  assert.throws(() => validateReleaseManifest(manifest, { platform: "darwin", arch: "arm64" }), /non-placeholder SHA-256/);
  manifest.models.lite.artifact.manifest_sha256 = digest("bundle-manifest");
  manifest.models.lite.artifact.manifest_url = "http://downloads.veylaroai.com/lite.json";
  assert.throws(() => validateReleaseManifest(manifest, { platform: "darwin", arch: "arm64" }), /credential-free HTTPS/);
  for (const tier of ["lite", "med", "max"]) {
    manifest.models[tier] = {
      checkpoint: manifest.models[tier].checkpoint,
      minimum_ram_gb: manifest.models[tier].minimum_ram_gb,
      release_status: "gated",
      gate_reason: "no executed release evidence exists",
    };
  }
  assert.throws(() => validateReleaseManifest(manifest, { platform: "darwin", arch: "arm64" }), /at least one model tier/);
});

test("path traversal, symlink escape, and payload tampering are rejected", (t) => {
  const { root, manifest } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  manifest.engine.variants["darwin-arm64"].executable = "../engine";
  assert.throws(() => validateReleaseManifest(manifest, { platform: "darwin", arch: "arm64" }), /escapes/);

  const clean = fixture();
  t.after(() => fs.rmSync(clean.root, { recursive: true, force: true }));
  const validated = loadReleaseManifest(clean.root, { platform: "darwin", arch: "arm64" });
  fs.writeFileSync(clean.executable, "changed-fixture");
  fs.chmodSync(clean.executable, 0o755);
  assert.throws(() => verifyEnginePayload(clean.root, validated), /size mismatch|digest mismatch/);
});
