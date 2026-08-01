const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const TIERS = Object.freeze(["lite", "med", "max"]);
const SHA256 = /^[a-f0-9]{64}$/i;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function safeRelative(value, label) {
  invariant(typeof value === "string" && value.length > 0, `${label} must be a non-empty relative path`);
  invariant(!path.isAbsolute(value) && !value.includes("\0"), `${label} must be relative and contain no NUL byte`);
  const normalized = path.posix.normalize(value.replaceAll("\\", "/"));
  invariant(normalized !== ".." && !normalized.startsWith("../"), `${label} escapes its bundle root`);
  return normalized;
}

function validDigest(value) {
  return typeof value === "string" && SHA256.test(value) && !/^0{64}$/.test(value);
}

function validateArtifact(artifact, label) {
  invariant(artifact && typeof artifact === "object", `${label} artifact is missing`);
  let url;
  try {
    url = new URL(artifact.manifest_url);
  } catch {
    throw new Error(`${label} bundle manifest URL is invalid`);
  }
  invariant(url.protocol === "https:" && !url.username && !url.password, `${label} bundle manifest URL must be credential-free HTTPS`);
  invariant(validDigest(artifact.manifest_sha256), `${label} bundle manifest needs a non-placeholder SHA-256 digest`);
  invariant(Number.isSafeInteger(artifact.total_bytes) && artifact.total_bytes > 1024 * 1024, `${label} total bundle size must be an integer above 1 MiB`);
}

function validateReleaseManifest(manifest, options = {}) {
  invariant(manifest && typeof manifest === "object", "release manifest must be an object");
  invariant(manifest.schema_version === 1, "release manifest schema_version must be 1");
  invariant(typeof manifest.release_id === "string" && manifest.release_id.trim().length >= 6, "release_id is missing");
  invariant(manifest.engine?.protocol === "openai-v1", "engine protocol must be openai-v1");
  invariant(manifest.engine?.variants && typeof manifest.engine.variants === "object", "engine variants are missing");
  invariant(manifest.models && typeof manifest.models === "object", "model catalog is missing");

  const platform = options.platform || process.platform;
  const arch = options.arch || process.arch;
  const variantKey = `${platform}-${arch}`;
  const variant = manifest.engine.variants[variantKey];
  invariant(variant && typeof variant === "object", `engine variant ${variantKey} is missing`);
  safeRelative(variant.executable, `${variantKey} executable`);
  invariant(Array.isArray(variant.arguments), `${variantKey} arguments must be an array`);
  invariant(variant.arguments.every((item) => typeof item === "string" && !item.includes("\0")), `${variantKey} arguments are invalid`);
  invariant(Array.isArray(variant.files) && variant.files.length > 0, `${variantKey} file inventory is empty`);
  const enginePaths = new Set();
  for (const [index, file] of variant.files.entries()) {
    const relative = safeRelative(file?.path, `${variantKey} files[${index}].path`);
    invariant(!enginePaths.has(relative), `${variantKey} contains duplicate file ${relative}`);
    enginePaths.add(relative);
    invariant(validDigest(file?.sha256), `${variantKey} ${relative} needs a non-placeholder SHA-256 digest`);
    invariant(Number.isSafeInteger(file?.bytes) && file.bytes > 0, `${variantKey} ${relative} has an invalid size`);
  }
  invariant(enginePaths.has(safeRelative(variant.executable, `${variantKey} executable`)), `${variantKey} executable is absent from its file inventory`);

  let readyModels = 0;
  for (const tier of TIERS) {
    const entry = manifest.models[tier];
    invariant(entry && typeof entry === "object", `${tier} model entry is missing`);
    invariant(typeof entry.checkpoint === "string" && entry.checkpoint.includes("/"), `${tier} checkpoint provenance is invalid`);
    invariant(Number.isFinite(entry.minimum_ram_gb) && entry.minimum_ram_gb >= 4, `${tier} minimum_ram_gb is invalid`);
    invariant(entry.release_status === "ready" || entry.release_status === "gated", `${tier} release_status must be ready or gated`);
    if (entry.release_status === "gated") {
      invariant(typeof entry.gate_reason === "string" && entry.gate_reason.trim().length >= 8, `${tier} gate_reason is missing`);
      continue;
    }
    readyModels += 1;
    validateArtifact(entry.artifact, tier);
    invariant(entry.license?.spdx === "Apache-2.0", `${tier} licence must be declared as Apache-2.0`);
    safeRelative(entry.license?.notice, `${tier} licence notice`);
  }
  invariant(readyModels > 0, "at least one model tier must be release-ready");
  return { manifest, variant, variantKey, readyModels };
}

function sha256File(file) {
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(file, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead;
    do {
      bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest("hex");
}

function verifyEnginePayload(root, validated) {
  const realRoot = fs.realpathSync(root);
  for (const item of validated.variant.files) {
    const relative = safeRelative(item.path, "engine file");
    const candidate = path.join(realRoot, relative);
    invariant(fs.existsSync(candidate), `engine file is missing: ${relative}`);
    const real = fs.realpathSync(candidate);
    invariant(real === realRoot || real.startsWith(`${realRoot}${path.sep}`), `engine file escapes the runtime bundle: ${relative}`);
    const stat = fs.statSync(real);
    invariant(stat.isFile() && stat.size === item.bytes, `engine file size mismatch: ${relative}`);
    invariant(sha256File(real) === item.sha256.toLowerCase(), `engine file digest mismatch: ${relative}`);
  }
  const executable = path.join(realRoot, safeRelative(validated.variant.executable, "engine executable"));
  invariant((fs.statSync(executable).mode & 0o111) !== 0, "engine executable is not executable");
  for (const tier of TIERS) {
    const model = validated.manifest.models[tier];
    if (model.release_status !== "ready") continue;
    const notice = path.join(realRoot, safeRelative(model.license.notice, `${tier} licence notice`));
    invariant(fs.existsSync(notice) && fs.statSync(notice).isFile() && fs.statSync(notice).size > 100, `${tier} licence notice is missing or empty`);
  }
  return executable;
}

function loadReleaseManifest(runtimeRoot, options = {}) {
  const file = path.join(runtimeRoot, "release-manifest.json");
  invariant(fs.existsSync(file), "runtime-release/release-manifest.json is missing");
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`runtime release manifest is invalid JSON: ${error.message}`);
  }
  return validateReleaseManifest(manifest, options);
}

module.exports = {
  TIERS,
  loadReleaseManifest,
  safeRelative,
  sha256File,
  validDigest,
  validateReleaseManifest,
  verifyEnginePayload,
};
