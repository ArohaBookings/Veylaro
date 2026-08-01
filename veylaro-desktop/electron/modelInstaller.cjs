const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { safeRelative, validDigest } = require("../build/releaseBundle.cjs");

const MANIFEST_LIMIT_BYTES = 4 * 1024 * 1024;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function secureHttps(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} URL is invalid`);
  }
  invariant(url.protocol === "https:" && !url.username && !url.password, `${label} URL must be credential-free HTTPS`);
  return url.toString();
}

function hashBytes(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function responseBytes(response, maximumBytes) {
  invariant(response?.ok, `download returned HTTP ${response?.status || "unknown"}`);
  const declared = Number(response.headers?.get?.("content-length") || 0);
  invariant(!declared || declared <= maximumBytes, "download exceeded its declared size limit");
  const reader = response.body?.getReader?.();
  invariant(reader, "download response had no readable body");
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    invariant(total <= maximumBytes, "download exceeded its size limit");
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
}

function validateModelBundleManifest(manifest, tier, releaseEntry) {
  invariant(manifest && typeof manifest === "object", "model bundle manifest must be an object");
  invariant(manifest.schema_version === 1, "model bundle schema_version must be 1");
  invariant(manifest.tier === tier, "model bundle tier does not match the requested tier");
  invariant(manifest.checkpoint === releaseEntry.checkpoint, "model bundle checkpoint does not match the release catalog");
  invariant(Array.isArray(manifest.files) && manifest.files.length >= 4, "model bundle file inventory is incomplete");

  const files = [];
  const seen = new Set();
  let totalBytes = 0;
  for (const [index, item] of manifest.files.entries()) {
    const relative = safeRelative(item?.path, `model files[${index}].path`);
    invariant(!seen.has(relative), `model bundle contains duplicate path ${relative}`);
    seen.add(relative);
    invariant(validDigest(item?.sha256), `model file ${relative} needs a non-placeholder SHA-256 digest`);
    invariant(Number.isSafeInteger(item?.bytes) && item.bytes > 0, `model file ${relative} has an invalid size`);
    files.push({ path: relative, url: secureHttps(item.url, `model file ${relative}`), sha256: item.sha256.toLowerCase(), bytes: item.bytes });
    totalBytes += item.bytes;
    invariant(Number.isSafeInteger(totalBytes), "model bundle size overflowed the safe integer range");
  }
  invariant(totalBytes === releaseEntry.artifact.total_bytes, "model bundle total size does not match the release catalog");
  for (const required of ["config.json", "tokenizer_config.json", "tokenizer.json"]) {
    invariant(seen.has(required), `model bundle is missing ${required}`);
  }
  invariant([...seen].some((name) => /^model.*\.safetensors$/i.test(path.posix.basename(name))), "model bundle contains no safetensors weights");
  return { ...manifest, files, totalBytes };
}

async function downloadVerifiedFile(item, destination, options = {}) {
  const response = await (options.fetchImpl || fetch)(item.url, { signal: options.signal, redirect: "follow" });
  if (response.url) secureHttps(response.url, `redirected model file ${item.path}`);
  invariant(response.ok, `model file ${item.path} returned HTTP ${response.status}`);
  const declared = Number(response.headers?.get?.("content-length") || 0);
  invariant(!declared || declared === item.bytes, `model file ${item.path} Content-Length mismatch`);
  const reader = response.body?.getReader?.();
  invariant(reader, `model file ${item.path} had no readable body`);

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const partial = `${destination}.part`;
  const hash = crypto.createHash("sha256");
  let received = 0;
  let fd = null;
  try {
    fd = fs.openSync(partial, "wx", 0o600);
    while (true) {
      if (options.signal?.aborted) {
        const error = new Error("model download aborted");
        error.name = "AbortError";
        throw error;
      }
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      invariant(received <= item.bytes, `model file ${item.path} exceeded its expected size`);
      hash.update(value);
      fs.writeSync(fd, value);
      options.onProgress?.({ file: item.path, received, total: item.bytes });
    }
    invariant(received === item.bytes, `model file ${item.path} size mismatch`);
    invariant(hash.digest("hex") === item.sha256, `model file ${item.path} digest mismatch`);
    fs.closeSync(fd);
    fd = null;
    fs.chmodSync(partial, 0o644);
    fs.renameSync(partial, destination);
  } catch (error) {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch { /* already closed */ }
    }
    fs.rmSync(partial, { force: true });
    throw error;
  }
}

async function installModelBundle(options) {
  const { tier, releaseEntry, userDataPath } = options;
  invariant(["lite", "med", "max"].includes(tier), "unknown model tier");
  invariant(releaseEntry?.release_status === "ready", `${tier} is not release-ready`);
  secureHttps(releaseEntry.artifact.manifest_url, `${tier} bundle manifest`);
  invariant(validDigest(releaseEntry.artifact.manifest_sha256), `${tier} bundle manifest digest is invalid`);

  const manifestResponse = await (options.fetchImpl || fetch)(releaseEntry.artifact.manifest_url, {
    signal: options.signal,
    redirect: "follow",
  });
  if (manifestResponse.url) secureHttps(manifestResponse.url, `redirected ${tier} bundle manifest`);
  const manifestBytes = await responseBytes(manifestResponse, MANIFEST_LIMIT_BYTES);
  invariant(hashBytes(manifestBytes) === releaseEntry.artifact.manifest_sha256.toLowerCase(), `${tier} bundle manifest digest mismatch`);
  let parsed;
  try {
    parsed = JSON.parse(manifestBytes.toString("utf8"));
  } catch (error) {
    throw new Error(`${tier} bundle manifest is invalid JSON: ${error.message}`);
  }
  const manifest = validateModelBundleManifest(parsed, tier, releaseEntry);

  const modelsRoot = path.join(userDataPath, "models");
  fs.mkdirSync(modelsRoot, { recursive: true });
  const staging = path.join(modelsRoot, `.install-${tier}-${crypto.randomUUID()}`);
  const target = path.join(modelsRoot, tier);
  const backup = path.join(modelsRoot, `.backup-${tier}-${crypto.randomUUID()}`);
  fs.mkdirSync(staging, { recursive: true });
  try {
    let completed = 0;
    for (const item of manifest.files) {
      const destination = path.join(staging, item.path);
      await downloadVerifiedFile(item, destination, {
        fetchImpl: options.fetchImpl,
        signal: options.signal,
        onProgress: (event) => options.onProgress?.({ ...event, completed, bundleTotal: manifest.totalBytes }),
      });
      completed += item.bytes;
    }
    fs.writeFileSync(path.join(staging, ".veylaro-bundle.json"), JSON.stringify({
      schema_version: 1,
      tier,
      checkpoint: releaseEntry.checkpoint,
      bundle_manifest_sha256: releaseEntry.artifact.manifest_sha256.toLowerCase(),
      verified_bytes: manifest.totalBytes,
      installed_at: new Date().toISOString(),
    }, null, 2), { mode: 0o600 });

    let movedOld = false;
    if (fs.existsSync(target)) {
      fs.renameSync(target, backup);
      movedOld = true;
    }
    try {
      fs.renameSync(staging, target);
    } catch (error) {
      if (movedOld && fs.existsSync(backup)) fs.renameSync(backup, target);
      throw error;
    }
    if (movedOld) fs.rmSync(backup, { recursive: true, force: true });
    return { ok: true, tier, path: target, checkpoint: releaseEntry.checkpoint, bytes: manifest.totalBytes };
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

module.exports = {
  downloadVerifiedFile,
  installModelBundle,
  validateModelBundleManifest,
};
