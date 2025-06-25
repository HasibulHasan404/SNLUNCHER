const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs").promises;
const Store = require("electron-store");
const { spawn } = require("child_process");

// Import backend modules
const ServerManager = require("./backend/serverManager");
const LeafMCService = require("./backend/leafMCService");
const ModrinthAPI = require("./backend/modrinthAPI");
const FileManager = require("./backend/fileManager");

// Initialize electron store
const store = new Store();

// Keep a global reference of the window object
let mainWindow;

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      sandbox: false,
    },
    frame: false,
    transparent: false,
    icon: path.join(__dirname, "../assets/icon.png"),
    show: false,
  });

  // Load the main page
  mainWindow.loadFile(path.join(__dirname, "renderer/index.html"));

  // Show window when ready to prevent visual flash
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // Open DevTools in development
  if (process.argv.includes("--dev")) {
    mainWindow.webContents.openDevTools();
  }

  // Handle window closed
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

// Initialize backend services
const serverManager = new ServerManager();
const leafMCService = new LeafMCService();
const modrinthAPI = new ModrinthAPI();
const fileManager = new FileManager();

// Disable security warnings in development
if (process.argv.includes("--dev")) {
  process.env["ELECTRON_DISABLE_SECURITY_WARNINGS"] = "true";
}

// App event handlers
app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Add command line switches for Linux compatibility
if (process.platform === "linux") {
  app.commandLine.appendSwitch("--no-sandbox");
  app.commandLine.appendSwitch("--disable-setuid-sandbox");
}

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC Handlers - Server Management
ipcMain.handle("get-servers", async () => {
  try {
    return await serverManager.getAllServers();
  } catch (error) {
    console.error("Error getting servers:", error);
    throw error;
  }
});

ipcMain.handle("create-server", async (event, serverConfig) => {
  try {
    return await serverManager.createServer(serverConfig);
  } catch (error) {
    console.error("Error creating server:", error);
    throw error;
  }
});

ipcMain.handle("start-server", async (event, serverId) => {
  try {
    return await serverManager.startServer(serverId);
  } catch (error) {
    console.error("Error starting server:", error);
    throw error;
  }
});

ipcMain.handle("stop-server", async (event, serverId) => {
  try {
    return await serverManager.stopServer(serverId);
  } catch (error) {
    console.error("Error stopping server:", error);
    throw error;
  }
});

ipcMain.handle("restart-server", async (event, serverId) => {
  try {
    return await serverManager.restartServer(serverId);
  } catch (error) {
    console.error("Error restarting server:", error);
    throw error;
  }
});

ipcMain.handle("delete-server", async (event, serverId) => {
  try {
    return await serverManager.deleteServer(serverId);
  } catch (error) {
    console.error("Error deleting server:", error);
    throw error;
  }
});

ipcMain.handle("get-server-status", async (event, serverId) => {
  try {
    return await serverManager.getServerStatus(serverId);
  } catch (error) {
    console.error("Error getting server status:", error);
    throw error;
  }
});

ipcMain.handle("send-server-command", async (event, serverId, command) => {
  try {
    return await serverManager.sendCommand(serverId, command);
  } catch (error) {
    console.error("Error sending server command:", error);
    throw error;
  }
});

ipcMain.handle("get-server-logs", async (event, serverId, lines = 100) => {
  try {
    return await serverManager.getServerLogs(serverId, lines);
  } catch (error) {
    console.error("Error getting server logs:", error);
    throw error;
  }
});

ipcMain.handle("get-server-stats", async (event, serverId) => {
  try {
    return await serverManager.getServerStats(serverId);
  } catch (error) {
    console.error("Error getting server stats:", error);
    throw error;
  }
});

// IPC Handlers - LeafMC Service
ipcMain.handle("get-leafmc-versions", async () => {
  try {
    return await leafMCService.getAvailableVersions();
  } catch (error) {
    console.error("Error getting LeafMC versions:", error);
    throw error;
  }
});

ipcMain.handle("download-leafmc", async (event, version, serverPath) => {
  try {
    return await leafMCService.downloadLeafMC(version, serverPath);
  } catch (error) {
    console.error("Error downloading LeafMC:", error);
    throw error;
  }
});

// IPC Handlers - File Manager
ipcMain.handle("get-directory-tree", async (event, serverPath) => {
  try {
    return await fileManager.getDirectoryTree(serverPath);
  } catch (error) {
    console.error("Error getting directory tree:", error);
    throw error;
  }
});

ipcMain.handle("get-directory-contents", async (event, dirPath) => {
  try {
    return await fileManager.getDirectoryContents(dirPath);
  } catch (error) {
    console.error("Error getting directory contents:", error);
    throw error;
  }
});

