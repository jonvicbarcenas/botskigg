import IPlugin from '../../interfaces/IPlugin.js';
import logger from '../../utils/Logger.js';
import mineflayerStateMachine from 'mineflayer-statemachine';

const { BehaviorIdle } = mineflayerStateMachine;

/**
 * BaseBehaviorPlugin - Base class for plugins that use the State Machine
 */
class BaseBehaviorPlugin extends IPlugin {
  constructor(name, bot, config = {}) {
    super(name, bot, config);
    this.stateMachine = null;
    this.behaviors = new Map();
  }

  async load() {
    this.stateMachine = this.bot.stateMachine;
    if (!this.stateMachine) {
      logger.warn(`${this.name}: StateMachine plugin not found. Behaviors will not be registered.`);
      return;
    }
    await this.onLoad();
    this.isLoaded = true;
    logger.success(`${this.name} plugin loaded`);
  }

  async onLoad() {
    // To be implemented by subclasses
  }

  async unload() {
    this.unregisterAllEvents();
    this.isLoaded = false;
    logger.info(`${this.name} plugin unloaded`);
  }

  registerBehavior(name, behaviorClass = BehaviorIdle, onEnter = null, onExit = null) {
    if (!this.stateMachine) return;

    const behavior = new behaviorClass();
    behavior.stateName = name;
    
    if (onEnter) behavior.onStateEntered = onEnter.bind(this);
    if (onExit) behavior.onStateExited = onExit.bind(this);
    
    this.stateMachine.addBehavior(name, behavior);
    this.behaviors.set(name, behavior);
    logger.debug(`${this.name}: Registered behavior '${name}'`);
    return behavior;
  }

  createTransition(parentState, childState, shouldTransitionFn, name = null) {
    if (!this.stateMachine) return;

    this.stateMachine.createTransition({
      parent: parentState,
      child: childState,
      name: name || `${parentState}_to_${childState}`,
      shouldTransition: shouldTransitionFn.bind(this),
      onTransition: () => logger.debug(`${this.name}: Transitioning ${parentState} -> ${childState}`)
    });
  }

  setState(stateName) {
    if (this.stateMachine) {
      this.stateMachine.setState(stateName);
    }
  }

  getState() {
    return this.stateMachine ? this.stateMachine.getState() : null;
  }
}

export default BaseBehaviorPlugin;
