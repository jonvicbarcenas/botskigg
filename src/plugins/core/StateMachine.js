import IPlugin from '../../interfaces/IPlugin.js';
import logger from '../../utils/Logger.js';
import mineflayerStateMachine from 'mineflayer-statemachine';

const { 
  BotStateMachine,
  BehaviorIdle,
  BehaviorFollowEntity,
  BehaviorGetClosestEntity,
  NestedStateMachine,
  StateTransition
} = mineflayerStateMachine;

/**
 * StateMachine Plugin - Wrapper for mineflayer-statemachine library
 * Manages bot behavior states with transitions and priorities
 */
class StateMachine extends IPlugin {
  constructor(bot, config = {}) {
    super('StateMachine', bot, config);
    this.stateMachine = null;
    this.behaviors = new Map();
    this.transitions = [];
    this.currentStateName = 'idle';
    this.stateHistory = [];
    this.maxHistorySize = config.maxHistorySize || 50;
  }

  async load() {
    try {
      // Setup default behaviors FIRST
      this.setupDefaultBehaviors();
      
      // Get the initial state (idle behavior)
      const initialState = this.getInitialState();
      
      // Create root nested state machine with idle as initial state
      const rootStateMachine = new NestedStateMachine([initialState], initialState);
      rootStateMachine.stateName = 'root';
      
      // Initialize the bot state machine with the root
      this.stateMachine = new BotStateMachine(this.bot, rootStateMachine);
      
      // Setup default transitions
      this.setupDefaultTransitions();
      
      // Register event handlers
      this.registerEvent('chat', this.handleChat);
      
      // Listen to state machine events
      this.stateMachine.on('stateEntered', (state) => this.onStateEntered(state));
      this.stateMachine.on('stateExited', (state) => this.onStateExited(state));
      
      // Start automatic behavior monitoring
      this.startBehaviorMonitoring();
      
      // Expose state machine to bot for other plugins
      this.bot.stateMachine = this;
      
      this.isLoaded = true;
      logger.success('StateMachine plugin loaded with dynamic behavior monitoring');
    } catch (error) {
      logger.error('Failed to load StateMachine plugin', error);
      throw error;
    }
  }

  /**
   * Start automatic behavior monitoring
   */
  startBehaviorMonitoring() {
    // Monitor every 2 seconds for automatic state transitions
    this.monitoringInterval = setInterval(() => {
      this.checkAutomaticTransitions();
    }, 2000);
    
    logger.info('Automatic behavior monitoring started');
  }

  /**
   * Check for automatic state transitions based on conditions
   */
  checkAutomaticTransitions() {
    try {
      // Skip if not in idle state (don't interrupt active behaviors)
      if (this.currentStateName !== 'idle') {
        return;
      }
      
      // Check for hunger (high priority)
      if (this.bot.food < 16) {
        const hasFood = this.bot.inventory.items().some(item => 
          item.name.includes('bread') || 
          item.name.includes('apple') || 
          item.name.includes('carrot') || 
          item.name.includes('potato') ||
          item.name.includes('beef') ||
          item.name.includes('pork') ||
          item.name.includes('chicken')
        );
        
        if (hasFood) {
          logger.info('Bot is hungry, automatically switching to eating state');
          this.setState('eating');
          return;
        }
      }
      
      // Check for nearby enemies (highest priority)
      const enemy = this.bot.nearestEntity(entity => {
        return entity.type === 'mob' && 
               entity.mobType && 
               ['zombie', 'skeleton', 'creeper', 'spider', 'enderman'].includes(entity.mobType) &&
               entity.position.distanceTo(this.bot.entity.position) < 8;
      });
      
      if (enemy) {
        logger.info(`Hostile ${enemy.mobType} detected nearby, automatically switching to combat state`);
        this.setState('fighting');
        return;
      }
      
      // Check for low health (flee behavior)
      if (this.bot.health < 10) {
        logger.warn('Low health detected, bot should seek safety');
        // Could implement fleeing behavior here
      }
      
    } catch (error) {
      logger.error('Error in automatic behavior monitoring:', error);
    }
  }

