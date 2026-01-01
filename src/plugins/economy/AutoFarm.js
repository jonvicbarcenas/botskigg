import BaseBehaviorPlugin from '../base/_BaseBehaviorPlugin.js';
import logger from '../../utils/Logger.js';
import ChatParser from '../../utils/ChatParser.js';
import { Vec3 } from 'vec3';
import { plugin as collectBlock } from 'mineflayer-collectblock';
import { getBotClient, sleep } from '../../utils/helpers/asyncHelpers.js';

/**
 * AutoFarm Plugin - Handles automated farming
 */
class AutoFarm extends BaseBehaviorPlugin {
  constructor(bot, config = {}) {
    super('AutoFarm', bot, config);
    this.isFarming = false;
    this.farmArea = null;
    this.cropTypes = ['wheat', 'carrots', 'potatoes', 'beetroots', 'nether_wart'];
    this.matureCrops = {
      'wheat': 7,
      'carrots': 7,
      'potatoes': 7,
      'beetroots': 3,
      'nether_wart': 3
    };
    this.farmInterval = null;
    this.harvestCount = 0;
    this.plantCount = 0;
    this.stats = {
      cropsHarvested: 0,
      cropsPlanted: 0,
      cyclesCompleted: 0,
      startTime: null
    };
    this.pluginLoader = null;
    this.pathfinder = null;
  }

  async onLoad() {
    // Load collectBlock plugin
    if (!this.bot.collectBlock) {
      this.bot.loadPlugin(collectBlock);
    }
    
    // Get pluginLoader reference from BotClient
    const botClient = await getBotClient();
    this.pluginLoader = botClient.getPluginLoader();
    
    // Get pathfinder from Navigation plugin
    const navigation = this.pluginLoader.getPlugin('Navigation');
    if (navigation && navigation.pathfinder) {
      this.pathfinder = navigation.pathfinder;
    }
    
    // Setup farming behaviors
    this.setupBehaviors();
    
    // Register chat commands
    this.registerEvent('chat', this.handleChat.bind(this));
  }

  /**
   * Setup state machine behaviors for farming
   */
  setupBehaviors() {
    // Register dynamic farming behavior
    this.registerBehavior('farming', undefined,
      () => {
        logger.info('Bot started autonomous farming');
        this.isFarming = true;
        this.startAutonomousFarming();
      },
      () => {
        logger.info('Bot stopped autonomous farming');
        this.isFarming = false;
        this.stopAutonomousFarming();
      }
    );
    
    // Create transitions
    this.createTransition('idle', 'farming', () => false); // Manual transition
    
    this.createTransition('farming', 'idle', () => !this.isFarming);
    
    logger.info('Dynamic farming behaviors and transitions registered');
  }

  /**
   * Start autonomous farming loop
   */
  startAutonomousFarming() {
    this.farmInterval = setInterval(async () => {
      // Check both the local flag and the state machine
      const currentState = this.getState();
      if (this.isFarming && (currentState === 'farming' || currentState === 'idle')) {
        try {
          // If we're in idle but isFarming is true, it means we probably got 
          // kicked back to idle by a navigation event. Re-assert farming state.
          if (currentState === 'idle') {
            this.setState('farming');
          }
          await this.performAutonomousFarmCycle();
        } catch (error) {
          logger.error('Error in autonomous farming cycle:', error);
        }
      }
    }, 5000); // Check every 5 seconds
  }

  /**
   * Stop autonomous farming loop
   */
  stopAutonomousFarming() {
    if (this.farmInterval) {
      clearInterval(this.farmInterval);
      this.farmInterval = null;
    }
  }

  /**
   * Perform one autonomous farm cycle
   */
  async performAutonomousFarmCycle() {
    // Find mature crops nearby
    const matureCrops = this.findMatureCrops(16);
    // Find empty farmland nearby
    const emptyFarmland = this.findEmptyFarmland(16);
    
    if (matureCrops.length > 0 || emptyFarmland.length > 0) {
      logger.info(`Farming cycle: Found ${matureCrops.length} mature crops and ${emptyFarmland.length} empty farmlands`);
      
      // Handle mature crops first
      for (const crop of matureCrops.slice(0, 5)) {
        try {
          const cropName = await this.harvestCrop(crop);
          if (cropName) {
            await this.replantCrop(crop.position, cropName);
          }
          await sleep(500);
        } catch (error) {
          logger.error('Error harvesting crop:', error);
        }
      }

      // Handle empty farmland
      for (const farmland of emptyFarmland.slice(0, 5)) {
        try {
          // Check if it's still empty
          const blockAbove = this.bot.blockAt(farmland.position.offset(0, 1, 0));
          if (blockAbove && (blockAbove.name === 'air' || blockAbove.name === 'void_air' || blockAbove.name === 'cave_air')) {
            await this.replantCrop(farmland.position.offset(0, 1, 0));
            await sleep(500);
          }
        } catch (error) {
          logger.error('Error planting on empty farmland:', error);
        }
      }
      
      this.stats.cyclesCompleted++;
      logger.success(`Farming cycle completed. Total cycles: ${this.stats.cyclesCompleted}`);
    } else {
      logger.debug('No mature crops or empty farmland found, waiting for growth...');
    }
  }

