const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { createWriteStream } = require('fs');
const { pipeline } = require('stream/promises');

class ModrinthAPI {
  constructor() {
    this.baseUrl = 'https://api.modrinth.com/v2';
    this.cdnUrl = 'https://cdn.modrinth.com';
    this.userAgent = 'SN-Server-Manager/1.0.0 (contact@example.com)';
    this.rateLimit = {
      requests: 0,
      resetTime: Date.now() + 60000 // Reset every minute
    };
  }

  async makeRequest(endpoint, params = {}) {
    // Simple rate limiting
    if (Date.now() > this.rateLimit.resetTime) {
      this.rateLimit.requests = 0;
      this.rateLimit.resetTime = Date.now() + 60000;
    }

    if (this.rateLimit.requests >= 300) { // Modrinth allows 300 requests per minute
      throw new Error('Rate limit exceeded. Please wait a moment.');
    }

    try {
      const response = await axios.get(`${this.baseUrl}${endpoint}`, {
        params,
        headers: {
          'User-Agent': this.userAgent
        },
        timeout: 10000
      });

      this.rateLimit.requests++;
      return response.data;
    } catch (error) {
      if (error.response?.status === 429) {
        throw new Error('Rate limit exceeded. Please wait a moment.');
      }
      throw error;
    }
  }

  async searchProjects(query, filters = {}) {
    try {
      const params = {
        query: query,
        limit: filters.limit || 20,
        offset: filters.offset || 0,
        index: filters.index || 'relevance'
      };

      // Add facets for filtering
      const facets = [];

      if (filters.categories && filters.categories.length > 0) {
        facets.push(`["categories:${filters.categories.join('","categories:')}"]`);
      }

      if (filters.versions && filters.versions.length > 0) {
        facets.push(`["versions:${filters.versions.join('","versions:')}"]`);
      }

      if (filters.loaders && filters.loaders.length > 0) {
        facets.push(`["categories:${filters.loaders.join('","categories:')}"]`);
      }

      if (filters.projectType) {
        facets.push(`["project_type:${filters.projectType}"]`);
      }

      if (facets.length > 0) {
        params.facets = `[${facets.join(',')}]`;
      }

      const data = await this.makeRequest('/search', params);

      return {
        hits: data.hits.map(hit => ({
          id: hit.project_id,
          slug: hit.slug,
          title: hit.title,
          description: hit.description,
          author: hit.author,
          iconUrl: hit.icon_url,
          categories: hit.categories,
          versions: hit.versions,
          downloads: hit.downloads,
          follows: hit.follows,
          dateCreated: hit.date_created,
          dateModified: hit.date_modified,
          license: hit.license,
          clientSide: hit.client_side,
          serverSide: hit.server_side,
          projectType: hit.project_type
        })),
        offset: data.offset,
        limit: data.limit,
        totalHits: data.total_hits
      };
    } catch (error) {
      console.error('Failed to search Modrinth:', error);
      throw new Error(`Search failed: ${error.message}`);
    }
  }

  async getProject(projectId) {
    try {
      const data = await this.makeRequest(`/project/${projectId}`);

      return {
        id: data.id,
        slug: data.slug,
        title: data.title,
        description: data.description,
        body: data.body,
        author: data.team,
        iconUrl: data.icon_url,
        categories: data.categories,
        additionalCategories: data.additional_categories,
        gameVersions: data.game_versions,
        loaders: data.loaders,
        versions: data.versions,
        downloads: data.downloads,
        followers: data.followers,
        dateCreated: data.date_created,
        dateModified: data.date_modified,
        status: data.status,
        license: data.license,
        clientSide: data.client_side,
        serverSide: data.server_side,
        projectType: data.project_type,
        moderationMessage: data.moderation_message,
        gallery: data.gallery,
        donationUrls: data.donation_urls,
        issuesUrl: data.issues_url,
        sourceUrl: data.source_url,
        wikiUrl: data.wiki_url,
        discordUrl: data.discord_url
      };
    } catch (error) {
      console.error('Failed to get project:', error);
      throw new Error(`Failed to get project: ${error.message}`);
    }
  }

