const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  DEVSTRAL_MAX_ID,
  GEMMA4_MED_ID,
  mlxLaunchSpec,
  selectEngineModel,
  snapshotLooksComplete,
  tierFromModelName,
} = require("../electron/engineRuntime.cjs");

function writeCompleteCheckpoint(directory) {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "config.json"), "{}", "utf8");
  fs.writeFileSync(path.join(directory, "tokenizer_config.json"), "{}", "utf8");
  fs.writeFileSync(path.join(directory, "tokenizer.json"), "x".repeat(2048), "utf8");
  const weights = path.join(directory, "model.safetensors");
  fs.writeFileSync(weights, "");
  fs.truncateSync(weights, 1024 * 1024);
}

test("model discovery never routes Lite to an unrelated first cache entry", () => {
  const models = [
    "mlx-community/Qwen2-VL-2B-Instruct-4bit",
    "mlx-community/gemma-4-e2b-it-4bit",
    "mlx-community/gemma-3-text-4b-it-4bit",
  ];
  assert.equal(selectEngineModel(models, "veylaro-code", "lite"), "mlx-community/gemma-4-e2b-it-4bit");
  assert.equal(selectEngineModel(models, models[2], "lite"), models[2]);
});

test("Gemma lineage is reported as Lite instead of a fictional Med or Max tier", () => {
  assert.equal(tierFromModelName("mlx-community/gemma-4-e2b-it-4bit"), "lite");
  assert.equal(tierFromModelName("mlx-community/gemma-3-text-4b-it-4bit"), "lite");
  assert.equal(tierFromModelName("laro-med-12b-q4"), "med");
  assert.equal(tierFromModelName(GEMMA4_MED_ID), "med");
  assert.equal(tierFromModelName(DEVSTRAL_MAX_ID), "max");
});

test("tier discovery fails closed instead of relabeling another installed model", () => {
  const models = [
    "mlx-community/gemma-4-e2b-it-4bit",
    "mlx-community/gemma-4-12B-it-4bit",
    "mlx-community/Devstral-Small-2-24B-Instruct-2512-OptiQ-4bit",
  ];
  assert.equal(selectEngineModel(models, models[0], "med"), models[1]);
  assert.equal(selectEngineModel([models[0]], models[0], "med"), "");
  assert.equal(selectEngineModel(["unrelated-coder"], "unrelated-coder", "max"), "");
});

