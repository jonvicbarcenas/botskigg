import IPlugin from '../../interfaces/IPlugin.js';
import logger from '../../utils/Logger.js';
import minecraftData from 'minecraft-data';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Vec3 } from 'vec3';
import { BehaviorIdle } from '../core/StateMachine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DepositSugarcane extends IPlugin {
  constructor(bot, config = {}) {
    super('DepositSugarcane', bot, config);
    this.pluginLoader = null;
    this.navigation = null;
    this.sugarPlugin = null;
    this.checkInterval = null;
    this.isBusyDepositing = false;
    this.threshold = config.threshold ?? 64; // default stack
    this.mcData = null;
  }

  async load() {
    try {
      // Increase listener limit to avoid MaxListeners warnings during collect operations
      if (typeof this.bot.setMaxListeners === 'function') {
        this.bot.setMaxListeners(50);
      }
      const BotClientModule = await import('../../core/BotClient.js');
      const BotClient = BotClientModule.default;
      const botClient = BotClient.getInstance();
      this.pluginLoader = botClient.getPluginLoader();

      this.navigation = this.pluginLoader.getPlugin('Navigation');
      this.sugarPlugin = this.pluginLoader.getPlugin('SugarcaneFarm');
      this.mcData = minecraftData(this.bot.version);

      // Ensure 'depositing' state exists for observability
      const sm = this.bot.stateMachine;
      if (sm && !sm.getBehavior('depositing')) {
        const depositingBehavior = new BehaviorIdle();
        depositingBehavior.stateName = 'depositing';
        sm.addBehavior('depositing', depositingBehavior);
        // create transitions idle <-> depositing
        sm.createTransition({
          parent: 'idle',
          child: 'depositing',
          name: 'idle_to_depositing',
          shouldTransition: () => false,
          onTransition: () => logger.debug('Transitioning from idle to depositing')
        });
        sm.createTransition({
          parent: 'depositing',
          child: 'idle',
          name: 'depositing_to_idle',
          shouldTransition: () => !this.isBusyDepositing,
          onTransition: () => logger.debug('Transitioning from depositing to idle')
        });
      }

      // Start monitoring every 4 seconds
      this.checkInterval = setInterval(() => {
        this.monitorAndDeposit().catch(err => logger.debug(`Deposit monitor error: ${err.message}`));
      }, 4000);

      // Optional chat command
      this.registerEvent('chat', this.handleChat.bind(this));

      this.isLoaded = true;
      logger.success('DepositSugarcane plugin loaded');
    } catch (err) {
      logger.error('Failed to load DepositSugarcane plugin', err);
      throw err;
    }
  }

  async unload() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.unregisterAllEvents();
    this.isLoaded = false;
    logger.info('DepositSugarcane plugin unloaded');
  }

  async handleChat(username, message) {
    if (username === this.bot.username) return;
    if (message === '!deposit now') {
      await this.monitorAndDeposit(true);
    }
  }

  getSugarcaneCount() {
    if (!this.mcData) return 0;
    const sugarItem = this.mcData.itemsByName['sugar_cane'];
    if (!sugarItem) return 0;
    const items = this.bot.inventory.items();
    return items.filter(i => i.type === sugarItem.id).reduce((sum, i) => sum + i.count, 0);
  }

  async monitorAndDeposit(force = false) {
    if (this.isBusyDepositing) return; // prevent reentry

    const count = this.getSugarcaneCount();
    if (!force && count < this.threshold) return;

    // Resolve chest area from waypoints
    const chestArea = this.loadChestArea();
    if (!chestArea) {
      logger.warn('No sugarcane_chest_area.area_radius defined in waypoints.json');
      return;
    }

    try {
      this.isBusyDepositing = true;
      // Flag global deposit mode so other systems can back off
      this.bot.memory = this.bot.memory || {};
      this.bot.memory.isDepositing = true;

      // Pause farming if active and stop navigation
      let shouldResume = false;
      if (this.sugarPlugin && this.sugarPlugin.isFarming) {
        shouldResume = true;
        this.sugarPlugin.stopFarming();
      }
      if (this.navigation && typeof this.navigation.stop === 'function') {
        this.navigation.stop(true); // silent stop
      }
      if (this.bot.stateMachine) {
        // Switch to depositing state for observability
        this.bot.stateMachine.setState('depositing', true);
      }
      // wait a bit to ensure loops stop
      await this.sleep(800);

      // Loop deposit until inventory goes below threshold
      while (this.getSugarcaneCount() >= (this.threshold || 64)) {
        // Ensure we are inside the chest area before scanning (no aborting)
        await this.ensureInChestArea(chestArea.center, chestArea.radius || 5);

        // Find a nearby chest within radius
        const chestBlock = this.findNearestChest(chestArea.center, chestArea.radius);
        if (!chestBlock) {
          logger.warn('No chest found in chest area, retrying...');
          await this.sleep(1000);
          continue;
        }

        await this.depositToChest(chestBlock);
        await this.sleep(300);
      }

      // Resume farming only after inventory is below threshold
      if (shouldResume && this.sugarPlugin && typeof this.sugarPlugin.startFarming === 'function') {
        await this.sugarPlugin.startFarming();
      }
    } catch (err) {
      logger.error('Deposit routine error', err);
    } finally {
      this.isBusyDepositing = false;
      if (this.bot.memory) this.bot.memory.isDepositing = false;
      if (this.bot.stateMachine) {
        this.bot.stateMachine.setState('idle', true);
      }
    }
  }

  loadChestArea() {
    try {
      const waypointsPath = path.join(__dirname, '../../../data/waypoints.json');
      const data = JSON.parse(fs.readFileSync(waypointsPath, 'utf8'));
      const ar = data.areas?.sugarcane_chest_area?.area_radius;
      if (!ar) return null;
      return { center: { x: ar.x, y: ar.y, z: ar.z }, radius: ar.radius ?? 10 };
    } catch (e) {
      logger.error('Failed to read waypoints.json for chest area', e);
      return null;
    }
  }

  findNearestChest(center, radius) {
    const chestId = this.bot.registry.blocksByName?.chest?.id;
    const trappedChestId = this.bot.registry.blocksByName?.trapped_chest?.id;
    const barrelId = this.bot.registry.blocksByName?.barrel?.id;

    // Scan cube around center
    const positions = [];
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -radius; dz <= radius; dz++) {
          positions.push({ x: center.x + dx, y: center.y + dy, z: center.z + dz });
        }
      }
    }

    let best = null;
    let bestDist = Infinity;
    for (const pos of positions) {
      const v = new Vec3(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z));
      const block = this.bot.blockAt(v);
      if (!block) continue;
      if (block.type === chestId || block.type === trappedChestId || block.type === barrelId) {
        const dist = this.bot.entity.position.distanceTo(block.position);
        if (dist < bestDist) {
          best = block;
          bestDist = dist;
        }
      }
    }
    return best;
  }

  async ensureInChestArea(center, radius) {
    // Keep trying until within radius + 1
    let attempts = 0;
    while (true) {
      const dist = this.bot.entity.position.distanceTo(new Vec3(center.x, center.y, center.z));
      if (dist <= radius + 1) return; // reached area
      attempts++;

      // Refresh navigation
      if (!this.navigation) this.navigation = this.pluginLoader.getPlugin('Navigation');

      try {
        if (this.navigation && typeof this.navigation.gotoCoords === 'function') {
          await this.navigation.gotoCoords(center.x, center.y, center.z, true);
        } else {
          throw new Error('Navigation plugin not available');
        }
      } catch (e) {
        // Fallback using pathfinder goal
        try {
          const pfMod = await import('mineflayer-pathfinder');
          const mp = pfMod.default || pfMod;
          if (!this.bot.pathfinder) {
            const { default: PathfinderUtil } = await import('../../utils/Pathfinder.js');
            const pf = new PathfinderUtil(this.bot, {});
            pf.initialize();
          }
          const goal = new mp.goals.GoalNear(center.x, center.y, center.z, Math.max(2, Math.min(5, radius)));
          this.bot.pathfinder.setGoal(goal);
          await this.sleep(3000);
          this.bot.pathfinder.setGoal(null);
        } catch (pfErr) {
          logger.warn(`ensureInChestArea fallback failed: ${pfErr.message}`);
        }
      }

      if (attempts > 5) {
        // small random nudge to escape stuck situations
        const pos = this.bot.entity.position;
        const nudge = new Vec3(pos.x + (Math.random() - 0.5) * 2, pos.y, pos.z + (Math.random() - 0.5) * 2);
        try {
          const pfMod = await import('mineflayer-pathfinder');
          const mp = pfMod.default || pfMod;
          const goal = new mp.goals.GoalNear(nudge.x, nudge.y, nudge.z, 1);
          this.bot.pathfinder.setGoal(goal);
          await this.sleep(1200);
          this.bot.pathfinder.setGoal(null);
        } catch {}
        attempts = 0; // reset attempts after nudge
      }
      await this.sleep(500);
    }
  }

  async depositToChest(chestBlock) {
    // Move close to chest first
    try {
      if (this.navigation && typeof this.navigation.gotoCoords === 'function') {
        await this.navigation.gotoCoords(chestBlock.position.x, chestBlock.position.y, chestBlock.position.z, true);
      }
    } catch (e) {
      logger.debug(`Navigation to chest failed: ${e.message}`);
    }

    // Open container
    let container = null;
    try {
      if (typeof this.bot.openContainer === 'function') {
        container = await this.bot.openContainer(chestBlock);
      } else if (typeof this.bot.openChest === 'function') {
        container = await this.bot.openChest(chestBlock);
      } else {
        throw new Error('No openContainer/openChest API available');
      }
    } catch (e) {
      logger.error('Failed to open chest', e);
      return;
    }

    // Deposit all sugarcane (all stacks) robustly
    try {
      const sugarItem = this.mcData.itemsByName['sugar_cane'];
      if (!sugarItem) return;

      // Try fast path: use container.deposit per stack
      const depositAllStacks = async () => {
        // Copy slots list to avoid mutation issues during transfer
        const stacks = this.bot.inventory.items().filter(i => i.type === sugarItem.id);
        for (const stack of stacks) {
          try {
            if (typeof container.deposit === 'function') {
              await container.deposit(stack.type, null, stack.count);
            } else {
              // Fallback: quick move this slot
              await this.safeQuickMove(stack.slot);
            }
            await this.sleep(100);
          } catch (innerErr) {
            // If deposit API failed (direction mismatch), fallback to quick move
            await this.safeQuickMove(stack.slot);
            await this.sleep(100);
          }
        }
      };

      // Execute deposit attempts until inventory has no sugar cane
      let safety = 0;
      while (this.getSugarcaneCount() > 0 && safety < 10) {
        await depositAllStacks();
        await this.sleep(150);
        safety++;
      }
    } catch (e) {
      logger.error('Failed while depositing sugarcane', e);
    } finally {
      try { await container.close(); } catch {}
    }
  }

  async safeQuickMove(slot) {
    try {
      if (this.bot.quickMoveSlot) {
        await this.bot.quickMoveSlot(slot);
      }
    } catch (e) {
      logger.debug(`quickMoveSlot failed: ${e.message}`);
    }
  }

  sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  getStatus() {
    return {
      ...super.getStatus(),
      threshold: this.threshold,
      isBusyDepositing: this.isBusyDepositing
    };
  }
}

export default DepositSugarcane;