  async getProjectVersions(projectId, gameVersions = [], loaders = []) {
    try {
      const params = {};

      if (gameVersions.length > 0) {
        params.game_versions = JSON.stringify(gameVersions);
      }

      if (loaders.length > 0) {
        params.loaders = JSON.stringify(loaders);
      }

      const data = await this.makeRequest(`/project/${projectId}/version`, params);

      return data.map(version => ({
        id: version.id,
        projectId: version.project_id,
        authorId: version.author_id,
        featured: version.featured,
        name: version.name,
        versionNumber: version.version_number,
        changelog: version.changelog,
        dependencies: version.dependencies,
        gameVersions: version.game_versions,
        versionType: version.version_type,
        loaders: version.loaders,
        files: version.files.map(file => ({
          hashes: file.hashes,
          url: file.url,
          filename: file.filename,
          primary: file.primary,
          size: file.size,
          fileType: file.file_type
        })),
        datePublished: version.date_published,
        downloads: version.downloads,
        status: version.status
      }));
    } catch (error) {
      console.error('Failed to get project versions:', error);
      throw new Error(`Failed to get versions: ${error.message}`);
    }
  }

  async getVersion(versionId) {
    try {
      const data = await this.makeRequest(`/version/${versionId}`);

      return {
        id: data.id,
        projectId: data.project_id,
        authorId: data.author_id,
        featured: data.featured,
        name: data.name,
        versionNumber: data.version_number,
        changelog: data.changelog,
        dependencies: data.dependencies,
        gameVersions: data.game_versions,
        versionType: data.version_type,
        loaders: data.loaders,
        files: data.files.map(file => ({
          hashes: file.hashes,
          url: file.url,
          filename: file.filename,
          primary: file.primary,
          size: file.size,
          fileType: file.file_type
        })),
        datePublished: data.date_published,
        downloads: data.downloads,
        status: data.status
      };
    } catch (error) {
      console.error('Failed to get version:', error);
      throw new Error(`Failed to get version: ${error.message}`);
    }
  }

  async downloadFile(versionId, targetPath, onProgress = null) {
    try {
      const version = await this.getVersion(versionId);
      const primaryFile = version.files.find(f => f.primary) || version.files[0];

      if (!primaryFile) {
        throw new Error('No downloadable files found');
      }

      const fileName = primaryFile.filename;
      const filePath = path.join(targetPath, fileName);

      // Check if file already exists
      try {
        await fs.access(filePath);
        const stats = await fs.stat(filePath);
        if (stats.size === primaryFile.size) {
          return {
            success: true,
            path: filePath,
            message: 'File already exists',
            filename: fileName,
            size: stats.size
          };
        }
      } catch {
        // File doesn't exist, continue with download
      }

      // Download the file
      const response = await axios({
        method: 'GET',
        url: primaryFile.url,
        responseType: 'stream',
        timeout: 300000, // 5 minutes
        headers: {
          'User-Agent': this.userAgent
        }
      });

      const totalSize = primaryFile.size;
      let downloadedSize = 0;

      const writeStream = createWriteStream(filePath);

      // Track download progress
      if (onProgress && totalSize > 0) {
        response.data.on('data', (chunk) => {
          downloadedSize += chunk.length;
          const progress = (downloadedSize / totalSize) * 100;
          onProgress(progress);
        });
      }

      await pipeline(response.data, writeStream);

      // Verify file integrity if hash is available
      if (primaryFile.hashes.sha1) {
        const isValid = await this.verifyFileHash(filePath, primaryFile.hashes.sha1, 'sha1');
        if (!isValid) {
          await fs.unlink(filePath);
          throw new Error('Downloaded file hash verification failed');
        }
      }

      return {
        success: true,
        path: filePath,
        filename: fileName,
        size: totalSize,
        message: 'Download completed successfully'
      };

    } catch (error) {
      console.error('Failed to download file:', error);
      throw new Error(`Download failed: ${error.message}`);
    }
  }

  async verifyFileHash(filePath, expectedHash, algorithm = 'sha1') {
    try {
      const crypto = require('crypto');
      const fileBuffer = await fs.readFile(filePath);
      const hash = crypto.createHash(algorithm);
      hash.update(fileBuffer);
      const actualHash = hash.digest('hex');

      return actualHash.toLowerCase() === expectedHash.toLowerCase();
    } catch (error) {
      console.error('Failed to verify file hash:', error);
      return false;
    }
  }

