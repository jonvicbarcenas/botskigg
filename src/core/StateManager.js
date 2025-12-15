import logger from '../utils/Logger.js';

/**
 * StateManager - Manages dynamic bot states and behaviors
 */
class StateManager {
  constructor() {
    this.states = new Map();
    this.listeners = new Map();
  }

  /**
   * Set a state value
   */
  setState(key, value) {
    const oldValue = this.states.get(key);
    this.states.set(key, value);
    
    logger.debug(`State changed: ${key} = ${value}`, { oldValue, newValue: value });
    
    // Notify listeners
    this.notifyListeners(key, value, oldValue);
  }

  /**
   * Get a state value
   */
  getState(key, defaultValue = null) {
    return this.states.has(key) ? this.states.get(key) : defaultValue;
  }

  /**
   * Check if state exists
   */
  hasState(key) {
    return this.states.has(key);
  }

  /**
   * Delete a state
   */
  deleteState(key) {
    const existed = this.states.delete(key);
    if (existed) {
      logger.debug(`State deleted: ${key}`);
      this.notifyListeners(key, null, this.states.get(key));
    }
    return existed;
  }

  /**
   * Toggle a boolean state
   */
  toggleState(key) {
    const current = this.getState(key, false);
    this.setState(key, !current);
    return !current;
  }

  /**
   * Increment a numeric state
   */
  incrementState(key, amount = 1) {
    const current = this.getState(key, 0);
    const newValue = current + amount;
    this.setState(key, newValue);
    return newValue;
  }

  /**
   * Get all states
   */
  getAllStates() {
    return Object.fromEntries(this.states);
  }

  /**
   * Clear all states
   */
  clearAll() {
    this.states.clear();
    logger.debug('All states cleared');
  }

  /**
   * Add a state change listener
   */
  addListener(key, callback) {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, []);
    }
    this.listeners.get(key).push(callback);
  }

  /**
   * Remove a state change listener
   */
  removeListener(key, callback) {
    if (!this.listeners.has(key)) return;
    
    const callbacks = this.listeners.get(key);
    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
    }
  }

  /**
   * Notify all listeners of a state change
   */
  notifyListeners(key, newValue, oldValue) {
    if (!this.listeners.has(key)) return;
    
    const callbacks = this.listeners.get(key);
    for (const callback of callbacks) {
      try {
        callback(newValue, oldValue, key);
      } catch (error) {
        logger.error(`Error in state listener for ${key}`, error);
      }
    }
  }

  /**
   * Create a namespaced state manager
   */
  createNamespace(namespace) {
    return {
      setState: (key, value) => this.setState(`${namespace}.${key}`, value),
      getState: (key, defaultValue) => this.getState(`${namespace}.${key}`, defaultValue),
      hasState: (key) => this.hasState(`${namespace}.${key}`),
      deleteState: (key) => this.deleteState(`${namespace}.${key}`),
      toggleState: (key) => this.toggleState(`${namespace}.${key}`),
      incrementState: (key, amount) => this.incrementState(`${namespace}.${key}`, amount)
    };
  }

  /**
   * Serialize states to JSON
   */
  serialize() {
    return JSON.stringify(Object.fromEntries(this.states), null, 2);
  }

  /**
   * Deserialize states from JSON
   */
  deserialize(json) {
    try {
      const data = typeof json === 'string' ? JSON.parse(json) : json;
      for (const [key, value] of Object.entries(data)) {
        this.setState(key, value);
      }
      logger.info('States deserialized successfully');
    } catch (error) {
      logger.error('Failed to deserialize states', error);
    }
  }

  /**
   * Get state statistics
   */
  getStats() {
    return {
      totalStates: this.states.size,
      totalListeners: Array.from(this.listeners.values()).reduce((sum, arr) => sum + arr.length, 0),
      states: this.getAllStates()
    };
  }
}

export default StateManager;
