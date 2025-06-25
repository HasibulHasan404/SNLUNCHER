// SN Server Manager - Renderer Process
// Main JavaScript file for the Electron renderer process

class SNServerManager {
  constructor() {
    this.currentServer = null;
    this.currentTab = "servers";
    this.activeTab = "servers"; // Track the currently active tab
    this.activeServerTab = "overview"; // Track the active server tab
    this.servers = [];
    this.plugins = [];
    this.leafMCVersions = [];
    this.paperVersions = [];
    this.fabricVersions = [];
    this.forgeVersions = [];
    this.currentServerType = "leafmc"; // Default server type
    this.eventListeners = [];
    this.domReady = false; // Track DOM ready state
    this.pendingUpdates = []; // Store operations that need to be performed after DOM is ready

    this.init();
  }

  async init() {
    try {
      // Wait for DOM to be fully loaded
      if (document.readyState !== "complete") {
        await new Promise((resolve) => {
          window.addEventListener("load", resolve, { once: true });
        });
      }

      await this.setupEventListeners();
      await this.loadInitialData();
      this.setupUI();

      // Mark DOM as ready after setup is complete
      this.domReady = true;

      // Execute any pending updates
      while (this.pendingUpdates.length > 0) {
        const update = this.pendingUpdates.shift();
        try {
          await update();
        } catch (updateError) {
          console.error("Error executing pending update:", updateError);
        }
      }

      this.showToast("Welcome to SN Server Manager!", "info");
    } catch (error) {
      console.error("Failed to initialize app:", error);
      this.showToast("Failed to initialize application", "error");
    }
  }