  async unload() {
    // Stop monitoring
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    this.behaviors.clear();
    this.transitions = [];
    this.unregisterAllEvents();
    this.isLoaded = false;
    logger.info('StateMachine plugin unloaded');
  }

  /**
   * Setup default behaviors
   */
  setupDefaultBehaviors() {
    // Idle behavior - default state
    const idle = new BehaviorIdle();
    idle.stateName = 'idle';
    this.behaviors.set('idle', idle);
    
    // Auto-eat behavior - high priority survival behavior
    const autoEat = this.createAutoEatBehavior();
    this.behaviors.set('eating', autoEat);
    
    // Auto-defend behavior - highest priority combat behavior
    const autoDefend = this.createAutoDefendBehavior();
    this.behaviors.set('fighting', autoDefend);
    
    logger.info('Default behaviors initialized with dynamic actions');
  }

  /**
   * Create auto-eat behavior
   */
  createAutoEatBehavior() {
    const autoEat = new BehaviorIdle();
    autoEat.stateName = 'eating';
    
    // Override the behavior to actually eat food
    autoEat.onStateEntered = async () => {
      logger.info('Bot is hungry, looking for food...');
      await this.performEating();
    };
    
    return autoEat;
  }

  /**
   * Create auto-defend behavior
   */
  createAutoDefendBehavior() {
    const autoDefend = new BehaviorIdle();
    autoDefend.stateName = 'fighting';
    
    // Override the behavior to actually fight
    autoDefend.onStateEntered = async () => {
      logger.info('Bot detected threat, engaging in combat...');
      await this.performCombat();
    };
    
    return autoDefend;
  }

  /**
   * Perform eating action
   */
  async performEating() {
    try {
      const food = this.bot.inventory.items().find(item => 
        item.name.includes('bread') || 
        item.name.includes('apple') || 
        item.name.includes('carrot') || 
        item.name.includes('potato') ||
        item.name.includes('beef') ||
        item.name.includes('pork') ||
        item.name.includes('chicken')
      );
      
      if (food) {
        logger.info(`Eating ${food.name}...`);
        await this.bot.equip(food, 'hand');
        await this.bot.consume();
        logger.success('Finished eating, returning to previous activity');
        
        // Return to idle after eating
        setTimeout(() => {
          if (this.currentStateName === 'eating') {
            this.setState('idle');
          }
        }, 1000);
      } else {
        logger.warn('No food found in inventory');
        this.setState('idle');
      }
    } catch (error) {
      logger.error('Error while eating:', error);
      this.setState('idle');
    }
  }

  /**
   * Perform combat action
   */
  async performCombat() {
    try {
      const enemy = this.bot.nearestEntity(entity => {
        return entity.type === 'mob' && 
               entity.mobType && 
               ['zombie', 'skeleton', 'creeper', 'spider', 'enderman'].includes(entity.mobType) &&
               entity.position.distanceTo(this.bot.entity.position) < 16;
      });
      
      if (enemy) {
        logger.info(`Engaging ${enemy.mobType || 'hostile mob'}...`);
        
        // Equip weapon if available
        const weapon = this.bot.inventory.items().find(item => 
          item.name.includes('sword') || 
          item.name.includes('axe') ||
          item.name === 'bow'
        );
        
        if (weapon) {
          await this.bot.equip(weapon, 'hand');
        }
        
        // Attack the enemy
        await this.bot.attack(enemy);
        
        // Continue fighting until enemy is dead or out of range
        const fightInterval = setInterval(() => {
          if (!enemy.isValid || enemy.position.distanceTo(this.bot.entity.position) > 16) {
            clearInterval(fightInterval);
            logger.success('Combat finished, returning to idle');
            if (this.currentStateName === 'fighting') {
              this.setState('idle');
            }
          } else {
            this.bot.attack(enemy);
          }
        }, 500);
        
      } else {
        logger.info('No enemies found, returning to idle');
        this.setState('idle');
      }
    } catch (error) {
      logger.error('Error during combat:', error);
      this.setState('idle');
    }
  }

