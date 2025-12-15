# Mineflayer Advanced MVP Bot

A sophisticated Minecraft bot built with Mineflayer, featuring a modular plugin architecture for easy extensibility and maintenance.

## 🌟 Features

- **State Machine System**: Professional behavior management using mineflayer-statemachine
- **Modular Plugin System**: Easy to add/remove features without breaking core functionality
- **Advanced Navigation**: Pathfinding with mineflayer-pathfinder integration
- **Combat System**: Intelligent target selection and combat management
- **Economy Features**: Auto-farming and crafting automation
- **Dynamic State Tracking**: Automatic state transitions and priority-based behavior
- **Web Interface**: Real-time inventory viewing through web browser
- **Comprehensive Logging**: Detailed logs with timestamps and error tracking
- **Configuration-Driven**: External JSON configs for easy customization

## 📁 Project Structure

```
mineflayer-advanced-mvp/
├── config/          # External configuration files
├── data/            # Persistent storage (inventory, waypoints)
├── logs/            # Runtime logs
└── src/             # Source code
    ├── core/        # Core bot systems
    ├── utils/       # Shared utilities
    ├── interfaces/  # Base classes for OOP
    └── plugins/     # Modular features
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18.0.0 or higher
- A Minecraft server (Java Edition)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd mineflayer-advanced-mvp
```

2. Install dependencies:
```bash
npm install
```

3. Configure the bot:
```bash
cp .env.example .env
```

4. Edit `.env` with your server details:
```env
MC_HOST=your-server-ip
MC_PORT=25565
MC_USERNAME=YourBotName
MC_VERSION=1.20.1
```

5. Customize settings in `config/` folder as needed

### Running the Bot

```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## ⚙️ Configuration

### config/settings.json
General bot settings including server connection details, chat prefix, and behavior options.

### config/physics.json
Physics and movement parameters for fine-tuning bot movement.

### config/permissions.json
Define admin users who can control the bot via chat commands.

### config/statemachine.json
State machine configuration including state priorities, transition rules, and behavior settings.

## 🔌 Plugin System

The bot uses a modular plugin architecture. Each plugin extends the base `IPlugin` class and can be loaded dynamically.

### Available Plugins

- **State Machine**: Behavior state management with automatic transitions
- **Navigation**: Movement and pathfinding
- **Combat**: Automatic combat and target management
- **Economy**: Auto-farming (crops and sugarcane) and crafting
- **Web Inventory**: Real-time inventory viewing

### Creating a New Plugin

1. Create a new file in `src/plugins/your-feature/YourPlugin.js`
2. Extend the `IPlugin` base class
3. Implement required methods: `load()`, `unload()`
4. The plugin will be automatically loaded on startup

## 📝 Chat Commands

Control the bot through in-game chat (admin only):

### Navigation Commands
- `!come` - Bot comes to your location
- `!follow` - Bot follows you
- `!stop` - Stop current action
- `!goto <waypoint>` - Go to saved waypoint
- `!goto <x> <y> <z>` - Go to coordinates

### State Machine Commands
- `!state` - Show current bot state
- `!states` - List all available states
- `!history` - Show recent state changes
- `!setstate <state>` - Manually set bot state (debug)

### Combat Commands
- `!attack` - Enable auto-attack mode
- `!defend` - Disable auto-attack
- `!combat` - Show combat status

### Farming Commands
- `!farm start` - Start auto-farming (crops)
- `!farm stop` - Stop farming
- `!farm status` - Show farming statistics
- `!sugarcane start` - Start sugarcane farming
- `!sugarcane stop` - Stop sugarcane farming
- `!sugarcane status` - Show sugarcane harvest count
- `!sugarcane area` - Show sugarcane farm area coordinates

### Waypoint Commands
- `!waypoint add <name>` - Save current location
- `!waypoint list` - List all waypoints

### Crafting Commands
- `!craft <item> [amount]` - Craft items
- `!recipes <item>` - Show item recipes

### Status Commands
- `!inv` - Show inventory
- `!status` - Show bot status

## 🐛 Debugging

Logs are stored in the `logs/` directory:
- `latest.log` - Current session logs
- `error.log` - Error stack traces

Set `LOG_LEVEL=debug` in `.env` for verbose logging.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

MIT License - feel free to use this project for any purpose.

## 🆘 Support

For issues and questions, please open an issue on the repository.

## 🔧 Advanced Usage

### State Machine System

The bot uses **mineflayer-statemachine** for intelligent behavior management:

#### How It Works
- **Automatic Transitions**: Bot automatically switches between states based on conditions
- **Priority System**: Higher priority states can interrupt lower priority ones
- **State History**: Tracks all state changes for debugging
- **Behavior Isolation**: Each state has its own behavior and lifecycle

#### Available States
- **idle** - Waiting for commands (Priority: 0)
- **moving** - Moving to destination (Priority: 10)
- **following** - Following a player (Priority: 20)
- **patrolling** - Patrolling routes (Priority: 30)
- **crafting** - Crafting items (Priority: 40)
- **farming** - Farming crops (Priority: 50)
- **mining** - Mining resources (Priority: 50)
- **fighting** - In combat (Priority: 70)
- **eating** - Eating food (Priority: 80)
- **fleeing** - Fleeing danger (Priority: 90)

#### State Transitions
The bot automatically transitions between states. For example:
- When you use `!attack`, bot enters **fighting** state
- When enemy is defeated, bot returns to **idle** state
- **fighting** state (priority 70) can interrupt **farming** state (priority 50)
- **fleeing** state (priority 90) can interrupt anything except system states

#### Configuring States
Edit `config/statemachine.json` to customize:
```json
{
  "states": {
    "fighting": {
      "priority": 70,
      "interruptible": false
    }
  }
}
```

### Using the Web Viewer

Enable the web inventory viewer in `.env`:
```env
WEB_VIEWER_ENABLED=true
WEB_VIEWER_PORT=3000
```

Access it at `http://localhost:3000` while the bot is running.

### Custom Waypoints

Edit `data/waypoints.json` to define custom navigation points:
```json
{
  "home": { "x": 100, "y": 64, "z": 200 },
  "farm": { "x": 150, "y": 64, "z": 250 }
}
```

### Creating Custom Behaviors

You can create custom state machine behaviors in your plugins:

```javascript
import { BehaviorIdle, StateTransition } from 'mineflayer-statemachine';

// Create a custom behavior
const myBehavior = new BehaviorIdle();
myBehavior.stateName = 'myCustomState';
myBehavior.onStateEntered = () => {
  console.log('Entered my custom state!');
};

// Add to state machine
this.bot.stateMachine.addBehavior('myCustomState', myBehavior);

// Create transition
this.bot.stateMachine.createTransition({
  parent: 'idle',
  child: 'myCustomState',
  shouldTransition: () => {
    // Your condition here
    return false;
  }
});
```

## 📚 Documentation

For more detailed documentation on each system:
- Core Systems: See `src/core/README.md` (coming soon)
- Plugin Development: See `src/plugins/README.md` (coming soon)
- API Reference: See inline JSDoc comments in source files
