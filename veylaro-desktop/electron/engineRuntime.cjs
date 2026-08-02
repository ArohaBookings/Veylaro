const fs = require("fs");
const os = require("os");
const path = require("path");
const { loadReleaseManifest, verifyEnginePayload } = require("../build/releaseBundle.cjs");

const GEMMA4_ID = "mlx-community/gemma-4-e2b-it-4bit";
const GEMMA4_MED_ID = "mlx-community/gemma-4-12B-it-4bit";
const DEVSTRAL_MAX_ID = "mlx-community/Devstral-Small-2-24B-Instruct-2512-OptiQ-4bit";
const GEMMA3_ID = "mlx-community/gemma-3-text-4b-it-4bit";

const MODEL_TIERS = Object.freeze({
  lite: Object.freeze({
    id: "lite",
    modelId: GEMMA4_ID,
    modelPathEnv: "VEYLARO_LITE_MODEL_PATH",
    pythonEnv: "VEYLARO_LITE_MLX_PYTHON",
    adapterEnv: "VEYLARO_LITE_ADAPTER_PATH",
    minimumRamGB: 8,
  }),
  med: Object.freeze({
    id: "med",
    modelId: GEMMA4_MED_ID,
    modelPathEnv: "VEYLARO_MED_MODEL_PATH",
    pythonEnv: "VEYLARO_MED_MLX_PYTHON",
    adapterEnv: "VEYLARO_MED_ADAPTER_PATH",
    minimumRamGB: 12,
  }),
  max: Object.freeze({
    id: "max",
    modelId: DEVSTRAL_MAX_ID,
    modelPathEnv: "VEYLARO_MAX_MODEL_PATH",
    pythonEnv: "VEYLARO_MAX_MLX_PYTHON",
    adapterEnv: "VEYLARO_MAX_ADAPTER_PATH",
    minimumRamGB: 24,
  }),
});

function modelTierConfig(sku = "lite") {
  return MODEL_TIERS[sku] || MODEL_TIERS.lite;
}

function tierFromModelName(model) {
  const value = String(model || "").toLowerCase();
  if (/(?:laro|veylaro)[-_ ]?max|(?:^|[-_/ ])24b(?:$|[-_/ ])/i.test(value)) return "max";
  if (/(?:laro|veylaro)[-_ ]?med|(?:^|[-_/ ])12b(?:$|[-_/ ])/i.test(value)) return "med";
  if (/(?:laro|veylaro)[-_ ]?lite|gemma-4-e2b|gemma-3.*4b|(?:^|[-_/ ])4b(?:$|[-_/ ])/i.test(value)) return "lite";
  return undefined;
}

function modelPreference(sku = "lite") {
  const tier = modelTierConfig(sku);
  const aliases = [`laro-${tier.id}`, `veylaro-${tier.id}`, tier.modelId];
  if (tier.id === "lite") aliases.push(GEMMA3_ID);
  if (tier.id === "med") aliases.push("gemma4:12b");
  if (tier.id === "max") aliases.push("devstral:24b");
  return aliases;
}

function selectEngineModel(models, preferred = "", sku = "lite") {
  const names = (models || []).map(String).filter(Boolean);
  const normalizedPreferred = String(preferred || "").replace(/:latest$/, "");
  const exact = names.find((model) => model === preferred || model.replace(/:latest$/, "") === normalizedPreferred);
  if (exact && tierFromModelName(exact) === sku) return exact;
  for (const wanted of modelPreference(sku)) {
    const hit = names.find((model) => model === wanted || model.startsWith(`${wanted}:`));
    if (hit && tierFromModelName(hit) === sku) return hit;
  }
  return "";
}

function cacheRepo(modelId) {
  return path.join(
    os.homedir(),
    ".cache",
    "huggingface",
    "hub",
    `models--${modelId.replace("/", "--")}`,
  );
}

function hasCachedSnapshot(modelId) {
  const snapshots = path.join(cacheRepo(modelId), "snapshots");
  try {
    return fs.readdirSync(snapshots).some((name) => snapshotLooksComplete(path.join(snapshots, name)));
  } catch {
    return false;
  }
}

function nonEmptyFile(file, minimumBytes = 1) {
  try {
    return fs.statSync(file).isFile() && fs.statSync(file).size >= minimumBytes;
  } catch {
    return false;
  }
}