  /**
   * Setup default transitions
   */
  setupDefaultTransitions() {
    // Transitions will be added by other plugins
    logger.info('Transitions ready for configuration');
  }

  /**
   * Get initial state
   */
  getInitialState() {
    return this.behaviors.get('idle');
  }

  /**
   * Add a behavior to the state machine
   */
  addBehavior(name, behavior) {
    if (!behavior.stateName) {
      behavior.stateName = name;
    }
    this.behaviors.set(name, behavior);
    logger.debug(`Behavior added: ${name}`);
  }

  /**
   * Get a behavior by name
   */
  getBehavior(name) {
    return this.behaviors.get(name);
  }

  /**
   * Add a transition between states
   */
  addTransition(transition) {
    this.transitions.push(transition);
    logger.debug(`Transition added: ${transition.parent?.stateName || 'root'} -> ${transition.child?.stateName || 'unknown'}`);
  }

  /**
   * Create and add a state transition
   */
  createTransition(options) {
    const {
      parent,
      child,
      name = `${parent}_to_${child}`,
      shouldTransition,
      onTransition
    } = options;

    const parentBehavior = this.behaviors.get(parent);
    const childBehavior = this.behaviors.get(child);

    if (!parentBehavior) {
      logger.error(`Parent behavior not found: ${parent}`);
      return null;
    }

    if (!childBehavior) {
      logger.error(`Child behavior not found: ${child}`);
      return null;
    }

    const transition = new StateTransition({
      parent: parentBehavior,
      child: childBehavior,
      name,
      shouldTransition,
      onTransition
    });

    this.addTransition(transition);
    return transition;
  }

  /**
   * Transition to a specific state
   */
  setState(stateName, force = false) {
    const behavior = this.behaviors.get(stateName);
    
    if (!behavior) {
      // Auto-register a simple idle behavior for unknown states to improve resiliency
      try {
        const auto = new BehaviorIdle();
        auto.stateName = stateName;
        this.addBehavior(stateName, auto);
        logger.warn(`Auto-registered missing state behavior: ${stateName}`);
      } catch (e) {
        logger.error(`State not found and could not be auto-registered: ${stateName}`);
        return false;
      }
    }

    // If already in the requested state, no-op without warning
    if (this.currentStateName === stateName) {
      logger.debug(`Already in state: ${stateName}`);
      return true;
    }

    try {
      if (force) {
        if (this.stateMachine && typeof this.stateMachine.setState === 'function') {
          this.stateMachine.setState(behavior);
        } else if (this.stateMachine && typeof this.stateMachine.transitionTo === 'function') {
          this.stateMachine.transitionTo(behavior);
        } else {
          // As a last resort, update current state name without invoking underlying lib
          logger.warn('Underlying BotStateMachine has no setState/transitionTo. Forcing state name only.');
        }
      } else {
        // Check if transition is valid through existing transitions
        const canTransition = this.canTransitionTo(stateName);
        if (canTransition) {
          if (this.stateMachine && typeof this.stateMachine.setState === 'function') {
            this.stateMachine.setState(behavior);
          } else if (this.stateMachine && typeof this.stateMachine.transitionTo === 'function') {
            this.stateMachine.transitionTo(behavior);
          } else {
            logger.warn('Underlying BotStateMachine has no setState/transitionTo. Applying state name only.');
          }
        } else {
          logger.warn(`Cannot transition to ${stateName} from ${this.currentStateName}`);
          return false;
        }
      }
      
      this.currentStateName = stateName;
      return true;
    } catch (error) {
      logger.error(`Error transitioning to ${stateName}`, error);
      return false;
    }
  }

