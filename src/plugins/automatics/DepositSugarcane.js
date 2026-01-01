import IPlugin from '../../interfaces/IPlugin.js';
import logger from '../../utils/Logger.js';
import minecraftData from 'minecraft-data';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Vec3 } from 'vec3';
import { BehaviorIdle } from '../core/StateMachine.js';
import { getBotClient, sleep } from '../../utils/helpers/asyncHelpers.js';
import { loadChestArea } from '../../utils/helpers/waypointsHelper.js';

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
    this.isFarming = false; // Compatibility with AutomationControl
    this.threshold = config.threshold ?? 64; // default stack
    this.mcData = null;
    this.fullChests = new Set(); // Track full chests
    this.fullChestsResetInterval = null;
    this.lastFullChestTime = 0; // Track when chests were last seen as full
    this.cooldownDuration = 0;
  }

  async load() {
    try {
      // Increase listener limit to avoid MaxListeners warnings during collect operations
      if (typeof this.bot.setMaxListeners === 'function') {
        this.bot.setMaxListeners(50);
      }
      const botClient = await getBotClient();
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

      // Reset full chests list every 2 minutes (in case they get emptied)
      this.fullChestsResetInterval = setInterval(() => {
        if (this.fullChests.size > 0) {
          logger.debug(`Resetting ${this.fullChests.size} full chest markers`);
          this.fullChests.clear();
        }
      }, 120000);

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
    if (this.fullChestsResetInterval) {
      clearInterval(this.fullChestsResetInterval);
      this.fullChestsResetInterval = null;
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

  async startFarming() {
    this.isFarming = true;
    // The routine is normally handled by the 4s interval, 
    // but we can trigger an immediate check if we want.
    this.monitorAndDeposit().catch(err => logger.debug(`Deposit startFarming error: ${err.message}`));
  }

  stopFarming() {
    this.isFarming = false;
    this.isBusyDepositing = false;
    if (this.bot.memory) this.bot.memory.isDepositing = false;
    logger.info('DepositSugarcane routine stopped/paused');
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

    // Check if we are in a "all chests full" cooldown period (5-10 mins)
    if (!force && this.lastFullChestTime > 0) {
      if (Date.now() - this.lastFullChestTime < this.cooldownDuration) {
        return;
      }
    }

    const count = this.getSugarcaneCount();
    if (!force && count < this.threshold) return;

    // Resolve chest area from waypoints
    const chestArea = loadChestArea('sugarcane_chest_area');
    if (!chestArea) {
      logger.warn('No sugarcane_chest_area.area_radius defined in waypoints.json');
      return;
    }

    try {
      this.isBusyDepositing = true;
      this.isFarming = true;
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
      await sleep(800);

      // Loop deposit until inventory goes below threshold
      let noChestAttempts = 0;
      while (this.isFarming && this.getSugarcaneCount() >= (this.threshold || 64)) {
        // Ensure we are inside the chest area before scanning (no aborting)
        await this.ensureInChestArea(chestArea.center, chestArea.radius || 5);
        if (!this.isFarming) break;

        // Find a nearby chest within radius (excluding full ones)
        const chestBlock = this.findNearestChest(chestArea.center, chestArea.radius);
        if (!chestBlock) {
          noChestAttempts++;
          if (noChestAttempts >= 3) {
            const minutes = Math.floor(Math.random() * 6) + 5; // 5 to 10 minutes
            logger.warn(`No available chests found after 3 attempts. All chests may be full. Pausing deposit for ${minutes} minutes.`);
            this.fullChests.clear();
            this.lastFullChestTime = Date.now() - (1000 * 60 * 7.5) + (1000 * 60 * minutes); // Adjust to desired random minutes
            // Re-calculating to be more direct:
            this.lastFullChestTime = Date.now();
            this.cooldownDuration = 1000 * 60 * minutes;
            break; // Exit the while loop to resume farming
          } else {
            logger.warn('No available chest found in chest area, retrying...');
          }
          await sleep(1000);
          continue;
        }

        const countBefore = this.getSugarcaneCount();
        const chestKey = `${chestBlock.position.x},${chestBlock.position.y},${chestBlock.position.z}`;
        const depositedAny = await this.depositToChest(chestBlock);
        const countAfter = this.getSugarcaneCount();
        
        // Check if deposit was successful
        if (!depositedAny || (countBefore === countAfter && countAfter > 0)) {
          // No items were deposited, chest is full
          this.fullChests.add(chestKey);
          logger.warn(`Chest at ${chestKey} is full, marking and finding another chest`);
          continue; // Skip to next iteration to find another chest
        }
        
        if (countAfter < countBefore) {
          // Successfully deposited items, reset counter
          noChestAttempts = 0;
          this.lastFullChestTime = 0; // Reset cooldown on success
          logger.debug(`Successfully deposited ${countBefore - countAfter} sugarcane`);
        }
        
        await sleep(300);
      }

      // Resume farming only after inventory is below threshold
      if (shouldResume && this.sugarPlugin && typeof this.sugarPlugin.startFarming === 'function') {
        await this.sugarPlugin.startFarming();
      }
    } catch (err) {
      logger.error('Deposit routine error', err);
    } finally {
      this.isBusyDepositing = false;
      this.isFarming = false;
      if (this.bot.memory) this.bot.memory.isDepositing = false;
      if (this.bot.stateMachine) {
        this.bot.stateMachine.setState('idle', true);
      }
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
        // Skip chests marked as full
        const chestKey = `${block.position.x},${block.position.y},${block.position.z}`;
        if (this.fullChests.has(chestKey)) {
          continue;
        }
        
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
    while (this.isFarming && attempts < 20) { // Safety limit instead of true
      const dist = this.bot.entity.position.distanceTo(new Vec3(center.x, center.y, center.z));
      if (dist <= radius + 1) return; // reached area
      attempts++;

      // Temporarily switch to idle to allow navigation
      const wasDepositing = this.bot.stateMachine?.getState() === 'depositing';
      if (wasDepositing) {
        this.bot.stateMachine.setState('idle', true);
      }

      // Refresh navigation
      if (!this.navigation) this.navigation = this.pluginLoader.getPlugin('Navigation');

      try {
        if (this.navigation && typeof this.navigation.gotoCoords === 'function') {
          await this.navigation.gotoCoords(center.x, center.y, center.z, true);
        } else {
          throw new Error('Navigation plugin not available');
        }
      } catch (e) {
        if (!this.isFarming) return;
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
          await sleep(3000);
          this.bot.pathfinder.setGoal(null);
        } catch (pfErr) {
          logger.warn(`ensureInChestArea fallback failed: ${pfErr.message}`);
        }
      }

      // Switch back to depositing
      if (wasDepositing) {
        this.bot.stateMachine.setState('depositing', true);
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
          await sleep(1200);
          this.bot.pathfinder.setGoal(null);
        } catch (e) {
          // Ignore nudge errors
        }
        attempts = 0; // reset attempts after nudge
      }
      await sleep(500);
    }
  }

  async depositToChest(chestBlock) {
    // Temporarily switch to idle to allow navigation
    const wasDepositing = this.bot.stateMachine?.getState() === 'depositing';
    if (wasDepositing) {
      this.bot.stateMachine.setState('idle', true);
    }

    // Move close to chest first
    try {
      if (this.navigation && typeof this.navigation.gotoCoords === 'function') {
        await this.navigation.gotoCoords(chestBlock.position.x, chestBlock.position.y, chestBlock.position.z, true);
      }
    } catch (e) {
      logger.debug(`Navigation to chest failed: ${e.message}`);
    }

    if (!this.isFarming) return;

    // Switch back to depositing
    if (wasDepositing) {
      this.bot.stateMachine.setState('depositing', true);
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
    let depositedAny = false;
    try {
      const sugarItem = this.mcData.itemsByName['sugar_cane'];
      if (!sugarItem) return depositedAny;

      const countBeforeDeposit = this.getSugarcaneCount();
      
      // Check if chest has space by examining container slots
      const containerSlots = container.slots || container.containerSlots();
      const emptySlots = containerSlots.filter(slot => slot === null).length;
      
      if (emptySlots === 0) {
        // Check if any existing stacks can accept more items
        const sugarStacks = containerSlots.filter(slot => slot && slot.type === sugarItem.id);
        const hasStackSpace = sugarStacks.some(slot => slot.count < (slot.stackSize || 64));
        
        if (!hasStackSpace) {
          logger.warn('Chest is completely full, no space for sugarcane');
          try { await container.close(); } catch (e) { /* ignore */ }
          return false; // Explicitly return false to indicate chest is full
        }
      }

      // Try fast path: use container.deposit per stack
      const depositAllStacks = async () => {
        // Copy slots list to avoid mutation issues during transfer
        const stacks = this.bot.inventory.items().filter(i => i.type === sugarItem.id);
        for (const stack of stacks) {
          if (!this.isFarming) break;
          const countBefore = this.getSugarcaneCount();
          try {
            if (typeof container.deposit === 'function') {
              await container.deposit(stack.type, null, stack.count);
            } else {
              // Fallback: quick move this slot
              await this.safeQuickMove(stack.slot);
            }
            await sleep(100);
            
            // Check if anything was actually deposited
            const countAfter = this.getSugarcaneCount();
            if (countAfter < countBefore) {
              depositedAny = true;
            } else {
              // Nothing deposited, chest might be full
              logger.debug('No items deposited in this attempt, chest may be full');
              break;
            }
          } catch (innerErr) {
            // If deposit API failed (direction mismatch), fallback to quick move
            await this.safeQuickMove(stack.slot);
            await sleep(100);
          }
        }
      };

      // Execute deposit attempts until inventory has no sugar cane or chest is full
      let safety = 0;
      let noProgressCount = 0;
      while (this.isFarming && this.getSugarcaneCount() > 0 && safety < 10) {
        const beforeAttempt = this.getSugarcaneCount();
        await depositAllStacks();
        await sleep(150);
        const afterAttempt = this.getSugarcaneCount();
        
        // If no progress was made, chest is likely full
        if (beforeAttempt === afterAttempt) {
          noProgressCount++;
          if (noProgressCount >= 2) {
            logger.warn('No progress after 2 attempts, chest appears full');
            depositedAny = false; // Mark as failed deposit
            break;
          }
        } else {
          noProgressCount = 0;
          depositedAny = true;
        }
        
        safety++;
      }
      
      const countAfterDeposit = this.getSugarcaneCount();
      if (countAfterDeposit < countBeforeDeposit) {
        depositedAny = true;
        logger.info(`Deposited ${countBeforeDeposit - countAfterDeposit} sugarcane to chest`);
      }
    } catch (e) {
      logger.error('Failed while depositing sugarcane', e);
    } finally {
      try { await container.close(); } catch (e) { /* ignore */ }
    }
    
    return depositedAny;
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

  getStatus() {
    return {
      ...super.getStatus(),
      threshold: this.threshold,
      isBusyDepositing: this.isBusyDepositing
    };
  }
}

export default DepositSugarcane;