ipcMain.handle("read-file", async (event, filePath) => {
  try {
    return await fileManager.readFile(filePath);
  } catch (error) {
    console.error("Error reading file:", error);
    throw error;
  }
});

ipcMain.handle("write-file", async (event, filePath, content) => {
  try {
    return await fileManager.writeFile(filePath, content);
  } catch (error) {
    console.error("Error writing file:", error);
    throw error;
  }
});

ipcMain.handle("delete-file", async (event, filePath) => {
  try {
    return await fileManager.deleteFile(filePath);
  } catch (error) {
    console.error("Error deleting file:", error);
    throw error;
  }
});

ipcMain.handle("rename-file", async (event, oldPath, newPath) => {
  try {
    return await fileManager.renameFile(oldPath, newPath);
  } catch (error) {
    console.error("Error renaming file:", error);
    throw error;
  }
});

ipcMain.handle("create-directory", async (event, dirPath) => {
  try {
    return await fileManager.createDirectory(dirPath);
  } catch (error) {
    console.error("Error creating directory:", error);
    throw error;
  }
});

ipcMain.handle("upload-files", async (event, targetDir) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "All Files", extensions: ["*"] },
        { name: "JAR Files", extensions: ["jar"] },
        {
          name: "Config Files",
          extensions: ["yml", "yaml", "json", "properties", "toml"],
        },
      ],
    });

    if (!result.canceled) {
      return await fileManager.uploadFiles(result.filePaths, targetDir);
    }
    return { success: false, message: "Upload cancelled" };
  } catch (error) {
    console.error("Error uploading files:", error);
    throw error;
  }
});

ipcMain.handle("download-folder", async (event, folderPath) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `${path.basename(folderPath)}.zip`,
      filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
    });

    if (!result.canceled) {
      return await fileManager.downloadFolder(folderPath, result.filePath);
    }
    return { success: false, message: "Download cancelled" };
  } catch (error) {
    console.error("Error downloading folder:", error);
    throw error;
  }
});

// IPC Handlers - Modrinth API
ipcMain.handle("search-modrinth", async (event, query, filters = {}) => {
  try {
    return await modrinthAPI.searchProjects(query, filters);
  } catch (error) {
    console.error("Error searching Modrinth:", error);
    throw error;
  }
});

ipcMain.handle("get-modrinth-project", async (event, projectId) => {
  try {
    return await modrinthAPI.getProject(projectId);
  } catch (error) {
    console.error("Error getting Modrinth project:", error);
    throw error;
  }
});

ipcMain.handle(
  "get-modrinth-versions",
  async (event, projectId, gameVersions = [], loaders = []) => {
    try {
      return await modrinthAPI.getProjectVersions(
        projectId,
        gameVersions,
        loaders,
      );
    } catch (error) {
      console.error("Error getting Modrinth versions:", error);
      throw error;
    }
  },
);

ipcMain.handle(
  "download-modrinth-file",
  async (event, versionId, serverPath) => {
    try {
      return await modrinthAPI.downloadFile(versionId, serverPath);
    } catch (error) {
      console.error("Error downloading Modrinth file:", error);
      throw error;
    }
  },
);

ipcMain.handle("get-installed-plugins", async (event, serverPath) => {
  try {
    return await fileManager.getInstalledPlugins(serverPath);
  } catch (error) {
    console.error("Error getting installed plugins:", error);
    throw error;
  }
});

// IPC Handlers - App Settings
ipcMain.handle("get-app-setting", (event, key) => {
  return store.get(key);
});

ipcMain.handle("set-app-setting", (event, key, value) => {
  store.set(key, value);
  return true;
});

ipcMain.handle("get-app-settings", () => {
  return store.store;
});

// IPC Handlers - Dialog
ipcMain.handle("show-error-dialog", async (event, title, content) => {
  return await dialog.showErrorBox(title, content);
});

ipcMain.handle("show-message-dialog", async (event, options) => {
  return await dialog.showMessageBox(mainWindow, options);
});

// IPC Handlers - Shell
ipcMain.handle("open-path", async (event, path) => {
  return shell.openPath(path);
});

ipcMain.handle("show-item-in-folder", async (event, path) => {
  return shell.showItemInFolder(path);
});

// IPC Handlers - Window Controls
ipcMain.handle("window-minimize", () => {
  if (mainWindow) mainWindow.minimize();
  return true;
});

ipcMain.handle("window-maximize", () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
  return true;
});

ipcMain.handle("window-close", () => {
  if (mainWindow) mainWindow.close();
  return true;
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});
