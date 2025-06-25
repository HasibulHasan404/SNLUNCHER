const fs = require("fs").promises;
const path = require("path");
const { spawn } = require("child_process");
const { app } = require("electron");
const Store = require("electron-store");
// const si = require('systeminformation'); // Removed dependency
const EventEmitter = require("events");

class ServerManager extends EventEmitter {
  constructor() {
    super();
    this.store = new Store();
    this.servers = new Map();
    this.runningProcesses = new Map();
    this.serverStats = new Map();
    this.logBuffers = new Map();
    this.serversDir = path.join(app.getPath("userData"), "servers");
    this.init();
  }

  async init() {
    try {
      await fs.mkdir(this.serversDir, { recursive: true });
      await this.loadServers();
    } catch (error) {
      console.error("Failed to initialize ServerManager:", error);
    }
  }

  async loadServers() {
    try {
      const servers = this.store.get("servers", {});
      for (const [id, serverData] of Object.entries(servers)) {
        this.servers.set(id, serverData);
        this.logBuffers.set(id, []);

        // Check if server directory exists
        const serverPath = path.join(this.serversDir, serverData.name);
        try {
          await fs.access(serverPath);
          serverData.status = "offline";
        } catch {
          serverData.status = "missing";
        }
      }
    } catch (error) {
      console.error("Failed to load servers:", error);
    }
  }

  async saveServers() {
    try {
      const serversObject = Object.fromEntries(this.servers);
      this.store.set("servers", serversObject);
    } catch (error) {
      console.error("Failed to save servers:", error);
    }
  }

  async getAllServers() {
    const servers = Array.from(this.servers.values());

    // Update status for each server
    for (const server of servers) {
      server.status = await this.getServerStatus(server.id);
    }

    return servers;
  }

  async createServer(config) {
    try {
      const serverId = this.generateServerId();
      const serverName = config.name.replace(/[^a-zA-Z0-9-_]/g, "_");
      const serverPath = path.join(this.serversDir, serverName);

      // Check if server directory already exists
      try {
        await fs.access(serverPath);
        throw new Error("Server with this name already exists");
      } catch (error) {
        if (error.code !== "ENOENT") {
          throw error;
        }
      }

      // Create server directory
      await fs.mkdir(serverPath, { recursive: true });

      // Create server configuration
      const serverData = {
        id: serverId,
        name: config.name,
        path: serverPath,
        type: config.type || "leafmc",
        version: config.version,
        gameVersion: config.gameVersion || "latest",
        ram: config.ram || 2048,
        port: config.port || 25565,
        status: "offline",
        createdAt: new Date().toISOString(),
        lastStarted: null,
        autoStart: config.autoStart || false,
        javaArgs:
          config.javaArgs ||
          "-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200",
      };

      // Generate server files
      await this.generateServerFiles(serverData);

      // Save server data
      this.servers.set(serverId, serverData);
      this.logBuffers.set(serverId, []);
      await this.saveServers();

      return { success: true, server: serverData };
    } catch (error) {
      console.error("Failed to create server:", error);
      return { success: false, error: error.message };
    }
  }

  async generateServerFiles(serverData) {
    const serverPath = serverData.path;

    // Create EULA file
    const eulaContent = `#By changing the setting below to TRUE you are indicating your agreement to our EULA (https://aka.ms/MinecraftEULA).
#${new Date().toISOString()}
eula=true`;
    await fs.writeFile(path.join(serverPath, "eula.txt"), eulaContent);

    // Create basic server.properties
    const serverProperties = `#Minecraft server properties
#${new Date().toISOString()}
server-port=${serverData.port}
gamemode=survival
difficulty=easy
spawn-protection=16
max-players=20
online-mode=true
white-list=false
spawn-monsters=true
spawn-animals=true
spawn-npcs=true
pvp=true
enable-command-block=false
motd=§aWelcome to ${serverData.name}!
server-name=${serverData.name}
max-world-size=29999984
view-distance=10
simulation-distance=10
level-name=world
level-type=minecraft\\:normal
level-seed=
allow-cheats=false
enforce-secure-profile=true`;
    await fs.writeFile(
      path.join(serverPath, "server.properties"),
      serverProperties,
    );

    // Create startup script
    const javaPath = "java";
    const jarName = `leafmc-${serverData.version}.jar`;
    const startupScript =
      process.platform === "win32"
        ? `@echo off
echo Starting ${serverData.name}...
"${javaPath}" -Xmx${serverData.ram}M -Xms${Math.floor(serverData.ram / 2)}M ${serverData.javaArgs} -jar "${jarName}" nogui
pause`
        : `#!/bin/bash
echo "Starting ${serverData.name}..."
java -Xmx${serverData.ram}M -Xms${Math.floor(serverData.ram / 2)}M ${serverData.javaArgs} -jar "${jarName}" nogui`;

    const scriptFile = process.platform === "win32" ? "start.bat" : "start.sh";
    await fs.writeFile(path.join(serverPath, scriptFile), startupScript);

    if (process.platform !== "win32") {
      await fs.chmod(path.join(serverPath, scriptFile), 0o755);
    }

    // Create plugins directory
    await fs.mkdir(path.join(serverPath, "plugins"), { recursive: true });
  }

