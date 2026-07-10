const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("veylaro", {
  pickFile: () => ipcRenderer.invoke("veylaro:pick", "file"),
  pickFolder: () => ipcRenderer.invoke("veylaro:pick", "folder"),
  sysinfo: () => ipcRenderer.invoke("veylaro:sysinfo"),
  exec: (cmd, cwd) => ipcRenderer.invoke("veylaro:exec", cmd, cwd),
  search: (query) => ipcRenderer.invoke("veylaro:search", query),
  isDesktop: true,
});
