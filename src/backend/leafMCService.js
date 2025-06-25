const axios = require("axios");
const fs = require("fs").promises;
const path = require("path");
const { createWriteStream } = require("fs");
const { pipeline } = require("stream");
const { promisify } = require("util");
const pipelineAsync = promisify(pipeline);

class LeafMCService {
  constructor() {
    this.baseUrl = "https://api.leafmc.one/v2";
    this.fallbackVersions = [
      {
        version: "1.21.5",
        build: "55",
        stable: true,
        downloadUrl:
          "https://api.leafmc.one/v2/projects/leaf/versions/1.21.5/builds/55/downloads/leaf-1.21.5-55.jar",
      },
      { version: "1.21.4", build: "latest", stable: true },
      { version: "1.21.3", build: "latest", stable: true },
      { version: "1.21.2", build: "latest", stable: true },
      { version: "1.21.1", build: "latest", stable: true },
      { version: "1.21.0", build: "latest", stable: true },
      { version: "1.20.4", build: "latest", stable: true },
      { version: "1.20.3", build: "latest", stable: true },
    ];
  }

  async getAvailableVersions() {
    try {
      // Direct manual approach since the API structure might be different
      const builds = ["55", "latest"];
      const versions = [
        "1.21.5",
        "1.21.4",
        "1.21.3",
        "1.21.2",
        "1.21.1",
        "1.21.0",
        "1.20.4",
        "1.20.3",
      ];

      const versionsList = [];
      for (const version of versions) {
        const build = version === "1.21.5" ? "55" : "latest";
        versionsList.push({
          version: version,
          build: build,
          stable: true,
          downloadUrl: this.generateDownloadUrl(version, build),
          releaseDate: new Date().toISOString(),
        });
      }

      return versionsList;
    } catch (error) {
      console.warn("Failed to fetch LeafMC versions from API:", error.message);
    }

    // Fallback to hardcoded versions if API fails
    return this.fallbackVersions.map((version) => ({
      ...version,
      downloadUrl: this.generateDownloadUrl(version.version, version.build),
      releaseDate: new Date().toISOString(),
    }));
  }

  generateDownloadUrl(version, build = "latest") {
    // LeafMC download URL pattern based on observed API structure
    return `${this.baseUrl}/projects/leaf/versions/${version}/builds/${build}/downloads/leaf-${version}-${build}.jar`;
  }

  async getLatestVersion(gameVersion = null) {
    try {
      const versions = await this.getAvailableVersions();

      if (gameVersion) {
        const filtered = versions.filter((v) => v.version === gameVersion);
        return filtered.length > 0 ? filtered[0] : null;
      }

      return versions.find((v) => v.stable) || versions[0] || null;
    } catch (error) {
      console.error("Failed to get latest LeafMC version:", error);
      return null;
    }
  }

  async downloadLeafMC(version, serverPath, onProgress = null) {
    try {
      const versions = await this.getAvailableVersions();
      const versionInfo = versions.find((v) => v.version === version);

      if (!versionInfo) {
        throw new Error(`LeafMC version ${version} not found`);
      }

      const downloadUrl = versionInfo.downloadUrl;
      const fileName = `leafmc-${version}.jar`;
      const filePath = path.join(serverPath, fileName);

      // Check if file already exists
      try {
        await fs.access(filePath);
        const stats = await fs.stat(filePath);
        if (stats.size > 0) {
          return {
            success: true,
            path: filePath,
            message: "File already exists",
          };
        }
      } catch {
        // File doesn't exist, continue with download
      }

      // Create download stream
      const response = await axios({
        method: "GET",
        url: downloadUrl,
        responseType: "stream",
        timeout: 300000, // 5 minutes timeout
        headers: {
          "User-Agent": "SN-Server-Manager/1.0.0",
        },
      });

      const totalSize = parseInt(response.headers["content-length"] || "0");
      let downloadedSize = 0;

      // Create write stream
      const writeStream = createWriteStream(filePath);

      // Track download progress
      if (onProgress && totalSize > 0) {
        response.data.on("data", (chunk) => {
          downloadedSize += chunk.length;
          const progress = (downloadedSize / totalSize) * 100;
          onProgress(progress);
        });
      }

      // Download the file
      await pipelineAsync(response.data, writeStream);

      // Verify file was downloaded successfully
      const stats = await fs.stat(filePath);
      if (stats.size === 0) {
        throw new Error("Downloaded file is empty");
      }

      return {
        success: true,
        path: filePath,
        size: stats.size,
        message: "Download completed successfully",
      };
    } catch (error) {
      console.error("Failed to download LeafMC:", error);

      // Try fallback download if main URL fails
      if (error.code === "ENOTFOUND" || error.response?.status >= 400) {
        return await this.downloadLeafMCFallback(
          version,
          serverPath,
          onProgress,
        );
      }

      throw error;
    }
  }

