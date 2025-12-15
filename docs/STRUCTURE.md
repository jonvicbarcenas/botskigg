# 📁 Project Structure

## Complete Directory Tree

```
mineflayer-advanced-mvp/
│
├── 📄 .env.example                 # Environment variables template
├── 📄 .gitignore                   # Git ignore rules
├── 📄 package.json                 # NPM dependencies and scripts
├── 📄 README.md                    # Main documentation
├── 📄 QUICKSTART.md               # Quick start guide
├── 📄 PROJECT_STATUS.md           # Project completion status
├── 📄 STRUCTURE.md                # This file
├── 📄 AGENTS.md                    # (Your existing file)
│
├── 📂 config/                      # External Configuration
│   ├── settings.json              # General bot settings
│   ├── physics.json               # Movement & pathfinding config
│   └── permissions.json           # Role-based access control
│
├── 📂 data/                        # Persistent Storage
│   ├── inventory_log.json         # Inventory state tracking
│   └── waypoints.json             # Navigation waypoints database
│
├── 📂 logs/                        # Runtime Logs
│   ├── .gitkeep                   # Keeps directory in git
│   ├── latest.log                 # (Generated at runtime)
│   └── error.log                  # (Generated at runtime)
│
└── 📂 src/                         # Source Code
    │
    ├── 📄 index.js                 # 🚀 ENTRY POINT - Bootstraps the app
    │
    ├── 📂 core/                    # Core Bot Systems
    │   ├── BotClient.js           # Main bot wrapper (Singleton)
    │   ├── EventManager.js        # Central event routing hub
    │   ├── StateManager.js        # Dynamic state management
    │   └── PluginLoader.js        # Dynamic plugin loader
    │
    ├── 📂 utils/                   # Shared Utilities
    │   ├── Logger.js              # Custom logging system
    │   ├── Pathfinder.js          # Pathfinding wrapper
    │   └── ChatParser.js          # Chat parsing utilities
    │
    ├── 📂 interfaces/              # OOP Base Classes
    │   ├── IPlugin.js             # Base plugin interface
    │   └── ICommand.js            # Base command interface
    │
    └── 📂 plugins/                 # Modular Features
        │
        ├── 📂 core/                # Core Plugins
        │   └── StateMachine.js    # State machine wrapper
        │
        ├── 📂 navigation/          # Movement & Pathfinding
        │   ├── Navigation.js      # Navigation plugin
        │   └── routes.js          # Route management
        │
        ├── 📂 combat/              # Combat System
        │   ├── CombatManager.js   # Combat logic
        │   └── targets.js         # Target filtering
        │
        ├── 📂 economy/             # Economy Features
        │   ├── AutoFarm.js        # Automated farming
        │   └── Crafter.js         # Item crafting
        │
        └── 📂 external/            # Third-Party Integrations
            └── WebInventory.js    # Web inventory viewer
```

## 📊 File Count by Category

| Category | Files | Purpose |
|----------|-------|---------|
| **Configuration** | 4 | External settings (JSON) |
| **Core System** | 4 | Bot engine and orchestration |
| **Utilities** | 3 | Reusable helper functions |
| **Interfaces** | 2 | OOP base classes |
| **Plugins** | 8 | Modular features |
| **Data** | 2 | Persistent storage |
| **Documentation** | 5 | README, guides, status |
| **Entry Point** | 1 | Application bootstrap |
| **Total** | **27 files** | |

## 🎯 Module Responsibilities

### Core (`src/core/`)
- **BotClient.js** (200 lines)
  - Creates and manages Mineflayer bot instance
  - Implements Singleton pattern
  - Handles reconnection logic
  - Coordinates all subsystems

- **EventManager.js** (180 lines)
  - Routes Minecraft events to handlers
  - Provides event priority system
  - Tracks event statistics
  - Implements observer pattern

- **StateManager.js** (150 lines)
  - Manages dynamic bot state
  - Provides state change listeners
  - Supports namespaced states
  - Serialization/deserialization

- **PluginLoader.js** (180 lines)
  - Discovers plugins automatically
  - Loads/unloads plugins dynamically
  - Manages plugin lifecycle
  - Provides plugin hot-reload

### Utilities (`src/utils/`)
- **Logger.js** (130 lines)
  - Color-coded console output
  - File-based logging
  - Multiple log levels
  - Timestamp formatting

- **Pathfinder.js** (150 lines)
  - Wraps mineflayer-pathfinder
  - Simplifies navigation commands
  - Provides helper methods
  - Distance calculations

- **ChatParser.js** (160 lines)
  - Strips color codes
  - Parses JSON chat format
  - Command extraction
  - Coordinate parsing

### Interfaces (`src/interfaces/`)
- **IPlugin.js** (80 lines)
  - Base class for all plugins
  - Enforces load/unload methods
  - Event registration helpers
  - Status reporting

- **ICommand.js** (100 lines)
  - Base class for commands
  - Cooldown management
  - Permission checking
  - Argument validation

### Plugins (`src/plugins/`)

#### Core (`core/`)
- **StateMachine.js** (300 lines)
  - Wrapper for mineflayer-statemachine
  - Behavior registration
  - State transitions
  - History tracking

#### Navigation (`navigation/`)
- **Navigation.js** (200 lines)
  - Movement commands (come, follow, goto)
  - Waypoint management
  - Chat command handling
  - Position tracking

