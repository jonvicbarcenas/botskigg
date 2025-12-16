import IPlugin from '../../interfaces/IPlugin.js';
import PathfinderUtil from '../../utils/Pathfinder.js';
import BehaviorManager from '../../components/BehaviorManager.js';
import MovementBehavior from '../../components/behaviors/MovementBehavior.js';
import FollowBehavior from '../../components/behaviors/FollowBehavior.js';
import logger from '../../utils/Logger.js';
import ChatParser from '../../utils/ChatParser.js';

/**
 * Navigation Plugin - Clean, modular navigation system
 */
class NavigationPlugin extends IPlugin {
  constructor(bot, config = {}) {
    super('Navigation', bot, config);
    this.pathfinder = null;
    this.behaviorManager = null;
  }

  async load() {
    try {
      // Initialize pathfinder
      this.pathfinder = new PathfinderUtil(this.bot, this.config.physics?.pathfinder || {});
      this.pathfinder.initialize();
      
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
      logger.success('Navigation plugin loaded with modular behaviors');
    } catch (error) {
      logger.error('Failed to load Navigation plugin', error);
      throw error;
    }
  }

  /**
   * Register behavior components
   */
  registerBehaviors() {
    const movementBehavior = new MovementBehavior(this.bot, this.pathfinder);
    const followBehavior = new FollowBehavior(this.bot, this.pathfinder);
    
    this.behaviorManager.registerBehavior(movementBehavior);
    this.behaviorManager.registerBehavior(followBehavior);
    
    logger.info('Navigation behaviors registered');
  }

  async handleChat(username, message) {
    if (username === this.bot.username) return;
    
    const parsed = ChatParser.parseCommand(message, '!');
    if (!parsed) return;
    
    const { command, args } = parsed;
    
    try {
      switch (command) {
        case 'come':
          await this.comeToPlayer(username);
          break;
        case 'follow':
          this.followPlayer(username);
          break;
        case 'stop':
          this.stop();
          break;
        case 'goto':
          if (args.length === 3) {
            await this.gotoCoords(parseInt(args[0]), parseInt(args[1]), parseInt(args[2]));
          }
          break;
      }
    } catch (error) {
      logger.error('Navigation command error', error);
      this.bot.chat(`Error: ${error.message}`);
    }
  }

  /**
   * Come to player
   */
  async comeToPlayer(username) {
    const player = this.bot.players[username]?.entity;
    if (!player) {
      this.bot.chat(`Cannot find ${username}`);
      return;
    }
    
    const pos = player.position;
    await this.gotoCoords(pos.x, pos.y, pos.z);
    this.bot.chat(`Coming to ${username}!`);
  }

  /**
   * Follow player
   */
  followPlayer(username) {
    const player = this.bot.players[username]?.entity;
    if (!player) {
      this.bot.chat(`Cannot find ${username}`);
      return;
    }
    
    const followBehavior = this.behaviorManager.getBehavior('following');
    followBehavior.setTarget(username);
    
    this.behaviorManager.activateBehavior('following');
    this.bot.chat(`Following ${username}`);
  }

  /**
   * Go to coordinates
   */
  async gotoCoords(x, y, z) {
    const movementBehavior = this.behaviorManager.getBehavior('moving');
    movementBehavior.setTarget(x, y, z);
    
    await this.pathfinder.goto(x, y, z);
    this.behaviorManager.activateBehavior('moving');
    this.bot.chat(`Going to ${x}, ${y}, ${z}`);
  }

  /**
   * Stop current action
   */
  stop() {
    this.behaviorManager.deactivateBehavior();
    this.pathfinder.stop();
    this.bot.chat('Stopped');
  }

  async unload() {
    if (this.behaviorManager) {
      this.behaviorManager.destroy();
    }
    this.pathfinder?.stop();
    this.unregisterAllEvents();
    this.isLoaded = false;
    logger.info('Navigation plugin unloaded');
  }

  getStatus() {
    return {
      ...super.getStatus(),
      pathfinder: this.pathfinder?.getStatus() || null,
      behaviors: this.behaviorManager?.getStatus() || null
    };
  }
}

export default NavigationPlugin;