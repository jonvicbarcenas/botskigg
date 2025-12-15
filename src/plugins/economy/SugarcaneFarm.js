import IPlugin from '../../interfaces/IPlugin.js';
import logger from '../../utils/Logger.js';
import { BehaviorIdle } from '../core/StateMachine.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import minecraftData from 'minecraft-data';
import { plugin as collectBlock } from 'mineflayer-collectblock';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * SugarcaneFarm Plugin - Handles automated sugarcane farming
 */
class SugarcaneFarm extends IPlugin {
  constructor(bot, config = {}) {
    super('SugarcaneFarm', bot, config);
    this.isFarming = false;
    this.farmArea = null;
    this.farmInterval = null;
    this.harvestCount = 0;
    this.stateMachine = null;
    this.recentlyHarvested = new Map(); // Track recently harvested positions
    this.harvestCooldown = 5000; // 5 seconds cooldown per position
    this.pluginLoader = null; // Will be set during load
    this.pathfinder = null; // Will be set during load
  }

  async load() {
    try {
      // Load mineflayer-collectblock plugin
      if (!this.bot.collectBlock) {
        this.bot.loadPlugin(collectBlock);
        logger.info('Loaded mineflayer-collectblock plugin');
      }
      
      // Get pluginLoader reference from BotClient
      const BotClient = (await import('../../core/BotClient.js')).default;
      const botClient = BotClient.getInstance();
      this.pluginLoader = botClient.getPluginLoader();
      
      // Get pathfinder directly from the Navigation plugin's pathfinder utility
      const navigation = this.pluginLoader.getPlugin('Navigation');
      if (navigation && navigation.pathfinder) {
        this.pathfinder = navigation.pathfinder;
        logger.info('Pathfinder initialized for SugarcaneFarm');
      } else {
        logger.warn('Navigation plugin or pathfinder not available');
      }
      
      // Get StateMachine reference
      this.stateMachine = this.bot.stateMachine;
      
      // Load farm area from waypoints
      this.loadFarmArea();
      
      // Setup farming behaviors if state machine is available
      if (this.stateMachine) {
        this.setupBehaviors();
      }
      
      // Register chat commands
      this.registerEvent('chat', this.handleChat.bind(this));
      
      this.isLoaded = true;
      logger.success('SugarcaneFarm plugin loaded');
      
      // Auto-start farming if enabled in config
      if (this.config.autoStart !== false) {
        // Wait a bit for bot to fully initialize
        setTimeout(async () => {
          await this.startFarming();
          logger.info('Auto-started sugarcane farming');
        }, 3000);
      }
    } catch (error) {
      logger.error('Failed to load SugarcaneFarm plugin', error);
      throw error;
    }
  }

  /**
   * Load farm area from waypoints.json
   */
  loadFarmArea() {
    try {
      const waypointsPath = path.join(__dirname, '../../../data/waypoints.json');
      const data = JSON.parse(fs.readFileSync(waypointsPath, 'utf8'));
      
      if (data.areas && data.areas.sugarcane_farm) {
        this.farmArea = data.areas.sugarcane_farm;
        logger.info(`Loaded sugarcane farm area: ${JSON.stringify(this.farmArea)}`);
      } else {
        logger.warn('No sugarcane_farm area found in waypoints.json');
      }
    } catch (error) {
      logger.error('Failed to load farm area', error);
    }
  }

  /**
   * Setup state machine behaviors for sugarcane farming
   */
  setupBehaviors() {
    // Create farming_sugarcane behavior
    const farmingBehavior = new BehaviorIdle();
    farmingBehavior.stateName = 'farming_sugarcane';
    farmingBehavior.onStateEntered = () => {
      logger.debug('Entered farming_sugarcane state');
      this.isFarming = true;
    };
    farmingBehavior.onStateExited = () => {
      logger.debug('Exited farming_sugarcane state');
      this.isFarming = false;
    };
    this.stateMachine.addBehavior('farming_sugarcane', farmingBehavior);
    
    // Create transitions
    this.stateMachine.createTransition({
      parent: 'idle',
      child: 'farming_sugarcane',
      name: 'idle_to_farming_sugarcane',
      shouldTransition: () => false, // Manual transition
      onTransition: () => {
        logger.debug('Transitioning from idle to farming_sugarcane');
      }
    });
    
    this.stateMachine.createTransition({
      parent: 'farming_sugarcane',
      child: 'idle',
      name: 'farming_sugarcane_to_idle',
      shouldTransition: () => !this.isFarming,
      onTransition: () => {
        logger.debug('Transitioning from farming_sugarcane to idle');
      }
    });
    
    logger.info('Sugarcane farming behaviors and transitions registered');
  }

