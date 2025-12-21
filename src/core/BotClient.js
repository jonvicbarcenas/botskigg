import mineflayer from 'mineflayer';
import pvp from 'mineflayer-pvp';
import { plugin as movement } from 'mineflayer-movement';
import hawkeye from 'minecrafthawkeye';
import logger from '../utils/Logger.js';
import StateManager from './StateManager.js';
import EventManager from './EventManager.js';
import PluginLoader from './PluginLoader.js';

/**
 * BotClient - Main class that wraps the Mineflayer instance
 * Implements Singleton pattern to ensure only one bot instance exists
 */
class BotClient {
  static instance = null;

  constructor(config) {
    if (BotClient.instance) {
      return BotClient.instance;
    }

    this.config = config;
    this.bot = null;
    this.stateManager = new StateManager();
    this.eventManager = null;
    this.pluginLoader = null;
    this.isRunning = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;

    BotClient.instance = this;
  }

  /**
   * Get singleton instance
   */
  static getInstance(config = null) {
    if (!BotClient.instance && config) {
      return new BotClient(config);
    }
    return BotClient.instance;
  }

  /**
   * Initialize and start the bot
   */
  async start() {
    if (this.isRunning) {
      logger.warn('Bot is already running');
      return;
    }

    try {
      logger.info('Starting bot...');
      
      // Create bot instance
      this.createBot();
      
      // Initialize managers
      this.eventManager = new EventManager(this.bot, this.stateManager);
      this.eventManager.initialize();
      
      // Initialize plugin loader
      this.pluginLoader = new PluginLoader(this.bot);
      
      // Wait for spawn
      await this.waitForSpawn();
      
      // Load plugins
      if (this.config.features) {
        await this.loadPlugins();
      }
      
      this.isRunning = true;
      this.reconnectAttempts = 0;
      
      logger.success('Bot started successfully');
    } catch (error) {
      logger.error('Failed to start bot', error);
      throw error;
    }
  }

  /**
   * Create the Mineflayer bot instance
   */
  createBot() {
    const botOptions = {
      host: this.config.server.host,
      port: this.config.server.port,
      username: this.config.bot.username,
      version: this.config.server.version,
      auth: this.config.server.auth,
      hideErrors: this.config.bot.hideErrors || false,
      viewDistance: this.config.bot.viewDistance || 'tiny',
      chatLengthLimit: this.config.bot.chatLengthLimit || 100
    };

    if (this.config.bot.password) {
      botOptions.password = this.config.bot.password;
    }

    this.bot = mineflayer.createBot(botOptions);
    
    // Load third-party plugins
    this.bot.loadPlugin(pvp);
    this.bot.loadPlugin(movement);
    this.bot.loadPlugin(hawkeye);
    
    // Attach config to bot for plugin access
    this.bot.config = this.config;
    
    // Setup auto-reconnect
    this.setupAutoReconnect();
    
    logger.info(`Bot connecting to ${botOptions.host}:${botOptions.port}...`);
  }

  /**
   * Setup automatic reconnection on disconnect
   */
  setupAutoReconnect() {
    if (!this.config.behavior?.autoReconnect) return;

    this.bot.on('end', (reason) => {
      if (!this.isRunning) return;
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        logger.error('Max reconnect attempts reached. Stopping bot.');
        this.isRunning = false;
        return;
      }

      const delay = this.config.behavior.reconnectDelay || 5000;
      this.reconnectAttempts++;
      
      logger.warn(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      
      setTimeout(() => {
        this.reconnect();
      }, delay);
    });
  }

  /**
   * Reconnect the bot
   */
  async reconnect() {
    try {
      logger.info('Attempting to reconnect...');
      
      // Clean up old bot
      if (this.bot) {
        this.bot.removeAllListeners();
      }
      
      // Create new bot
      this.createBot();
      
      // Reinitialize managers
      this.eventManager = new EventManager(this.bot, this.stateManager);
      this.eventManager.initialize();
      
      this.pluginLoader = new PluginLoader(this.bot);
      
      // Wait for spawn
      await this.waitForSpawn();
      
      // Reload plugins
      await this.loadPlugins();
      
      logger.success('Reconnected successfully');
    } catch (error) {
      logger.error('Failed to reconnect', error);
    }
  }

  /**
   * Wait for bot to spawn
   */
  waitForSpawn() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Spawn timeout'));
      }, 60000);

      this.bot.once('spawn', () => {
        clearTimeout(timeout);
        
        logger.info(`Bot spawned in world! Detected version: ${this.bot.version}`);

        // Auto-respawn setup
        if (this.config.behavior?.autoRespawn) {
          this.bot.on('death', () => {
            logger.info('Auto-respawning...');
            setTimeout(() => this.bot.respawn(), 1000);
          });
        }
        
        resolve();
      });

      this.bot.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * Load plugins based on configuration
   */
  async loadPlugins() {
    const enabledFeatures = this.config.features;
    
    // Filter plugins based on enabled features
    const filter = (plugin) => {
      // Convert plugin name to camelCase (e.g., WebInventory -> webInventory)
      const featureName = plugin.name.charAt(0).toLowerCase() + plugin.name.slice(1);
      return enabledFeatures[featureName] !== false;
    };

    await this.pluginLoader.loadAll(filter);
  }

  /**
   * Stop the bot
   */
  async stop() {
    if (!this.isRunning) {
      logger.warn('Bot is not running');
      return;
    }

    try {
      logger.info('Stopping bot...');
      
      this.isRunning = false;
      
      // Unload all plugins
      if (this.pluginLoader) {
        await this.pluginLoader.unloadAll();
      }
      
      // Clean up event manager
      if (this.eventManager) {
        this.eventManager.cleanup();
      }
      
      // Disconnect bot
      if (this.bot) {
        this.bot.quit();
      }
      
      logger.success('Bot stopped successfully');
    } catch (error) {
      logger.error('Error stopping bot', error);
      throw error;
    }
  }

  /**
   * Get bot status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      username: this.bot?.username,
      health: this.bot?.health,
      food: this.bot?.food,
      position: this.bot?.entity?.position,
      gameMode: this.bot?.game?.gameMode,
      states: this.stateManager.getAllStates(),
      plugins: this.pluginLoader?.getStats(),
      events: this.eventManager?.getStats()
    };
  }

  /**
   * Get the bot instance
   */
  getBot() {
    return this.bot;
  }

  /**
   * Get state manager
   */
  getStateManager() {
    return this.stateManager;
  }

  /**
   * Get event manager
   */
  getEventManager() {
    return this.eventManager;
  }

  /**
   * Get plugin loader
   */
  getPluginLoader() {
    return this.pluginLoader;
  }
}

export default BotClient;
