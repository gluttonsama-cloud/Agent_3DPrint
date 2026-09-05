const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'relief',
  Object.freeze({
    segment: (input) => ipcRenderer.invoke('relief:segment', input),
    save: (project) => ipcRenderer.invoke('relief:save', project),
    open: () => ipcRenderer.invoke('relief:open'),
    export: (project) => ipcRenderer.invoke('relief:export', project),
    sample: () => ipcRenderer.invoke('relief:sample'),
    appInfo: () => ipcRenderer.invoke('relief:info'),
  }),
);
