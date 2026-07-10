const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs");
const { exec } = require("child_process");

const DEV_URL = process.env.VITE_DEV_SERVER_URL || null;

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
  const props = kind === "folder" ? ["openDirectory"] : ["openFile"];
  const res = await dialog.showOpenDialog({ properties: props });
  if (res.canceled || !res.filePaths.length) return null;
  return res.filePaths[0];
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
ipcMain.handle("veylaro:exec", (_e, cmd, cwd) => {
  let dir = os.homedir();
  try {
    if (cwd) {
      const p = cwd.replace(/^~(?=\/|$)/, os.homedir());
      const st = fs.existsSync(p) && fs.statSync(p);
      dir = st ? (st.isDirectory() ? p : path.dirname(p)) : os.homedir();
    }
  } catch { /* fall back to home */ }
  return new Promise((resolve) => {
    exec(String(cmd), { cwd: dir, timeout: 120000, maxBuffer: 4 * 1024 * 1024, shell: process.env.SHELL || "/bin/zsh" }, (err, stdout, stderr) => {
      const out = [stdout, stderr].filter(Boolean).join("\n").trimEnd();
      resolve({ out: out || (err ? String(err.message) : "✓ done (no output)"), ok: !err });
    });
  });
});

ipcMain.handle("veylaro:sysinfo", () => ({
  ramGB: Math.round(os.totalmem() / (1024 * 1024 * 1024)),
  platform: process.platform,
  arch: process.arch,
  cpus: os.cpus().length,
  version: app.getVersion(),
}));

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
