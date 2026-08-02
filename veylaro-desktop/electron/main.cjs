const { app, BrowserWindow, ipcMain, dialog, shell, powerMonitor } = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs");
const { exec, execFile, spawn } = require("child_process");
const guard = require("./guard.cjs");
const {
  engineBase,
  llamacppLaunchSpec,
  mlxLaunchSpec,
  modelTierConfig,
  selectEngineModel,
  tierFromModelName,
} = require("./engineRuntime.cjs");
const { installModelBundle } = require("./modelInstaller.cjs");
const { resolveModelCatalog, resolveReleaseModel } = require("./modelManager.cjs");

const DEV_URL = process.env.VITE_DEV_SERVER_URL || null;

// Background dev servers Laro starts (so it can open localhost in the Viewport).
// Tracked by pid so we can stop them on request and kill them all on quit.
const devServers = new Map(); // pid -> { child, url }
const modelDownloads = new Map(); // tier -> AbortController

// The inference service is a child of Veylaro Code, not a prerequisite the
// user has to remember to launch. The process starts only on the first model
// request, stays resident while the session is active, and is stopped on idle,
// memory pressure, or app exit by the renderer lifecycle.
let engineProcess = null;
let engineStartedByApp = false;
let engineLog = "";
let engineTier = null;
let engineModel = null;

