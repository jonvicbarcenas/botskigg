import logger from './Logger.js';

/**
 * AutomationControl - Reusable utility for pausing/stopping automation plugins
 * Provides modular control over farming and other automated tasks
 */
class AutomationControl {
  constructor(pluginLoader, bot) {
    this.pluginLoader = pluginLoader;
    this.bot = bot;
    this.pausedPlugins = new Map(); // Track which plugins were paused
    this.wasMonitoringPaused = false;
    this.savedMonitoringInterval = null;
  }

  /**
   * Get all automation plugins that can be controlled
   */
  getAutomationPlugins() {
    return ['SugarcaneFarm', 'AutoFarm'];
  }

  /**
   * Pause the state machine's automatic behavior monitoring
   */
  pauseStateMachineMonitoring() {
    const stateMachine = this.pluginLoader?.getPlugin('StateMachine');
    if (stateMachine && stateMachine.monitoringInterval) {
      this.savedMonitoringInterval = stateMachine.monitoringInterval;
      clearInterval(stateMachine.monitoringInterval);
      stateMachine.monitoringInterval = null;
      this.wasMonitoringPaused = true;
      logger.info('Paused StateMachine automatic monitoring');
    }
  }

  /**
   * Resume the state machine's automatic behavior monitoring
   */
  resumeStateMachineMonitoring() {
    if (this.wasMonitoringPaused) {
      const stateMachine = this.pluginLoader?.getPlugin('StateMachine');
      if (stateMachine && !stateMachine.monitoringInterval) {
        stateMachine.startBehaviorMonitoring();
        logger.info('Resumed StateMachine automatic monitoring');
      }
      this.wasMonitoringPaused = false;
    }
  }

  /**
   * Temporarily pause all active automation (can be resumed)
   * @returns {string[]} List of plugins that were paused
   */
  pauseAll() {
    const paused = [];

    // Pause state machine monitoring first to prevent interruptions
    this.pauseStateMachineMonitoring();

    for (const pluginName of this.getAutomationPlugins()) {
      const plugin = this.pluginLoader?.getPlugin(pluginName);
      if (plugin && plugin.isFarming) {
        plugin.stopFarming();
        this.pausedPlugins.set(pluginName, true);
        paused.push(pluginName);
        logger.info(`Paused ${pluginName}`);
      }
    }

    // Stop navigation
    const navigation = this.pluginLoader?.getPlugin('Navigation');
    if (navigation) {
      navigation.stop(true);
    }

    // Clear pathfinder goals
    this.bot.pathfinder?.setGoal(null);

    return paused;
  }

  /**
   * Resume all previously paused automation plugins
   */
  async resumeAll() {
    // Resume state machine monitoring first
    this.resumeStateMachineMonitoring();

    for (const [pluginName] of this.pausedPlugins) {
      const plugin = this.pluginLoader?.getPlugin(pluginName);
      if (plugin && typeof plugin.startFarming === 'function') {
        try {
          await plugin.startFarming();
          logger.info(`Resumed ${pluginName}`);
        } catch (error) {
          logger.error(`Failed to resume ${pluginName}`, error);
        }
      }
    }
    this.pausedPlugins.clear();
  }

  /**
   * Permanently stop all automation (won't auto-resume)
   */
  stopAll() {
    // Note: Don't pause state machine monitoring for permanent stop
    // as it handles survival behaviors like eating/combat

    for (const pluginName of this.getAutomationPlugins()) {
      const plugin = this.pluginLoader?.getPlugin(pluginName);
      if (plugin && plugin.isFarming) {
        plugin.stopFarming();
        logger.info(`Stopped ${pluginName}`);
      }
    }

    // Stop navigation
    const navigation = this.pluginLoader?.getPlugin('Navigation');
    if (navigation) {
      navigation.stop(true);
    }

    // Clear pathfinder goals
    this.bot.pathfinder?.setGoal(null);

    // Clear paused list since this is permanent
    this.pausedPlugins.clear();
    this.wasMonitoringPaused = false;
  }

  /**
   * Check if any automation is currently active
   */
  isAnyActive() {
    for (const pluginName of this.getAutomationPlugins()) {
      const plugin = this.pluginLoader?.getPlugin(pluginName);
      if (plugin && plugin.isFarming) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if any plugins are paused (waiting to resume)
   */
  hasPausedPlugins() {
    return this.pausedPlugins.size > 0;
  }
}

export default AutomationControl;