  async unload() {
    this.stopFarming();
    this.unregisterAllEvents();
    this.isLoaded = false;
    logger.info('SugarcaneFarm plugin unloaded');
  }

  async handleChat(username, message) {
    if (username === this.bot.username) return;
    
    if (message === '!sugarcane start') {
      await this.startFarming();
      this.bot.chat('Sugarcane farming started');
    } else if (message === '!sugarcane stop') {
      this.stopFarming();
      this.bot.chat('Sugarcane farming stopped');
    } else if (message === '!sugarcane status') {
      const status = `Farming: ${this.isFarming ? 'Active' : 'Inactive'}, Harvested: ${this.harvestCount}`;
      this.bot.chat(status);
    } else if (message === '!sugarcane area') {
      if (this.farmArea) {
        const center = this.getFarmCenter();
        this.bot.chat(`Farm center: ${center.x}, ${center.y}, ${center.z}`);
      } else {
        this.bot.chat('No farm area configured');
      }
    }
  }

  async startFarming() {
    if (this.isFarming) {
      logger.warn('Already farming sugarcane');
      return;
    }

    if (!this.farmArea) {
      logger.error('No farm area configured');
      this.bot.chat('No farm area configured in waypoints.json');
      return;
    }

    this.isFarming = true;
    this.harvestCount = 0;

    // Try to set state to farming_sugarcane
    if (this.stateMachine) {
      const success = this.stateMachine.setState('farming_sugarcane');
      if (!success) {
        logger.warn('Could not change to farming_sugarcane state, farming anyway');
      }
    }

    logger.info('Starting sugarcane farming...');
    
    // Move to farm center first
    const center = this.getFarmCenter();
    logger.info(`Moving to farm center: ${center.x}, ${center.y}, ${center.z}`);
    
    try {
      const navigation = this.pluginLoader.getPlugin('Navigation');
      if (navigation) {
        await navigation.gotoCoords(center.x, center.y, center.z, true); // Silent mode
      }
    } catch (error) {
      logger.error('Failed to navigate to farm center', error);
    }

    // Start farming loop
    this.farmInterval = setInterval(async () => {
      if (this.isFarming) {
        await this.farmCycle();
      }
    }, 3000); // Check every 3 seconds
  }

  stopFarming() {
    this.isFarming = false;
    
    if (this.farmInterval) {
      clearInterval(this.farmInterval);
      this.farmInterval = null;
    }
    
    // Return to idle state
    if (this.stateMachine) {
      this.stateMachine.setState('idle');
    }
    
    logger.info('Sugarcane farming stopped');
  }

  /**
   * Get center position of farm area
   */
  getFarmCenter() {
    if (!this.farmArea) return null;
    
    const { corner1, corner2 } = this.farmArea;
    return {
      x: Math.floor((corner1.x + corner2.x) / 2),
      y: corner1.y,
      z: Math.floor((corner1.z + corner2.z) / 2)
    };
  }

  /**
   * Main farming cycle
   */
  async farmCycle() {
    try {
      // If deposit routine is active, skip farming
      const deposit = this.bot.pluginLoader?.getPlugin('DepositSugarcane');
      if (deposit && deposit.isBusyDepositing) return;
      if (this.bot.memory?.isDepositing) return;
      
      // FIRST: Collect any existing drops before harvesting more
      await this.collectAllNearbyDrops();
      
      // Clean up old harvested positions
      this.cleanupHarvestedCache();
      
      // Find mature sugarcane using findBlock
      const matureSugarcane = await this.findMatureSugarcane();
      
      logger.info(`Farm cycle: Found ${matureSugarcane.length} mature sugarcane blocks to harvest`);
      
      if (matureSugarcane.length > 0) {
        // Process sugarcane one at a time
        for (const block of matureSugarcane.slice(0, 3)) { // Process 3 at a time
          if (!this.isFarming) break;
          
          await this.harvestSugarcane(block);
          await this.sleep(500); // Small delay between harvests
        }
      }
    } catch (error) {
      logger.error('Farm cycle error', error);
    }
  }

