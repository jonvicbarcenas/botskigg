import BaseBehavior from './BaseBehavior.js';
import logger from '../../utils/Logger.js';

/**
 * Movement Behavior Component - Handles bot movement actions
 */
class MovementBehavior extends BaseBehavior {
  constructor(bot, pathfinder) {
    super('moving', { tickInterval: 1000 });
    this.bot = bot;
    this.pathfinder = pathfinder;
    this.target = null;
  }

  /**
   * Set movement target
   */
  setTarget(x, y, z) {
    this.target = { x, y, z };
  }

  /**
   * Check if movement is complete
   */
  tick() {
    if (!this.pathfinder.isMoving() && this.target) {
      logger.success('Movement completed');
      this.target = null;
      return 'complete';
    }
    return 'continue';
  }

  /**
   * Start movement behavior
   */
  onEnter() {
    super.onEnter();
    if (this.target) {
      logger.info(`Moving to ${this.target.x}, ${this.target.y}, ${this.target.z}`);
    }
  }

  /**
   * Stop movement behavior
   */
  onExit() {
    super.onExit();
    this.pathfinder.stop();
    this.target = null;
  }
}

export default MovementBehavior;