  /**
   * Force state change
   */
  forceState(stateName) {
    return this.setState(stateName, true);
  }

  /**
   * Get current state name
   */
  getState() {
    return this.currentStateName;
  }

  /**
   * Check if in specific state
   */
  isInState(stateName) {
    return this.currentStateName === stateName;
  }

  /**
   * Check if can transition to state
   */
  canTransitionTo(stateName) {
    // Check if there's a valid transition path
    const currentBehavior = this.behaviors.get(this.currentStateName);
    const targetBehavior = this.behaviors.get(stateName);
    
    if (!currentBehavior || !targetBehavior) return false;

    // Find matching transition
    const transition = this.transitions.find(t => 
      t.parent === currentBehavior && t.child === targetBehavior
    );

    return transition !== undefined;
  }

  /**
   * Add state to history
   */
  addToHistory(stateName) {
    this.stateHistory.push({
      state: stateName,
      timestamp: Date.now()
    });

    if (this.stateHistory.length > this.maxHistorySize) {
      this.stateHistory.shift();
    }
  }

  /**
   * Get state history
   */
  getHistory(limit = 10) {
    return this.stateHistory.slice(-limit);
  }

  /**
   * Event handlers
   */
  onStateEntered(state) {
    const stateName = state.stateName || 'unknown';
    this.currentStateName = stateName;
    this.addToHistory(stateName);
    logger.info(`Entered state: ${stateName}`);
  }

  onStateExited(state) {
    const stateName = state.stateName || 'unknown';
    logger.debug(`Exited state: ${stateName}`);
  }

  async handleChat(username, message) {
    if (username === this.bot.username) return;
    
    if (message === '!state') {
      this.bot.chat(`Current state: ${this.currentStateName}`);
    } else if (message === '!states') {
      const states = Array.from(this.behaviors.keys()).join(', ');
      this.bot.chat(`Available states: ${states}`);
    } else if (message === '!history') {
      const history = this.getHistory(5);
      if (history.length === 0) {
        this.bot.chat('No state history');
        return;
      }
      this.bot.chat('Recent states:');
      history.forEach((entry, i) => {
        const time = new Date(entry.timestamp).toLocaleTimeString();
        this.bot.chat(`${i + 1}. ${entry.state} at ${time}`);
      });
    } else if (message.startsWith('!setstate ')) {
      const state = message.split(' ')[1];
      if (this.behaviors.has(state)) {
        if (this.setState(state, true)) {
          this.bot.chat(`State changed to: ${state}`);
        } else {
          this.bot.chat(`Cannot change to state: ${state}`);
        }
      } else {
        this.bot.chat(`Invalid state: ${state}`);
      }
    }
  }

  /**
   * Get comprehensive status
   */
  getStatus() {
    return {
      ...super.getStatus(),
      currentState: this.currentStateName,
      behaviorCount: this.behaviors.size,
      transitionCount: this.transitions.length,
      historySize: this.stateHistory.length,
      recentHistory: this.getHistory(5),
      availableStates: Array.from(this.behaviors.keys())
    };
  }

  /**
   * Create common behaviors
   */
  static createIdleBehavior() {
    const idle = new BehaviorIdle();
    idle.stateName = 'idle';
    return idle;
  }

  static createFollowBehavior(bot, targets) {
    const follow = new BehaviorFollowEntity(bot, targets);
    follow.stateName = 'following';
    return follow;
  }

  /**
   * Utility to create a nested state machine
   */
  createNestedStateMachine(rootState, ...states) {
    return new NestedStateMachine(rootState, ...states);
  }
}

export default StateMachine;

// Export behavior classes for use in other plugins
export {
  BehaviorIdle,
  BehaviorFollowEntity,
  BehaviorGetClosestEntity,
  NestedStateMachine,
  StateTransition
};
