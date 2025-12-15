/**
 * IPlugin - Base interface that all plugins must extend
 * Enforces standardized methods for plugin lifecycle management
 */
class IPlugin {
  constructor(name, bot, config = {}) {
    if (new.target === IPlugin) {
      throw new Error('Cannot instantiate abstract class IPlugin directly');
    }

    this.name = name;
    this.bot = bot;
    this.config = config;
    this.isLoaded = false;
    this.events = new Map();
  }

  /**
   * Load the plugin - must be implemented by child classes
   */
  async load() {
    throw new Error('Method load() must be implemented');
  }

  /**
   * Unload the plugin - must be implemented by child classes
   */
  async unload() {
    throw new Error('Method unload() must be implemented');
  }

  /**
   * Register an event handler
   */
  registerEvent(eventName, handler) {
    const boundHandler = handler.bind(this);
    this.events.set(eventName, boundHandler);
    this.bot.on(eventName, boundHandler);
  }

  /**
   * Unregister a specific event handler
   */
  unregisterEvent(eventName) {
    const handler = this.events.get(eventName);
    if (handler) {
      this.bot.removeListener(eventName, handler);
      this.events.delete(eventName);
    }
  }

  /**
   * Unregister all event handlers
   */
  unregisterAllEvents() {
    for (const [eventName, handler] of this.events) {
      this.bot.removeListener(eventName, handler);
    }
    this.events.clear();
  }

  /**
   * Get plugin status
   */
  getStatus() {
    return {
      name: this.name,
      isLoaded: this.isLoaded,
      eventCount: this.events.size
    };
  }

  /**
   * Lifecycle hook - called after plugin is loaded
   */
  onLoad() {
    // Optional override
  }

  /**
   * Lifecycle hook - called before plugin is unloaded
   */
  onUnload() {
    // Optional override
  }

  /**
   * Update plugin configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }
}

export default IPlugin;
