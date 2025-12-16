import IPlugin from '../../interfaces/IPlugin.js';
import PathfinderUtil from '../../utils/Pathfinder.js';
import AutomationControl from '../../utils/AutomationControl.js';
import logger from '../../utils/Logger.js';
import ChatParser from '../../utils/ChatParser.js';
import { Vec3 } from 'vec3';

/**
 * Teleport Plugin - Handles trapdoor interaction for teleportation
 */
class Teleport extends IPlugin {
  constructor(bot, config = {}) {
    super('Teleport', bot, config);
    this.trapdoorPos = new Vec3(16, 63, -93);
    this.pathfinder = null;
    this.pluginLoader = null;
    this.automationControl = null;
  }

  async load() {
    try {
      this.pathfinder = new PathfinderUtil(this.bot, this.config.physics?.pathfinder || {});
      this.pathfinder.initialize();
      
      // Get pluginLoader reference from BotClient
      const BotClient = (await import('../../core/BotClient.js')).default;
      const botClient = BotClient.getInstance();
      this.pluginLoader = botClient.getPluginLoader();
      
      // Initialize automation control utility
      this.automationControl = new AutomationControl(this.pluginLoader, this.bot);
      
      this.registerEvent('chat', this.handleChat);
      this.isLoaded = true;
      logger.success('Teleport plugin loaded');
    } catch (error) {
      logger.error('Failed to load Teleport plugin', error);
      throw error;
    }
  }

  async unload() {
    this.unregisterAllEvents();
    this.isLoaded = false;
    logger.info('Teleport plugin unloaded');
  }

  async handleChat(username, message) {
    if (username === this.bot.username) return;

    const parsed = ChatParser.parseCommand(message, '!');
    if (!parsed) return;

    const { command } = parsed;

    if (command === 'tp') {
      await this.interactTrapdoor(username);
    }
  }

  /**
   * Interact with the trapdoor at the specified position
   * Temporarily pauses automation, executes, then resumes
   */
  async interactTrapdoor() {
    try {
      // Temporarily pause all automation (will resume after)
      this.automationControl.pauseAll();
      await this.sleep(500);

      const { x, y, z } = this.trapdoorPos;
      
      // Move near the trapdoor first
      this.bot.chat('Moving to trapdoor...');
      await this.pathfinder.goto(x, y, z, 3);
      
      const block = this.bot.blockAt(this.trapdoorPos);
      
      if (!block) {
        this.bot.chat('Cannot find block at trapdoor position');
        logger.warn('Block not found at trapdoor position');
        // Resume automation even on failure
        await this.automationControl.resumeAll();
        return;
      }

      logger.info(`Interacting with trapdoor at ${this.trapdoorPos}`);
      
      // Right-click (activate) the block
      await this.bot.activateBlock(block);
      
      this.bot.chat('Trapdoor activated');
      logger.success('Trapdoor interaction complete');

      // Wait a moment then resume automation
      await this.sleep(1000);
      await this.automationControl.resumeAll();
    } catch (error) {
      logger.error('Failed to interact with trapdoor', error);
      this.bot.chat(`Error: ${error.message}`);
      // Resume automation on error
      await this.automationControl.resumeAll();
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getStatus() {
    return {
      ...super.getStatus(),
      trapdoorPosition: this.trapdoorPos
    };
  }
}

export default Teleport;
