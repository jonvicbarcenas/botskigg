import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/Logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * PluginLoader - Dynamically loads modules from plugins folder
 */
class PluginLoader {
  constructor(bot, pluginsDir = null) {
    this.bot = bot;
    this.pluginsDir = pluginsDir || path.join(__dirname, '../plugins');
    this.plugins = new Map();
    this.loadedPlugins = [];
  }

  /**
   * Discover all plugins in the plugins directory
   */
  async discoverPlugins() {
    const discovered = [];

    try {
      if (!fs.existsSync(this.pluginsDir)) {
        logger.warn(`Plugins directory not found: ${this.pluginsDir}`);
        return discovered;
      }

      const categories = fs.readdirSync(this.pluginsDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      for (const category of categories) {
        const categoryPath = path.join(this.pluginsDir, category);
        const files = fs.readdirSync(categoryPath)
          .filter(file => file.endsWith('.js') && !file.startsWith('_'));

        for (const file of files) {
          const pluginPath = path.join(categoryPath, file);
          const pluginName = path.basename(file, '.js');
          
          discovered.push({
            name: pluginName,
            category,
            path: pluginPath,
            relativePath: path.relative(process.cwd(), pluginPath)
          });
        }
      }

      logger.info(`Discovered ${discovered.length} plugins`);
      return discovered;
    } catch (error) {
      logger.error('Error discovering plugins', error);
      return discovered;
    }
  }

  /**
   * Load a single plugin
   */
  async loadPlugin(pluginInfo) {
    try {
      const pluginModule = await import(`file://${pluginInfo.path}`);
      const PluginClass = pluginModule.default;

      if (!PluginClass) {
        throw new Error(`Plugin ${pluginInfo.name} does not export a default class`);
      }

      // Get plugin-specific config from bot's config
      const pluginConfig = this.getPluginConfig(pluginInfo.name);

      // Instantiate plugin with config
      const plugin = new PluginClass(this.bot, pluginConfig);
      
      // Check if plugin implements required methods
      if (typeof plugin.load !== 'function') {
        throw new Error(`Plugin ${pluginInfo.name} does not implement load() method`);
      }

      // Load the plugin
      await plugin.load();
      
      // Store plugin instance
      this.plugins.set(pluginInfo.name, {
        instance: plugin,
        info: pluginInfo,
        loadedAt: Date.now()
      });

      this.loadedPlugins.push(pluginInfo.name);
      
      logger.success(`Loaded plugin: ${pluginInfo.name} (${pluginInfo.category})`);
      return plugin;
    } catch (error) {
      logger.error(`Failed to load plugin: ${pluginInfo.name}`, error);
      throw error;
    }
  }

  /**
   * Get plugin-specific configuration
   */
  getPluginConfig(pluginName) {
    // Convert plugin name to config key (e.g., WebViewer -> webViewer)
    const configKey = pluginName.charAt(0).toLowerCase() + pluginName.slice(1);
    
    // Check if bot has config
    if (!this.bot.config) return {};
    
    // Return plugin-specific config or empty object
    return this.bot.config[configKey] || {};
  }

  /**
   * Load all discovered plugins
   */
  async loadAll(filter = null) {
    const discovered = await this.discoverPlugins();
    const toLoad = filter ? discovered.filter(filter) : discovered;

    // Define plugin loading priority order
    const priorityOrder = {
      'core': 1,        // Core plugins first (StateMachine, etc.)
      'navigation': 2,  // Navigation second (provides pathfinder)
      'combat': 3,
      'automatics': 4,
      'economy': 5,     // Economy plugins last (depend on navigation)
      'external': 6
    };

    // Sort plugins by category priority
    toLoad.sort((a, b) => {
      const priorityA = priorityOrder[a.category] || 999;
      const priorityB = priorityOrder[b.category] || 999;
      return priorityA - priorityB;
    });

    logger.info(`Loading ${toLoad.length} plugins...`);

    const results = {
      success: [],
      failed: []
    };

    for (const pluginInfo of toLoad) {
      try {
        await this.loadPlugin(pluginInfo);
        results.success.push(pluginInfo.name);
      } catch (error) {
        results.failed.push({
          name: pluginInfo.name,
          error: error.message
        });
      }
    }

    logger.info(`Plugin loading complete: ${results.success.length} succeeded, ${results.failed.length} failed`);
    
    if (results.failed.length > 0) {
      logger.warn('Failed plugins:', results.failed);
    }

    return results;
  }

  /**
   * Unload a plugin
   */
  async unloadPlugin(pluginName) {
    if (!this.plugins.has(pluginName)) {
      throw new Error(`Plugin ${pluginName} is not loaded`);
    }

    const { instance } = this.plugins.get(pluginName);

    try {
      if (typeof instance.unload === 'function') {
        await instance.unload();
      }

      this.plugins.delete(pluginName);
      
      const index = this.loadedPlugins.indexOf(pluginName);
      if (index > -1) {
        this.loadedPlugins.splice(index, 1);
      }

      logger.info(`Unloaded plugin: ${pluginName}`);
    } catch (error) {
      logger.error(`Failed to unload plugin: ${pluginName}`, error);
      throw error;
    }
  }

  /**
   * Unload all plugins
   */
  async unloadAll() {
    logger.info('Unloading all plugins...');

    const pluginNames = Array.from(this.plugins.keys());
    
    for (const name of pluginNames) {
      try {
        await this.unloadPlugin(name);
      } catch (error) {
        logger.error(`Error unloading plugin ${name}`, error);
      }
    }

    logger.success('All plugins unloaded');
  }

  /**
   * Reload a plugin
   * @deprecated Hot reload is not supported in ES Modules without full restart
   */
  async reloadPlugin(pluginName) {
    logger.warn('Hot reload is not supported in ES Modules. Please restart the bot.');
    return false;
  }

  /**
   * Get a loaded plugin instance
   */
  getPlugin(pluginName) {
    return this.plugins.get(pluginName)?.instance || null;
  }

  /**
   * Check if plugin is loaded
   */
  isLoaded(pluginName) {
    return this.plugins.has(pluginName);
  }

  /**
   * Get all loaded plugin names
   */
  getLoadedPlugins() {
    return Array.from(this.plugins.keys());
  }

  /**
   * Get plugin info
   */
  getPluginInfo(pluginName) {
    return this.plugins.get(pluginName) || null;
  }

  /**
   * Get statistics about loaded plugins
   */
  getStats() {
    const stats = {
      totalLoaded: this.plugins.size,
      plugins: []
    };

    for (const [name, data] of this.plugins) {
      stats.plugins.push({
        name,
        category: data.info.category,
        loadedAt: new Date(data.loadedAt).toISOString(),
        status: data.instance.getStatus ? data.instance.getStatus() : 'unknown'
      });
    }

    return stats;
  }
}

export default PluginLoader;
