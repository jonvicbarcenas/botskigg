import IPlugin from '../../interfaces/IPlugin.js';
import logger from '../../utils/Logger.js';
import ChatParser from '../../utils/ChatParser.js';
import minecraftData from 'minecraft-data';
import { BehaviorIdle } from '../core/StateMachine.js';
import { getBotClient, sleep } from '../../utils/helpers/asyncHelpers.js';

class AutoEat extends IPlugin {
  constructor(bot, config = {}) {
    super('AutoEat', bot, config);
    this.pluginLoader = null;
    this.navigation = null;
    this.sugarPlugin = null;
    this.interval = null;
    this.isEating = false;
    this.threshold = config.threshold ?? 14; // start eating if food < 14 (7 shanks)
    this.healthPanic = config.healthPanic ?? 10; // if health is low, eat too
    this.mcData = null;
    this.foodPriority = [
      'golden_carrot',
      'cooked_beef',
      'cooked_porkchop',
      'cooked_mutton',
      'cooked_chicken',
      'cooked_rabbit',
      'baked_potato',
      'bread',
      'pumpkin_pie',
      'beetroot_soup',
      'mushroom_stew',
      'rabbit_stew',
      'carrot',
      'sweet_berries',
      'apple'
    ];
    // Broad edible whitelist (covers most versions)
    this.edible = new Set([
      'apple', 'golden_apple', 'enchanted_golden_apple', 'golden_carrot', 'carrot', 'potato', 'baked_potato', 'beetroot', 'beetroot_soup', 'bread', 'cake', 'cookie', 'pumpkin_pie',
      'mushroom_stew', 'rabbit_stew', 'suspicious_stew', 'chorus_fruit',
      'dried_kelp', 'sweet_berries', 'glow_berries',
      'cooked_beef', 'beef', 'cooked_porkchop', 'porkchop', 'cooked_mutton', 'mutton', 'cooked_chicken', 'chicken', 'cooked_rabbit', 'rabbit',
      'cooked_cod', 'cod', 'cooked_salmon', 'salmon', 'tropical_fish', 'pufferfish'
    ]);
    this.blacklist = new Set([
      'rotten_flesh',
      'spider_eye',
      'pufferfish',
      'poisonous_potato',
      'raw_chicken' // can cause hunger
    ]);
  }

  async load() {
    try {
      const botClient = await getBotClient();
      this.pluginLoader = botClient.getPluginLoader();

      this.navigation = this.pluginLoader.getPlugin('Navigation');
      this.sugarPlugin = this.pluginLoader.getPlugin('SugarcaneFarm');
      this.mcData = minecraftData(this.bot.version);

      // Ensure 'eating' state exists for observability
      const sm = this.bot.stateMachine;
      if (sm && !sm.getBehavior('eating')) {
        const eatingBehavior = new BehaviorIdle();
        eatingBehavior.stateName = 'eating';
        sm.addBehavior('eating', eatingBehavior);
        sm.createTransition({
          parent: 'idle', child: 'eating', name: 'idle_to_eating', shouldTransition: () => false,
          onTransition: () => logger.debug('Transitioning from idle to eating')
        });
        sm.createTransition({
          parent: 'eating', child: 'idle', name: 'eating_to_idle', shouldTransition: () => !this.isEating,
          onTransition: () => logger.debug('Transitioning from eating to idle')
        });
      }

      // Monitor every 2s
      this.interval = setInterval(() => {
        this.checkAndEat().catch(err => logger.debug(`AutoEat error: ${err.message}`));
      }, 2000);

      this.registerEvent('chat', this.handleChat.bind(this));

      this.isLoaded = true;
      logger.success('AutoEat plugin loaded');
    } catch (err) {
      logger.error('Failed to load AutoEat plugin', err);
      throw err;
    }
  }

  async unload() {
    if (this.interval) clearInterval(this.interval);
    this.unregisterAllEvents();
    this.isLoaded = false;
  }

  async handleChat(username, message) {
    if (username === this.bot.username) return;
    
    const parsed = ChatParser.parseCommand(message, this.bot.config.behavior?.chatCommandPrefix || '!');
    if (!parsed || parsed.command !== 'eat') return;

    logger.debug(`AutoEat received command: ${parsed.command} ${parsed.args.join(' ')} from ${username}`);
    
    const subCommand = parsed.args[0];

    if (subCommand === 'now') {
      await this.checkAndEat(true);
    } else if (subCommand === 'threshold') {
      const val = parseInt(parsed.args[1]);
      if (!isNaN(val) && val >= 0 && val <= 20) {
        this.threshold = val;
        this.bot.chat(`Eat threshold set to ${val}`);
      } else {
        this.bot.chat('Usage: !eat threshold <0-20>');
      }
    }
  }

  needsFood() {
    if (this.bot.memory?.isDepositing) return false; // don't eat during deposit
    const hungry = this.bot.food !== undefined ? this.bot.food < this.threshold : false;
    const lowHealth = this.bot.health !== undefined ? this.bot.health < this.healthPanic : false;
    return hungry || lowHealth;
  }

  pickFoodItem() {
    if (!this.mcData) return null;
    const inv = this.bot.inventory.items();
    // Map of name to item id
    const byName = this.mcData.itemsByName;

    // build priority list of items present
    for (const name of this.foodPriority) {
      const itemDef = byName[name];
      if (!itemDef) continue;
      const stack = inv.find(i => i.type === itemDef.id);
      if (stack) return stack;
    }
    // fallback: any food item that's edible by name and not blacklisted
    for (const it of inv) {
      const def = this.mcData.items[it.type];
      const name = def?.name;
      if (!name) continue;
      if (this.blacklist.has(name)) continue;
      if (def.food || this.edible.has(name)) return it;
    }
    return null;
  }

  async checkAndEat(force = false) {
    if (this.isEating) return;
    if (!force && !this.needsFood()) return;

    const food = this.pickFoodItem();
    if (!food) {
      // Only warn if we actually need food or it was forced
      logger.warn('No edible food found in inventory');
      return;
    }

    this.isEating = true;

    // Pause states similar to deposit
    const wasFarming = !!(this.sugarPlugin && this.sugarPlugin.isFarming);
    try {
      this.bot.memory = this.bot.memory || {};
      this.bot.memory.isEating = true;

      if (this.sugarPlugin && this.sugarPlugin.isFarming) {
        this.sugarPlugin.stopFarming();
      }
      if (this.navigation && typeof this.navigation.stop === 'function') {
        this.navigation.stop(true);
      }
      if (this.bot.stateMachine) {
        this.bot.stateMachine.setState('eating', true);
      }

      // Ensure not moving
      if (this.bot.pathfinder) {
        this.bot.pathfinder.setGoal(null);
      }

      // Equip and consume
      await this.bot.equip(food, 'hand');
      // small settle delay
      await sleep(200);
      await this.bot.consume();
      await sleep(200);

      logger.info(`Ate ${this.mcData.items[food.type]?.name || 'food'}`);
    } catch (err) {
      logger.error('AutoEat failed', err);
    } finally {
      this.isEating = false;
      if (this.bot.memory) this.bot.memory.isEating = false;
      if (this.bot.stateMachine) {
        this.bot.stateMachine.setState('idle', true);
      }
      // Resume farming if it was active prior
      if (wasFarming && this.sugarPlugin && typeof this.sugarPlugin.startFarming === 'function') {
        await this.sugarPlugin.startFarming();
      }
    }
  }

  getStatus() {
    return {
      ...super.getStatus(),
      isEating: this.isEating,
      threshold: this.threshold
    };
  }
}

export default AutoEat;
