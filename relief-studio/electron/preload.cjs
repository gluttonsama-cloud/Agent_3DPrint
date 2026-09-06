const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'relief',
  Object.freeze({
    segment: (input) => ipcRenderer.invoke('relief:segment', input),
    subject: (input) => ipcRenderer.invoke('relief:subject', input),
    subjectStatus: () => ipcRenderer.invoke('relief:subject-status'),
    cancelSubject: () => ipcRenderer.invoke('relief:subject-cancel'),
    cancelSegment: () => ipcRenderer.invoke('relief:segment-cancel'),
    save: (project) => ipcRenderer.invoke('relief:save', project),
    open: () => ipcRenderer.invoke('relief:open'),
    export: (project) => ipcRenderer.invoke('relief:export', project),
    sample: () => ipcRenderer.invoke('relief:sample'),
    appInfo: () => ipcRenderer.invoke('relief:info'),
  }),
);
