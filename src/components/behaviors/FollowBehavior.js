import BaseBehavior from './BaseBehavior.js';
import logger from '../../utils/Logger.js';

/**
 * Follow Behavior Component - Handles following players
 */
class FollowBehavior extends BaseBehavior {
  constructor(bot, pathfinder) {
    super('following', { tickInterval: 2000 });
    this.bot = bot;
    this.pathfinder = pathfinder;
    this.targetPlayer = null;
  }

  /**
   * Set follow target
   */
  setTarget(username) {
    this.targetPlayer = username;
  }

  /**
   * Check follow status
   */
  tick() {
    if (!this.targetPlayer) return 'complete';
    
    const player = this.bot.players[this.targetPlayer]?.entity;
    if (!player) {
      logger.warn(`Lost sight of ${this.targetPlayer}`);
      return 'complete';
    }
    
    const distance = this.bot.entity.position.distanceTo(player.position);
    if (distance > 10) {
      logger.debug(`Following ${this.targetPlayer} - distance: ${distance.toFixed(1)}`);
    }
    
    return 'continue';
  }

  /**
   * Start following
   */
  onEnter() {
    super.onEnter();
    if (this.targetPlayer) {
      logger.info(`Started following ${this.targetPlayer}`);
      this.pathfinder.followPlayer(this.targetPlayer, 3);
    }
  }

  /**
   * Stop following
   */
  onExit() {
    super.onExit();
    this.pathfinder.stop();
    logger.info(`Stopped following ${this.targetPlayer}`);
    this.targetPlayer = null;
  }
}

export default FollowBehavior;