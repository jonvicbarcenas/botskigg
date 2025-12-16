import IPlugin from '../../interfaces/IPlugin.js';
import BehaviorManager from '../../components/BehaviorManager.js';
import FarmingBehavior from '../../components/behaviors/FarmingBehavior.js';
import logger from '../../utils/Logger.js';

/**
 * AutoFarm Plugin - Clean, modular farming system
 */
class AutoFarmPlugin extends IPlugin {
  constructor(bot, config = {}) {
    super('AutoFarm', bot, config);
    this.behaviorManager = null;
    this.pathfinder = null;
  }

  async load() {
    try {
      // Get pathfinder from Navigation plugin
      const navigation = this.bot.pluginLoader?.getPlugin('Navigation');
      if (navigation && navigation.pathfinder) {
        this.pathfinder = navigation.pathfinder;
      }
      
      // Get state machine
      const stateMachine = this.bot.stateMachine;
      if (!stateMachine) {
        throw new Error('StateMachine not available');
      }
      
      // Create behavior manager
      this.behaviorManager = new BehaviorManager(this.bot, stateMachine);
      
      // Register behaviors
      this.registerBehaviors();
      
      // Register chat commands
      this.registerEvent('chat', this.handleChat);
      
      this.isLoaded = true;
      logger.success('AutoFarm plugin loaded with modular behaviors');
    } catch (error) {
      logger.error('Failed to load AutoFarm plugin', error);
      throw error;
    }
  }

  /**
   * Register behavior components
   */
  registerBehaviors() {
    const farmingBehavior = new FarmingBehavior(this.bot, this.pathfinder);
    this.behaviorManager.registerBehavior(farmingBehavior);
    
    logger.info('Farming behaviors registered');
  }

  async handleChat(username, message) {
    if (username === this.bot.username) return;
    
    if (message === '!farm start') {
      this.startFarming();
    } else if (message === '!farm stop') {
      this.stopFarming();
    } else if (message === '!farm status') {
      this.getFarmStatus();
    }
  }

  /**
   * Start farming
   */
  startFarming() {
    const success = this.behaviorManager.activateBehavior('farming');
    if (success) {
      this.bot.chat('Auto-farming started');
    } else {
      this.bot.chat('Failed to start farming');
    }
  }

  /**
   * Stop farming
   */
  stopFarming() {
    this.behaviorManager.deactivateBehavior();
    this.bot.chat('Auto-farming stopped');
  }

  /**
   * Get farm status
   */
  getFarmStatus() {
    const farmingBehavior = this.behaviorManager.getBehavior('farming');
    if (farmingBehavior && farmingBehavior.isActive) {
      const stats = farmingBehavior.stats;
      this.bot.chat(`Farming: ${stats.cropsHarvested} harvested, ${stats.cropsPlanted} planted, ${stats.cyclesCompleted} cycles`);
    } else {
      this.bot.chat('Not currently farming');
    }
  }

  async unload() {
    if (this.behaviorManager) {
      this.behaviorManager.destroy();
    }
    this.unregisterAllEvents();
    this.isLoaded = false;
    logger.info('AutoFarm plugin unloaded');
  }

  getStatus() {
    return {
      ...super.getStatus(),
      behaviors: this.behaviorManager?.getStatus() || null
    };
  }
}

export default AutoFarmPlugin;