async function discoverEngine(raw, preferredModel = "", sku = "lite", timeoutMs = 1200) {
  const base = engineBase(raw);
  try {
    const res = await fetch(`${base}/v1/models`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return { ok: false, url: base };
    const body = await res.json();
    const models = (body?.data || []).map((item) => String(item?.id || "")).filter(Boolean);
    const model = selectEngineModel(models, preferredModel, sku);
    if (!model) return { ok: false, url: base, provider: "mlx", availableModels: models };
    return { ok: true, url: base, provider: "mlx", model, tier: tierFromModelName(model) };
  } catch {
    return { ok: false, url: base };
  }
}

async function verifyEngine(discovery, timeoutMs = 45000) {
  if (!discovery?.ok || !discovery.model) return { ...discovery, ok: false, error: "No compatible local model was discovered." };
  try {
    const response = await fetch(`${discovery.url}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: discovery.model,
        messages: [{ role: "user", content: "Reply only OK." }],
        stream: false,
        max_tokens: 8,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`generation probe returned HTTP ${response.status}`);
    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (!String(content || "").trim()) throw new Error("generation probe produced no answer text");
    return discovery;
  } catch (error) {
    return { ...discovery, ok: false, error: String(error?.message || error) };
  }
}

async function ensureEngine(raw, preferredModel = "", sku = "lite") {
  const requested = modelTierConfig(sku);
  let existing = await discoverEngine(raw, preferredModel, requested.id);
  if (existing.ok) {
    const verified = await verifyEngine(existing, 45000);
    return verified.ok
      ? { ...verified, started: false }
      : { ...verified, error: `A local model server is present but unusable: ${verified.error}` };
  }

  // A tier switch must never relabel the currently resident model. Stop only
  // app-owned inference; an external endpoint remains under the user's control.
  const ownedWrongTier = engineProcess && engineStartedByApp && engineTier !== requested.id;
  if (ownedWrongTier) {
    stopOwnedEngine();
    await new Promise((resolve) => setTimeout(resolve, 500));
    existing = await discoverEngine(raw, preferredModel, requested.id);
    if (existing.ok) {
      const verified = await verifyEngine(existing, 45000);
      if (verified.ok) return { ...verified, started: false };
    }
  }

  if (existing.availableModels?.length && (!engineProcess || !engineStartedByApp)) {
    return {
      ok: false,
      url: engineBase(raw),
      error: `The running endpoint does not provide Laro ${requested.id}. Available: ${existing.availableModels.join(", ")}.`,
    };
  }

  if (engineProcess && !engineProcess.killed) {
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline && engineProcess) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const found = await discoverEngine(raw, preferredModel, requested.id);
      if (found.ok) {
        const ready = await verifyEngine(found, Math.max(1000, deadline - Date.now()));
        if (ready.ok) return { ...ready, started: false };
        break;
      }
    }
    return { ok: false, url: engineBase(raw), error: `Veylaro MLX did not finish starting. ${engineLog.slice(-320)}` };
  }

  const memory = await readMemoryState();
  if (memory.totalGB < requested.minimumRamGB - 0.25) {
    return { ok: false, url: engineBase(raw), error: `Laro ${requested.id} requires at least ${requested.minimumRamGB} GB of unified memory.` };
  }
  if (memory.pressureFreePct < 25) {
    return { ok: false, url: engineBase(raw), error: `Model start paused to protect this Mac (${memory.pressureFreePct.toFixed(0)}% memory pressure headroom). Close heavy apps and try again.` };
  }

  // Prefer the self-contained llama.cpp engine (single binary + GGUF, no Python).
  // Fall back to the MLX runtime when a llama.cpp engine/GGUF isn't present, so
  // dev machines that still run MLX keep working unchanged.
  const launchOpts = {
    preferredModel,
    sku: requested.id,
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    userDataPath: app.getPath("userData"),
  };
  const spec = llamacppLaunchSpec(raw, launchOpts) || mlxLaunchSpec(raw, launchOpts);
  if (!spec) {
    return {
      ok: false,
      url: engineBase(raw),
      error: `No complete local Laro ${requested.id} engine and weight bundle was found.`,
    };
  }

  engineLog = "";
  try {
    const child = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      env: {
        ...process.env,
        HF_HUB_OFFLINE: "1",
        TRANSFORMERS_OFFLINE: "1",
        TOKENIZERS_PARALLELISM: "false",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    engineProcess = child;
    engineStartedByApp = true;
    engineTier = spec.tier;
    engineModel = spec.model;
    const capture = (chunk) => { engineLog = (engineLog + String(chunk)).slice(-5000); };
    child.stdout?.on("data", capture);
    child.stderr?.on("data", capture);
    child.on("exit", () => {
      if (engineProcess !== child) return;
      engineProcess = null;
      engineStartedByApp = false;
      engineTier = null;
      engineModel = null;
    });
  } catch (error) {
    engineProcess = null;
    engineStartedByApp = false;
    engineTier = null;
    engineModel = null;
    return { ok: false, url: engineBase(raw), error: String(error?.message || error) };
  }

  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const found = await discoverEngine(raw, spec.model, spec.tier);
    if (found.ok) {
      const ready = await verifyEngine(found, Math.max(1000, deadline - Date.now()));
      if (ready.ok) return { ...ready, model: ready.model || spec.model, tier: ready.tier || spec.tier, started: true };
      engineLog = (engineLog + `\nGeneration probe failed: ${ready.error}`).slice(-5000);
      break;
    }
    if (!engineProcess) break;
  }
  const error = `Veylaro MLX did not become ready. ${engineLog.slice(-320)}`;
  stopOwnedEngine();
  return { ok: false, url: engineBase(raw), error };
}

function stopOwnedEngine() {
  if (!engineProcess || !engineStartedByApp) return { ok: false, stopped: false };
  try { engineProcess.kill("SIGTERM"); } catch { /* already gone */ }
  engineProcess = null;
  engineStartedByApp = false;
  engineTier = null;
  engineModel = null;
  return { ok: true, stopped: true };
}

async function readMemoryState() {
  const totalGB = os.totalmem() / (1024 ** 3);
  const freeGB = os.freemem() / (1024 ** 3);
  let pressureFreePct = totalGB > 0 ? (freeGB / totalGB) * 100 : 0;
  if (process.platform === "darwin") {
    pressureFreePct = await new Promise((resolve) => {
      execFile("/usr/bin/memory_pressure", ["-Q"], { timeout: 4000, maxBuffer: 128 * 1024 }, (error, stdout) => {
        if (error) return resolve(pressureFreePct);
        const match = String(stdout).match(/System-wide memory free percentage:\s*([\d.]+)%/i);
        resolve(match ? Number(match[1]) : pressureFreePct);
      });
    });
  }
  return {
    totalGB,
    freeGB,
    freePct: totalGB > 0 ? (freeGB / totalGB) * 100 : 0,
    pressureFreePct,
  };
}

async function waitForHttp(url, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      // Any HTTP response proves that a server owns the port. A 404 is still
      // stronger evidence than a guessed localhost URL.
      await fetch(url, { signal: AbortSignal.timeout(1000), redirect: "manual" });
      return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  return false;
}

// Build the augmented PATH once — a GUI-launched app otherwise can't find node/npx.
function toolPath() {
  if (process.platform === "win32") return process.env.PATH;
  const extra = ["/opt/homebrew/bin", "/opt/homebrew/sbin", "/usr/local/bin", "/usr/local/sbin",
    path.join(os.homedir(), ".volta/bin"), path.join(os.homedir(), ".cargo/bin"),
    path.join(os.homedir(), ".local/bin"), "/usr/bin", "/bin", "/usr/sbin", "/sbin"];
  const seen = new Set();
  return [...extra, ...String(process.env.PATH || "").split(":")].filter((p) => p && !seen.has(p) && seen.add(p)).join(":");
}

// Single instance only — launching Veylaro again focuses the existing window
// instead of opening a second (or third) copy.
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const wins = BrowserWindow.getAllWindows();
    if (wins.length) {
      const w = wins[0];
      if (w.isMinimized()) w.restore();
      w.focus();
    }
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1420,
    height: 900,
    minWidth: 980,
    minHeight: 640,
    show: false,
    backgroundColor: "#0b0908",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: { x: 18, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true, // the Deck's Viewport uses <webview> on desktop
    },
  });

  win.once("ready-to-show", () => win.show());

  // external links open in the real browser, never inside the app
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (DEV_URL) {
    win.loadURL(DEV_URL);
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

ipcMain.handle("veylaro:pick", async (_e, kind) => {
  // createDirectory surfaces the "New Folder" button so you can make a fresh
  // project folder right from the picker instead of only digging into files.
  const props = kind === "folder"
    ? ["openDirectory", "createDirectory"]
    : ["openFile", "createDirectory"];
  const res = await dialog.showOpenDialog({
    properties: props,
    message: kind === "folder" ? "Pick or create a folder for Laro to work in" : "Pick a file for Laro to work on",
    buttonLabel: "Use this",
  });
  if (res.canceled || !res.filePaths.length) return null;
  return res.filePaths[0];
});

// New project: create a fresh, empty folder and hand it back as the session
// scope, so you never have to hunt for somewhere for Laro to write into.
ipcMain.handle("veylaro:newProject", async (_e, name) => {
  const res = await dialog.showOpenDialog({
    properties: ["openDirectory", "createDirectory"],
    message: "Choose where to create the new project",
    buttonLabel: "Create here",
  });
  if (res.canceled || !res.filePaths.length) return null;
  const safe = String(name || "veylaro-project").replace(/[^\w.-]+/g, "-").slice(0, 60) || "veylaro-project";
  let dir = path.join(res.filePaths[0], safe);
  let n = 2;
  while (fs.existsSync(dir)) { dir = path.join(res.filePaths[0], `${safe}-${n++}`); }
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "README.md"), `# ${name || safe}\n\nCreated with Veylaro Code.\n`, "utf-8");
    return dir;
  } catch (e) {
    return { error: String(e && e.message || e) };
  }
});

// Internet search: fetch DuckDuckGo results server-side (no CORS in main).
// Only the QUERY leaves the machine — never code or conversation.
ipcMain.handle("veylaro:search", async (_e, query) => {
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(String(query))}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh) VeylaroCode/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    const html = await res.text();
    const results = [];
    const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:class="result__snippet"[^>]*>([\s\S]*?)<\/a>)?/g;
    let m;
    while ((m = re.exec(html)) && results.length < 4) {
      const strip = (s) => (s || "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').trim();
      let url = m[1];
      const uddg = /uddg=([^&]+)/.exec(url);
      if (uddg) url = decodeURIComponent(uddg[1]);
      results.push({ title: strip(m[2]), url, snippet: strip(m[3]).slice(0, 220) });
    }
    return { ok: true, results };
  } catch (err) {
    return { ok: false, results: [], error: String(err && err.message) };
  }
});

