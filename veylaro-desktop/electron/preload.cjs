const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("veylaro", {
  pickFile: () => ipcRenderer.invoke("veylaro:pick", "file"),
  pickFolder: () => ipcRenderer.invoke("veylaro:pick", "folder"),
  sysinfo: () => ipcRenderer.invoke("veylaro:sysinfo"),
  exec: (cmd, cwd, opts) => ipcRenderer.invoke("veylaro:exec", cmd, cwd, opts),
  readFile: (p) => ipcRenderer.invoke("veylaro:readFile", p),
  writeFile: (p, content, ctx) => ipcRenderer.invoke("veylaro:writeFile", p, content, ctx),
  listDir: (p) => ipcRenderer.invoke("veylaro:listDir", p),
  checkWrite: (p, ctx) => ipcRenderer.invoke("veylaro:checkWrite", p, ctx),
  search: (query) => ipcRenderer.invoke("veylaro:search", query),
  isDesktop: true,
});