  /**
   * Find mature sugarcane blocks using bot.findBlock
   */
  async findMatureSugarcane() {
    if (!this.farmArea) return [];

    const { corner1, corner2 } = this.farmArea;
    
    // Calculate search boundaries
    const minX = Math.min(corner1.x, corner2.x);
    const maxX = Math.max(corner1.x, corner2.x);
    const minY = Math.min(corner1.y, corner2.y) - 1;
    const maxY = Math.max(corner1.y, corner2.y) + 3;
    const minZ = Math.min(corner1.z, corner2.z);
    const maxZ = Math.max(corner1.z, corner2.z);

    const matureSugarcane = [];
    const processedBases = new Set();

    // Find all sugarcane blocks in the area
    const sugarcaneBlocks = this.bot.findBlocks({
      matching: this.bot.registry.blocksByName.sugar_cane.id,
      maxDistance: 64,
      count: 1000
    });

    // Check each sugarcane block
    for (const pos of sugarcaneBlocks) {
      // Check if within farm area
      if (pos.x < minX || pos.x > maxX || 
          pos.y < minY || pos.y > maxY || 
          pos.z < minZ || pos.z > maxZ) {
        continue;
      }

      const block = this.bot.blockAt(pos);
      if (!block || block.name !== 'sugar_cane') continue;

      // Find the base block (bottom sugarcane block)
      let baseBlock = block;
      let currentBlock = block;
      while (true) {
        const blockBelow = this.bot.blockAt(currentBlock.position.offset(0, -1, 0));
        if (blockBelow && blockBelow.name === 'sugar_cane') {
          baseBlock = blockBelow;
          currentBlock = blockBelow;
        } else {
          break;
        }
      }

      // Skip if we already processed this base
      const baseKey = `${baseBlock.position.x},${baseBlock.position.y},${baseBlock.position.z}`;
      if (processedBases.has(baseKey)) continue;
      processedBases.add(baseKey);

      // Skip recently harvested positions
      if (this.isRecentlyHarvested(baseBlock.position)) continue;

      // Check if this sugarcane is tall enough (at least 2 blocks high)
      const secondBlock = this.bot.blockAt(baseBlock.position.offset(0, 1, 0));
      if (secondBlock && secondBlock.name === 'sugar_cane') {
        // This is mature (at least 2 blocks tall) - add the second block to harvest list
        matureSugarcane.push(secondBlock);
      }
    }

    return matureSugarcane;
  }

  /**
   * Check if position was recently harvested
   */
  isRecentlyHarvested(position) {
    const key = `${position.x},${position.y},${position.z}`;
    const timestamp = this.recentlyHarvested.get(key);
    
    if (!timestamp) return false;
    
    return (Date.now() - timestamp) < this.harvestCooldown;
  }

  /**
   * Mark position as recently harvested
   */
  markHarvested(position) {
    const key = `${position.x},${position.y},${position.z}`;
    this.recentlyHarvested.set(key, Date.now());
  }

  /**
   * Clean up old harvested positions from cache
   */
  cleanupHarvestedCache() {
    const now = Date.now();
    for (const [key, timestamp] of this.recentlyHarvested.entries()) {
      if (now - timestamp > this.harvestCooldown) {
        this.recentlyHarvested.delete(key);
      }
    }
  }

