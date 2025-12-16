import IPlugin from '../../interfaces/IPlugin.js';
import logger from '../../utils/Logger.js';
import mineflayerStateMachine from 'mineflayer-statemachine';

const { 
  BotStateMachine,
  BehaviorIdle,
  NestedStateMachine
} = mineflayerStateMachine;

/**
 * StateMachine Plugin - Clean, modular state management
 */
class StateMachinePlugin extends IPlugin {
  constructor(bot, config = {}) {
    super('StateMachine', bot, config);
    this.stateMachine = null;
    this.behaviors = new Map();
    this.currentStateName = 'idle';
    this.stateHistory = [];
  }

  async load() {
    try {
      // Create idle behavior
      const idle = new BehaviorIdle();
      idle.stateName = 'idle';
      this.behaviors.set('idle', idle);
      
      // Create state machine
      const rootStateMachine = new NestedStateMachine([idle], idle);
      rootStateMachine.stateName = 'root';
      this.stateMachine = new BotStateMachine(this.bot, rootStateMachine);
      
      // Listen to state events
      this.stateMachine.on('stateEntered', (state) => this.onStateEntered(state));
      this.stateMachine.on('stateExited', (state) => this.onStateExited(state));
      
      // Register chat commands
      this.registerEvent('chat', this.handleChat);
      
      // Expose to bot
      this.bot.stateMachine = this;
      
      this.isLoaded = true;
      logger.success('StateMachine plugin loaded');
    } catch (error) {
      logger.error('Failed to load StateMachine plugin', error);
      throw error;
    }
  }

  /**
   * Add behavior to state machine
   */
  addBehavior(name, behavior) {
    if (!behavior.stateName) {
      behavior.stateName = name;
    }
    this.behaviors.set(name, behavior);
    logger.debug(`Behavior added: ${name}`);
  }

  /**
   * Set current state
   */
  setState(stateName) {
    const behavior = this.behaviors.get(stateName);
    if (!behavior) {
      logger.error(`State not found: ${stateName}`);
      return false;
    }

    if (this.currentStateName === stateName) {
      return true;
    }

    try {
      if (this.stateMachine.setState) {
        this.stateMachine.setState(behavior);
      }
      this.currentStateName = stateName;
      return true;
    } catch (error) {
      logger.error(`Error transitioning to ${stateName}`, error);
      return false;
    }
  }

  /**
   * Get current state
   */
  getState() {
    return this.currentStateName;
  }

  /**
   * State event handlers
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

  /**
   * Add to state history
   */
  addToHistory(stateName) {
    this.stateHistory.push({
      state: stateName,
      timestamp: Date.now()
    });

    if (this.stateHistory.length > 50) {
      this.stateHistory.shift();
    }
  }

  /**
   * Get state history
   */
  getHistory(limit = 10) {
    return this.stateHistory.slice(-limit);
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
    }
  }

  async unload() {
    this.behaviors.clear();
    this.unregisterAllEvents();
    this.isLoaded = false;
    logger.info('StateMachine plugin unloaded');
  }

  getStatus() {
    return {
      ...super.getStatus(),
      currentState: this.currentStateName,
      behaviorCount: this.behaviors.size,
      historySize: this.stateHistory.length,
      availableStates: Array.from(this.behaviors.keys())
    };
  }
}

export default StateMachinePlugin;