// Terminal mode: run a real shell command, cwd'd to the session scope.
// Every command passes the Guard first — catastrophic ones never run at all.
ipcMain.handle("veylaro:exec", (_e, cmd, cwd, opts) => {
  const options = opts || {};
  const verdict = guard.checkCommand(cmd);
  if (!verdict.allow) {
    return Promise.resolve({ ok: false, blocked: true, out: `⛔ Blocked by Veylaro's guard: ${verdict.reason}` });
  }
  if (verdict.needsConfirm && !options.confirmed) {
    return Promise.resolve({ ok: false, needsConfirm: true, out: `⚠️ ${verdict.reason}: ${cmd}` });
  }
  const cwdVerdict = guard.checkCwd(cwd, options);
  if (!cwdVerdict.allow) {
    return Promise.resolve({ ok: false, blocked: true, out: `⛔ Blocked by Veylaro's guard: ${cwdVerdict.reason}` });
  }
  if (cwdVerdict.needsConfirm && !options.confirmed) {
    return Promise.resolve({ ok: false, needsConfirm: true, out: `⚠️ ${cwdVerdict.reason}: ${cwd}` });
  }
  const dir = cwdVerdict.path;
  const modelVerdict = options.modelInitiated
    ? guard.checkModelCommand(cmd, { mode: options.policy === "build" ? "build" : "repair" })
    : null;
  if (modelVerdict && !modelVerdict.allow) {
    return Promise.resolve({ ok: false, blocked: true, out: `⛔ Model command blocked: ${modelVerdict.reason}` });
  }
  const shell = options.shell || process.env.SHELL || (process.platform === "win32" ? undefined : "/bin/zsh");
  // A GUI-launched app inherits a minimal PATH, so node/npx/git go missing (the
  // "command not found: npx" failure). toolPath() prepends the real toolchain dirs.
  const env = { ...process.env, PATH: toolPath() };
  return new Promise((resolve) => {
    const callback = (err, stdout, stderr) => {
      const out = [stdout, stderr].filter(Boolean).join("\n").trimEnd();
      resolve({ out: out || (err ? String(err.message) : "\u2713 done (no output)"), ok: !err });
    };
    if (modelVerdict?.argv) {
      execFile(modelVerdict.argv[0], modelVerdict.argv.slice(1), { cwd: dir, timeout: 180000, maxBuffer: 8 * 1024 * 1024, env }, callback);
    } else {
      exec(String(cmd), { cwd: dir, timeout: 180000, maxBuffer: 8 * 1024 * 1024, shell, env }, callback);
    }
  });
});