- **routes.js** (130 lines)
  - Patrol route system
  - Route management
  - Distance calculation
  - Loop/once modes

#### Combat (`combat/`)
- **CombatManager.js** (180 lines)
  - Auto-attack system
  - Target selection
  - Weapon management
  - Combat state tracking

- **targets.js** (160 lines)
  - Target filtering utilities
  - Hostile/passive detection
  - Threat level calculation
  - Friend/enemy lists

#### Economy (`economy/`)
- **AutoFarm.js** (200 lines)
  - Crop detection
  - Harvest automation
  - Replanting system
  - Farmland creation

- **Crafter.js** (180 lines)
  - Item crafting
  - Recipe lookup
  - Crafting table support
  - Auto-crafting lists

#### External (`external/`)
- **WebInventory.js** (80 lines)
  - Web inventory viewer
  - HTTP server wrapper
  - Inventory data export
  - Optional feature

## 🔄 Data Flow

```
┌─────────────────────────────────────────────────────────┐
│                    index.js (Entry)                     │
│  - Loads configuration                                  │
│  - Creates BotClient instance                           │
│  - Starts bot and plugins                               │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│                   BotClient (Core)                      │
│  - Manages Mineflayer bot                               │
│  - Initializes subsystems                               │
└──┬──────────────┬──────────────┬─────────────┬─────────┘
   │              │              │             │
   ▼              ▼              ▼             ▼
┌──────┐   ┌──────────┐   ┌────────┐   ┌────────────┐
│State │   │  Event   │   │Plugin  │   │  Utils     │
│Mgr   │   │ Manager  │   │Loader  │   │(Logger,    │
│      │   │          │   │        │   │Pathfinder) │
└──────┘   └────┬─────┘   └───┬────┘   └────────────┘
                │             │
                │             ▼
                │      ┌─────────────┐
                │      │  Plugins    │
                │      │ (Features)  │
                │      └─────────────┘
                │             │
                ▼             ▼
         ┌──────────────────────┐
         │   Minecraft Server   │
         └──────────────────────┘
```

## 🛠️ Adding New Features

### Add a New Plugin
1. Create file in `src/plugins/<category>/<PluginName>.js`
2. Extend `IPlugin` base class
3. Implement `load()` and `unload()` methods
4. Plugin auto-loads on next start

### Add a New Command
1. Add command handler in existing plugin
2. Parse command in plugin's `handleChat()` method
3. Implement command logic
4. Add to permissions if needed

### Add New Configuration
1. Add settings to `config/settings.json`
2. Access via `this.config` in plugins
3. Override with environment variables if needed

### Add New Utility
1. Create file in `src/utils/<UtilName>.js`
2. Export functions or class
3. Import where needed
4. Keep utilities stateless when possible

## 📦 Dependencies Overview

### Production Dependencies
```
mineflayer (4.20.1)
├── minecraft-protocol - Network communication
├── prismarine-* - Minecraft data structures
└── vec3 - 3D vector math

mineflayer-pathfinder (2.4.4)
├── prismarine-physics - Movement simulation
└── mineflayer-collectblock - Block collection

mineflayer-statemachine (1.1.0)
└── Behavior state machine system

prismarine-viewer (1.24.0)
└── three.js - 3D rendering (optional)

mineflayer-web-inventory (1.8.0)
└── express - Web server (optional)

dotenv (16.4.5)
└── Environment variable loading
```

### Development Tools
```
eslint - Code linting
```

## 🎨 Code Style

### Naming Conventions
- **Classes**: PascalCase (`BotClient`, `StateManager`)
- **Files**: PascalCase for classes, camelCase for utilities
- **Functions**: camelCase (`loadPlugin`, `handleChat`)
- **Constants**: UPPER_SNAKE_CASE (rare, mostly in configs)
- **Private methods**: Prefix with `_` (optional)

### Import Style
```javascript
// Core modules
import fs from 'fs';
import path from 'path';

// Third-party
import mineflayer from 'mineflayer';

// Local modules
import Logger from '../utils/Logger.js';
import IPlugin from '../interfaces/IPlugin.js';
```

### Comment Style
```javascript
/**
 * JSDoc style for classes and methods
 * @param {string} param - Description
 * @returns {boolean} Description
 */
function example(param) {
  // Inline comments for complex logic
  return true;
}
```

## 🚀 Execution Flow

1. **Startup** (`index.js`)
   - Load environment variables
   - Load JSON configurations
   - Merge configurations
   - Create BotClient

2. **Bot Initialization** (`BotClient.js`)
   - Create Mineflayer bot
   - Initialize StateManager
   - Initialize EventManager
   - Initialize PluginLoader

3. **Connection** (Mineflayer)
   - Connect to server
   - Wait for login
   - Wait for spawn

4. **Plugin Loading** (`PluginLoader.js`)
   - Discover plugins
   - Filter by configuration
   - Load each plugin
   - Register events

5. **Runtime** (Event-driven)
   - Listen for Minecraft events
   - Route through EventManager
   - Handle in plugins
   - Update states

6. **Shutdown** (Graceful)
   - Unload all plugins
   - Clean up event handlers
   - Disconnect bot
   - Exit process

---

**Ready to start! Run `npm install` followed by `npm start`** 🚀