  async downloadLeafMCFallback(version, serverPath, onProgress = null) {
    try {
      console.log("Attempting fallback download for LeafMC...");

      // Alternative download sources
      const fallbackUrls = [
        `${this.baseUrl}/projects/leaf/versions/${version}/builds/latest/downloads/leaf-${version}-latest.jar`,
        `https://api.leafmc.one/v2/projects/leaf/versions/${version}/builds/latest/downloads/leaf-${version}-latest.jar`,
        `https://github.com/Winds-Studio/Leaf/releases/download/${version}/leaf-${version}.jar`,
        `https://cdn.leafmc.one/downloads/leaf-${version}.jar`,
      ];

      for (const url of fallbackUrls) {
        try {
          const fileName = `leafmc-${version}.jar`;
          const filePath = path.join(serverPath, fileName);

          const response = await axios({
            method: "GET",
            url: url,
            responseType: "stream",
            timeout: 300000,
            headers: {
              "User-Agent": "SN-Server-Manager/1.0.0",
            },
          });

          const totalSize = parseInt(response.headers["content-length"] || "0");
          let downloadedSize = 0;

          const writeStream = createWriteStream(filePath);

          if (onProgress && totalSize > 0) {
            response.data.on("data", (chunk) => {
              downloadedSize += chunk.length;
              const progress = (downloadedSize / totalSize) * 100;
              onProgress(progress);
            });
          }

          await pipelineAsync(response.data, writeStream);

          const stats = await fs.stat(filePath);
          if (stats.size > 0) {
            return {
              success: true,
              path: filePath,
              size: stats.size,
              message: "Download completed via fallback",
            };
          }
        } catch (fallbackError) {
          console.warn(`Fallback URL failed: ${url}`, fallbackError.message);
          continue;
        }
      }

      throw new Error("All download sources failed");
    } catch (error) {
      console.error("All fallback downloads failed:", error);
      throw new Error(`Failed to download LeafMC ${version}: ${error.message}`);
    }
  }

  async getVersionInfo(version) {
    try {
      const versions = await this.getAvailableVersions();
      return versions.find((v) => v.version === version) || null;
    } catch (error) {
      console.error("Failed to get version info:", error);
      return null;
    }
  }

  async isVersionCompatible(version, minecraftVersion) {
    try {
      // Simple version compatibility check
      const versionInfo = await this.getVersionInfo(version);
      if (!versionInfo) return false;

      // LeafMC versions typically match Minecraft versions
      return versionInfo.version === minecraftVersion;
    } catch (error) {
      console.error("Failed to check version compatibility:", error);
      return false;
    }
  }

  async validateServerJar(jarPath) {
    try {
      const stats = await fs.stat(jarPath);

      if (stats.size < 1024 * 1024) {
        // Less than 1MB is suspicious
        return {
          valid: false,
          error: "JAR file is too small",
        };
      }

      // Check if it's actually a JAR file (basic check)
      const buffer = Buffer.alloc(4);
      const fd = await fs.open(jarPath, "r");
      await fd.read(buffer, 0, 4, 0);
      await fd.close();

      // JAR files start with PK (ZIP header)
      if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
        return {
          valid: false,
          error: "File is not a valid JAR archive",
        };
      }

      return {
        valid: true,
        size: stats.size,
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message,
      };
    }
  }

  async getServerType(jarPath) {
    try {
      // This is a simplified implementation
      // In a real scenario, you might want to extract and read the JAR manifest
      const fileName = path.basename(jarPath).toLowerCase();

      if (fileName.includes("leafmc") || fileName.includes("leaf")) {
        return "leafmc";
      }

      if (fileName.includes("paper")) {
        return "paper";
      }

      if (fileName.includes("spigot")) {
        return "spigot";
      }

      if (fileName.includes("bukkit")) {
        return "bukkit";
      }

      return "unknown";
    } catch (error) {
      console.error("Failed to determine server type:", error);
      return "unknown";
    }
  }

  async createServerStartupConfig(serverPath, config) {
    try {
      const startupConfig = {
        javaArgs:
          config.javaArgs ||
          "-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200",
        memory: config.memory || 2048,
        jarFile: config.jarFile || `leaf-${config.version}.jar`,
        additionalArgs: config.additionalArgs || "nogui",
      };

      const configPath = path.join(serverPath, "startup-config.json");
      await fs.writeFile(configPath, JSON.stringify(startupConfig, null, 2));

      return startupConfig;
    } catch (error) {
      console.error("Failed to create startup config:", error);
      throw error;
    }
  }

  async updateLeafMC(serverPath, currentVersion, targetVersion) {
    try {
      // Handle both new and old naming conventions
      let currentJarPath = path.join(
        serverPath,
        `leaf-${currentVersion}-${currentVersion === "1.21.5" ? "55" : "latest"}.jar`,
      );

      // Check if file exists, if not try the older naming pattern
      try {
        await fs.access(currentJarPath);
      } catch (error) {
        currentJarPath = path.join(serverPath, `leaf-${currentVersion}.jar`);
      }

      const backupPath = currentJarPath + ".backup";

      // Backup current version
      try {
        await fs.copyFile(currentJarPath, backupPath);
      } catch (error) {
        console.warn("Failed to backup current version:", error);
      }

      // Download new version
      const result = await this.downloadLeafMC(targetVersion, serverPath);

      if (result.success) {
        // Remove old version
        try {
          await fs.unlink(currentJarPath);
        } catch (error) {
          console.warn("Failed to remove old version:", error);
        }

        return {
          success: true,
          message: `Successfully updated from ${currentVersion} to ${targetVersion}`,
          backupPath: backupPath,
        };
      }

      return result;
    } catch (error) {
      console.error("Failed to update LeafMC:", error);

      // Restore backup if update failed
      try {
        // Use the same path logic as above to ensure consistency
        let currentJarPath = path.join(
          serverPath,
          `leaf-${currentVersion}-${currentVersion === "1.21.5" ? "55" : "latest"}.jar`,
        );

        // Check if file exists, if not try the older naming pattern
        try {
          await fs.access(currentJarPath);
        } catch (error) {
          currentJarPath = path.join(serverPath, `leaf-${currentVersion}.jar`);
        }

        const backupPath = currentJarPath + ".backup";
        await fs.copyFile(backupPath, currentJarPath);
      } catch (restoreError) {
        console.error("Failed to restore backup:", restoreError);
      }

      throw error;
    }
  }
}

module.exports = LeafMCService;