// Start a dev server in the BACKGROUND and hand back the localhost URL, so Laro
// can open its own work in the Viewport. Unlike exec, this does NOT wait for the
// (never-ending) process to finish \u2014 it watches the output for a localhost URL,
// returns as soon as it sees one, and keeps the server running.
ipcMain.handle("veylaro:serve", (_e, cmd, cwd, ctx) => {
  const verdict = guard.checkCommand(cmd);
  if (!verdict.allow) return Promise.resolve({ ok: false, error: `Blocked: ${verdict.reason}` });
  const parsed = guard.parseCommand(cmd);
  const argv = parsed.ok ? parsed.argv : [];
  const exe = String(argv[0] || "").toLowerCase();
  const args = argv.slice(1);
  const script = args[0] === "run" ? args[1] : args[0];
  if (!["npm", "pnpm", "yarn", "bun"].includes(exe) || !["dev", "start", "serve"].includes(script) || args.length > 2) {
    return Promise.resolve({ ok: false, error: "Blocked: only a declared dev, start, or serve package script may open the Viewport" });
  }
  const cwdVerdict = guard.checkCwd(cwd, ctx || {});
  if (!cwdVerdict.allow) return Promise.resolve({ ok: false, error: `Blocked: ${cwdVerdict.reason}` });
  if (cwdVerdict.needsConfirm && !(ctx && ctx.confirmed)) return Promise.resolve({ ok: false, error: `Confirmation required: ${cwdVerdict.reason}` });
  const dir = cwdVerdict.path;
  return new Promise((resolve) => {
    let done = false;
    let child;
    try {
      child = spawn(argv[0], argv.slice(1), { cwd: dir, shell: false, env: { ...process.env, PATH: toolPath(), FORCE_COLOR: "0", BROWSER: "none" } });
    } catch (e) {
      return resolve({ ok: false, error: String(e && e.message) });
    }
    const finish = (res) => { if (!done) { done = true; resolve(res); } };
    let buf = "";
    const checking = new Set();
    const prove = async (url, guessed = false) => {
      if (done || checking.has(url)) return;
      checking.add(url);
      const ready = await waitForHttp(url, guessed ? 3500 : 10000);
      if (done) return;
      if (ready && child.pid) {
        devServers.set(child.pid, { child, url });
        finish({ ok: true, url, pid: child.pid, ...(guessed ? { guessed: true } : {}) });
      } else if (guessed) {
        try { child.kill("SIGTERM"); } catch { /* already gone */ }
        finish({
          ok: false,
          error: `The dev command stayed alive but no HTTP server answered at ${url}.\n${buf.slice(-500)}`,
        });
      }
    };
    const sniff = (chunk) => {
      buf += String(chunk);
      // common dev-server announcements: "localhost:3000", "Local: http://localhost:5173/"
      const m = buf.match(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{2,5})/i) || buf.match(/(?:localhost|127\.0\.0\.1):(\d{2,5})/i);
      if (m && child.pid) {
        const port = m[1] || (m[0].match(/:(\d{2,5})/) || [])[1];
        const url = `http://localhost:${port}`;
        void prove(url);
      }
    };
    child.stdout && child.stdout.on("data", sniff);
    child.stderr && child.stderr.on("data", sniff);
    child.on("error", (e) => finish({ ok: false, error: String(e && e.message) }));
    child.on("exit", (code) => finish({ ok: false, error: `server exited (${code})\n${buf.slice(-500)}` }));
    // Fallback: infer a likely port, then PROVE it. Never report a guessed URL as
    // live merely because the child process has not exited.
    setTimeout(() => {
      if (done || !child.pid) return;
      const guess = /vite/i.test(cmd) ? 5173 : /next/i.test(cmd) ? 3000 : /(\bserve\b|http-server)/i.test(cmd) ? 8080 : 3000;
      const url = `http://localhost:${guess}`;
      void prove(url, true);
    }, 9000);
  });
});

