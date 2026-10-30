const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('beyin', {
  call: (mod, method, ...args) => ipcRenderer.invoke('mod', mod, method, args),
  modules: () => ipcRenderer.invoke('modules'),
  setEnabled: (id, on) => ipcRenderer.invoke('setEnabled', id, on),
  alerts: () => ipcRenderer.invoke('alerts'),
  pickVault: () => ipcRenderer.invoke('pickVault'),
  config: () => ipcRenderer.invoke('config'),
  setConfig: (patch) => ipcRenderer.invoke('setConfig', patch),
  onGoto: (cb) => ipcRenderer.on('goto', (_e, id) => cb(id)),
});
