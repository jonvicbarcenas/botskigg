import IPlugin from '../../interfaces/IPlugin.js';
import logger from '../../utils/Logger.js';

/**
 * WebViewer Plugin - Wrapper for prismarine-viewer
 * Provides a web interface to view the bot's perspective
 */
class WebViewer extends IPlugin {
  constructor(bot, config = {}) {
    super('WebViewer', bot, config);
    this.viewer = null;
    this.port = config.port || 3000;
    this.isRunning = false;
  }

  async load() {
    try {
      // Check if enabled in features config
      const isEnabled = this.bot.config?.features?.webViewer;
      if (!isEnabled) {
        logger.info('WebViewer is disabled in config');
        return;
      }

      // Try to load prismarine-viewer
      try {
        const { mineflayer: mineflayerViewer } = await import('prismarine-viewer');
        
        // Ensure bot version is known - prismarine-viewer needs this
        if (!this.bot.version) {
          this.bot.version = this.bot.config?.server?.version || '1.20.1';
        }
        
        logger.info(`Initializing WebViewer for Minecraft version: ${this.bot.version}`);

        // Start web viewer
        this.viewer = mineflayerViewer(this.bot, {
          port: this.port,
          firstPerson: this.config.firstPerson !== false
        });

        this.isRunning = true;
        logger.success(`WebViewer server started on port ${this.port}`);
        logger.info(`Access viewer at: http://localhost:${this.port}`);
        
      } catch (error) {
        logger.warn('prismarine-viewer not installed or failed to load');
        logger.info('Install with: npm install prismarine-viewer');
        logger.error('Error details:', error);
        return;
      }

      this.isLoaded = true;
      
    } catch (error) {
      logger.error('Failed to load WebViewer plugin', error);
      throw error;
    }
  }

  async unload() {
    if (this.viewer && this.isRunning) {
      try {
        // Close the web viewer
        if (this.viewer.close) {
          this.viewer.close();
        }
        this.isRunning = false;
        logger.info('WebViewer server stopped');
      } catch (error) {
        logger.error('Error stopping WebViewer server', error);
      }
    }

    this.unregisterAllEvents();
    this.isLoaded = false;
  }

  getStatus() {
    return {
      ...super.getStatus(),
      isRunning: this.isRunning,
      port: this.port,
      url: this.isRunning ? `http://localhost:${this.port}` : null
    };
  }
}

export default WebViewer;
