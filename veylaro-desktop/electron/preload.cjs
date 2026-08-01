const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("veylaro", {
  pickFile: () => ipcRenderer.invoke("veylaro:pick", "file"),
  pickFolder: () => ipcRenderer.invoke("veylaro:pick", "folder"),
  newProject: (name) => ipcRenderer.invoke("veylaro:newProject", name),
  sysinfo: () => ipcRenderer.invoke("veylaro:sysinfo"),
  engineEnsure: (url, preferredModel, sku) => ipcRenderer.invoke("veylaro:engineEnsure", url, preferredModel, sku),
  engineStop: () => ipcRenderer.invoke("veylaro:engineStop"),
  memoryState: () => ipcRenderer.invoke("veylaro:memoryState"),
  modelCatalog: () => ipcRenderer.invoke("veylaro:modelCatalog"),
  modelInstall: (tier) => ipcRenderer.invoke("veylaro:modelInstall", tier),
  modelCancel: (tier) => ipcRenderer.invoke("veylaro:modelCancel", tier),
  onModelProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on("veylaro:modelProgress", listener);
    return () => ipcRenderer.removeListener("veylaro:modelProgress", listener);
  },
  exec: (cmd, cwd, opts) => ipcRenderer.invoke("veylaro:exec", cmd, cwd, opts),
  serve: (cmd, cwd, ctx) => ipcRenderer.invoke("veylaro:serve", cmd, cwd, ctx),
  stopServe: (pid) => ipcRenderer.invoke("veylaro:stopServe", pid),
  readFile: (p, ctx) => ipcRenderer.invoke("veylaro:readFile", p, ctx),
  writeFile: (p, content, ctx) => ipcRenderer.invoke("veylaro:writeFile", p, content, ctx),
  restoreFile: (p, content, ctx) => ipcRenderer.invoke("veylaro:restoreFile", p, content, ctx),
  listDir: (p, ctx) => ipcRenderer.invoke("veylaro:listDir", p, ctx),
  checkWrite: (p, ctx) => ipcRenderer.invoke("veylaro:checkWrite", p, ctx),
  search: (query) => ipcRenderer.invoke("veylaro:search", query),
  powerState: () => ipcRenderer.invoke("veylaro:powerState"),
  isDesktop: true,
});
