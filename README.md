# SN Server Manager

A modern Minecraft Server Manager built with Electron.js, featuring a sleek Modrinth-inspired dark theme and comprehensive LeafMC server support.

![SN Server Manager](https://img.shields.io/badge/version-1.0.0-green.svg)
![Electron](https://img.shields.io/badge/Electron-27.0.0-blue.svg)
![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

## ✨ Features

### 🖥️ Server Management
- **Create & Manage LeafMC Servers**: Easy server creation with automatic JAR downloading
- **Real-time Server Status**: Live monitoring of server state (Online/Offline/Starting/Error)
- **Resource Monitoring**: CPU, RAM, and player count tracking
- **Server Console**: Live log viewing and command execution
- **Automatic Startup Scripts**: Generated startup configurations for optimal performance

### 📁 Integrated File Manager
- **Two-pane Interface**: Intuitive file browser with tree view and detail list
- **File Operations**: Create, delete, rename, upload, and download files/folders
- **Text File Editing**: Built-in editor for configuration files
- **Real-time File Watching**: Automatic updates when files change

### 🧩 Plugin/Mod Manager (Modrinth Integration)
- **Browse Plugins**: Search and filter from Modrinth's extensive plugin library
- **One-click Installation**: Direct plugin installation to server directories
- **Dependency Resolution**: Automatic handling of plugin dependencies
- **Plugin Management**: Enable/disable/update installed plugins
- **Version Compatibility**: Automatic version matching for your server

### 🎨 Modern UI/UX
- **Modrinth-inspired Design**: Clean, dark theme with professional aesthetics
- **Responsive Layout**: Optimized for various screen sizes
- **Smooth Animations**: Polished transitions and interactions
- **Toast Notifications**: Non-intrusive status updates
- **Loading States**: Clear feedback during operations

### ⚙️ Advanced Settings
- **Theme Customization**: Multiple color schemes and accent colors
- **Performance Tuning**: Configurable RAM allocation and Java arguments
- **Auto-start Options**: Automatic server startup on app launch
- **Cache Management**: Built-in cache clearing and optimization

## 🚀 Quick Start

### Prerequisites
- **Node.js** 18 or higher
- **npm** or **yarn**
- **Java** 17 or higher (for running Minecraft servers)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/HasibulHasan404/sn-server-manager.git
   cd sn-server-manager
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the application**
   ```bash
   npm start
   ```

### Development

```bash
# Start in development mode with DevTools
npm run dev

# Build for production
npm run build

# Package for distribution
npm run dist
```

## 📖 Usage Guide

### Creating Your First Server

1. **Navigate to "Create Server"** in the sidebar
2. **Fill in server details**:
   - Server Name (e.g., "My Awesome Server")
   - Choose LeafMC Version from dropdown
   - Set RAM allocation (recommended: 2GB+)
   - Configure port (default: 25565)
3. **Accept the Minecraft EULA**
4. **Click "Create Server"**

The application will:
- Create a dedicated server directory
- Download the specified LeafMC JAR
- Generate startup scripts and configuration files
- Set up the basic server structure

### Managing Servers

#### Server Overview
- **Status Monitoring**: Real-time server state and resource usage
- **Quick Actions**: Start, stop, and restart servers with one click
- **Performance Metrics**: CPU, RAM, and player statistics

#### Console Management
- **Live Log Viewing**: Real-time server output with color coding
- **Command Execution**: Send commands directly to the server
- **Log History**: Searchable command and event history

#### File Management
- **Navigate Files**: Browse server directories with the file tree
- **Edit Configurations**: Modify server.properties, plugin configs, etc.
- **Upload Files**: Drag-and-drop or browse to upload files
- **Download Backups**: Create and download server backups

### Plugin Management

#### Browsing Plugins
1. **Search**: Use the search bar to find specific plugins
2. **Filter**: Apply category and version filters
3. **Browse**: Explore featured and popular plugins
4. **Install**: One-click installation with dependency resolution

#### Managing Installed Plugins
- **View Installed**: See all plugins in your server
- **Enable/Disable**: Toggle plugins without deletion
- **Update**: Check for and install plugin updates
- **Remove**: Safely uninstall plugins

## 🏗️ Architecture

### Frontend (Renderer Process)
- **HTML/CSS/JS**: Modern ES6+ JavaScript with responsive design
- **Modrinth Theme**: Custom CSS variables for consistent styling
- **Event-driven UI**: Real-time updates via IPC communication

### Backend (Main Process)
- **Server Manager**: Core server lifecycle management
- **LeafMC Service**: Version management and JAR downloading
- **Modrinth API**: Plugin search and installation
- **File Manager**: File system operations and monitoring

### Key Technologies
- **Electron.js**: Cross-platform desktop framework
- **Node.js**: Server-side runtime and backend logic
- **Axios**: HTTP client for API communications
- **Chokidar**: File system monitoring
- **Archiver**: File compression and extraction

## 🛠️ Configuration

### Java Arguments
Default optimized arguments for LeafMC:
```
-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200
```

### Server Properties
Key configuration options:
- **server-port**: Server port (default: 25565)
- **max-players**: Maximum player count
- **difficulty**: Game difficulty setting
- **gamemode**: Default game mode
- **online-mode**: Enable/disable authentication

### Application Settings
- **Theme**: Dark/Light/Auto
- **Accent Color**: Customizable color schemes
- **Auto-start**: Launch servers automatically
- **Notifications**: System notification preferences

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Commit changes**: `git commit -m 'Add amazing feature'`
4. **Push to branch**: `git push origin feature/amazing-feature`
5. **Open a Pull Request**

### Development Guidelines
- Follow existing code style and conventions
- Add JSDoc comments for new functions
- Test thoroughly on multiple platforms
- Update documentation as needed

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

### Common Issues

**Server won't start**
- Ensure Java 17+ is installed and in PATH
- Check that the server port isn't already in use
- Verify sufficient RAM allocation

**LeafMC download fails**
- Check internet connection
- Try a different LeafMC version
- Clear application cache in Settings

**Plugins not installing**
- Verify server compatibility
- Check Modrinth API status
- Ensure sufficient disk space

## 🔗 Links

- **LeafMC**: [https://www.leafmc.one/](https://www.leafmc.one/)
- **Modrinth**: [https://modrinth.com/](https://modrinth.com/)
- **Electron**: [https://www.electronjs.org/](https://www.electronjs.org/)


### Version History
- **v1.0.0**: Initial release with core functionality
  - LeafMC server management
  - Modrinth plugin integration
  - File management system
  - Modern dark theme UI

---

**Made with ❤️ for the Minecraft community**
