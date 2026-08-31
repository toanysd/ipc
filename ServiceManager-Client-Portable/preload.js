const { contextBridge, ipcRenderer } = require('electron');

/**
 * Expose một tập API an toàn cho cả Manager (setup.html) lẫn Client.
 * contextIsolation: true — không cho renderer tiếp cận Node truyền thống.
 */
contextBridge.exposeInMainWorld('electronAPI', {
    // Thông tin màn hình / desktop
    getDesktopSources : () => ipcRenderer.invoke('get-desktop-sources'),
    getDesktopSource  : () => ipcRenderer.invoke('get-desktop-source'),

    // Hệ thống
    lockWorkstation   : () => ipcRenderer.invoke('lock-workstation'),
    getSystemInfo     : () => ipcRenderer.invoke('get-system-info'),

    // Ẩn cửa sổ (client stealth)
    hideWindow        : () => ipcRenderer.invoke('hide-window'),

    // Chọn / đổi role và khởi động lại
    switchRole        : (role) => ipcRenderer.invoke('switch-role', role)
});