  async getCategories() {
    try {
      const data = await this.makeRequest('/tag/category');
      return data.map(category => ({
        icon: category.icon,
        name: category.name,
        projectType: category.project_type,
        header: category.header
      }));
    } catch (error) {
      console.error('Failed to get categories:', error);
      return [];
    }
  }

  async getLoaders() {
    try {
      const data = await this.makeRequest('/tag/loader');
      return data.map(loader => ({
        icon: loader.icon,
        name: loader.name,
        supportedProjectTypes: loader.supported_project_types
      }));
    } catch (error) {
      console.error('Failed to get loaders:', error);
      return [];
    }
  }

  async getGameVersions() {
    try {
      const data = await this.makeRequest('/tag/game_version');
      return data.map(version => ({
        version: version.version,
        versionType: version.version_type,
        date: version.date,
        major: version.major
      }));
    } catch (error) {
      console.error('Failed to get game versions:', error);
      return [];
    }
  }

  async checkForUpdates(installedMods) {
    try {
      const updates = [];

      for (const mod of installedMods) {
        if (!mod.modrinthId) continue;

        try {
          const versions = await this.getProjectVersions(
            mod.modrinthId,
            [mod.gameVersion],
            [mod.loader]
          );

          const latestVersion = versions.find(v => v.versionType === 'release') || versions[0];

          if (latestVersion && latestVersion.versionNumber !== mod.version) {
            updates.push({
              mod: mod,
              latestVersion: latestVersion,
              updateAvailable: true
            });
          }
        } catch (error) {
          console.warn(`Failed to check updates for ${mod.name}:`, error.message);
        }
      }

      return updates;
    } catch (error) {
      console.error('Failed to check for updates:', error);
      return [];
    }
  }

  async getProjectDependencies(projectId, gameVersion, loader) {
    try {
      const versions = await this.getProjectVersions(projectId, [gameVersion], [loader]);
      const latestVersion = versions.find(v => v.versionType === 'release') || versions[0];

      if (!latestVersion || !latestVersion.dependencies) {
        return [];
      }

      const dependencies = [];

      for (const dep of latestVersion.dependencies) {
        if (dep.dependency_type === 'required') {
          try {
            const depProject = await this.getProject(dep.project_id);
            dependencies.push({
              projectId: dep.project_id,
              versionId: dep.version_id,
              project: depProject,
              dependencyType: dep.dependency_type
            });
          } catch (error) {
            console.warn(`Failed to get dependency ${dep.project_id}:`, error.message);
          }
        }
      }

      return dependencies;
    } catch (error) {
      console.error('Failed to get project dependencies:', error);
      return [];
    }
  }

  async resolveAndDownloadDependencies(projectId, gameVersion, loader, targetPath, onProgress = null) {
    try {
      const dependencies = await this.getProjectDependencies(projectId, gameVersion, loader);
      const downloadResults = [];

      for (let i = 0; i < dependencies.length; i++) {
        const dep = dependencies[i];

        if (onProgress) {
          onProgress({
            current: i + 1,
            total: dependencies.length,
            dependency: dep.project.title
          });
        }

        try {
          const versions = await this.getProjectVersions(
            dep.projectId,
            [gameVersion],
            [loader]
          );

          const versionToDownload = versions.find(v => v.versionType === 'release') || versions[0];

          if (versionToDownload) {
            const result = await this.downloadFile(versionToDownload.id, targetPath);
            downloadResults.push({
              project: dep.project,
              result: result
            });
          }
        } catch (error) {
          console.warn(`Failed to download dependency ${dep.project.title}:`, error.message);
          downloadResults.push({
            project: dep.project,
            result: { success: false, error: error.message }
          });
        }
      }

      return downloadResults;
    } catch (error) {
      console.error('Failed to resolve dependencies:', error);
      return [];
    }
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  formatDownloadCount(count) {
    if (count < 1000) return count.toString();
    if (count < 1000000) return (count / 1000).toFixed(1) + 'K';
    return (count / 1000000).toFixed(1) + 'M';
  }
}

module.exports = ModrinthAPI;