function snapshotLooksComplete(candidate) {
  try {
    if (!fs.statSync(candidate).isDirectory()) return false;
    if (!nonEmptyFile(path.join(candidate, "config.json"))) return false;
    if (!nonEmptyFile(path.join(candidate, "tokenizer_config.json"))) return false;
    if (!nonEmptyFile(path.join(candidate, "tokenizer.json"), 1024)) return false;

    const indexPath = path.join(candidate, "model.safetensors.index.json");
    if (nonEmptyFile(indexPath)) {
      const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
      const shards = [...new Set(Object.values(index?.weight_map || {}).map(String).filter(Boolean))];
      return shards.length > 0 && shards.every((file) => nonEmptyFile(path.join(candidate, file), 1024 * 1024));
    }
    return fs.readdirSync(candidate)
      .filter((file) => /^model.*\.safetensors$/i.test(file))
      .some((file) => nonEmptyFile(path.join(candidate, file), 1024 * 1024));
  } catch {
    return false;
  }
}

function engineBase(raw) {
  try {
    const url = new URL(String(raw || "http://127.0.0.1:8080"));
    return `${url.protocol}//${url.hostname}:${url.port || (url.protocol === "https:" ? "443" : "80")}`;
  } catch {
    return "http://127.0.0.1:8080";
  }
}

function installedBundleLooksValid(modelRoot, tier, releaseEntry) {
  try {
    if (!snapshotLooksComplete(modelRoot)) return false;
    const marker = JSON.parse(fs.readFileSync(path.join(modelRoot, ".veylaro-bundle.json"), "utf8"));
    return marker?.schema_version === 1
      && marker?.tier === tier
      && marker?.checkpoint === releaseEntry.checkpoint
      && marker?.bundle_manifest_sha256 === releaseEntry.artifact.manifest_sha256;
  } catch {
    return false;
  }
}

function packagedLaunchSpec(raw, options, tier) {
  try {
    if (!options.resourcesPath || !options.userDataPath) return null;
    const base = engineBase(raw);
    const parsed = new URL(base);
    if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") return null;
    const runtimeRoot = path.join(options.resourcesPath, "runtime-release");
    const validated = loadReleaseManifest(runtimeRoot, {
      platform: options.platform || process.platform,
      arch: options.arch || process.arch,
    });
    const releaseEntry = validated.manifest.models[tier.id];
    if (releaseEntry.release_status !== "ready") return null;
    const model = path.join(options.userDataPath, "models", tier.id);
    if (!installedBundleLooksValid(model, tier.id, releaseEntry)) return null;
    const command = verifyEnginePayload(runtimeRoot, validated);
    const args = [
      ...validated.variant.arguments,
      "--model", model,
      "--host", "127.0.0.1",
      "--port", parsed.port || "8080",
      "--max-tokens", "512",
      "--decode-concurrency", "1",
      "--prompt-concurrency", "1",
      "--prefill-step-size", "256",
      "--prompt-cache-size", "1",
      "--prompt-cache-bytes", "67108864",
    ];
    if (/gemma-4/i.test(releaseEntry.checkpoint)) args.push("--chat-template-args", '{"enable_thinking":false}');
    return {
      command,
      args,
      cwd: runtimeRoot,
      model,
      tier: tier.id,
      minimumRamGB: tier.minimumRamGB,
      releaseId: validated.manifest.release_id,
    };
  } catch {
    return null;
  }
}

const GGUF_MAGIC = Buffer.from("GGUF");
/** A GGUF weight file that is present and plausibly complete (correct magic,
    not a truncated download). */
function ggufLooksComplete(file, minimumBytes = 50 * 1024 * 1024) {
  try {
    const st = fs.statSync(file);
    if (!st.isFile() || st.size < minimumBytes) return false;
    const fd = fs.openSync(file, "r");
    const head = Buffer.alloc(4);
    fs.readSync(fd, head, 0, 4, 0);
    fs.closeSync(fd);
    return head.equals(GGUF_MAGIC);
  } catch {
    return false;
  }
}

/** SELF-CONTAINED ENGINE (llama.cpp). A single relocatable binary + a GGUF —
    no Python, no MLX, no ollama. Packaged: the binary is bundled in
    runtime-release/<platform>-<arch>/ and the GGUF is installed under
    userData/models/<tier>/model.gguf. Dev: point VEYLARO_LLAMACPP_SERVER at a
    built llama-server and VEYLARO_<TIER>_GGUF at a local GGUF. Returns null when
    the pieces aren't present, so callers fall back to the mlx path. */
