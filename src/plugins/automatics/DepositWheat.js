import IPlugin from '../../interfaces/IPlugin.js';
import logger from '../../utils/Logger.js';
import minecraftData from 'minecraft-data';
import { Vec3 } from 'vec3';
import { BehaviorIdle } from '../core/StateMachine.js';
import ChatParser from '../../utils/ChatParser.js';
import AutomationControl from '../../utils/AutomationControl.js';

/**
 * DepositWheat Plugin - Automatically deposits wheat into a specific chest
 */
class DepositWheat extends IPlugin {
  constructor(bot, config = {}) {
    super('DepositWheat', bot, config);
    this.pluginLoader = null;
    this.navigation = null;
    this.automationControl = null;
    this.checkInterval = null;
    this.isBusyDepositing = false;
    this.threshold = config.threshold ?? 64;
    this.depositPos = config.depositPos ? new Vec3(config.depositPos.x, config.depositPos.y, config.depositPos.z) : new Vec3(67, 68, 39);
    this.mcData = null;
  }

  async load() {
    try {
      const BotClientModule = await import('../../core/BotClient.js');
      const BotClient = BotClientModule.default;
      const botClient = BotClient.getInstance();
      this.pluginLoader = botClient.getPluginLoader();

      this.navigation = this.pluginLoader.getPlugin('Navigation');
      this.automationControl = new AutomationControl(this.pluginLoader, this.bot);
      this.mcData = minecraftData(this.bot.version);

      // Register behaviors if state machine is available
      const sm = this.bot.stateMachine;
      if (sm && !sm.getBehavior('depositing_wheat')) {
        const depositingBehavior = new BehaviorIdle();
        depositingBehavior.stateName = 'depositing_wheat';
        sm.addBehavior('depositing_wheat', depositingBehavior);
        
        sm.createTransition({
          parent: 'idle',
          child: 'depositing_wheat',
          name: 'idle_to_depositing_wheat',
          shouldTransition: () => false,
          onTransition: () => logger.debug('Transitioning to wheat deposit')
        });
        
        sm.createTransition({
          parent: 'depositing_wheat',
          child: 'idle',
          name: 'depositing_wheat_to_idle',
          shouldTransition: () => !this.isBusyDepositing,
          onTransition: () => logger.debug('Finished wheat deposit')
        });
      }

      // Check every 10 seconds
      this.checkInterval = setInterval(() => {
        this.monitorAndDeposit().catch(err => logger.debug(`Wheat deposit error: ${err.message}`));
      }, 10000);

      this.registerEvent('chat', this.handleChat.bind(this));

      this.isLoaded = true;
      logger.success('DepositWheat plugin loaded');
    } catch (err) {
      logger.error('Failed to load DepositWheat plugin', err);
      throw err;
    }
  }

  async unload() {
    if (this.checkInterval) clearInterval(this.checkInterval);
    this.unregisterAllEvents();
    this.isLoaded = false;
  }

  async handleChat(username, message) {
    if (username === this.bot.username) return;
    
    const parsed = ChatParser.parseCommand(message, this.bot.config.behavior?.chatCommandPrefix || '!');
    if (!parsed || parsed.command !== 'deposit_wheat') return;

    if (parsed.args[0] === 'now') {
      await this.monitorAndDeposit(true);
    } else if (parsed.args[0] === 'pos' && parsed.args.length >= 4) {
      const x = parseInt(parsed.args[1]);
      const y = parseInt(parsed.args[2]);
      const z = parseInt(parsed.args[3]);
      if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
        this.depositPos = new Vec3(x, y, z);
        this.bot.chat(`Wheat deposit position set to ${x}, ${y}, ${z}`);
      }
    }
  }

  getWheatCount() {
    if (!this.mcData) return 0;
    const wheatItem = this.mcData.itemsByName['wheat'];
    if (!wheatItem) return 0;
    return this.bot.inventory.items()
      .filter(i => i.type === wheatItem.id)
      .reduce((sum, i) => sum + i.count, 0);
  }

  async monitorAndDeposit(force = false) {
    if (this.isBusyDepositing) return;

    const count = this.getWheatCount();
    if (!force && count < this.threshold) return;

    logger.info(`Wheat threshold reached (${count}/${this.threshold}). Starting deposit...`);

    try {
      this.isBusyDepositing = true;
      this.bot.memory = this.bot.memory || {};
      this.bot.memory.isDepositing = true;

      // Pause all active automation
      this.automationControl.pauseAll();

      if (this.bot.stateMachine) {
        this.bot.stateMachine.setState('depositing_wheat', true);
      }

      // Move to chest
      if (this.navigation) {
        await this.navigation.gotoCoords(this.depositPos.x, this.depositPos.y, this.depositPos.z, true);
      }

      const chestBlock = this.bot.blockAt(this.depositPos);
      if (chestBlock && (chestBlock.name === 'chest' || chestBlock.name === 'barrel' || chestBlock.name === 'trapped_chest')) {
        await this.depositToChest(chestBlock);
      } else {
        logger.warn(`No chest found at wheat deposit position ${this.depositPos}`);
      }

      // Resume previously active automation
      await this.automationControl.resumeAll();

    } catch (err) {
      logger.error('Wheat deposit failed', err);
    } finally {
      this.isBusyDepositing = false;
      this.bot.memory.isDepositing = false;
      if (this.bot.stateMachine) {
        this.bot.stateMachine.setState('idle', true);
      }
    }
  }

  async depositToChest(chestBlock) {
    let container = null;
    try {
      container = await this.bot.openContainer(chestBlock);
      const wheatItem = this.mcData.itemsByName['wheat'];
      const stacks = this.bot.inventory.items().filter(i => i.type === wheatItem.id);
      
      for (const stack of stacks) {
        await container.deposit(stack.type, null, stack.count);
        await new Promise(r => setTimeout(r, 200));
      }
      logger.success('Wheat deposited successfully');
    } catch (err) {
      logger.error('Error during wheat deposit', err);
    } finally {
      if (container) await container.close();
    }
  }
}

export default DepositWheat;

  async depositToChest(chestBlock) {
    let container = null;
    try {
      container = await this.bot.openContainer(chestBlock);
      const wheatItem = this.mcData.itemsByName['wheat'];
      const stacks = this.bot.inventory.items().filter(i => i.type === wheatItem.id);
      
      for (const stack of stacks) {
        await container.deposit(stack.type, null, stack.count);
        await new Promise(r => setTimeout(r, 200));
      }
      logger.success('Wheat deposited successfully');
    } catch (err) {
      logger.error('Error during wheat deposit', err);
    } finally {
      if (container) await container.close();
    }
  }
}

export default DepositWheat;