  async startServer(serverId) {
    try {
      const server = this.servers.get(serverId);
      if (!server) {
        throw new Error("Server not found");
      }

      if (this.runningProcesses.has(serverId)) {
        throw new Error("Server is already running");
      }

      const serverPath = server.path;
      const jarFiles = await fs.readdir(serverPath);
      const jarFile = jarFiles.find(
        (file) => file.endsWith(".jar") && file.includes("leafmc"),
      );

      if (!jarFile) {
        throw new Error("LeafMC jar file not found. Please download it first.");
      }

      const javaArgs = [
        `-Xmx${server.ram}M`,
        `-Xms${Math.floor(server.ram / 2)}M`,
        ...server.javaArgs.split(" "),
        "-jar",
        jarFile,
        "nogui",
      ];

      const serverProcess = spawn("java", javaArgs, {
        cwd: serverPath,
        stdio: ["pipe", "pipe", "pipe"],
      });

      this.runningProcesses.set(serverId, serverProcess);
      server.status = "starting";
      server.lastStarted = new Date().toISOString();

      // Handle process output
      serverProcess.stdout.on("data", (data) => {
        this.handleServerOutput(serverId, data.toString());
      });

      serverProcess.stderr.on("data", (data) => {
        this.handleServerOutput(serverId, data.toString(), "error");
      });

      serverProcess.on("close", (code) => {
        this.handleServerClose(serverId, code);
      });

      serverProcess.on("error", (error) => {
        this.handleServerError(serverId, error);
      });

      // Start monitoring server stats
      this.startStatsMonitoring(serverId);

      await this.saveServers();
      this.emit("server-status-changed", serverId, "starting");

      return { success: true };
    } catch (error) {
      console.error("Failed to start server:", error);
      return { success: false, error: error.message };
    }
  }

  async stopServer(serverId) {
    try {
      const process = this.runningProcesses.get(serverId);
      if (!process) {
        throw new Error("Server is not running");
      }

      // Send stop command
      process.stdin.write("stop\n");

      // Wait for graceful shutdown (max 30 seconds)
      const timeout = setTimeout(() => {
        if (this.runningProcesses.has(serverId)) {
          process.kill("SIGTERM");
        }
      }, 30000);

      process.on("close", () => {
        clearTimeout(timeout);
      });

      return { success: true };
    } catch (error) {
      console.error("Failed to stop server:", error);
      return { success: false, error: error.message };
    }
  }

  async restartServer(serverId) {
    try {
      await this.stopServer(serverId);

      // Wait a moment for complete shutdown
      await new Promise((resolve) => setTimeout(resolve, 2000));

      return await this.startServer(serverId);
    } catch (error) {
      console.error("Failed to restart server:", error);
      return { success: false, error: error.message };
    }
  }

  async deleteServer(serverId) {
    try {
      const server = this.servers.get(serverId);
      if (!server) {
        throw new Error("Server not found");
      }

      // Stop server if running
      if (this.runningProcesses.has(serverId)) {
        await this.stopServer(serverId);
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }

      // Remove server files
      await fs.rm(server.path, { recursive: true, force: true });

      // Clean up data structures
      this.servers.delete(serverId);
      this.runningProcesses.delete(serverId);
      this.serverStats.delete(serverId);
      this.logBuffers.delete(serverId);

      await this.saveServers();

      return { success: true };
    } catch (error) {
      console.error("Failed to delete server:", error);
      return { success: false, error: error.message };
    }
  }

