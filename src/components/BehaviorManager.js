import logger from '../utils/Logger.js';

/**
 * Behavior Manager - Coordinates behavior components
 */
class BehaviorManager {
  constructor(bot, stateMachine) {
    this.bot = bot;
    this.stateMachine = stateMachine;
    this.behaviors = new Map();
    this.activeBehavior = null;
  }

  /**
   * Register a behavior component
   */
  registerBehavior(behavior) {
    this.behaviors.set(behavior.name, behavior);
    
    // Add to state machine
    const smBehavior = behavior.createBehavior();
    this.stateMachine.addBehavior(behavior.name, smBehavior);
    
    logger.debug(`Registered behavior: ${behavior.name}`);
  }

  /**
   * Activate a behavior
   */
  async activateBehavior(name, ...args) {
    const behavior = this.behaviors.get(name);
    if (!behavior) {
      logger.error(`Behavior not found: ${name}`);
      return false;
    }

    // Setup behavior if it has a setup method
    if (behavior.setup && typeof behavior.setup === 'function') {
      behavior.setup(...args);
    }

    // Transition to behavior state
    const success = this.stateMachine.setState(name);
    if (success) {
      this.activeBehavior = behavior;
      logger.info(`Activated behavior: ${name}`);
    }
    
    return success;
  }

  /**
   * Deactivate current behavior
   */
  deactivateBehavior() {
    if (this.activeBehavior) {
      this.stateMachine.setState('idle');
      this.activeBehavior = null;
      logger.info('Deactivated current behavior');
    }
  }

  /**
   * Get behavior by name
   */
  getBehavior(name) {
    return this.behaviors.get(name);
  }

  /**
   * Get all registered behaviors
   */
  getAllBehaviors() {
    return Array.from(this.behaviors.keys());
  }

  /**
   * Get current active behavior
   */
  getActiveBehavior() {
    return this.activeBehavior;
  }

  /**
   * Check behavior status
   */
  getStatus() {
    return {
      activeBehavior: this.activeBehavior?.name || 'none',
      registeredBehaviors: this.getAllBehaviors(),
      behaviorCount: this.behaviors.size
    };
  }

  /**
   * Cleanup all behaviors
   */
  destroy() {
    for (const behavior of this.behaviors.values()) {
      if (behavior.destroy) {
        behavior.destroy();
      }
    }
    this.behaviors.clear();
    this.activeBehavior = null;
  }
}

export default BehaviorManager;