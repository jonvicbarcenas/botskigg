# 🚀 Quick Start Guide

Get your Mineflayer bot up and running in 5 minutes!

## Step 1: Install Dependencies

```bash
npm install
```

This will install:
- `mineflayer` - The Minecraft bot framework
- `mineflayer-pathfinder` - Navigation and pathfinding
- `prismarine-viewer` - 3D visualization (optional)
- `mineflayer-web-inventory` - Web-based inventory viewer (optional)
- `dotenv` - Environment variable management

## Step 2: Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your server details:

```env
MC_HOST=localhost          # Your Minecraft server IP
MC_PORT=25565             # Server port
MC_USERNAME=MyBot         # Bot's username
MC_VERSION=1.20.1         # Minecraft version
MC_AUTH=offline           # Use 'microsoft' for online mode
```

## Step 3: Configure Permissions

Edit `config/permissions.json` and add your Minecraft username to the owner list:

```json
{
  "roles": {
    "owner": {
      "users": ["YourMinecraftUsername"],
      "permissions": ["*"]
    }
  }
}
```

## Step 4: Start the Bot

```bash
npm start
```

You should see:
```
============================================================
Mineflayer Advanced MVP Bot
============================================================
[INFO] Loading configuration...
[INFO] Server: localhost:25565
[SUCCESS] Bot logged in as MyBot
[SUCCESS] Bot spawned at 100.00, 64.00, 200.00
[SUCCESS] Navigation plugin loaded
[SUCCESS] Bot started successfully
```

## Step 5: Test Basic Commands

In your Minecraft server chat, try these commands:

### Navigation
- `!come` - Bot comes to you
- `!follow` - Bot follows you
- `!stop` - Stop current action
- `!goto spawn` - Go to spawn waypoint
- `!goto 100 64 200` - Go to coordinates

### Waypoints
- `!waypoint add home` - Save current location as "home"
- `!waypoint list` - List all waypoints
- `!goto home` - Go to saved waypoint

### Combat
- `!attack` - Enable auto-attack mode
- `!defend` - Disable auto-attack
- `!combat` - Check combat status

### Farming (Optional)
- `!farm start` - Start auto-farming
- `!farm stop` - Stop farming
- `!farm status` - Check farming stats

### Crafting (Optional)
- `!craft torch 64` - Craft 64 torches
- `!recipes torch` - Show recipes for item

### State Machine
- `!state` - Show current bot state
- `!states` - List all available states
- `!history` - Show recent state changes
- `!setstate <state>` - Force state change (debug)

### Status
- `!status` - Show bot status (coming soon)
- `!inv` - Show inventory (coming soon)

## 🎮 Testing the Bot

### Test Navigation:
1. Join your Minecraft server
2. Type `!come` in chat
3. Bot should pathfind to your location
4. Type `!follow` to make bot follow you
5. Type `!stop` when done

### Test State Machine:
1. Type `!state` to see current bot state (should be "idle")
2. Type `!follow` - bot enters "following" state
3. Type `!state` again - should show "following"
4. Type `!stop` - bot returns to "idle" state
5. Type `!history` to see state change history

### Test Waypoints:
1. Move to a location you want to save
2. Type `!waypoint add base`
3. Move away from that location
4. Type `!goto base`
5. Bot should navigate back to the saved location

## ⚙️ Configuration Tips

### Enable/Disable Features

Edit `config/settings.json`:

```json
{
  "features": {
    "pathfinder": true,      // Navigation system
    "webViewer": false,      // 3D viewer (resource intensive)
    "webInventory": false,   // Web inventory viewer
    "autoEat": true,         // Auto-eat when hungry
    "autoCombat": false,     // Auto-attack hostiles
    "autoFarm": false        // Auto-farming
  }
}
```

### Adjust Physics

Edit `config/physics.json` for pathfinding behavior:

```json
{
  "pathfinder": {
    "allowParkour": true,    // Allow jumping gaps
    "allowSprinting": true,  // Sprint while moving
    "canDig": false,         // Dig through blocks
    "canPlaceBlocks": false  // Place blocks to path
  }
}
```

### Set Chat Prefix

Change the command prefix in `config/settings.json`:

```json
{
  "behavior": {
    "chatCommandPrefix": "!"  // Change to "$", ".", etc.
  }
}
```

## 🐛 Troubleshooting

### Bot won't connect
- Check `MC_HOST` and `MC_PORT` are correct
- Verify Minecraft version matches server
- For online servers, set `MC_AUTH=microsoft` and provide `MC_PASSWORD`

### Bot doesn't respond to commands
- Verify your username is in `config/permissions.json`
- Check the command prefix matches (default is `!`)
- Look at console logs for errors

### Pathfinding not working
- Ensure `pathfinder` feature is enabled
- Check if bot has line of sight to destination
- Try adjusting physics settings in `config/physics.json`

### Plugins not loading
- Check console for error messages
- Verify all dependencies are installed (`npm install`)
- Some plugins require optional dependencies

## 📁 Directory Structure

```
mineflayer-advanced-mvp/
├── config/           # Configuration files (edit these)
├── data/            # Persistent data (waypoints, inventory logs)
├── logs/            # Runtime logs (latest.log, error.log)
└── src/
    ├── core/        # Core bot systems (don't modify)
    ├── utils/       # Helper utilities
    ├── interfaces/  # Base classes for plugins
    └── plugins/     # Feature plugins (customize here)
```

## 🔧 Development Mode

For auto-reload during development:

```bash
npm run dev
```

This uses Node's `--watch` flag to restart on file changes.

## 📚 Next Steps

- Read the full [README.md](README.md) for detailed documentation
- Explore plugin code in `src/plugins/` to customize behavior
- Add your own commands by extending `ICommand` class
- Create custom plugins by extending `IPlugin` class

## 🎯 Common Use Cases

### 1. AFK Bot
```javascript
// Set bot to follow you while you're AFK
!follow
```

### 2. Base Guardian
```javascript
// Save your base location
!waypoint add base

// Make bot patrol (coming soon with routes)
// For now, just have it stay at base
!goto base
```

### 3. Farming Assistant
```javascript
// Enable auto-farming
!farm start

// Bot will automatically harvest and replant crops
// Stop when done
!farm stop
```

### 4. Resource Gatherer
```javascript
// Navigate to resource area
!goto 1000 64 2000

// Enable combat protection
!attack

// Let bot defend itself while you gather resources
```

## ⚡ Performance Tips

1. **Reduce view distance** in `config/settings.json` for better performance
2. **Disable webViewer** unless you need 3D visualization
3. **Set appropriate log level** (`info` for normal use, `debug` for troubleshooting)
4. **Limit active plugins** - only enable features you need

## 🤝 Need Help?

- Check logs in `logs/latest.log` for errors
- Set `LOG_LEVEL=debug` in `.env` for detailed logs
- Review plugin source code in `src/plugins/`
- Open an issue on GitHub (if applicable)

---

**Happy botting! 🤖**