  async getServerStatus(serverId) {
    const server = this.servers.get(serverId);
    if (!server) {
      return "unknown";
    }

    if (this.runningProcesses.has(serverId)) {
      const process = this.runningProcesses.get(serverId);
      if (process.killed) {
        return "offline";
      }
      return server.status || "running";
    }

    return "offline";
  }

  async sendCommand(serverId, command) {
    try {
      const process = this.runningProcesses.get(serverId);
      if (!process) {
        throw new Error("Server is not running");
      }

      process.stdin.write(command + "\n");
      return { success: true };
    } catch (error) {
      console.error("Failed to send command:", error);
      return { success: false, error: error.message };
    }
  }

  async getServerLogs(serverId, lines = 100) {
    try {
      const logBuffer = this.logBuffers.get(serverId) || [];
      return logBuffer.slice(-lines);
    } catch (error) {
      console.error("Failed to get server logs:", error);
      return [];
    }
  }

  async getServerStats(serverId) {
    return (
      this.serverStats.get(serverId) || {
        cpu: 0,
        memory: 0,
        uptime: 0,
        players: 0,
      }
    );
  }

  handleServerOutput(serverId, data, type = "info") {
    const lines = data.split("\n").filter((line) => line.trim());
    const logBuffer = this.logBuffers.get(serverId) || [];

    for (const line of lines) {
      const logEntry = {
        timestamp: new Date().toISOString(),
        type: type,
        message: line.trim(),
      };

      logBuffer.push(logEntry);

      // Keep only last 1000 log entries
      if (logBuffer.length > 1000) {
        logBuffer.shift();
      }

      // Check for server ready state
      if (line.includes("Done") && line.includes('For help, type "help"')) {
        const server = this.servers.get(serverId);
        if (server) {
          server.status = "running";
          this.emit("server-status-changed", serverId, "running");
        }
      }
    }

    this.logBuffers.set(serverId, logBuffer);
    this.emit("server-log-update", serverId, lines);
  }

  handleServerClose(serverId, code) {
    const server = this.servers.get(serverId);
    if (server) {
      server.status = "offline";
    }

    this.runningProcesses.delete(serverId);
    this.serverStats.delete(serverId);
    this.emit("server-status-changed", serverId, "offline");

    const logEntry = {
      timestamp: new Date().toISOString(),
      type: "info",
      message: `Server stopped with exit code ${code}`,
    };

    const logBuffer = this.logBuffers.get(serverId) || [];
    logBuffer.push(logEntry);
    this.logBuffers.set(serverId, logBuffer);
  }

  handleServerError(serverId, error) {
    console.error(`Server ${serverId} error:`, error);

    const server = this.servers.get(serverId);
    if (server) {
      server.status = "error";
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      type: "error",
      message: `Server error: ${error.message}`,
    };

    const logBuffer = this.logBuffers.get(serverId) || [];
    logBuffer.push(logEntry);
    this.logBuffers.set(serverId, logBuffer);

    this.emit("server-status-changed", serverId, "error");
  }

  startStatsMonitoring(serverId) {
    const process = this.runningProcesses.get(serverId);
    if (!process) return;

    const statsInterval = setInterval(async () => {
      if (!this.runningProcesses.has(serverId)) {
        clearInterval(statsInterval);
        return;
      }

      try {
        // Simplified stats without systeminformation
        const stats = {
          cpu: Math.random() * 50 + 10, // Mock CPU usage
          memory: Math.floor(Math.random() * 1000 + 500), // Mock memory usage
          uptime: Math.floor(
            (Date.now() -
              new Date(this.servers.get(serverId).lastStarted).getTime()) /
              1000,
          ),
          players: this.extractPlayerCount(serverId),
        };

        this.serverStats.set(serverId, stats);
      } catch (error) {
        console.error("Failed to get server stats:", error);
      }
    }, 5000);
  }

  extractPlayerCount(serverId) {
    const logBuffer = this.logBuffers.get(serverId) || [];
    const recentLogs = logBuffer.slice(-50);

    // Look for player join/leave messages to estimate player count
    // This is a simple implementation - could be enhanced
    let playerCount = 0;
    const playerPattern = /(\w+) joined the game|(\w+) left the game/;

    for (const log of recentLogs) {
      if (playerPattern.test(log.message)) {
        // This is a very basic implementation
        // In a real scenario, you'd want to track actual player names
      }
    }

    return playerCount;
  }

  generateServerId() {
    return (
      "server_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9)
    );
  }
}

module.exports = ServerManager;