test("Gemma 4 launch spec enforces the conservative 16 GB runtime envelope", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "veylaro-engine-spec-"));
  try {
    const python = path.join(root, ".venv-axon-gemma4", "bin", "python");
    const model = path.join(root, "gemma-4-e2b-it-4bit");
    fs.mkdirSync(path.dirname(python), { recursive: true });
    fs.writeFileSync(python, "", "utf8");
    writeCompleteCheckpoint(model);

    const spec = mlxLaunchSpec("http://127.0.0.1:8080", {
      root,
      env: { VEYLARO_MODEL_PATH: model },
    });
    assert.ok(spec);
    assert.equal(spec.command, python);
    assert.deepEqual(spec.args.slice(0, 3), ["-m", "mlx_lm", "server"]);
    assert.ok(spec.args.includes("--decode-concurrency"));
    assert.equal(spec.args[spec.args.indexOf("--decode-concurrency") + 1], "1");
    assert.equal(spec.args[spec.args.indexOf("--prompt-concurrency") + 1], "1");
    assert.equal(spec.args[spec.args.indexOf("--prompt-cache-size") + 1], "1");
    assert.equal(spec.args[spec.args.indexOf("--prompt-cache-bytes") + 1], "67108864");
    assert.equal(spec.args[spec.args.indexOf("--chat-template-args") + 1], '{"enable_thinking":false}');
    assert.equal(spec.args.includes("--adapter-path"), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("each tier uses only its own explicit checkpoint path", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "veylaro-tier-spec-"));
  try {
    const python = path.join(root, ".venv-axon-gemma4", "bin", "python");
    const lite = path.join(root, "lite-4b");
    const med = path.join(root, "med-12b");
    const max = path.join(root, "max-24b");
    fs.mkdirSync(path.dirname(python), { recursive: true });
    fs.writeFileSync(python, "", "utf8");
    for (const checkpoint of [lite, med, max]) writeCompleteCheckpoint(checkpoint);

    const env = {
      VEYLARO_LITE_MODEL_PATH: lite,
      VEYLARO_MED_MODEL_PATH: med,
      VEYLARO_MAX_MODEL_PATH: max,
    };
    assert.equal(mlxLaunchSpec("http://127.0.0.1:8080", { root, env, sku: "lite" }).model, lite);
    assert.equal(mlxLaunchSpec("http://127.0.0.1:8080", { root, env, sku: "med" }).model, med);
    assert.equal(mlxLaunchSpec("http://127.0.0.1:8080", { root, env, sku: "max" }).model, max);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("an invalid explicit model path fails closed", () => {
  assert.equal(mlxLaunchSpec("http://127.0.0.1:8080", {
    root: os.tmpdir(),
    env: { VEYLARO_MODEL_PATH: path.join(os.tmpdir(), "missing-veylaro-model") },
  }), null);
});

test("cache admission rejects metadata-only and zero-byte checkpoints", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "veylaro-cache-check-"));
  try {
    fs.writeFileSync(path.join(root, "config.json"), "{}", "utf8");
    fs.writeFileSync(path.join(root, "tokenizer_config.json"), "{}", "utf8");
    fs.writeFileSync(path.join(root, "tokenizer.json"), "x".repeat(2048), "utf8");
    fs.writeFileSync(path.join(root, "model.safetensors"), "", "utf8");
    assert.equal(snapshotLooksComplete(root), false);
    fs.writeFileSync(path.join(root, "model.safetensors"), Buffer.alloc(1024 * 1024));
    assert.equal(snapshotLooksComplete(root), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("packaged runtime accepts only an integrity-matched installed tier", () => {
  const resourcesPath = fs.mkdtempSync(path.join(os.tmpdir(), "veylaro-packaged-resources-"));
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "veylaro-packaged-user-"));
  try {
    const runtimeRoot = path.join(resourcesPath, "runtime-release");
    const executable = path.join(runtimeRoot, "engine", "bin", "python");
    fs.mkdirSync(path.dirname(executable), { recursive: true });
    fs.mkdirSync(path.join(runtimeRoot, "licenses"), { recursive: true });
    fs.writeFileSync(executable, "packaged-engine");
    fs.chmodSync(executable, 0o755);
    fs.writeFileSync(path.join(runtimeRoot, "licenses", "Apache-2.0.txt"), "Apache License 2.0\n" + "release notice ".repeat(12));
    const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
    const artifactSha = sha("lite-artifact");
    const bundleSha = sha("lite-bundle");
    const gated = (checkpoint, minimumRam) => ({
      checkpoint,
      minimum_ram_gb: minimumRam,
      release_status: "gated",
      gate_reason: "checkpoint has no clean release evidence",
    });
    const manifest = {
      schema_version: 1,
      release_id: "packaged-test",
      engine: {
        protocol: "openai-v1",
        variants: {
          "darwin-arm64": {
            executable: "engine/bin/python",
            arguments: ["-m", "mlx_lm", "server"],
            files: [{ path: "engine/bin/python", sha256: sha("packaged-engine"), bytes: 15 }],
          },
        },
      },
      models: {
        lite: {
          checkpoint: "google/gemma-4-e2b-it",
          minimum_ram_gb: 8,
          release_status: "ready",
          artifact: {
            manifest_url: "https://downloads.veylaroai.com/laro-lite.json",
            manifest_sha256: bundleSha,
            total_bytes: 2 * 1024 * 1024,
          },
          license: { spdx: "Apache-2.0", notice: "licenses/Apache-2.0.txt" },
        },
        med: gated("google/gemma-4-12b-it", 16),
        max: gated("mistralai/Devstral-Small-2-24B-Instruct", 24),
      },
    };
    fs.writeFileSync(path.join(runtimeRoot, "release-manifest.json"), JSON.stringify(manifest));

    const modelRoot = path.join(userDataPath, "models", "lite");
    writeCompleteCheckpoint(modelRoot);
    fs.writeFileSync(path.join(modelRoot, ".veylaro-bundle.json"), JSON.stringify({
      schema_version: 1,
      tier: "lite",
      checkpoint: "google/gemma-4-e2b-it",
      bundle_manifest_sha256: bundleSha,
    }));

    const options = {
      packaged: true,
      resourcesPath,
      userDataPath,
      platform: "darwin",
      arch: "arm64",
      sku: "lite",
    };
    const spec = mlxLaunchSpec("http://127.0.0.1:8080", options);
    assert.ok(spec);
    assert.equal(spec.command, fs.realpathSync(executable));
    assert.deepEqual(spec.args.slice(0, 3), ["-m", "mlx_lm", "server"]);
    assert.equal(spec.model, modelRoot);
    assert.equal(mlxLaunchSpec("http://127.0.0.1:8080", { ...options, sku: "med" }), null);

    const marker = JSON.parse(fs.readFileSync(path.join(modelRoot, ".veylaro-bundle.json"), "utf8"));
    marker.bundle_manifest_sha256 = sha("different-bundle");
    fs.writeFileSync(path.join(modelRoot, ".veylaro-bundle.json"), JSON.stringify(marker));
    assert.equal(mlxLaunchSpec("http://127.0.0.1:8080", options), null);
  } finally {
    fs.rmSync(resourcesPath, { recursive: true, force: true });
    fs.rmSync(userDataPath, { recursive: true, force: true });
  }
});