  /**
   * Harvest sugarcane block (breaks from 2nd block upward, leaving base intact)
   */
  async harvestSugarcane(block) {
    try {
      // If deposit routine is active, skip harvesting
      if (this.bot.memory?.isDepositing) return;
      const deposit = this.bot.pluginLoader?.getPlugin('DepositSugarcane');
      if (deposit && deposit.isBusyDepositing) return;
      // Find the base block to mark as harvested
      let baseBlock = block;
      let currentBlock = block;
      while (true) {
        const blockBelow = this.bot.blockAt(currentBlock.position.offset(0, -1, 0));
        if (blockBelow && blockBelow.name === 'sugar_cane') {
          baseBlock = blockBelow;
          currentBlock = blockBelow;
        } else {
          break;
        }
      }

      // Always move close to the sugarcane before harvesting
      const currentPos = this.bot.entity.position;
      const distance = currentPos.distanceTo(block.position);
      
      logger.debug(`Current distance to sugarcane: ${distance.toFixed(2)} blocks`);
      
      if (distance > 4.5) {
        try {
          if (!this.pathfinder) {
            // Try to get pathfinder again if it wasn't available during load
            const navigation = this.pluginLoader.getPlugin('Navigation');
            if (navigation && navigation.pathfinder) {
              this.pathfinder = navigation.pathfinder;
            }
          }
          
          if (this.pathfinder) {
            logger.debug(`Moving to sugarcane at ${block.position.x}, ${block.position.y}, ${block.position.z}...`);
            await this.pathfinder.goto(block.position.x, block.position.y, block.position.z, 3);
            logger.debug(`Arrived at sugarcane`);
          } else {
            logger.warn('Pathfinder not available - trying direct movement');
            // Fallback: use bot.pathfinder directly
            const pathfinderModule = await import('mineflayer-pathfinder');
            const { goals } = pathfinderModule;
            const goal = new goals.GoalNear(block.position.x, block.position.y, block.position.z, 3);
            this.bot.pathfinder.setGoal(goal);
            await this.sleep(2000); // Wait for movement
          }
        } catch (navError) {
          logger.debug(`Could not navigate to sugarcane: ${navError.message}`);
        }
      } else {
        logger.debug('Already close enough to sugarcane');
      }

      // Stop ALL pathfinding before digging
      if (this.pathfinder) {
        this.pathfinder.stop();
      }
      this.bot.pathfinder.setGoal(null);
      
      // Wait for bot to fully stop moving and for any ongoing actions to complete
      await this.sleep(800);
      
      // Ensure bot is not moving before digging
      const velocity = this.bot.entity.velocity;
      const isMoving = Math.abs(velocity.x) > 0.01 || Math.abs(velocity.z) > 0.01;
      if (isMoving) {
        logger.debug('Bot still moving, waiting longer...');
        await this.sleep(500);
      }

      // Look at the block
      await this.bot.lookAt(block.position.offset(0.5, 0.5, 0.5));
      await this.sleep(300);

      // Verify block still exists and is harvestable
      const targetBlock = this.bot.blockAt(block.position);
      if (!targetBlock || targetBlock.name !== 'sugar_cane') {
        logger.debug('Block no longer exists or changed, skipping');
        return;
      }

      // Dig the second block (this will break all blocks above it, but leave the base)
      await this.bot.dig(block);
      
      logger.debug(`Harvested sugarcane at ${block.position.x}, ${block.position.y}, ${block.position.z} (base kept at y=${baseBlock.position.y})`);
      
      // Wait a moment for drops to spawn
      await this.sleep(300);
      
      // Collect nearby sugarcane drops (skip if depositing)
      if (!this.bot.memory?.isDepositing) {
        await this.collectNearbyDrops(block.position);
      }
      
      this.harvestCount++;
      // Mark the base position as harvested to prevent immediate re-harvest
      this.markHarvested(baseBlock.position);
      
      await this.sleep(200);
    } catch (error) {
      logger.error(`Failed to harvest sugarcane at ${block.position}`, error);
    }
  }

  /**
   * Collect nearby item drops (around a specific position)
   */
  async collectNearbyDrops(position) {
    try {
      if (this.bot.memory?.isDepositing) return;
      // Wait a bit longer for drops to fully spawn and settle
      await this.sleep(500);
      
      await this.collectDroppedItems(position);
    } catch (error) {
      logger.debug(`Error collecting drops: ${error.message}`);
    }
  }