ipcMain.handle("veylaro:stopServe", (_e, pid) => {
  const s = devServers.get(pid);
  if (s) { try { s.child.kill("SIGTERM"); } catch { /* gone */ } devServers.delete(pid); return { ok: true }; }
  return { ok: false };
});

/* ---- real file access, every call guarded ---- */

ipcMain.handle("veylaro:readFile", (_e, target, ctx) => {
  const lexical = guard.norm(target);
  let exists = false;
  try { fs.lstatSync(lexical); exists = true; } catch { /* absent or inaccessible */ }
  if (!exists) return { ok: false, exists: false, error: "path does not exist" };
  const verdict = guard.checkRead(target, ctx || {});
  if (!verdict.allow) return { ok: false, exists: true, blocked: true, error: verdict.reason };
  if (verdict.needsConfirm && !(ctx && ctx.confirmed)) return { ok: false, exists: true, needsConfirm: true, error: verdict.reason };
  try {
    const t = verdict.path;
    const stat = fs.statSync(t);
    if (!stat.isFile()) return { ok: false, exists: true, error: "path is not a file" };
    if (stat.size > 2 * 1024 * 1024) return { ok: false, exists: true, error: "file larger than 2 MB — open it in chunks" };
    return { ok: true, exists: true, content: fs.readFileSync(t, "utf8") };
  } catch (e) {
    return { ok: false, exists: true, error: String(e && e.message) };
  }
});

ipcMain.handle("veylaro:writeFile", (_e, target, content, ctx) => {
  const verdict = guard.checkWrite(target, ctx || {});
  if (!verdict.allow) return { ok: false, blocked: true, error: verdict.reason };
  if (verdict.needsConfirm && !(ctx && ctx.confirmed)) return { ok: false, needsConfirm: true, error: verdict.reason };
  try {
    const t = verdict.path;
    fs.mkdirSync(path.dirname(t), { recursive: true });
    // never silently clobber: keep one backup of what was there
    if (fs.existsSync(t) && !(ctx && ctx.rollback)) {
      try { fs.copyFileSync(t, t + ".veylaro-bak"); } catch { /* best effort */ }
    }
    fs.writeFileSync(t, String(content), "utf8");
    return { ok: true, path: t };
  } catch (e) {
    return { ok: false, error: String(e && e.message) };
  }
});

/** Transaction rollback primitive. The renderer may only restore a path that
    the same scoped Guard would allow it to edit. `null` means the file was
    created during this run, so rollback removes it. Directories are never
    removed and every call must be explicitly marked as a confirmed rollback. */
ipcMain.handle("veylaro:restoreFile", (_e, target, content, ctx) => {
  const verdict = guard.checkWrite(target, ctx || {});
  if (!verdict.allow) return { ok: false, blocked: true, error: verdict.reason };
  if (!(ctx && ctx.confirmed && ctx.rollback)) return { ok: false, blocked: true, error: "restore requires a confirmed rollback" };
  try {
    const t = verdict.path;
    if (content === null) {
      if (fs.existsSync(t)) {
        const stat = fs.lstatSync(t);
        if (!stat.isFile() && !stat.isSymbolicLink()) return { ok: false, blocked: true, error: "rollback only removes files" };
        fs.unlinkSync(t);
      }
      return { ok: true, path: t, removed: true };
    }
    fs.mkdirSync(path.dirname(t), { recursive: true });
    fs.writeFileSync(t, String(content), "utf8");
    return { ok: true, path: t };
  } catch (e) {
    return { ok: false, error: String(e && e.message) };
  }
});

