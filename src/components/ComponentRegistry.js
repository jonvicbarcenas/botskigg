import logger from '../utils/Logger.js';

/**
 * Component Registry - Central registry for all bot components
 */
class ComponentRegistry {
  constructor() {
    this.components = new Map();
    this.dependencies = new Map();
  }

  /**
   * Register a component
   */
  register(name, component, dependencies = []) {
    this.components.set(name, component);
    this.dependencies.set(name, dependencies);
    logger.debug(`Component registered: ${name}`);
  }

  /**
   * Get a component by name
   */
  get(name) {
    return this.components.get(name);
  }

  /**
   * Check if component exists
   */
  has(name) {
    return this.components.has(name);
  }

  /**
   * Get all component names
   */
  getNames() {
    return Array.from(this.components.keys());
  }

  /**
   * Initialize components in dependency order
   */
  async initializeAll() {
    const initialized = new Set();
    const initializing = new Set();

    const initialize = async (name) => {
      if (initialized.has(name)) return;
      if (initializing.has(name)) {
        throw new Error(`Circular dependency detected: ${name}`);
      }

      initializing.add(name);
      
      // Initialize dependencies first
      const deps = this.dependencies.get(name) || [];
      for (const dep of deps) {
        await initialize(dep);
      }

      // Initialize component
      const component = this.components.get(name);
      if (component && typeof component.initialize === 'function') {
        await component.initialize();
        logger.debug(`Component initialized: ${name}`);
      }

      initializing.delete(name);
      initialized.add(name);
    };

    // Initialize all components
    for (const name of this.components.keys()) {
      await initialize(name);
    }

    logger.success(`Initialized ${initialized.size} components`);
  }

  /**
   * Cleanup all components
   */
  async cleanup() {
    for (const [name, component] of this.components) {
      if (component && typeof component.cleanup === 'function') {
        try {
          await component.cleanup();
          logger.debug(`Component cleaned up: ${name}`);
        } catch (error) {
          logger.error(`Error cleaning up component ${name}:`, error);
        }
      }
    }
    
    this.components.clear();
    this.dependencies.clear();
    logger.info('All components cleaned up');
  }

  /**
   * Get registry status
   */
  getStatus() {
    return {
      componentCount: this.components.size,
      components: this.getNames()
    };
  }
}

export default ComponentRegistry;