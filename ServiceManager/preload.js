const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getDesktopSources: () => ipcRenderer.invoke('get-desktop-sources'),
    lockWorkstation: () => ipcRenderer.invoke('lock-workstation'),
    getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
    switchRole: (role) => ipcRenderer.invoke('switch-role', role)
});