function llamacppLaunchSpec(raw, options = {}) {
  const parsed = new URL(engineBase(raw));
  if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") return null;
  const env = options.env || process.env;
  const tier = modelTierConfig(options.sku);

  let server = "";
  let gguf = "";
  let cwd = process.cwd();
  if (options.packaged && options.resourcesPath && options.userDataPath) {
    const engineDir = path.join(options.resourcesPath, "runtime-release", `${options.platform || process.platform}-${options.arch || process.arch}`);
    server = path.join(engineDir, process.platform === "win32" ? "llama-server.exe" : "llama-server");
    gguf = path.join(options.userDataPath, "models", tier.id, "model.gguf");
    cwd = engineDir;
  } else {
    server = String(env.VEYLARO_LLAMACPP_SERVER || "").trim();
    gguf = String(env[`VEYLARO_${tier.id.toUpperCase()}_GGUF`] || env.VEYLARO_GGUF || "").trim();
    cwd = server ? path.dirname(server) : process.cwd();
  }
  if (!server || !fs.existsSync(server)) return null;
  if (!gguf || !ggufLooksComplete(gguf)) return null;

  const ctx = tier.id === "max" ? "32768" : tier.id === "med" ? "16384" : "8192";
  const args = [
    "-m", gguf,
    "--host", "127.0.0.1",
    "--port", parsed.port || "8080",
    "-c", ctx,
    "-ngl", "99",       // offload all layers to Metal/GPU when available
    "--no-webui",
    "--jinja",           // use the model's own chat template
  ];
  return {
    command: server,
    args,
    cwd,
    model: gguf,
    tier: tier.id,
    minimumRamGB: tier.minimumRamGB,
    engine: "llamacpp",
  };
}

function mlxLaunchSpec(raw, options = {}) {
  const base = engineBase(raw);
  const parsed = new URL(base);
  if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") return null;

  const env = options.env || process.env;
  const root = options.root || path.resolve(__dirname, "..", "..");
  const tier = modelTierConfig(options.sku);
  if (options.packaged) return packagedLaunchSpec(raw, options, tier);
  const legacyExplicit = tier.id === "lite" ? env.VEYLARO_MODEL_PATH : "";
  const explicitModel = String(env[tier.modelPathEnv] || legacyExplicit || "").trim();
  if (explicitModel && !snapshotLooksComplete(explicitModel)) return null;

  // The explicit path is authoritative. Otherwise use only checkpoints that
  // are fully present in the local HF cache; offline mode is enforced by main.
  const model = explicitModel
    || (hasCachedSnapshot(tier.modelId) ? tier.modelId : "");
  if (!model) return null;

  const gemma4Python = path.join(root, ".venv-axon-gemma4", "bin", "python");
  const isGemma4 = /gemma-4/i.test(model);
  const python = env[tier.pythonEnv] || env.VEYLARO_MLX_PYTHON || gemma4Python;
  if (!fs.existsSync(python)) return null;

  // Adapters are architecture-specific and opt-in. Never attach a historical
  // adapter merely because it exists on disk.
  const adapter = String(env[tier.adapterEnv] || env.VEYLARO_ADAPTER_PATH || "").trim();
  if (adapter && !fs.existsSync(path.join(adapter, "adapters.safetensors"))) return null;

  const args = [
    "-m", "mlx_lm", "server",
    "--model", model,
    "--host", "127.0.0.1",
    "--port", parsed.port || "8080",
    "--max-tokens", "512",
    "--decode-concurrency", "1",
    "--prompt-concurrency", "1",
    "--prefill-step-size", "256",
    "--prompt-cache-size", "1",
    "--prompt-cache-bytes", "67108864",
  ];
  if (isGemma4) args.push("--chat-template-args", '{"enable_thinking":false}');
  if (adapter && fs.existsSync(path.join(adapter, "adapters.safetensors"))) {
    args.push("--adapter-path", adapter);
  }
  return {
    command: python,
    args,
    cwd: root,
    model,
    tier: tier.id,
    minimumRamGB: tier.minimumRamGB,
  };
}

module.exports = {
  DEVSTRAL_MAX_ID,
  GEMMA3_ID,
  GEMMA4_ID,
  GEMMA4_MED_ID,
  MODEL_TIERS,
  engineBase,
  ggufLooksComplete,
  hasCachedSnapshot,
  installedBundleLooksValid,
  llamacppLaunchSpec,
  mlxLaunchSpec,
  modelPreference,
  modelTierConfig,
  selectEngineModel,
  snapshotLooksComplete,
  tierFromModelName,
};