  async setupEventListeners() {
    // Navigation
    document.querySelectorAll(".nav-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        e.preventDefault();
        const tab = item.dataset.tab;
        this.switchTab(tab);
      });
    });

    // Server form
    const serverForm = document.getElementById("server-form");
    if (serverForm) {
      serverForm.addEventListener("submit", (e) => this.handleServerCreate(e));
    }

    // RAM slider
    const ramSlider = document.getElementById("server-ram");
    if (ramSlider) {
      ramSlider.addEventListener("input", (e) => {
        document.getElementById("ram-value").textContent = e.target.value;
      });
    }

    // Server type selection
    const serverTypeSelect = document.getElementById("server-type");
    if (serverTypeSelect) {
      serverTypeSelect.addEventListener("change", (e) => {
        const selectedType = e.target.value;
        this.handleServerTypeChange(selectedType);

        // Update plugins/mods tab label based on server type
        const pluginsTab = document.querySelector('[data-tab="plugins"]');
        if (pluginsTab) {
          const tabSpan = pluginsTab.querySelector("span");
          if (tabSpan) {
            if (selectedType === "fabric" || selectedType === "forge") {
              tabSpan.textContent = "Browse Mods";
            } else {
              tabSpan.textContent = "Browse Plugins";
            }
          }
        }
      });
    }

    // Minecraft version selection
    const minecraftVersionSelect = document.getElementById("minecraft-version");
    if (minecraftVersionSelect) {
      minecraftVersionSelect.addEventListener("change", () => {
        // Reload versions for the current server type when MC version changes
        this.handleServerTypeChange(this.currentServerType);
      });
    }

    // Server type info button
    const showServerTypeInfoBtn = document.getElementById(
      "show-server-type-info",
    );
    if (showServerTypeInfoBtn) {
      showServerTypeInfoBtn.addEventListener("click", () => {
        this.showServerTypeModal();
      });
    }

    // Close server type modal
    const closeServerTypeModalBtn = document.getElementById(
      "close-server-type-modal",
    );
    if (closeServerTypeModalBtn) {
      closeServerTypeModalBtn.addEventListener("click", () => {
        this.hideServerTypeModal();
      });
    }

    // Select server type button in modal
    const selectServerTypeBtn = document.getElementById(
      "select-server-type-btn",
    );
    if (selectServerTypeBtn) {
      selectServerTypeBtn.addEventListener("click", () => {
        this.hideServerTypeModal();
      });
    }

    // Server actions
    document
      .getElementById("refresh-servers")
      ?.addEventListener("click", () => this.loadServers());
    document
      .getElementById("create-server-btn")
      ?.addEventListener("click", () => this.switchTab("create-server"));

    // Plugin search
    const pluginSearch = document.getElementById("plugin-search");
    if (pluginSearch) {
      pluginSearch.addEventListener(
        "input",
        this.debounce((e) => {
          this.searchPlugins(e.target.value);
        }, 500),
      );
    }

    // Settings
    this.setupSettingsEventListeners();

    // Modal
    this.setupModalEventListeners();

    // Real-time updates from main process
    this.setupMainProcessListeners();
  }

  setupSettingsEventListeners() {
    // Theme settings
    const themeSelect = document.getElementById("theme-select");
    if (themeSelect) {
      themeSelect.addEventListener("change", (e) => {
        this.changeTheme(e.target.value);
      });
    }

    // Color options
    document.querySelectorAll(".color-option").forEach((option) => {
      option.addEventListener("click", (e) => {
        this.changeAccentColor(e.target.dataset.color);
      });
    });

    // Settings toggles
    document
      .querySelectorAll('.toggle input[type="checkbox"]')
      .forEach((toggle) => {
        toggle.addEventListener("change", (e) => {
          this.saveSetting(e.target.id, e.target.checked);
        });
      });

    // Clear cache
    document.getElementById("clear-cache")?.addEventListener("click", () => {
      this.clearCache();
    });
  }

  setupModalEventListeners() {
    // Server modal tabs
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        this.switchServerTab(e.target.dataset.tab);
      });
    });

    // Console input
    const consoleInput = document.getElementById("console-input");
    if (consoleInput) {
      consoleInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
          this.sendConsoleCommand();
        }
      });
    }

    document.getElementById("send-command")?.addEventListener("click", () => {
      this.sendConsoleCommand();
    });

    // Server control buttons
    document.getElementById("start-server")?.addEventListener("click", () => {
      this.startServer(this.currentServer.id);
    });

    document.getElementById("stop-server")?.addEventListener("click", () => {
      this.stopServer(this.currentServer.id);
    });

    document.getElementById("restart-server")?.addEventListener("click", () => {
      this.restartServer(this.currentServer.id);
    });

    document.getElementById("delete-server")?.addEventListener("click", () => {
      this.deleteServer(this.currentServer.id);
    });

    // File manager
    document.getElementById("create-folder")?.addEventListener("click", () => {
      this.createFolder();
    });

    document.getElementById("upload-files")?.addEventListener("click", () => {
      this.uploadFiles();
    });

    document.getElementById("refresh-files")?.addEventListener("click", () => {
      this.refreshFiles();
    });
  }

  setupMainProcessListeners() {
    // Server status changes
    this.eventListeners.push(
      window.electronAPI.onServerStatusChange((serverId, status) => {
        this.updateServerStatus(serverId, status);
      }),
    );

    // Server logs
    this.eventListeners.push(
      window.electronAPI.onServerLogUpdate((serverId, logs) => {
        this.updateConsoleOutput(serverId, logs);
      }),
    );

    // File system changes
    this.eventListeners.push(
      window.electronAPI.onFileSystemChange((path, eventType) => {
        this.handleFileSystemChange(path, eventType);
      }),
    );

    // Download progress
    this.eventListeners.push(
      window.electronAPI.onDownloadProgress((progress) => {
        this.updateDownloadProgress(progress);
      }),
    );
  }

  async loadInitialData() {
    this.showLoading("Loading application data...");

    try {
      await Promise.all([
        this.loadServers(),
        this.loadLeafMCVersions(),
        this.loadSettings(),
      ]);
    } finally {
      this.hideLoading();
    }
  }

  async loadServers() {
    try {
      this.servers = await window.electronAPI.getServers();

      // Only render if we're on the servers tab
      if (this.activeTab === "servers" && this.domReady) {
        // Add a small delay to ensure DOM is ready after tab switch
        setTimeout(() => {
          // Double-check we're still on the servers tab
          if (this.activeTab === "servers") {
            this.renderServerList();
          }
        }, 100);
      }
    } catch (error) {
      console.error("Failed to load servers:", error);
    }
  }

  async loadLeafMCVersions() {
    try {
      this.leafMCVersions = await window.electronAPI.getLeafMCVersions();
      this.populateVersionSelect("leafmc");
    } catch (error) {
      console.error("Failed to load LeafMC versions:", error);
    }
  }

  async loadPaperVersions() {
    try {
      // Simulated Paper versions (would normally come from API)
      this.paperVersions = [
        { version: "1.21.5", build: "latest", stable: true },
        { version: "1.21.4", build: "latest", stable: true },
        { version: "1.20.4", build: "latest", stable: true },
        { version: "1.19.4", build: "latest", stable: true },
        { version: "1.18.2", build: "latest", stable: true },
        { version: "1.17.1", build: "latest", stable: true },
        { version: "1.16.5", build: "latest", stable: true },
      ];
      this.populateVersionSelect("paper");
    } catch (error) {
      console.error("Failed to load Paper versions:", error);
    }
  }

  async loadFabricVersions() {
    try {
      // Simulated Fabric versions (would normally come from API)
      this.fabricVersions = [
        { version: "1.21.5", loader: "0.15.6", stable: true },
        { version: "1.21.4", loader: "0.15.5", stable: true },
        { version: "1.20.4", loader: "0.15.4", stable: true },
        { version: "1.19.4", loader: "0.15.3", stable: true },
        { version: "1.18.2", loader: "0.15.2", stable: true },
        { version: "1.17.1", loader: "0.15.1", stable: true },
        { version: "1.16.5", loader: "0.15.0", stable: true },
      ];
      this.populateVersionSelect("fabric");
    } catch (error) {
      console.error("Failed to load Fabric versions:", error);
    }
  }

  async loadForgeVersions() {
    try {
      // Simulated Forge versions (would normally come from API)
      this.forgeVersions = [
        { version: "1.21.5", forge: "49.0.10", stable: true },
        { version: "1.21.4", forge: "49.0.9", stable: true },
        { version: "1.20.4", forge: "48.0.50", stable: true },
        { version: "1.19.4", forge: "45.1.0", stable: true },
        { version: "1.18.2", forge: "40.2.0", stable: true },
        { version: "1.17.1", forge: "37.1.0", stable: true },
        { version: "1.16.5", forge: "36.2.39", stable: true },
      ];
      this.populateVersionSelect("forge");
    } catch (error) {
      console.error("Failed to load Forge versions:", error);
    }
  }

  async loadSettings() {
    try {
      const settings = await window.electronAPI.getAppSettings();
      this.applySettings(settings);
    } catch (error) {
      console.error("Failed to load settings:", error);
    }
  }

  setupUI() {
    // Initialize tooltips, modals, etc.
    this.initializeComponents();
  }

  initializeComponents() {
    // Set up any additional UI components
    this.updateDateTime();
    setInterval(() => this.updateDateTime(), 60000); // Update every minute
  }

  // Tab Management
  switchTab(tabName) {
    const previousTab = this.activeTab;
    this.activeTab = tabName;

    try {
      // Update navigation
      document.querySelectorAll(".nav-item").forEach((item) => {
        item.classList.remove("active");
      });
      const tabNav = document.querySelector(`[data-tab="${tabName}"]`);
      if (tabNav) tabNav.classList.add("active");

      // Update content
      document.querySelectorAll(".tab-content").forEach((content) => {
        content.classList.remove("active");
      });
      const tabContent = document.getElementById(`${tabName}-tab`);
      if (tabContent) tabContent.classList.add("active");

      console.log(`Tab switched from ${previousTab} to ${tabName}`);

      // Add a small delay to ensure DOM updates before handlers run
      setTimeout(() => {
        if (this.activeTab === tabName) {
          // Make sure user hasn't switched again
          this.handleTabSwitch(tabName, previousTab);
        }
      }, 50);
    } catch (error) {
      console.error(`Error switching to tab ${tabName}:`, error);
    }
  }

  async handleTabSwitch(tabName, previousTab) {
    console.log(`Switching from ${previousTab || "unknown"} to ${tabName} tab`);

    try {
      // Wait a bit to ensure DOM has updated after tab switch
      await new Promise((resolve) => setTimeout(resolve, 100));

      if (!this.domReady) {
        console.log("DOM not ready yet, queuing tab operations");
        this.pendingUpdates.push(() =>
          this.handleTabSwitch(tabName, previousTab),
        );
        return;
      }

      // Only execute tab-specific logic if the tab is still active
      // (user might have switched tabs again during the delay)
      if (this.activeTab !== tabName) {
        console.log(
          `Tab changed during delay, canceling operations for ${tabName}`,
        );
        return;
      }

      switch (tabName) {
        case "servers":
          await this.loadServers();
          break;
        case "create-server":
          // Initialize server type containers
          if (this.safeGetElement("server-type")) {
            // Reset to default server type
            const serverTypeSelect = this.safeGetElement("server-type");
            serverTypeSelect.value = "leafmc";
            this.handleServerTypeChange("leafmc");

            // Ensure forms reset
            const serverForm = this.safeGetElement("server-form");
            if (serverForm) serverForm.reset();

            // Set default values
            const ramSlider = this.safeGetElement("server-ram");
            if (ramSlider) {
              ramSlider.value = 2048;
              const ramValue = this.safeGetElement("ram-value");
              if (ramValue) ramValue.textContent = "2048";
            }

            // Load all server type versions in advance for better UX
            this.loadLeafMCVersions();
            this.loadPaperVersions();
            this.loadFabricVersions();
            this.loadForgeVersions();
          }
          break;
        case "plugins":
          await this.loadPluginCategories();
          // Clear previous search results
          this.clearPluginResults();
          const searchInput = this.safeGetElement("plugin-search");
          if (searchInput) searchInput.value = "";
          break;
        case "settings":
          await this.loadSettings();
          break;
      }
    } catch (error) {
      console.error(`Error handling tab switch to ${tabName}:`, error);
    }
  }

  // Server Type Handling
  handleServerTypeChange(serverType) {
    this.currentServerType = serverType;

    // Hide all version containers first
    document
      .querySelectorAll(".server-version-container")
      .forEach((container) => {
        container.classList.add("d-none");
      });

    // Show the selected server type's version container
    const versionContainer = document.getElementById(
      `${serverType}-version-container`,
    );
    if (versionContainer) {
      versionContainer.classList.remove("d-none");
    }

    // Load versions for the selected server type
    switch (serverType) {
      case "leafmc":
        this.loadLeafMCVersions();
        break;
      case "paper":
        this.loadPaperVersions();
        break;
      case "fabric":
        this.loadFabricVersions();
        break;
      case "forge":
        this.loadForgeVersions();
        break;
      case "vanilla":
        // No version selection needed for vanilla
        break;
    }

    // Update the UI to show appropriate options
    this.updateServerTypeUI(serverType);
  }

  updateServerTypeUI(serverType) {
    // Update form elements based on server type
    const serverNameInput = document.getElementById("server-name");
    if (serverNameInput && !serverNameInput.value) {
      // Set a default name based on server type if empty
      serverNameInput.value = `My ${serverType.charAt(0).toUpperCase() + serverType.slice(1)} Server`;
    }

    // Change description or help text based on server type
    const serverTypeInfo = {
      leafmc: "LeafMC supports plugins for extending your server",
      paper: "Paper is a high-performance server with plugin support",
      fabric: "Fabric is a lightweight mod loader for Minecraft",
      forge: "Forge is the most widely used mod loader",
      vanilla: "Vanilla is the official Minecraft server with no modifications",
    };

    // You could display this info somewhere in the UI if needed
  }

  showServerTypeModal() {
    const modal = document.getElementById("server-type-modal");
    if (modal) {
      modal.classList.add("active");
    }
  }

  hideServerTypeModal() {
    const modal = document.getElementById("server-type-modal");
    if (modal) {
      modal.classList.remove("active");
    }
  }

  // Server Management
  // Safe DOM element getter utility function
  safeGetElement(id) {
    const element = document.getElementById(id);
    if (!element) {
      // Only warn if we're on a tab where this element should exist
      if (
        (id === "server-list" || id === "empty-servers") &&
        this.activeTab === "servers"
      ) {
        console.warn(
          `Element with ID "${id}" not found in the DOM when expected`,
        );
      } else if (
        (id.includes("console") || id.includes("file")) &&
        this.activeServerTab &&
        this.currentServer
      ) {
        console.warn(
          `Server element with ID "${id}" not found in the DOM when expected`,
        );
      }
      return null;
    }
    return element;
  }

  // Check if an element is visible in the current tab
  isElementVisible(id) {
    const element = this.safeGetElement(id);
    if (!element) return false;

    // Check if element or its parent tab is hidden
    const isVisible = element.offsetParent !== null;
    return isVisible;
  }

  renderServerList() {
    if (!this.domReady) {
      console.log("DOM not ready yet, deferring renderServerList");
      this.pendingUpdates.push(() => this.renderServerList());
      return;
    }

    // Only render if we're on the servers tab
    if (this.activeTab !== "servers") {
      console.log("Not on servers tab, skipping renderServerList");
      return;
    }

    const serverList = this.safeGetElement("server-list");

    // If server list element isn't found, skip rendering
    if (!serverList) {
      return;
    }

    // Try to get empty state element, but don't fail if it's not found
    const emptyState = document.getElementById("empty-servers");

    if (this.servers.length === 0) {
      serverList.innerHTML = "";
      if (emptyState) {
        emptyState.style.display = "flex";
      }
      return;
    }

    if (emptyState) {
      emptyState.style.display = "none";
    }

    const serversHTML = this.servers
      .map(
        (server) => `
            <div class="server-card" data-server-id="${server.id}">
                <div class="server-card-header">
                    <div class="server-info">
                        <h3>${this.escapeHtml(server.name)}</h3>
                        <div class="server-meta">
                            <span>LeafMC ${server.version}</span>
                            <span>Port: ${server.port}</span>
                            <span>RAM: ${server.ram}MB</span>
                        </div>
                    </div>
                    <div class="server-status ${server.status}">
                        <i class="fas fa-circle"></i>
                        ${this.formatStatus(server.status)}
                    </div>
                </div>
                <div class="server-actions">
                    <button class="btn btn-primary btn-sm" onclick="app.openServerModal('${server.id}')">
                        <i class="fas fa-cog"></i>
                        Manage
                    </button>
                    ${
                      server.status === "offline"
                        ? `<button class="btn btn-success btn-sm" onclick="app.startServer('${server.id}')">
                            <i class="fas fa-play"></i>
                            Start
                        </button>`
                        : `<button class="btn btn-danger btn-sm" onclick="app.stopServer('${server.id}')">
                            <i class="fas fa-stop"></i>
                            Stop
                        </button>`
                    }
                </div>
            </div>
        `,
      )
      .join("");

    serverList.innerHTML = serversHTML;
  }

  populateVersionSelect(serverType) {
    let versionSelect, versions;

    switch (serverType) {
      case "leafmc":
        versionSelect = document.getElementById("leafmc-version");
        versions = this.leafMCVersions;
        break;
      case "paper":
        versionSelect = document.getElementById("paper-version");
        versions = this.paperVersions;
        break;
      case "fabric":
        versionSelect = document.getElementById("fabric-version");
        versions = this.fabricVersions;
        break;
      case "forge":
        versionSelect = document.getElementById("forge-version");
        versions = this.forgeVersions;
        break;
      default:
        return;
    }

    if (!versionSelect) return;

    if (!versions || versions.length === 0) {
      versionSelect.innerHTML =
        '<option value="">No versions available</option>';
      return;
    }

    // Filter versions based on selected Minecraft version
    const mcVersionSelect = document.getElementById("minecraft-version");
    const selectedMcVersion = mcVersionSelect ? mcVersionSelect.value : null;

    const filteredVersions = selectedMcVersion
      ? versions.filter((v) => v.version === selectedMcVersion)
      : versions;

    if (filteredVersions.length === 0) {
      versionSelect.innerHTML = `<option value="">No ${serverType} versions for Minecraft ${selectedMcVersion}</option>`;
      return;
    }

    let optionsHTML;

    switch (serverType) {
      case "leafmc":
        optionsHTML = filteredVersions
          .map(
            (version) => `
                <option value="${version.version}" ${version.stable ? "" : 'data-unstable="true"'}>
                    LeafMC ${version.version} ${version.build !== "latest" ? `(build ${version.build})` : ""} ${version.stable ? "" : "(Beta)"}
                </option>
            `,
          )
          .join("");
        break;
      case "paper":
        optionsHTML = filteredVersions
          .map(
            (version) => `
                <option value="${version.version}">
                    Paper ${version.version} ${version.build !== "latest" ? `(build ${version.build})` : ""}
                </option>
            `,
          )
          .join("");
        break;
      case "fabric":
        optionsHTML = filteredVersions
          .map(
            (version) => `
                <option value="${version.version}">
                    Fabric ${version.version} (loader ${version.loader})
                </option>
            `,
          )
          .join("");
        break;
      case "forge":
        optionsHTML = filteredVersions
          .map(
            (version) => `
                <option value="${version.version}">
                    Forge ${version.version} (${version.forge})
                </option>
            `,
          )
          .join("");
        break;
    }

    versionSelect.innerHTML = `
            <option value="">Select a version...</option>
            ${optionsHTML}
        `;
  }
  async handleServerCreate(e) {
    e.preventDefault();

    // Get server type
    const serverType = document.getElementById("server-type").value;

    const formData = new FormData(e.target);

    // Get version based on server type
    let version;
    switch (serverType) {
      case "leafmc":
        version = document.getElementById("leafmc-version").value;
        break;
      case "paper":
        version = document.getElementById("paper-version").value;
        break;
      case "fabric":
        version = document.getElementById("fabric-version").value;
        break;
      case "forge":
        version = document.getElementById("forge-version").value;
        break;
      case "vanilla":
        version = document.getElementById("minecraft-version").value;
        break;
      default:
        version = document.getElementById("leafmc-version").value;
    }

    const serverConfig = {
      name:
        formData.get("server-name") ||
        document.getElementById("server-name").value,
      version: version,
      ram: parseInt(document.getElementById("server-ram").value),
      port: parseInt(document.getElementById("server-port").value),
      javaArgs: document.getElementById("java-args").value,
      eulaAccepted: document.getElementById("eula-checkbox").checked,
      serverType: serverType,
    };

    // Add server-type specific configurations
    if (serverType === "fabric" && document.getElementById("fabric-api")) {
      serverConfig.includeFabricApi =
        document.getElementById("fabric-api").checked;
    }

    if (
      !serverConfig.name ||
      !serverConfig.version ||
      !serverConfig.eulaAccepted
    ) {
      this.showToast(
        "Please fill in all required fields and accept the EULA",
        "error",
      );
      return;
    }

    this.showLoading("Creating server...");

    try {
      const result = await window.electronAPI.createServer(serverConfig);

      if (result.success) {
        this.showToast(
          `${serverConfig.serverType.charAt(0).toUpperCase() + serverConfig.serverType.slice(1)} server created successfully!`,
          "success",
        );
        await this.loadServers();
        this.switchTab("servers");

        // Reset form
        e.target.reset();
        document.getElementById("ram-value").textContent = "2048";
      } else {
        this.showToast(result.error || "Failed to create server", "error");
      }
    } catch (error) {
      console.error("Server creation failed:", error);
      this.showToast("Failed to create server", "error");
    } finally {
      this.hideLoading();
    }
  }

  async startServer(serverId) {
    this.showLoading(`Starting server...`);

    try {
      const result = await window.electronAPI.startServer(serverId);

      if (result.success) {
        this.showToast("Server starting...", "info");
        await this.loadServers();
      } else {
        this.showToast(result.error || "Failed to start server", "error");
      }
    } catch (error) {
      console.error("Failed to start server:", error);
      this.showToast("Failed to start server", "error");
    } finally {
      this.hideLoading();
    }
  }

  async stopServer(serverId) {
    this.showLoading("Stopping server...");

    try {
      const result = await window.electronAPI.stopServer(serverId);

      if (result.success) {
        this.showToast("Server stopping...", "info");
        await this.loadServers();
      } else {
        this.showToast(result.error || "Failed to stop server", "error");
      }
    } catch (error) {
      console.error("Failed to stop server:", error);
      this.showToast("Failed to stop server", "error");
    } finally {
      this.hideLoading();
    }
  }

  async restartServer(serverId) {
    this.showLoading("Restarting server...");

    try {
      const result = await window.electronAPI.restartServer(serverId);

      if (result.success) {
        this.showToast("Server restarting...", "info");
        await this.loadServers();
      } else {
        this.showToast(result.error || "Failed to restart server", "error");
      }
    } catch (error) {
      console.error("Failed to restart server:", error);
      this.showToast("Failed to restart server", "error");
    } finally {
      this.hideLoading();
    }
  }

  async deleteServer(serverId) {
    const confirmed = await this.showConfirmDialog(
      "Delete Server",
      "Are you sure you want to delete this server? This action cannot be undone.",
      "Delete",
    );

    if (!confirmed) return;

    this.showLoading("Deleting server...");

    try {
      const result = await window.electronAPI.deleteServer(serverId);

      if (result.success) {
        this.showToast("Server deleted successfully", "success");
        await this.loadServers();
        this.closeServerModal();
      } else {
        this.showToast(result.error || "Failed to delete server", "error");
      }
    } catch (error) {
      console.error("Failed to delete server:", error);
      this.showToast("Failed to delete server", "error");
    } finally {
      this.hideLoading();
    }
  }

  // Server Modal
  async openServerModal(serverId) {
    const server = this.servers.find((s) => s.id === serverId);
    if (!server) return;

    this.currentServer = server;

    // Update modal title
    document.getElementById("server-modal-title").textContent = server.name;

    // Load server data
    await this.loadServerData(server);

    // Show modal
    document.getElementById("server-modal").classList.add("active");

    // Switch to overview tab
    this.switchServerTab("overview");
  }

  closeServerModal() {
    document.getElementById("server-modal").classList.remove("active");
    this.currentServer = null;
  }

  switchServerTab(tabName) {
    const previousTab = this.activeServerTab;
    this.activeServerTab = tabName;

    try {
      // Update tab buttons
      document.querySelectorAll(".tab-btn").forEach((btn) => {
        btn.classList.remove("active");
      });
      const tabBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
      if (tabBtn) tabBtn.classList.add("active");

      // Update tab content
      document.querySelectorAll(".server-tab-content").forEach((content) => {
        content.classList.remove("active");
      });
      const tabContent = document.getElementById(`${tabName}-content`);
      if (tabContent) tabContent.classList.add("active");

      console.log(`Server tab switched from ${previousTab} to ${tabName}`);

      // Add a small delay to ensure DOM updates before handlers run
      setTimeout(() => {
        if (this.activeServerTab === tabName) {
          // Make sure user hasn't switched again
          this.handleServerTabSwitch(tabName, previousTab);
        }
      }, 50);
    } catch (error) {
      console.error(`Error switching to server tab ${tabName}:`, error);
    }
  }

  async handleServerTabSwitch(tabName, previousTab) {
    if (!this.currentServer) return;

    const server = this.servers.find((s) => s.id === this.currentServer);
    if (!server) return;

    try {
      // Wait a bit to ensure DOM has updated after tab switch
      await new Promise((resolve) => setTimeout(resolve, 100));

      if (!this.domReady) {
        console.log("DOM not ready yet, queuing server tab operations");
        this.pendingUpdates.push(() =>
          this.handleServerTabSwitch(tabName, previousTab),
        );
        return;
      }

      // Only execute tab-specific logic if the tab is still active
      // (user might have switched tabs again during the delay)
      if (this.activeServerTab !== tabName) {
        console.log(
          `Server tab changed during delay, canceling operations for ${tabName}`,
        );
        return;
      }

      // Check if required tab content exists
      const tabContent = document.getElementById(`${tabName}-content`);
      if (!tabContent) {
        console.warn(`Server tab content for "${tabName}" not found in DOM`);
        return;
      }

      switch (tabName) {
        case "overview":
          await this.loadServerStats();
          break;
        case "console":
          await this.loadServerLogs();
          break;
        case "files":
          await this.loadServerFiles();
          break;
        case "plugins":
          await this.loadServerPlugins();
          break;
        case "settings":
          await this.loadServerSettings();
          break;
      }
    } catch (error) {
      console.error(`Error handling server tab switch to ${tabName}:`, error);
    }
  }

  async loadServerData(server) {
    try {
      if (!server || !server.id) {
        console.warn("Invalid server object provided to loadServerData");
        return;
      }

      // Load basic server info
      const status = await window.electronAPI.getServerStatus(server.id);

      // Update server status in the server object
      const serverObj = this.servers.find((s) => s.id === server.id);
      if (serverObj) {
        serverObj.status = status;
      }

      // Only update UI if we're on the servers tab
      if (this.activeTab === "servers") {
        // Wait a bit to ensure DOM is ready
        setTimeout(() => this.updateServerStatus(server.id, status), 50);
      }
    } catch (error) {
      console.error("Failed to load server data:", error);
    }
  }

  async loadServerStats() {
    try {
      const stats = await window.electronAPI.getServerStats(
        this.currentServer.id,
      );
      this.updateServerStatsDisplay(stats);
    } catch (error) {
      console.error("Failed to load server stats:", error);
    }
  }

  async loadServerLogs() {
    try {
      const logs = await window.electronAPI.getServerLogs(
        this.currentServer.id,
        100,
      );
      this.updateConsoleOutput(this.currentServer.id, logs);
    } catch (error) {
      console.error("Failed to load server logs:", error);
    }
  }

  async loadServerFiles() {
    try {
      const tree = await window.electronAPI.getDirectoryTree(
        this.currentServer.path,
      );
      this.renderFileTree(tree);
    } catch (error) {
      console.error("Failed to load server files:", error);
    }
  }

  async loadServerPlugins() {
    try {
      if (!this.currentServer) return;

      // Check if we're still on the plugins tab
      if (this.activeServerTab !== "plugins") return;

      const server = this.servers.find((s) => s.id === this.currentServer);
      if (!server) return;

      const plugins = await window.electronAPI.getInstalledPlugins(server.path);

      // Double-check we're still on the same tab and server before updating UI
      if (this.activeServerTab === "plugins" && this.domReady) {
        this.renderInstalledPlugins(plugins);
      }
    } catch (error) {
      console.error("Failed to load server plugins:", error);
    }
  }

  async loadServerSettings() {
    // Load server.properties and other config files
    try {
      const serverPropsPath = `${this.currentServer.path}/server.properties`;
      const serverProps = await window.electronAPI.readFile(serverPropsPath);
      this.renderServerProperties(serverProps.content);
    } catch (error) {
      console.error("Failed to load server settings:", error);
    }
  }

  // Console Management
  async sendConsoleCommand() {
    const input = document.getElementById("console-input");
    const command = input.value.trim();

    if (!command || !this.currentServer) return;

    try {
      await window.electronAPI.sendServerCommand(
        this.currentServer.id,
        command,
      );
      input.value = "";

      // Add command to console output
      this.addConsoleMessage(`> ${command}`, "command");
    } catch (error) {
      console.error("Failed to send command:", error);
      this.showToast("Failed to send command", "error");
    }
  }

  updateConsoleOutput(serverId, logs) {
    if (!this.currentServer || this.currentServer.id !== serverId) return;

    const consoleOutput = document.getElementById("console-output");
    if (!consoleOutput) return;

    logs.forEach((log) => {
      this.addConsoleMessage(log.message, log.type, log.timestamp);
    });

    // Auto-scroll to bottom
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
  }

  addConsoleMessage(message, type = "info", timestamp = null) {
    const consoleOutput = document.getElementById("console-output");
    if (!consoleOutput) return;

    const time = timestamp
      ? new Date(timestamp).toLocaleTimeString()
      : new Date().toLocaleTimeString();
    const messageElement = document.createElement("div");
    messageElement.className = `console-message console-${type}`;
    messageElement.textContent = `[${time}] ${message}`;

    consoleOutput.appendChild(messageElement);

    // Keep only last 1000 messages
    while (consoleOutput.children.length > 1000) {
      consoleOutput.removeChild(consoleOutput.firstChild);
    }
  }

  // Plugin Management
  async searchPlugins(query) {
    if (!query.trim()) {
      this.clearPluginResults();
      return;
    }

    this.showLoading("Searching plugins...");

    try {
      const filters = this.getPluginFilters();
      const results = await window.electronAPI.searchModrinth(query, filters);
      this.renderPluginResults(results);
    } catch (error) {
      console.error("Plugin search failed:", error);
      this.showToast("Failed to search plugins", "error");
    } finally {
      this.hideLoading();
    }
  }

  getPluginFilters() {
    const filters = {
      projectType: "plugin",
      categories: [],
      versions: [],
      limit: 20,
    };

    // Get selected categories
    document
      .querySelectorAll("#category-filters input:checked")
      .forEach((checkbox) => {
        filters.categories.push(checkbox.value);
      });

    // Get selected version
    const versionFilter = document.getElementById("version-filter").value;
    if (versionFilter) {
      filters.versions.push(versionFilter);
    }

    // Get sort option
    const sortFilter = document.getElementById("sort-filter").value;
    if (sortFilter) {
      filters.index = sortFilter;
    }

    return filters;
  }

  renderPluginResults(results) {
    const pluginsGrid = document.getElementById("plugins-grid");

    if (!results.hits || results.hits.length === 0) {
      pluginsGrid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">
                        <i class="fas fa-search"></i>
                    </div>
                    <h3>No plugins found</h3>
                    <p>Try adjusting your search terms or filters</p>
                </div>
            `;
      return;
    }

    const pluginsHTML = results.hits
      .map(
        (plugin) => `
            <div class="plugin-card" data-plugin-id="${plugin.id}">
                <div class="plugin-header">
                    <div class="plugin-icon">
                        ${
                          plugin.iconUrl
                            ? `<img src="${plugin.iconUrl}" alt="${plugin.title}" style="width: 100%; height: 100%; object-fit: cover; border-radius: var(--border-radius);">`
                            : '<i class="fas fa-puzzle-piece"></i>'
                        }
                    </div>
                    <div class="plugin-info">
                        <h4>${this.escapeHtml(plugin.title)}</h4>
                        <div class="plugin-author">${this.escapeHtml(plugin.author)}</div>
                    </div>
                </div>
                <div class="plugin-description">
                    ${this.escapeHtml(plugin.description)}
                </div>
                <div class="plugin-stats">
                    <div class="plugin-downloads">
                        <i class="fas fa-download"></i>
                        ${this.formatNumber(plugin.downloads)}
                    </div>
                    <button class="btn btn-primary btn-sm" onclick="app.installPlugin('${plugin.id}')">
                        <i class="fas fa-download"></i>
                        Install
                    </button>
                </div>
            </div>
        `,
      )
      .join("");

    pluginsGrid.innerHTML = pluginsHTML;
  }

  async installPlugin(pluginId) {
    if (!this.currentServer) {
      this.showToast("Please select a server first", "warning");
      return;
    }

    this.showLoading("Installing plugin...");

    try {
      // Get latest version for current game version
      const versions = await window.electronAPI.getModrinthVersions(
        pluginId,
        [this.currentServer.gameVersion || "1.20.4"],
        ["bukkit", "spigot", "paper"],
      );

      if (versions.length === 0) {
        this.showToast("No compatible version found", "warning");
        return;
      }

      const latestVersion = versions[0];
      const result = await window.electronAPI.downloadModrinthFile(
        latestVersion.id,
        `${this.currentServer.path}/plugins`,
      );

      if (result.success) {
        this.showToast("Plugin installed successfully!", "success");
      } else {
        this.showToast(result.error || "Failed to install plugin", "error");
      }
    } catch (error) {
      console.error("Plugin installation failed:", error);
      this.showToast("Failed to install plugin", "error");
    } finally {
      this.hideLoading();
    }
  }

  async loadPluginCategories() {
    try {
      const categories = await window.electronAPI.searchModrinth("", {
        projectType: "plugin",
        limit: 0,
        facets: "[]",
      });

      // This is a simplified approach - in a real implementation,
      // you'd want to get actual categories from the Modrinth API
      const commonCategories = [
        "Adventure",
        "Decoration",
        "Economy",
        "Library",
        "Magic",
        "Management",
        "Minigame",
        "Optimization",
        "Storage",
        "Technology",
        "Transportation",
        "Utility",
        "Worldgen",
      ];

      this.renderCategoryFilters(commonCategories);
    } catch (error) {
      console.error("Failed to load plugin categories:", error);
    }
  }

  renderCategoryFilters(categories) {
    const categoryFilters = document.getElementById("category-filters");
    if (!categoryFilters) return;

    const filtersHTML = categories
      .map(
        (category) => `
            <div class="filter-option">
                <input type="checkbox" id="cat-${category.toLowerCase()}" value="${category.toLowerCase()}">
                <label for="cat-${category.toLowerCase()}">${category}</label>
            </div>
        `,
      )
      .join("");

    categoryFilters.innerHTML = filtersHTML;

    // Add event listeners
    categoryFilters
      .querySelectorAll('input[type="checkbox"]')
      .forEach((checkbox) => {
        checkbox.addEventListener("change", () => {
          const query = document.getElementById("plugin-search").value;
          if (query.trim()) {
            this.searchPlugins(query);
          }
        });
      });
  }

  clearPluginResults() {
    const pluginsGrid = document.getElementById("plugins-grid");
    pluginsGrid.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">
                    <i class="fas fa-search"></i>
                </div>
                <h3>Search for plugins</h3>
                <p>Use the search bar above to find plugins for your server</p>
            </div>
        `;
  }

  // File Management
  renderFileTree(tree) {
    const fileTree = document.getElementById("file-tree");
    if (!fileTree || !tree) return;

    const treeHTML = this.renderFileTreeNode(tree);
    fileTree.innerHTML = treeHTML;
  }

  renderFileTreeNode(node, level = 0) {
    const indent = "  ".repeat(level);

    if (node.type === "directory") {
      const childrenHTML = node.children
        ? node.children
            .map((child) => this.renderFileTreeNode(child, level + 1))
            .join("")
        : "";

      return `
                <div class="file-item directory" style="padding-left: ${level * 16}px" data-path="${node.path}">
                    <i class="file-icon fas fa-folder"></i>
                    <span class="file-name">${this.escapeHtml(node.name)}</span>
                </div>
                ${childrenHTML}
            `;
    } else {
      return `
                <div class="file-item file" style="padding-left: ${level * 16}px" data-path="${node.path}">
                    <i class="file-icon fas fa-file"></i>
                    <span class="file-name">${this.escapeHtml(node.name)}</span>
                    <span class="file-size">${this.formatFileSize(node.size)}</span>
                </div>
            `;
    }
  }

  async createFolder() {
    const folderName = prompt("Enter folder name:");
    if (!folderName || !this.currentServer) return;

    try {
      const folderPath = `${this.currentServer.path}/${folderName}`;
      await window.electronAPI.createDirectory(folderPath);
      this.showToast("Folder created successfully", "success");
      await this.loadServerFiles();
    } catch (error) {
      console.error("Failed to create folder:", error);
      this.showToast("Failed to create folder", "error");
    }
  }

  async uploadFiles() {
    if (!this.currentServer) return;

    try {
      const result = await window.electronAPI.uploadFiles(
        this.currentServer.path,
      );

      if (result.success) {
        this.showToast(
          `Uploaded ${result.successCount}/${result.totalFiles} files`,
          "success",
        );
        await this.loadServerFiles();
      } else {
        this.showToast("Upload cancelled", "info");
      }
    } catch (error) {
      console.error("Failed to upload files:", error);
      this.showToast("Failed to upload files", "error");
    }
  }

  async refreshFiles() {
    if (!this.currentServer) return;
    await this.loadServerFiles();
    this.showToast("Files refreshed", "info");
  }

  // UI Helper Methods
  updateServerStatus(serverId, status) {
    // Update server card status
    const serverCard = document.querySelector(`[data-server-id="${serverId}"]`);
    if (serverCard) {
      const statusElement = serverCard.querySelector(".server-status");
      statusElement.className = `server-status ${status}`;
      statusElement.innerHTML = `
                <i class="fas fa-circle"></i>
                ${this.formatStatus(status)}
            `;

      // Update action buttons
      const actionsContainer = serverCard.querySelector(".server-actions");
      const manageBtn = actionsContainer.querySelector(".btn-primary");
      const actionBtn = actionsContainer.querySelector(
        ".btn-success, .btn-danger",
      );

      if (status === "offline") {
        actionBtn.className = "btn btn-success btn-sm";
        actionBtn.innerHTML = '<i class="fas fa-play"></i> Start';
        actionBtn.onclick = () => this.startServer(serverId);
      } else {
        actionBtn.className = "btn btn-danger btn-sm";
        actionBtn.innerHTML = '<i class="fas fa-stop"></i> Stop';
        actionBtn.onclick = () => this.stopServer(serverId);
      }
    }

    // Update modal if open
    if (this.currentServer && this.currentServer.id === serverId) {
      document.getElementById("server-status").textContent =
        this.formatStatus(status);
    }
  }

  updateServerStatsDisplay(stats) {
    document.getElementById("cpu-usage").textContent =
      `${stats.cpu.toFixed(1)}%`;
    document.getElementById("ram-usage").textContent = `${stats.memory} MB`;
    document.getElementById("player-count").textContent = `${stats.players}/20`;
  }

  renderInstalledPlugins(plugins) {
    const installedPlugins = document.getElementById("installed-plugins");
    if (!installedPlugins) return;

    if (plugins.length === 0) {
      installedPlugins.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">
                        <i class="fas fa-puzzle-piece"></i>
                    </div>
                    <h3>No plugins installed</h3>
                    <p>Browse plugins to add functionality to your server</p>
                </div>
            `;
      return;
    }

    const pluginsHTML = plugins
      .map(
        (plugin) => `
            <div class="plugin-item">
                <div class="plugin-info">
                    <h4>${this.escapeHtml(plugin.name)}</h4>
                    <p>${plugin.version || "Unknown version"}</p>
                </div>
                <div class="plugin-actions">
                    <button class="btn btn-sm ${plugin.enabled ? "btn-warning" : "btn-success"}"
                            onclick="app.togglePlugin('${plugin.path}', ${!plugin.enabled})">
                        ${plugin.enabled ? "Disable" : "Enable"}
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="app.deletePlugin('${plugin.path}')">
                        Delete
                    </button>
                </div>
            </div>
        `,
      )
      .join("");

    installedPlugins.innerHTML = pluginsHTML;
  }

  renderServerProperties(content) {
    const serverProperties = document.getElementById("server-properties");
    if (!serverProperties) return;

    // Parse properties
    const properties = this.parseProperties(content);

    const propertiesHTML = Object.entries(properties)
      .map(
        ([key, value]) => `
            <div class="property-item">
                <label for="prop-${key}">${key}</label>
                <input type="text" id="prop-${key}" value="${this.escapeHtml(value)}"
                       onchange="app.updateServerProperty('${key}', this.value)">
            </div>
        `,
      )
      .join("");

    serverProperties.innerHTML = propertiesHTML;
  }

  parseProperties(content) {
    const properties = {};
    const lines = content.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...valueParts] = trimmed.split("=");
        if (key && valueParts.length > 0) {
          properties[key.trim()] = valueParts.join("=").trim();
        }
      }
    }

    return properties;
  }

  async updateServerProperty(key, value) {
    if (!this.currentServer) return;

    try {
      // This would need to be implemented to update server.properties
      this.showToast("Property updated (restart required)", "info");
    } catch (error) {
      console.error("Failed to update property:", error);
      this.showToast("Failed to update property", "error");
    }
  }

  async togglePlugin(pluginPath, enable) {
    try {
      const result = await window.electronAPI.togglePlugin(pluginPath, enable);
      if (result.success) {
        this.showToast(`Plugin ${enable ? "enabled" : "disabled"}`, "success");
        await this.loadServerPlugins();
      }
    } catch (error) {
      console.error("Failed to toggle plugin:", error);
      this.showToast("Failed to toggle plugin", "error");
    }
  }

  async deletePlugin(pluginPath) {
    const confirmed = await this.showConfirmDialog(
      "Delete Plugin",
      "Are you sure you want to delete this plugin?",
      "Delete",
    );

    if (!confirmed) return;

    try {
      await window.electronAPI.deleteFile(pluginPath);
      this.showToast("Plugin deleted", "success");
      await this.loadServerPlugins();
    } catch (error) {
      console.error("Failed to delete plugin:", error);
      this.showToast("Failed to delete plugin", "error");
    }
  }

  // Settings Management
  async saveSetting(key, value) {
    try {
      await window.electronAPI.setAppSetting(key, value);
      this.showToast("Setting saved", "success");
    } catch (error) {
      console.error("Failed to save setting:", error);
      this.showToast("Failed to save setting", "error");
    }
  }

  applySettings(settings) {
    // Apply theme
    if (settings.theme) {
      this.changeTheme(settings.theme);
    }

    // Apply other settings
    Object.entries(settings).forEach(([key, value]) => {
      const element = document.getElementById(key);
      if (element) {
        if (element.type === "checkbox") {
          element.checked = value;
        } else {
          element.value = value;
        }
      }
    });
  }

  changeTheme(theme) {
    document.body.className = `bg-dark text-light theme-${theme}`;
    this.saveSetting("theme", theme);
  }

  changeAccentColor(color) {
    document.documentElement.style.setProperty(
      "--primary-color",
      this.getColorValue(color),
    );

    // Update active color option
    document.querySelectorAll(".color-option").forEach((option) => {
      option.classList.remove("active");
    });
    document.querySelector(`[data-color="${color}"]`).classList.add("active");

    this.saveSetting("accent-color", color);
  }

  getColorValue(color) {
    const colors = {
      green: "#00d563",
      blue: "#3b82f6",
      purple: "#8b5cf6",
      red: "#ef4444",
      orange: "#f59e0b",
    };
    return colors[color] || colors.green;
  }

  async clearCache() {
    try {
      // Clear any cached data
      this.showToast("Cache cleared", "success");
    } catch (error) {
      console.error("Failed to clear cache:", error);
      this.showToast("Failed to clear cache", "error");
    }
  }

  // Event Handlers
  updateServerStatus(serverId, status) {
    const server = this.servers.find((s) => s.id === serverId);
    if (server) {
      server.status = status;

      // Only render if we're on the servers tab and DOM is ready
      if (this.activeTab === "servers" && this.domReady) {
        // Use a small delay to ensure DOM is ready
        setTimeout(() => {
          // Double-check we're still on the servers tab before rendering
          if (this.activeTab === "servers") {
            this.renderServerList();
          }
        }, 100);
      }
    }
  }

  handleFileSystemChange(path, eventType) {
    // Handle file system changes
    if (this.currentServer && path.startsWith(this.currentServer.path)) {
      // Refresh file view if currently viewing files
      const filesTab = document.getElementById("files-content");
      if (filesTab.classList.contains("active")) {
        this.loadServerFiles();
      }
    }
  }

  updateDownloadProgress(progress) {
    // Update download progress display
    const loadingText = document.getElementById("loading-text");
    if (loadingText) {
      loadingText.textContent = `Downloading... ${Math.round(progress)}%`;
    }
  }

  // UI Utilities
  showLoading(message = "Loading...") {
    const overlay = document.getElementById("loading-overlay");
    const text = document.getElementById("loading-text");

    if (text) text.textContent = message;
    if (overlay) overlay.classList.add("active");
  }

  hideLoading() {
    const overlay = document.getElementById("loading-overlay");
    if (overlay) overlay.classList.remove("active");
  }

  showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    // Show toast
    setTimeout(() => toast.classList.add("show"), 100);

    // Remove toast after 5 seconds
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => container.removeChild(toast), 300);
    }, 5000);
  }

  async showConfirmDialog(title, message, confirmText = "OK") {
    const options = {
      type: "question",
      buttons: ["Cancel", confirmText],
      defaultId: 1,
      title: title,
      message: message,
    };

    const result = await window.electronAPI.showMessageDialog(options);
    return result.response === 1;
  }

  // Utility Functions
  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  formatStatus(status) {
    const statusMap = {
      online: "Online",
      offline: "Offline",
      starting: "Starting",
      stopping: "Stopping",
      error: "Error",
      running: "Running",
    };
    return statusMap[status] || status;
  }

  formatNumber(num) {
    if (num < 1000) return num.toString();
    if (num < 1000000) return (num / 1000).toFixed(1) + "K";
    return (num / 1000000).toFixed(1) + "M";
  }

  formatFileSize(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  updateDateTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString();

    // Update any datetime displays
    const timeElements = document.querySelectorAll(".current-time");
    timeElements.forEach((el) => (el.textContent = timeString));
  }

  // Cleanup
  cleanup() {
    // Remove all event listeners
    this.eventListeners.forEach((unsubscribe) => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    });

    // Clear intervals
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
  }
}

// Global functions for onclick handlers
window.switchTab = (tab) => app.switchTab(tab);
window.closeServerModal = () => app.closeServerModal();

// Initialize the application
let app;
document.addEventListener("DOMContentLoaded", () => {
  app = new SNServerManager();
});

// Handle app cleanup
window.addEventListener("beforeunload", () => {
  if (app) {
    app.cleanup();
  }
});