  async unload() {
    this.stopFarming();
    this.unregisterAllEvents();
    this.isLoaded = false;
    logger.info('AutoFarm plugin unloaded');
  }

  async handleChat(username, message) {
    if (username === this.bot.username) return;
    
    const parsed = ChatParser.parseCommand(message, this.bot.config.behavior?.chatCommandPrefix || '!');
    if (!parsed || parsed.command !== 'farm') return;

    logger.debug(`AutoFarm received command: ${parsed.command} ${parsed.args.join(' ')} from ${username}`);
    
    const subCommand = parsed.args[0];

    if (subCommand === 'start') {
      await this.startFarming();
      this.bot.chat('Auto-farming started');
    } else if (subCommand === 'stop') {
      this.stopFarming();
      this.bot.chat('Auto-farming stopped');
    } else if (subCommand === 'status') {
      const status = this.getStatus();
      this.bot.chat(`Farming: ${status.isFarming ? 'Active' : 'Inactive'}, Harvested: ${status.harvestCount}, Planted: ${status.plantCount}`);
    } else if (subCommand === 'scan') {
      // Debug command to scan for crops
      const crops = this.findMatureCrops(16);
      const empty = this.findEmptyFarmland(16);
      this.bot.chat(`Found ${crops.length} mature crops and ${empty.length} empty farmland nearby`);
    }
  }

  async startFarming() {
    if (this.isFarming) {
      logger.warn('Already farming');
      return;
    }

    this.isFarming = true;
    this.harvestCount = 0;
    this.plantCount = 0;

    // Set state to farming
    this.setState('farming');

    // Disable sprinting for careful farming
    if (this.pathfinder) {
      this.pathfinder.setConfig({ allowSprinting: false });
    }

    logger.info('Starting auto-farm (sprinting disabled)...');
    
    // Logic is handled by onStateEntered
  }

  stopFarming() {
    this.isFarming = false;
    
    // Return to idle state
    this.setState('idle');

    // Re-enable sprinting based on config
    if (this.pathfinder) {
      const defaultSprint = this.bot.config?.physics?.pathfinder?.allowSprinting !== false;
      this.pathfinder.setConfig({ allowSprinting: defaultSprint });
    }
    
    logger.info('Auto-farming stopped (sprinting restored)');
    
    // Logic is handled by onStateExited
  }

  async farmCycle() {
    try {
      // Find mature crops nearby
      const matureCrops = this.findMatureCrops(16);
      const emptyFarmland = this.findEmptyFarmland(16);
      
      if (matureCrops.length > 0 || emptyFarmland.length > 0) {
        logger.info(`Manual farm cycle: ${matureCrops.length} mature, ${emptyFarmland.length} empty`);
        
        for (const crop of matureCrops.slice(0, 5)) {
          const name = await this.harvestCrop(crop);
          if (name) await this.replantCrop(crop.position, name);
          await sleep(500);
        }

        for (const farmland of emptyFarmland.slice(0, 5)) {
          await this.replantCrop(farmland.position.offset(0, 1, 0));
          await sleep(500);
        }
      }
    } catch (error) {
      logger.error('Farm cycle error', error);
    }
  }

  findMatureCrops(range = 16) {
    const crops = [];
    const pos = this.bot.entity.position;

    // Use findBlocks for more reliable detection
    for (const cropType of this.cropTypes) {
      const blockType = this.bot.registry.blocksByName[cropType];
      if (!blockType) {
        logger.debug(`Block type ${cropType} not found in registry`);
        continue;
      }

      const foundBlocks = this.bot.findBlocks({
        matching: blockType.id,
        maxDistance: range,
        count: 100
      });

      for (const blockPos of foundBlocks) {
        const block = this.bot.blockAt(blockPos);
        if (block && this.isMatureCrop(block)) {
          crops.push(block);
        }
      }
    }

    logger.debug(`Found ${crops.length} mature crops within ${range} blocks`);
    return crops;
  }

  isMatureCrop(block) {
    if (!block || !block.name) return false;

    for (const cropType of this.cropTypes) {
      if (block.name === cropType) {
        const maxAge = this.matureCrops[cropType];
        // Use getProperties() to get block state (modern mineflayer)
        const properties = block.getProperties ? block.getProperties() : {};
        const age = properties.age !== undefined ? properties.age : (block._properties?.age ?? 0);
        return age >= maxAge;
      }
    }

    return false;
  }

  findEmptyFarmland(range = 16) {
    const farmlandBlock = this.bot.registry.blocksByName['farmland'];
    if (!farmlandBlock) return [];

    const foundBlocks = this.bot.findBlocks({
      matching: farmlandBlock.id,
      maxDistance: range,
      count: 100
    });

    const empty = [];
    for (const blockPos of foundBlocks) {
      const blockAbove = this.bot.blockAt(blockPos.offset(0, 1, 0));
      if (blockAbove && (blockAbove.name === 'air' || blockAbove.name === 'void_air' || blockAbove.name === 'cave_air')) {
        empty.push(this.bot.blockAt(blockPos));
      }
    }

    logger.debug(`Found ${empty.length} empty farmland blocks within ${range} blocks`);
    return empty;
  }

