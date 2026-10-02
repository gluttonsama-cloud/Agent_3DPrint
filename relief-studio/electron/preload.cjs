const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('reliefV2', Object.freeze({
  height: (request) => ipcRenderer.invoke('v2:height', request),
  recognition: (request) => ipcRenderer.invoke('v2:recognition', request),
  export: (request) => ipcRenderer.invoke('v2:export', request),
  save: (request) => ipcRenderer.invoke('v2:save', request),
  open: (request) => ipcRenderer.invoke('v2:open', request),
  migrate: (request) => ipcRenderer.invoke('v2:migrate', request),
  import: (request) => ipcRenderer.invoke('v2:import', request),
  cancel: (request) => ipcRenderer.invoke('v2:cancel', request),
  progress: (request) => ipcRenderer.invoke('v2:progress', request),
}));

contextBridge.exposeInMainWorld(
  'relief',
  Object.freeze({
    segment: (input) => ipcRenderer.invoke('relief:segment', input),
    repair: (input) => ipcRenderer.invoke('relief:repair', input),
    refine: (input) => ipcRenderer.invoke('relief:refine', input),
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
