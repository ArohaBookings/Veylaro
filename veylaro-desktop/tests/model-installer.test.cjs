const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { downloadVerifiedFile, installModelBundle, validateModelBundleManifest } = require("../electron/modelInstaller.cjs");

const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");

function bundleFixture() {
  const files = new Map([
    ["config.json", Buffer.from("{}")],
    ["tokenizer_config.json", Buffer.from("{}")],
    ["tokenizer.json", Buffer.from("x".repeat(2048))],
    ["model.safetensors", Buffer.alloc(1024 * 1024 + 7, 7)],
  ]);
  const inventory = [...files].map(([file, bytes]) => ({
    path: file,
    url: `https://downloads.veylaroai.com/lite/${file}`,
    sha256: sha(bytes),
    bytes: bytes.length,
  }));
  const manifest = {
    schema_version: 1,
    tier: "lite",
    checkpoint: "google/gemma-4-e2b-it",
    files: inventory,
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  const totalBytes = inventory.reduce((sum, item) => sum + item.bytes, 0);
  const releaseEntry = {
    checkpoint: manifest.checkpoint,
    minimum_ram_gb: 8,
    release_status: "ready",
    artifact: {
      manifest_url: "https://downloads.veylaroai.com/lite/manifest.json",
      manifest_sha256: sha(manifestBytes),
      total_bytes: totalBytes,
    },
    license: { spdx: "Apache-2.0", notice: "licenses/Apache-2.0.txt" },
  };
  return { files, manifest, manifestBytes, releaseEntry };
}

function fetchFixture(fixture, overrides = new Map()) {
  return async (url) => {
    const value = overrides.has(url)
      ? overrides.get(url)
      : url === fixture.releaseEntry.artifact.manifest_url
        ? fixture.manifestBytes
        : fixture.files.get(new URL(url).pathname.split("/").pop());
    if (!value) return new Response("missing", { status: 404 });
    return new Response(value, { status: 200, headers: { "content-length": String(value.length) } });
  };
}

test("model installer streams a verified bundle and writes an integrity marker", async (t) => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "veylaro-model-install-"));
  t.after(() => fs.rmSync(userDataPath, { recursive: true, force: true }));
  const fixture = bundleFixture();
  const progress = [];
  const result = await installModelBundle({
    tier: "lite",
    releaseEntry: fixture.releaseEntry,
    userDataPath,
    fetchImpl: fetchFixture(fixture),
    onProgress: (event) => progress.push(event),
  });
  assert.equal(result.ok, true);
  assert.equal(fs.statSync(path.join(result.path, "model.safetensors")).size, 1024 * 1024 + 7);
  const marker = JSON.parse(fs.readFileSync(path.join(result.path, ".veylaro-bundle.json"), "utf8"));
  assert.equal(marker.bundle_manifest_sha256, fixture.releaseEntry.artifact.manifest_sha256);
  assert.ok(progress.length > 0);
});

test("a corrupted file is rejected without replacing the installed model", async (t) => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "veylaro-model-rollback-"));
  t.after(() => fs.rmSync(userDataPath, { recursive: true, force: true }));
  const target = path.join(userDataPath, "models", "lite");
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, "keep.txt"), "known-good");
  const fixture = bundleFixture();
  const badUrl = "https://downloads.veylaroai.com/lite/model.safetensors";
  const overrides = new Map([[badUrl, Buffer.alloc(1024 * 1024 + 7, 9)]]);
  await assert.rejects(() => installModelBundle({
    tier: "lite",
    releaseEntry: fixture.releaseEntry,
    userDataPath,
    fetchImpl: fetchFixture(fixture, overrides),
  }), /digest mismatch/);
  assert.equal(fs.readFileSync(path.join(target, "keep.txt"), "utf8"), "known-good");
});

test("an interrupted standalone download removes its partial file", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "veylaro-model-partial-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const destination = path.join(root, "weights", "model.safetensors");
  const expected = Buffer.from("expected-complete-file");
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(() => downloadVerifiedFile({
    path: "model.safetensors",
    url: "https://downloads.veylaroai.com/lite/model.safetensors",
    sha256: sha(expected),
    bytes: expected.length,
  }, destination, {
    signal: controller.signal,
    fetchImpl: async () => new Response(Buffer.from("partial"), { status: 200 }),
  }), /aborted/);

  assert.equal(fs.existsSync(destination), false);
  assert.equal(fs.existsSync(`${destination}.part`), false);
});

test("bundle manifests reject traversal and mismatched checkpoints", () => {
  const fixture = bundleFixture();
  fixture.manifest.files[0].path = "../config.json";
  assert.throws(() => validateModelBundleManifest(fixture.manifest, "lite", fixture.releaseEntry), /escapes/);
  const clean = bundleFixture();
  clean.manifest.checkpoint = "unknown/model";
  assert.throws(() => validateModelBundleManifest(clean.manifest, "lite", clean.releaseEntry), /checkpoint/);
});
