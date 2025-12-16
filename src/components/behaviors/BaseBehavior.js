import { BehaviorIdle } from 'mineflayer-statemachine';
import logger from '../../utils/Logger.js';

/**
 * Base Behavior Component - Reusable behavior foundation
 */
class BaseBehavior {
  constructor(name, config = {}) {
    this.name = name;
    this.config = config;
    this.isActive = false;
    this.interval = null;
    this.behavior = null;
  }

  /**
   * Create the mineflayer behavior instance
   */
  createBehavior() {
    const behavior = new BehaviorIdle();
    behavior.stateName = this.name;
    
    behavior.onStateEntered = () => {
      this.isActive = true;
      logger.info(`Entered ${this.name} behavior`);
      this.onEnter();
    };
    
    behavior.onStateExited = () => {
      this.isActive = false;
      logger.debug(`Exited ${this.name} behavior`);
      this.onExit();
    };
    
    this.behavior = behavior;
    return behavior;
  }

  /**
   * Start behavior monitoring loop
   */
  startMonitoring(intervalMs = 2000) {
    if (this.interval) return;
    
    this.interval = setInterval(() => {
      if (this.isActive) {
        this.tick();
      }
    }, intervalMs);
  }

  /**
   * Stop behavior monitoring
   */
  stopMonitoring() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /**
   * Called when behavior is entered - override in subclasses
   */
  onEnter() {
    this.startMonitoring();
  }

  /**
   * Called when behavior is exited - override in subclasses
   */
  onExit() {
    this.stopMonitoring();
  }

  /**
   * Called every tick while behavior is active - override in subclasses
   */
  tick() {
    // Override in subclasses
  }

  /**
   * Get behavior status
   */
  getStatus() {
    return {
      name: this.name,
      isActive: this.isActive,
      hasInterval: !!this.interval
    };
  }

  /**
   * Cleanup resources
   */
  destroy() {
    this.stopMonitoring();
    this.isActive = false;
    this.behavior = null;
  }
}

export default BaseBehavior;