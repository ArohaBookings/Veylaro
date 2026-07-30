const { app, BrowserWindow, ipcMain, dialog, shell, powerMonitor } = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs");
const { exec } = require("child_process");
const guard = require("./guard.cjs");

const DEV_URL = process.env.VITE_DEV_SERVER_URL || null;

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
  const verdict = guard.checkCommand(cmd);
  if (!verdict.allow) {
    return Promise.resolve({ ok: false, blocked: true, out: `⛔ Blocked by Veylaro's guard: ${verdict.reason}` });
  }
  if (verdict.needsConfirm && !(opts && opts.confirmed)) {
    return Promise.resolve({ ok: false, needsConfirm: true, out: `⚠️ ${verdict.reason}: ${cmd}` });
  }
  let dir = os.homedir();
  try {
    if (cwd) {
      const p = guard.norm(cwd);
      const st = fs.existsSync(p) && fs.statSync(p);
      dir = st ? (st.isDirectory() ? p : path.dirname(p)) : os.homedir();
    }
  } catch { /* fall back to home */ }
  const shell = (opts && opts.shell) || process.env.SHELL || (process.platform === "win32" ? undefined : "/bin/zsh");
  return new Promise((resolve) => {
    exec(String(cmd), { cwd: dir, timeout: 180000, maxBuffer: 8 * 1024 * 1024, shell }, (err, stdout, stderr) => {
      const out = [stdout, stderr].filter(Boolean).join("\n").trimEnd();
      resolve({ out: out || (err ? String(err.message) : "\u2713 done (no output)"), ok: !err });
    });
  });
});

/* ---- real file access, every call guarded ---- */

ipcMain.handle("veylaro:readFile", (_e, target) => {
  try {
    const t = guard.norm(target);
    const stat = fs.statSync(t);
    if (stat.size > 2 * 1024 * 1024) return { ok: false, error: "file larger than 2 MB — open it in chunks" };
    return { ok: true, content: fs.readFileSync(t, "utf8") };
  } catch (e) {
    return { ok: false, error: String(e && e.message) };
  }
});

ipcMain.handle("veylaro:writeFile", (_e, target, content, ctx) => {
  const verdict = guard.checkWrite(target, ctx || {});
  if (!verdict.allow) return { ok: false, blocked: true, error: verdict.reason };
  if (verdict.needsConfirm && !(ctx && ctx.confirmed)) return { ok: false, needsConfirm: true, error: verdict.reason };
  try {
    const t = guard.norm(target);
    fs.mkdirSync(path.dirname(t), { recursive: true });
    // never silently clobber: keep one backup of what was there
    if (fs.existsSync(t)) {
      try { fs.copyFileSync(t, t + ".veylaro-bak"); } catch { /* best effort */ }
    }
    fs.writeFileSync(t, String(content), "utf8");
    return { ok: true, path: t };
  } catch (e) {
    return { ok: false, error: String(e && e.message) };
  }
});

ipcMain.handle("veylaro:listDir", (_e, target) => {
  try {
    const t = guard.norm(target);
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

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
