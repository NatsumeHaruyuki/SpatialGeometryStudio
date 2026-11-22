import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('studio', {
  openProject: () => ipcRenderer.invoke('project:open'),
  saveProject: (scene: unknown, asJson = false) => ipcRenderer.invoke('project:save', scene, asJson),
  exportPNG: (data: string) => ipcRenderer.invoke('image:export', data),
  dataInfo: () => ipcRenderer.invoke('data:info'),
  setDataMode: (mode: string) => ipcRenderer.invoke('data:mode', mode),
  setDirty: (dirty: boolean) => ipcRenderer.send('project:dirty', dirty === true),
  copyPrompt: () => ipcRenderer.invoke('prompt:copy'),
  copyImportRepair: (input: string, error: string) => ipcRenderer.invoke('prompt:copy-repair', input, error),
});
