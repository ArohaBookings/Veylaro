const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("the local launcher never weakens Gatekeeper or strips quarantine", () => {
  const launcher = read("run-app-locally.sh");
  assert.doesNotMatch(launcher, /xattr\s+-[a-zA-Z]*[rd]/);
  assert.doesNotMatch(launcher, /spctl\s+--master-disable/);
  assert.doesNotMatch(launcher, /codesign\b/);
  assert.match(launcher, /spctl\s+--assess/);
});

test("the optional local-only signing hook does not invoke a shell", () => {
  const hook = read("build/afterPack.cjs");
  assert.doesNotMatch(hook, /execSync|spawnSync\([^,]+,[^,]+,\s*\{[^}]*shell:\s*true/s);
  assert.match(hook, /execFileSync\("codesign"/);
  assert.match(hook, /VEYLARO_LOCAL_ADHOC/);
});

test("production packaging remains guarded by the release preflight", () => {
  const packageJson = JSON.parse(read("package.json"));
  assert.match(packageJson.scripts.dist, /^node build\/releasePreflight\.cjs/);
  assert.match(packageJson.scripts["dist:mac"], /^node build\/releasePreflight\.cjs/);
  assert.match(packageJson.scripts["dist:win"], /^node build\/releasePreflight\.cjs/);
  assert.match(packageJson.scripts["dist:all"], /^node build\/releasePreflight\.cjs/);
  assert.ok(packageJson.build.files.includes("build/releaseBundle.cjs"));
});

test("release preflight requires a self-contained, integrity-pinned runtime payload", () => {
  const preflight = read("build/releasePreflight.cjs");
  assert.match(preflight, /runtime-release/);
  assert.match(preflight, /loadReleaseManifest/);
  assert.match(preflight, /verifyEnginePayload/);
});

test("production entitlements keep library validation enabled", () => {
  for (const file of ["build/entitlements.mac.plist", "build/entitlements.mac.inherit.plist"]) {
    const plist = read(file);
    assert.doesNotMatch(plist, /disable-library-validation/);
    assert.match(plist, /com\.apple\.security\.cs\.allow-jit/);
  }
});

test("production inference has no legacy Ollama protocol dependency", () => {
  for (const file of ["electron/main.cjs", "src/engine/runtime.ts", "src/components/Deck.tsx", "cli/veylaro.cjs"]) {
    const source = read(file);
    assert.doesNotMatch(source, /\/api\/(?:tags|chat|generate)/);
    assert.doesNotMatch(source, /127\.0\.0\.1:11434|Ollama isn't running|point at a different Ollama/);
  }
});
