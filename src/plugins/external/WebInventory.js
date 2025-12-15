import IPlugin from '../../interfaces/IPlugin.js';
import logger from '../../utils/Logger.js';

/**
 * WebInventory Plugin - Wrapper for mineflayer-web-inventory
 * Provides a web interface to view bot's inventory
 */
class WebInventory extends IPlugin {
  constructor(bot, config = {}) {
    super('WebInventory', bot, config);
    this.webServer = null;
    this.port = config.port || 3001;
    this.isRunning = false;
  }

  async load() {
    try {
      // Only load if enabled in config
      if (!this.config.enabled) {
        logger.info('WebInventory is disabled in config');
        return;
      }

      // Try to load mineflayer-web-inventory
      try {
        const mineflayerWebInventory = await import('mineflayer-web-inventory');
        
        // Start web inventory server
        this.webServer = mineflayerWebInventory.default(this.bot, {
          port: this.port,
          host: this.config.host || '0.0.0.0'
        });

        this.isRunning = true;
        logger.success(`WebInventory server started on port ${this.port}`);
        logger.info(`Access inventory at: http://localhost:${this.port}`);
        
      } catch (error) {
        logger.warn('mineflayer-web-inventory not installed, skipping WebInventory plugin');
        logger.info('Install with: npm install mineflayer-web-inventory');
        return;
      }

      this.isLoaded = true;
      
    } catch (error) {
      logger.error('Failed to load WebInventory plugin', error);
      throw error;
    }
  }

  async unload() {
    if (this.webServer && this.isRunning) {
      try {
        // Close the web server
        if (this.webServer.close) {
          this.webServer.close();
        }
        this.isRunning = false;
        logger.info('WebInventory server stopped');
      } catch (error) {
        logger.error('Error stopping WebInventory server', error);
      }
    }

    this.unregisterAllEvents();
    this.isLoaded = false;
  }

  getInventoryData() {
    return {
      slots: this.bot.inventory.slots.map(item => {
        if (!item) return null;
        return {
          name: item.name,
          count: item.count,
          slot: item.slot,
          displayName: item.displayName
        };
      }),
      totalItems: this.bot.inventory.items().length,
      emptySlots: this.bot.inventory.emptySlotCount()
    };
  }

  getStatus() {
    return {
      ...super.getStatus(),
      isRunning: this.isRunning,
      port: this.port,
      url: this.isRunning ? `http://localhost:${this.port}` : null,
      inventoryData: this.isRunning ? this.getInventoryData() : null
    };
  }
}

export default WebInventory;
