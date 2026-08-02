/* ============================================================
   Self-contained GGUF model catalog.

   The app bundles the llama.cpp engine (runtime-release/) and downloads these
   GGUF weights on first run — verified by exact size + SHA-256 — into
   userData/models/<tier>/model.gguf, where llamacppLaunchSpec finds them. No
   Python, no MLX, no ollama.

   Lite (Gemma 4B / E2B) is pinned and shippable now. Med/Max are gated until
   their GGUFs are pinned — the catalog reports them honestly as "coming soon"
   rather than offering a download that can't be verified.
   ============================================================ */

const fs = require("fs");
const path = require("path");
const { downloadVerifiedFile } = require("./modelInstaller.cjs");
const { ggufLooksComplete } = require("./engineRuntime.cjs");

// All three tiers are Gemma (commercial use permitted under the Gemma Terms) and
// load in llama.cpp. SHA-256 pins are HuggingFace's LFS X-Linked-ETag (verified:
// lite's pin equals the locally-computed hash of the downloaded file).
const GGUF_MODELS = Object.freeze({
  lite: Object.freeze({
    tier: "lite",
    checkpoint: "unsloth/gemma-3n-E2B-it-GGUF",
    url: "https://huggingface.co/unsloth/gemma-3n-E2B-it-GGUF/resolve/main/gemma-3n-E2B-it-Q4_K_M.gguf",
    bytes: 3026881888,
    sha256: "189d42b4303cb1078ea8d00963f437cd6d884069b7ba2ba80b38cd09585dc415",
    minimumRamGB: 8,
  }),
  med: Object.freeze({
    tier: "med",
    checkpoint: "unsloth/gemma-3-12b-it-GGUF",
    url: "https://huggingface.co/unsloth/gemma-3-12b-it-GGUF/resolve/main/gemma-3-12b-it-Q4_K_M.gguf",
    bytes: 7300778336,
    sha256: "15b8fd9d8672cd4240c178c217ca781409291f34e353d2e913b29c7602ceb3ff",
    minimumRamGB: 12,
  }),
  max: Object.freeze({
    tier: "max",
    checkpoint: "unsloth/gemma-3-27b-it-GGUF",
    url: "https://huggingface.co/unsloth/gemma-3-27b-it-GGUF/resolve/main/gemma-3-27b-it-Q4_K_M.gguf",
    bytes: 16546688736,
    sha256: "f1b699659942c777bd3ec0bcb527d6ebf34ae14ca76e3af103d58d0c9cbdadee",
    minimumRamGB: 24,
  }),
});

function ggufPath(userDataPath, tier) {
  return path.join(userDataPath, "models", tier, "model.gguf");
}

/** Is the tier's GGUF present and plausibly complete on disk? */
function ggufInstalled(userDataPath, tier) {
  if (!GGUF_MODELS[tier]) return false;
  return ggufLooksComplete(ggufPath(userDataPath, tier));
}

/** Download + verify the tier's GGUF into userData/models/<tier>/model.gguf.
    No-op (returns cached) if it's already present and complete. */
async function installGgufModel(options) {
  const { tier, userDataPath, onProgress, signal } = options;
  const entry = GGUF_MODELS[tier];
  if (!entry) throw new Error(`No GGUF model is registered for the ${tier} tier yet.`);
  const dest = ggufPath(userDataPath, tier);
  if (ggufLooksComplete(dest)) {
    return { ok: true, tier, path: dest, checkpoint: entry.checkpoint, bytes: entry.bytes, cached: true };
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  await downloadVerifiedFile(
    { url: entry.url, path: `${tier}/model.gguf`, bytes: entry.bytes, sha256: entry.sha256 },
    dest,
    {
      signal,
      onProgress: (p) =>
        onProgress?.({ file: `${tier}/model.gguf`, received: p.received, total: p.total, completed: 0, bundleTotal: entry.bytes }),
    },
  );
  return { ok: true, tier, path: dest, checkpoint: entry.checkpoint, bytes: entry.bytes };
}

/** Catalog rows for the renderer: ready + installed state per tier. */
function ggufCatalog(userDataPath) {
  return ["lite", "med", "max"].map((tier) => {
    const entry = GGUF_MODELS[tier];
    if (entry) {
      return {
        tier,
        checkpoint: entry.checkpoint,
        minimumRamGB: entry.minimumRamGB,
        releaseStatus: "ready",
        installed: ggufInstalled(userDataPath, tier),
        bytes: entry.bytes,
      };
    }
    return {
      tier,
      releaseStatus: "gated",
      installed: false,
      gateReason: `Laro ${tier} weights are coming soon.`,
    };
  });
}

module.exports = { GGUF_MODELS, ggufPath, ggufInstalled, installGgufModel, ggufCatalog };
