import mineflayerPathfinder from 'mineflayer-pathfinder';
import logger from './Logger.js';

const { pathfinder, Movements, goals } = mineflayerPathfinder;

/**
 * Pathfinder wrapper to simplify mineflayer-pathfinder movement commands
 */
class PathfinderUtil {
  constructor(bot, config = {}) {
    this.bot = bot;
    this.config = config;
    this.movements = null;
    this.isInitialized = false;
    this.currentReject = null;
  }

  /**
   * Initialize pathfinder with bot
   */
  initialize() {
    if (this.isInitialized) return;

    try {
      this.bot.loadPlugin(pathfinder);
      this.movements = new Movements(this.bot);
      
      // Apply configuration
      if (this.config.canDig !== undefined) {
        this.movements.canDig = this.config.canDig;
      }
      if (this.config.allowSprinting !== undefined) {
        this.movements.allowSprinting = this.config.allowSprinting;
      }
      if (this.config.allowParkour !== undefined) {
        this.movements.allowParkour = this.config.allowParkour;
      }
      
      this.isInitialized = true;
      logger.success('Pathfinder initialized');
    } catch (error) {
      logger.error('Failed to initialize pathfinder', error);
      throw error;
    }
  }

  /**
   * Go to specific coordinates
   */
  async goto(x, y, z, range = 1) {
    if (!this.isInitialized) this.initialize();
    
    // If already moving, stop first to clear previous promise
    if (this.currentReject) {
      this.stop();
    }

    try {
      const goal = new goals.GoalNear(x, y, z, range);
      this.bot.pathfinder.setMovements(this.movements);
      this.bot.pathfinder.setGoal(goal);
      
      logger.debug(`Moving to coordinates: ${x}, ${y}, ${z}`);
      
      return new Promise((resolve, reject) => {
        this.currentReject = reject;
        
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error('Pathfinding timeout'));
        }, 60000); // 60 second timeout

        const goalReached = () => {
          cleanup();
          logger.success(`Reached destination: ${x}, ${y}, ${z}`);
          resolve();
        };

        const pathUpdate = (results) => {
          if (results.status === 'noPath') {
            cleanup();
            reject(new Error('No path to destination'));
          }
        };

        const cleanup = () => {
          clearTimeout(timeout);
          this.bot.removeListener('goal_reached', goalReached);
          this.bot.removeListener('path_update', pathUpdate);
          this.currentReject = null;
        };

        this.bot.once('goal_reached', goalReached);
        this.bot.on('path_update', pathUpdate);
      });
    } catch (error) {
      this.currentReject = null;
      logger.error('Failed to pathfind to location', error);
      throw error;
    }
  }

  /**
   * Follow a player
   */
  followPlayer(username, range = 3) {
    if (!this.isInitialized) this.initialize();

    const player = this.bot.players[username]?.entity;
    if (!player) {
      throw new Error(`Player ${username} not found`);
    }

    const goal = new goals.GoalFollow(player, range);
    this.bot.pathfinder.setMovements(this.movements);
    this.bot.pathfinder.setGoal(goal, true);
    
    logger.info(`Following player: ${username}`);
  }

  /**
   * Go to a player
   */
  async gotoPlayer(username, range = 3) {
    if (!this.isInitialized) this.initialize();

    const player = this.bot.players[username]?.entity;
    if (!player) {
      throw new Error(`Player ${username} not found`);
    }

    const { x, y, z } = player.position;
    return this.goto(x, y, z, range);
  }

  /**
   * Go to a block
   */
  async gotoBlock(block, range = 1) {
    if (!this.isInitialized) this.initialize();

    const { x, y, z } = block.position;
    return this.goto(x, y, z, range);
  }

  /**
   * Stop current pathfinding
   */
  stop() {
    if (!this.isInitialized) return;

    this.bot.pathfinder.setGoal(null);
    
    if (this.currentReject) {
      this.currentReject(new Error('Pathfinding interrupted'));
      this.currentReject = null;
    }
    
    logger.info('Pathfinding stopped');
  }

  /**
   * Check if bot is currently pathfinding
   */
  isMoving() {
    return this.isInitialized && this.bot.pathfinder.isMoving();
  }

  /**
   * Get distance to target position
   */
  distanceTo(x, y, z) {
    const pos = this.bot.entity.position;
    const dx = pos.x - x;
    const dy = pos.y - y;
    const dz = pos.z - z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Check if position is reachable
   */
  canReach(x, y, z) {
    // Simple check - can be improved with actual pathfinding test
    const distance = this.distanceTo(x, y, z);
    return distance < (this.config.searchRadius || 64);
  }

  /**
   * Set movements configuration
   */
  setConfig(config) {
    this.config = { ...this.config, ...config };
    
    if (this.movements) {
      Object.assign(this.movements, config);
    }
  }

  /**
   * Get current goal
   */
  getCurrentGoal() {
    if (!this.isInitialized) return null;
    return this.bot.pathfinder.goal;
  }
}

export default PathfinderUtil;