ipcMain.handle("veylaro:listDir", (_e, target, ctx) => {
  const verdict = guard.checkRead(target, ctx || {});
  if (!verdict.allow) return { ok: false, blocked: true, error: verdict.reason };
  if (verdict.needsConfirm && !(ctx && ctx.confirmed)) return { ok: false, needsConfirm: true, error: verdict.reason };
  try {
    const t = verdict.path;
    const entries = fs.readdirSync(t, { withFileTypes: true })
      .filter((d) => !d.name.startsWith("."))
      .slice(0, 500)
      .map((d) => ({ name: d.name, dir: d.isDirectory() }));
    return { ok: true, entries };
  } catch (e) {
    return { ok: false, error: String(e && e.message) };
  }
});

/** Ask the Guard about a path without doing anything — used by the UI. */
ipcMain.handle("veylaro:checkWrite", (_e, target, ctx) => guard.checkWrite(target, ctx || {}));

ipcMain.handle("veylaro:sysinfo", () => ({
  ramGB: Math.round(os.totalmem() / (1024 * 1024 * 1024)),
  platform: process.platform,
  arch: process.arch,
  cpus: os.cpus().length,
  version: app.getVersion(),
}));

ipcMain.handle("veylaro:engineEnsure", (_e, url, preferredModel, sku) => ensureEngine(url, preferredModel, sku));
ipcMain.handle("veylaro:engineStop", () => stopOwnedEngine());
ipcMain.handle("veylaro:memoryState", () => readMemoryState());
ipcMain.handle("veylaro:modelCatalog", () => {
  try {
    return resolveModelCatalog({
      packaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
      userDataPath: app.getPath("userData"),
      platform: process.platform,
      arch: process.arch,
    });
  } catch (error) {
    return { ok: false, productionReady: false, releaseId: null, models: [], error: String(error?.message || error) };
  }
});
ipcMain.handle("veylaro:modelInstall", async (event, tier) => {
  if (modelDownloads.has(tier)) return { ok: false, error: `${tier} installation is already running` };
  const memory = await readMemoryState();
  if (memory.pressureFreePct < 30) {
    return { ok: false, error: `Installation paused to protect this Mac (${memory.pressureFreePct.toFixed(0)}% memory pressure headroom).` };
  }
  const controller = new AbortController();
  modelDownloads.set(tier, controller);
  try {
    const release = resolveReleaseModel({
      packaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
      platform: process.platform,
      arch: process.arch,
    }, tier);
    const result = await installModelBundle({
      tier,
      releaseEntry: release.entry,
      userDataPath: app.getPath("userData"),
      signal: controller.signal,
      onProgress: (progress) => {
        if (!event.sender.isDestroyed()) event.sender.send("veylaro:modelProgress", { tier, ...progress });
      },
    });
    return { ...result, releaseId: release.releaseId };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  } finally {
    modelDownloads.delete(tier);
  }
});
ipcMain.handle("veylaro:modelCancel", (_event, tier) => {
  const controller = modelDownloads.get(tier);
  if (!controller) return { ok: false, canceled: false };
  controller.abort();
  return { ok: true, canceled: true };
});

// Power + idle telemetry for the overnight-learning scheduler. The gating logic
// itself lives in the renderer (testable TS); the main process only reports the
// two facts the renderer can't see on its own: seconds since last input, and
// whether we're on battery. Never throws — a missing powerMonitor just reports
// "active + plugged" so learning simply won't start rather than crash.
ipcMain.handle("veylaro:powerState", () => {
  try {
    return {
      idleSec: powerMonitor.getSystemIdleTime(),
      onBattery: powerMonitor.isOnBatteryPower(),
      ok: true,
    };
  } catch {
    return { idleSec: 0, onBattery: false, ok: false };
  }
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  stopOwnedEngine();
  for (const controller of modelDownloads.values()) controller.abort();
  modelDownloads.clear();
  // never leave orphan dev servers running after the app closes
  for (const { child } of devServers.values()) { try { child.kill("SIGTERM"); } catch { /* gone */ } }
  devServers.clear();
});

app.on("window-all-closed", () => {
  for (const { child } of devServers.values()) { try { child.kill("SIGTERM"); } catch { /* gone */ } }
  devServers.clear();
  if (process.platform !== "darwin") app.quit();
});
