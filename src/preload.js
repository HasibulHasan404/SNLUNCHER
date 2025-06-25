const { contextBridge, ipcRenderer } = require("electron");

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("electronAPI", {
  // Server Management
  getServers: () => ipcRenderer.invoke("get-servers"),
  createServer: (config) => ipcRenderer.invoke("create-server", config),
  startServer: (serverId) => ipcRenderer.invoke("start-server", serverId),
  stopServer: (serverId) => ipcRenderer.invoke("stop-server", serverId),
  restartServer: (serverId) => ipcRenderer.invoke("restart-server", serverId),
  deleteServer: (serverId) => ipcRenderer.invoke("delete-server", serverId),
  getServerStatus: (serverId) =>
    ipcRenderer.invoke("get-server-status", serverId),
  sendServerCommand: (serverId, command) =>
    ipcRenderer.invoke("send-server-command", serverId, command),
  getServerLogs: (serverId, lines) =>
    ipcRenderer.invoke("get-server-logs", serverId, lines),
  getServerStats: (serverId) =>
    ipcRenderer.invoke("get-server-stats", serverId),

  // LeafMC Service
  getLeafMCVersions: () => ipcRenderer.invoke("get-leafmc-versions"),
  downloadLeafMC: (version, serverPath) =>
    ipcRenderer.invoke("download-leafmc", version, serverPath),

  // File Manager
  getDirectoryTree: (serverPath) =>
    ipcRenderer.invoke("get-directory-tree", serverPath),
  getDirectoryContents: (dirPath) =>
    ipcRenderer.invoke("get-directory-contents", dirPath),
  readFile: (filePath) => ipcRenderer.invoke("read-file", filePath),
  writeFile: (filePath, content) =>
    ipcRenderer.invoke("write-file", filePath, content),
  deleteFile: (filePath) => ipcRenderer.invoke("delete-file", filePath),
  renameFile: (oldPath, newPath) =>
    ipcRenderer.invoke("rename-file", oldPath, newPath),
  createDirectory: (dirPath) => ipcRenderer.invoke("create-directory", dirPath),
  uploadFiles: (targetDir) => ipcRenderer.invoke("upload-files", targetDir),
  downloadFolder: (folderPath) =>
    ipcRenderer.invoke("download-folder", folderPath),

  // Modrinth API
  searchModrinth: (query, filters) =>
    ipcRenderer.invoke("search-modrinth", query, filters),
  getModrinthProject: (projectId) =>
    ipcRenderer.invoke("get-modrinth-project", projectId),
  getModrinthVersions: (projectId, gameVersions, loaders) =>
    ipcRenderer.invoke(
      "get-modrinth-versions",
      projectId,
      gameVersions,
      loaders,
    ),
  downloadModrinthFile: (versionId, serverPath) =>
    ipcRenderer.invoke("download-modrinth-file", versionId, serverPath),
  getInstalledPlugins: (serverPath) =>
    ipcRenderer.invoke("get-installed-plugins", serverPath),

  // App Settings
  getAppSetting: (key) => ipcRenderer.invoke("get-app-setting", key),
  setAppSetting: (key, value) =>
    ipcRenderer.invoke("set-app-setting", key, value),
  getAppSettings: () => ipcRenderer.invoke("get-app-settings"),

  // Dialog
  showErrorDialog: (title, content) =>
    ipcRenderer.invoke("show-error-dialog", title, content),
  showMessageDialog: (options) =>
    ipcRenderer.invoke("show-message-dialog", options),

  // Shell
  openPath: (path) => ipcRenderer.invoke("open-path", path),
  showItemInFolder: (path) => ipcRenderer.invoke("show-item-in-folder", path),

  // Window Controls
  minimizeWindow: () => ipcRenderer.invoke("window-minimize"),
  maximizeWindow: () => ipcRenderer.invoke("window-maximize"),
  closeWindow: () => ipcRenderer.invoke("window-close"),

  // Event listeners for real-time updates
  onServerStatusChange: (callback) => {
    const subscription = (event, serverId, status) =>
      callback(serverId, status);
    ipcRenderer.on("server-status-changed", subscription);

    // Return unsubscribe function
    return () =>
      ipcRenderer.removeListener("server-status-changed", subscription);
  },

  onServerLogUpdate: (callback) => {
    const subscription = (event, serverId, logData) =>
      callback(serverId, logData);
    ipcRenderer.on("server-log-update", subscription);

    return () => ipcRenderer.removeListener("server-log-update", subscription);
  },

  onFileSystemChange: (callback) => {
    const subscription = (event, path, eventType) => callback(path, eventType);
    ipcRenderer.on("filesystem-change", subscription);

    return () => ipcRenderer.removeListener("filesystem-change", subscription);
  },

  onDownloadProgress: (callback) => {
    const subscription = (event, progress) => callback(progress);
    ipcRenderer.on("download-progress", subscription);

    return () => ipcRenderer.removeListener("download-progress", subscription);
  },

  // Remove all listeners (cleanup)
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners("server-status-changed");
    ipcRenderer.removeAllListeners("server-log-update");
    ipcRenderer.removeAllListeners("filesystem-change");
    ipcRenderer.removeAllListeners("download-progress");
  },
});

// Expose version info
contextBridge.exposeInMainWorld("versions", {
  node: () => process.versions.node,
  chrome: () => process.versions.chrome,
  electron: () => process.versions.electron,
  app: () => process.env.npm_package_version || "1.0.0",
});

// Expose platform info
contextBridge.exposeInMainWorld("platform", {
  isWindows: process.platform === "win32",
  isMac: process.platform === "darwin",
  isLinux: process.platform === "linux",
});
