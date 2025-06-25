const fs = require('fs').promises;
const path = require('path');
const { createWriteStream, createReadStream } = require('fs');
const archiver = require('archiver');
const { pipeline } = require('stream/promises');
const chokidar = require('chokidar');
const yaml = require('yaml');

class FileManager {
  constructor() {
    this.watchers = new Map();
    this.supportedTextFiles = [
      '.txt', '.yml', '.yaml', '.json', '.properties', '.toml', '.conf',
      '.cfg', '.ini', '.log', '.md', '.js', '.css', '.html', '.xml'
    ];
  }

  async getDirectoryTree(rootPath) {
    try {
      const tree = await this.buildDirectoryTree(rootPath);
      return tree;
    } catch (error) {
      console.error('Failed to get directory tree:', error);
      throw new Error(`Failed to get directory tree: ${error.message}`);
    }
  }

  async buildDirectoryTree(dirPath, level = 0) {
    if (level > 10) return null; // Prevent infinite recursion

    try {
      const stats = await fs.stat(dirPath);
      const name = path.basename(dirPath);

      if (stats.isDirectory()) {
        const children = [];
        const entries = await fs.readdir(dirPath);

        for (const entry of entries) {
          if (entry.startsWith('.')) continue; // Skip hidden files

          const entryPath = path.join(dirPath, entry);
          const child = await this.buildDirectoryTree(entryPath, level + 1);
          if (child) {
            children.push(child);
          }
        }

        return {
          name: name,
          path: dirPath,
          type: 'directory',
          children: children.sort((a, b) => {
            if (a.type !== b.type) {
              return a.type === 'directory' ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
          }),
          size: 0,
          modified: stats.mtime
        };
      } else {
        return {
          name: name,
          path: dirPath,
          type: 'file',
          size: stats.size,
          modified: stats.mtime,
          extension: path.extname(name).toLowerCase()
        };
      }
    } catch (error) {
      console.warn(`Failed to process ${dirPath}:`, error.message);
      return null;
    }
  }

  async getDirectoryContents(dirPath) {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const contents = [];

      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;

        const entryPath = path.join(dirPath, entry.name);
        const stats = await fs.stat(entryPath);

        contents.push({
          name: entry.name,
          path: entryPath,
          type: entry.isDirectory() ? 'directory' : 'file',
          size: entry.isFile() ? stats.size : 0,
          modified: stats.mtime,
          extension: entry.isFile() ? path.extname(entry.name).toLowerCase() : null,
          isTextFile: entry.isFile() ? this.isTextFile(entry.name) : false
        });
      }

      return contents.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
    } catch (error) {
      console.error('Failed to get directory contents:', error);
      throw new Error(`Failed to get directory contents: ${error.message}`);
    }
  }

  async readFile(filePath) {
    try {
      const stats = await fs.stat(filePath);

      if (stats.size > 10 * 1024 * 1024) { // 10MB limit
        throw new Error('File is too large to read (>10MB)');
      }

      if (!this.isTextFile(filePath)) {
        throw new Error('File is not a text file');
      }

      const content = await fs.readFile(filePath, 'utf8');

      return {
        content: content,
        size: stats.size,
        modified: stats.mtime,
        encoding: 'utf8'
      };
    } catch (error) {
      console.error('Failed to read file:', error);
      throw new Error(`Failed to read file: ${error.message}`);
    }
  }

  async writeFile(filePath, content) {
    try {
      // Create directory if it doesn't exist
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });

      // Backup existing file if it exists
      try {
        await fs.access(filePath);
        const backupPath = `${filePath}.backup`;
        await fs.copyFile(filePath, backupPath);
      } catch {
        // File doesn't exist, no backup needed
      }

      await fs.writeFile(filePath, content, 'utf8');

      const stats = await fs.stat(filePath);

      return {
        success: true,
        size: stats.size,
        modified: stats.mtime
      };
    } catch (error) {
      console.error('Failed to write file:', error);
      throw new Error(`Failed to write file: ${error.message}`);
    }
  }

  async deleteFile(filePath) {
    try {
      const stats = await fs.stat(filePath);

      if (stats.isDirectory()) {
        await fs.rm(filePath, { recursive: true, force: true });
      } else {
        await fs.unlink(filePath);
      }

      return { success: true };
    } catch (error) {
      console.error('Failed to delete file:', error);
      throw new Error(`Failed to delete file: ${error.message}`);
    }
  }

  async renameFile(oldPath, newPath) {
    try {
      // Check if target already exists
      try {
        await fs.access(newPath);
        throw new Error('Target file already exists');
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }

      await fs.rename(oldPath, newPath);
      return { success: true };
    } catch (error) {
      console.error('Failed to rename file:', error);
      throw new Error(`Failed to rename file: ${error.message}`);
    }
  }

  async createDirectory(dirPath) {
    try {
      await fs.mkdir(dirPath, { recursive: true });
      return { success: true };
    } catch (error) {
      console.error('Failed to create directory:', error);
      throw new Error(`Failed to create directory: ${error.message}`);
    }
  }

  async uploadFiles(filePaths, targetDir) {
    try {
      const results = [];

      for (const filePath of filePaths) {
        const fileName = path.basename(filePath);
        const targetPath = path.join(targetDir, fileName);

        try {
          await fs.copyFile(filePath, targetPath);
          const stats = await fs.stat(targetPath);

          results.push({
            filename: fileName,
            success: true,
            size: stats.size,
            path: targetPath
          });
        } catch (error) {
          results.push({
            filename: fileName,
            success: false,
            error: error.message
          });
        }
      }

      return {
        success: true,
        results: results,
        totalFiles: filePaths.length,
        successCount: results.filter(r => r.success).length
      };
    } catch (error) {
      console.error('Failed to upload files:', error);
      throw new Error(`Failed to upload files: ${error.message}`);
    }
  }

  async downloadFolder(folderPath, outputPath) {
    try {
      const archive = archiver('zip', {
        zlib: { level: 9 }
      });

      const output = createWriteStream(outputPath);

      return new Promise((resolve, reject) => {
        output.on('close', () => {
          resolve({
            success: true,
            path: outputPath,
            size: archive.pointer()
          });
        });

        archive.on('error', (error) => {
          reject(error);
        });

        archive.pipe(output);
        archive.directory(folderPath, false);
        archive.finalize();
      });
    } catch (error) {
      console.error('Failed to download folder:', error);
      throw new Error(`Failed to download folder: ${error.message}`);
    }
  }

  async getInstalledPlugins(serverPath) {
    try {
      const pluginsDir = path.join(serverPath, 'plugins');

      try {
        await fs.access(pluginsDir);
      } catch {
        return [];
      }

      const entries = await fs.readdir(pluginsDir);
      const plugins = [];

      for (const entry of entries) {
        if (!entry.endsWith('.jar')) continue;

        const pluginPath = path.join(pluginsDir, entry);
        const stats = await fs.stat(pluginPath);

        const plugin = {
          filename: entry,
          path: pluginPath,
          size: stats.size,
          modified: stats.mtime,
          enabled: !entry.endsWith('.jar.disabled'),
          name: this.extractPluginName(entry),
          version: null,
          description: null,
          author: null,
          modrinthId: null
        };

        // Try to extract plugin information
        try {
          const pluginInfo = await this.extractPluginInfo(pluginPath);
          Object.assign(plugin, pluginInfo);
        } catch (error) {
          console.warn(`Failed to extract plugin info for ${entry}:`, error.message);
        }

        plugins.push(plugin);
      }

      return plugins.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      console.error('Failed to get installed plugins:', error);
      throw new Error(`Failed to get installed plugins: ${error.message}`);
    }
  }

  async extractPluginInfo(jarPath) {
    try {
      // This is a simplified implementation
      // In a real scenario, you'd want to extract and parse plugin.yml from the JAR
      const filename = path.basename(jarPath);
      const nameWithoutExt = filename.replace(/\.jar(\.disabled)?$/, '');

      // Try to parse version from filename
      const versionMatch = nameWithoutExt.match(/[-_](\d+(?:\.\d+)*(?:[-_]\w+)?)/);
      const version = versionMatch ? versionMatch[1] : null;

      const name = versionMatch ?
        nameWithoutExt.replace(versionMatch[0], '') :
        nameWithoutExt;

      return {
        name: name || nameWithoutExt,
        version: version,
        description: null,
        author: null
      };
    } catch (error) {
      console.warn('Failed to extract plugin info:', error);
      return {};
    }
  }

  extractPluginName(filename) {
    const nameWithoutExt = filename.replace(/\.jar(\.disabled)?$/, '');
    const versionMatch = nameWithoutExt.match(/[-_](\d+(?:\.\d+)*(?:[-_]\w+)?)/);

    if (versionMatch) {
      return nameWithoutExt.replace(versionMatch[0], '');
    }

    return nameWithoutExt;
  }

  async togglePlugin(pluginPath, enable) {
    try {
      const isCurrentlyEnabled = !pluginPath.endsWith('.disabled');

      if (enable && !isCurrentlyEnabled) {
        // Enable plugin (remove .disabled suffix)
        const newPath = pluginPath.replace('.jar.disabled', '.jar');
        await fs.rename(pluginPath, newPath);
        return { success: true, newPath: newPath };
      } else if (!enable && isCurrentlyEnabled) {
        // Disable plugin (add .disabled suffix)
        const newPath = pluginPath + '.disabled';
        await fs.rename(pluginPath, newPath);
        return { success: true, newPath: newPath };
      }

      return { success: true, newPath: pluginPath };
    } catch (error) {
      console.error('Failed to toggle plugin:', error);
      throw new Error(`Failed to toggle plugin: ${error.message}`);
    }
  }

  async watchDirectory(dirPath, callback) {
    try {
      if (this.watchers.has(dirPath)) {
        return;
      }

      const watcher = chokidar.watch(dirPath, {
        ignored: /^\./, // ignore dotfiles
        persistent: true,
        ignoreInitial: true
      });

      watcher.on('add', (path) => callback('add', path));
      watcher.on('change', (path) => callback('change', path));
      watcher.on('unlink', (path) => callback('unlink', path));
      watcher.on('addDir', (path) => callback('addDir', path));
      watcher.on('unlinkDir', (path) => callback('unlinkDir', path));

      this.watchers.set(dirPath, watcher);
    } catch (error) {
      console.error('Failed to watch directory:', error);
    }
  }

  async unwatchDirectory(dirPath) {
    try {
      const watcher = this.watchers.get(dirPath);
      if (watcher) {
        await watcher.close();
        this.watchers.delete(dirPath);
      }
    } catch (error) {
      console.error('Failed to unwatch directory:', error);
    }
  }

  isTextFile(filename) {
    const ext = path.extname(filename).toLowerCase();
    return this.supportedTextFiles.includes(ext);
  }

  async parseConfigFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const ext = path.extname(filePath).toLowerCase();

      switch (ext) {
        case '.json':
          return JSON.parse(content);
        case '.yml':
        case '.yaml':
          return yaml.parse(content);
        case '.properties':
          return this.parseProperties(content);
        default:
          return content;
      }
    } catch (error) {
      console.error('Failed to parse config file:', error);
      throw new Error(`Failed to parse config file: ${error.message}`);
    }
  }

  parseProperties(content) {
    const properties = {};
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          properties[key.trim()] = valueParts.join('=').trim();
        }
      }
    }

    return properties;
  }

  async writeConfigFile(filePath, data) {
    try {
      const ext = path.extname(filePath).toLowerCase();
      let content;

      switch (ext) {
        case '.json':
          content = JSON.stringify(data, null, 2);
          break;
        case '.yml':
        case '.yaml':
          content = yaml.stringify(data);
          break;
        case '.properties':
          content = this.stringifyProperties(data);
          break;
        default:
          content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
      }

      await this.writeFile(filePath, content);
      return { success: true };
    } catch (error) {
      console.error('Failed to write config file:', error);
      throw new Error(`Failed to write config file: ${error.message}`);
    }
  }

  stringifyProperties(data) {
    const lines = [];

    for (const [key, value] of Object.entries(data)) {
      lines.push(`${key}=${value}`);
    }

    return lines.join('\n');
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async cleanup() {
    for (const [dirPath, watcher] of this.watchers) {
      try {
        await watcher.close();
      } catch (error) {
        console.error(`Failed to close watcher for ${dirPath}:`, error);
      }
    }
    this.watchers.clear();
  }
}

module.exports = FileManager;