  /**
   * Collect dropped sugarcane items using mineflayer-collectblock
   */
  async collectDroppedItems(position) {
    try {
      if (this.bot.memory?.isDepositing) return;
      logger.debug('Looking for dropped sugarcane items...');

      const mcData = minecraftData(this.bot.version);
      const sugarcaneItem = mcData.itemsByName['sugar_cane'];

      if (!sugarcaneItem) {
        logger.debug('Sugar cane item type not found');
        return;
      }

      const droppedSugarcane = Object.values(this.bot.entities).filter(entity => {
        if (!entity || entity.name !== 'item') return false;
        if (entity.metadata && entity.metadata[8]) {
          const itemData = entity.metadata[8];
          if (itemData.itemId === sugarcaneItem.id) {
            return entity.position.distanceTo(position) <= 16;
          }
        }
        return false;
      });

      if (droppedSugarcane.length === 0) {
        logger.debug('No dropped sugarcane found nearby');
        return;
      }

      logger.info(`Found ${droppedSugarcane.length} dropped sugarcane item(s), collecting...`);

      for (const itemEntity of droppedSugarcane) {
        if (!this.isFarming) break;
        if (!itemEntity.isValid) continue;
        
        try {
          await this.bot.collectBlock.collect(itemEntity, { ignoreNoPath: true });
          logger.debug('Collected sugarcane item');
        } catch (err) {
          logger.debug(`Could not collect item: ${err.message}`);
        }
      }

      logger.info('Finished collecting items');
    } catch (error) {
      logger.debug(`Error collecting items: ${error.message}`);
    }
  }

  /**
   * Collect all nearby drops in the farm area (prioritized at start of cycle)
   */
  async collectAllNearbyDrops() {
    try {
      if (this.bot.memory?.isDepositing) return;
      const mcData = minecraftData(this.bot.version);
      const sugarcaneItem = mcData.itemsByName['sugar_cane'];

      if (!sugarcaneItem) {
        logger.debug('Sugar cane item type not found');
        return;
      }

      // Find ALL dropped sugarcane in the farm area
      const droppedSugarcane = Object.values(this.bot.entities).filter(entity => {
        if (!entity || entity.name !== 'item') return false;
        if (!entity.position) return false;
        
        // Check if in farm area
        if (this.farmArea) {
          const { corner1, corner2 } = this.farmArea;
          const minX = Math.min(corner1.x, corner2.x);
          const maxX = Math.max(corner1.x, corner2.x);
          const minY = Math.min(corner1.y, corner2.y) - 1;
          const maxY = Math.max(corner1.y, corner2.y) + 3;
          const minZ = Math.min(corner1.z, corner2.z);
          const maxZ = Math.max(corner1.z, corner2.z);
          
          if (entity.position.x < minX || entity.position.x > maxX ||
              entity.position.y < minY || entity.position.y > maxY ||
              entity.position.z < minZ || entity.position.z > maxZ) {
            return false;
          }
        }
        
        // Check if it's sugarcane
        if (entity.metadata && entity.metadata[8]) {
          const itemData = entity.metadata[8];
          return itemData.itemId === sugarcaneItem.id;
        }
        
        return false;
      });

      if (droppedSugarcane.length === 0) return;

      logger.info(`Collecting ${droppedSugarcane.length} dropped sugarcane before harvesting...`);

      // Sort by distance (closest first)
      droppedSugarcane.sort((a, b) => {
        const distA = this.bot.entity.position.distanceTo(a.position);
        const distB = this.bot.entity.position.distanceTo(b.position);
        return distA - distB;
      });

      // Collect each item
      for (const itemEntity of droppedSugarcane) {
        if (!this.isFarming) break;
        if (!itemEntity.isValid) continue;
        
        try {
          await this.bot.collectBlock.collect(itemEntity, { ignoreNoPath: true });
          logger.debug('Collected sugarcane item');
        } catch (collectError) {
          logger.debug(`Could not collect item: ${collectError.message}`);
        }
      }

      logger.info('Finished collecting drops');
    } catch (error) {
      logger.debug(`Error in collectAllNearbyDrops: ${error.message}`);
    }
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get plugin status
   */
  getStatus() {
    return {
      ...super.getStatus(),
      isFarming: this.isFarming,
      harvestCount: this.harvestCount,
      farmArea: this.farmArea
    };
  }
}

export default SugarcaneFarm;