  async collectDroppedItems(range = 5) {
    const items = Object.values(this.bot.entities).filter(e => 
      e.type === 'item' && 
      this.bot.entity.position.distanceTo(e.position) < range
    );
    
    if (items.length === 0) return;

    logger.debug(`Collecting ${items.length} dropped items nearby`);
    for (const item of items) {
      try {
        if (this.bot.collectBlock) {
          await this.bot.collectBlock.collect(item, { ignoreNoPath: true });
        } else if (this.pathfinder) {
          await this.pathfinder.goto(item.position.x, item.position.y, item.position.z, 0);
          await sleep(200);
        }
      } catch (error) {
        logger.debug(`Failed to collect item: ${error.message}`);
      }
    }
  }

  async harvestCrop(block) {
    try {
      // Store crop name and position before harvesting
      const cropName = block.name;
      const cropPos = block.position.clone();
      
      // Move closer for better item pickup
      const distance = this.bot.entity.position.distanceTo(cropPos);
      if (distance > 2) {
        if (this.pathfinder) {
          await this.pathfinder.goto(cropPos.x, cropPos.y, cropPos.z, 1.5);
        } else {
          logger.warn('Pathfinder not available, skipping movement');
        }
      }

      // Look at crop
      await this.bot.lookAt(cropPos);

      // Break crop
      await this.bot.dig(block);
      
      // Wait for items to be picked up
      await this.collectDroppedItems(3);
      
      this.harvestCount++;
      logger.debug(`Harvested ${cropName}`);
      
      return cropName;
    } catch (error) {
      logger.error(`Failed to harvest crop at ${block.position}`, error);
      return null;
    }
  }

  async replantCrop(position, cropName) {
    try {
      // If position is a block, get its position
      const targetPos = position.position ? position.position.clone() : position.clone();
      
      // If cropName is not provided, try to find any available seeds
      let seeds = null;
      if (cropName) {
        seeds = this.findSeeds(cropName);
      }
      
      if (!seeds) {
        // Fallback: search for any seeds in inventory
        const seedMap = {
          'wheat': 'wheat_seeds',
          'carrots': 'carrot',
          'potatoes': 'potato',
          'beetroots': 'beetroot_seeds',
          'nether_wart': 'nether_wart'
        };
        for (const type of Object.keys(seedMap)) {
          seeds = this.findSeeds(type);
          if (seeds) {
            cropName = type;
            break;
          }
        }
      }

      if (!seeds) {
        logger.debug('No seeds available for planting');
        return;
      }

      // Move to position if needed
      const distance = this.bot.entity.position.distanceTo(targetPos);
      if (distance > 4) {
        if (this.pathfinder) {
          await this.pathfinder.goto(targetPos.x, targetPos.y, targetPos.z, 2);
        }
      }

      // Equip seeds
      await this.bot.equip(seeds, 'hand');

      // Place seeds
      const blockBelow = this.bot.blockAt(targetPos.offset(0, -1, 0));
      if (blockBelow && blockBelow.name === 'farmland') {
        await this.bot.lookAt(blockBelow.position);
        await this.bot.placeBlock(blockBelow, new Vec3(0, 1, 0));
        this.plantCount++;
        logger.debug(`Planted ${cropName} at ${targetPos}`);
      }
    } catch (error) {
      logger.error(`Failed to replant at ${position}`, error);
    }
  }

  findSeeds(cropType) {
    const seedMap = {
      'wheat': 'wheat_seeds',
      'carrots': 'carrot',
      'potatoes': 'potato',
      'beetroots': 'beetroot_seeds',
      'nether_wart': 'nether_wart'
    };

    const seedName = seedMap[cropType];
    if (!seedName) return null;

    return this.bot.inventory.items().find(item => item.name === seedName);
  }

  async createFarmland(position, size = 9) {
    // Simple farmland creator - creates a square farm
    const halfSize = Math.floor(size / 2);
    
    logger.info(`Creating ${size}x${size} farm at position`);

    for (let x = -halfSize; x <= halfSize; x++) {
      for (let z = -halfSize; z <= halfSize; z++) {
        try {
          const blockPos = position.offset(x, 0, z);
          const block = this.bot.blockAt(blockPos);
          
          if (block && (block.name === 'dirt' || block.name === 'grass_block')) {
            // Use hoe to create farmland
            const hoe = this.bot.inventory.items().find(item => 
              item.name.includes('hoe')
            );
            
            if (hoe) {
              await this.bot.equip(hoe, 'hand');
              await this.bot.activateBlock(block);
              await sleep(100);
            }
          }
        } catch (error) {
          logger.error(`Failed to create farmland at offset ${x},${z}`, error);
        }
      }
    }

    logger.success('Farmland creation complete');
  }

  getStatus() {
    return {
      ...super.getStatus(),
      isFarming: this.isFarming,
      harvestCount: this.harvestCount,
      plantCount: this.plantCount,
      farmArea: this.farmArea
    };
  }
}

export default AutoFarm;
