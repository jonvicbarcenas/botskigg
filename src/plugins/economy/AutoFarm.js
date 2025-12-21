import BaseBehaviorPlugin from '../base/_BaseBehaviorPlugin.js';
import logger from '../../utils/Logger.js';

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
    // Get pluginLoader reference from BotClient
    const BotClient = (await import('../../core/BotClient.js')).default;
    const botClient = BotClient.getInstance();
    this.pluginLoader = botClient.getPluginLoader();
    
    // Get pathfinder from Navigation plugin
    const navigation = this.pluginLoader.getPlugin('Navigation');
    if (navigation && navigation.pathfinder) {
      this.pathfinder = navigation.pathfinder;
    }
    
    // Setup farming behaviors
    this.setupBehaviors();
    
    // Register chat commands
    this.registerEvent('chat', this.handleChat);
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
      if (this.isFarming && this.getState() === 'farming') {
        try {
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
    
    if (matureCrops.length > 0) {
      logger.info(`Found ${matureCrops.length} mature crops, harvesting...`);
      
      for (const crop of matureCrops.slice(0, 3)) { // Limit to 3 crops per cycle
        try {
          await this.harvestCrop(crop);
          await this.replantCrop(crop);
          await this.sleep(500); // Small delay between crops
        } catch (error) {
          logger.error('Error harvesting crop:', error);
        }
      }
      
      this.stats.cyclesCompleted++;
      logger.success(`Farming cycle completed. Total cycles: ${this.stats.cyclesCompleted}`);
    } else {
      logger.debug('No mature crops found, waiting for growth...');
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
    
    if (message === '!farm start') {
      await this.startFarming();
      this.bot.chat('Auto-farming started');
    } else if (message === '!farm stop') {
      this.stopFarming();
      this.bot.chat('Auto-farming stopped');
    } else if (message === '!farm status') {
      const status = this.getStatus();
      this.bot.chat(`Farming: ${status.isFarming ? 'Active' : 'Inactive'}, Harvested: ${status.harvestCount}, Planted: ${status.plantCount}`);
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

    logger.info('Starting auto-farm...');
    
    // Logic is handled by onStateEntered
  }

  stopFarming() {
    this.isFarming = false;
    
    // Return to idle state
    this.setState('idle');
    
    logger.info('Auto-farming stopped');
    
    // Logic is handled by onStateExited
  }

  async farmCycle() {
    try {
      // Find mature crops nearby
      const matureCrops = this.findMatureCrops(16);
      
      if (matureCrops.length > 0) {
        logger.info(`Found ${matureCrops.length} mature crops`);
        
        for (const crop of matureCrops.slice(0, 5)) { // Process 5 at a time
          await this.harvestCrop(crop);
          await this.replantCrop(crop);
          await this.sleep(500); // Small delay between actions
        }
      }
    } catch (error) {
      logger.error('Farm cycle error', error);
    }
  }

  findMatureCrops(range = 16) {
    const crops = [];
    const pos = this.bot.entity.position;

    // Search for crop blocks in range
    for (let x = -range; x <= range; x++) {
      for (let y = -2; y <= 2; y++) {
        for (let z = -range; z <= range; z++) {
          const blockPos = pos.offset(x, y, z);
          const block = this.bot.blockAt(blockPos);
          
          if (block && this.isMatureCrop(block)) {
            crops.push(block);
          }
        }
      }
    }

    return crops;
  }

  isMatureCrop(block) {
    if (!block || !block.name) return false;

    for (const cropType of this.cropTypes) {
      if (block.name === cropType) {
        const maxAge = this.matureCrops[cropType];
        const age = block.metadata || 0;
        return age >= maxAge;
      }
    }

    return false;
  }

  async harvestCrop(block) {
    try {
      // Move to crop
      const distance = this.bot.entity.position.distanceTo(block.position);
      if (distance > 4) {
        if (this.pathfinder) {
          await this.pathfinder.goto(block.position.x, block.position.y, block.position.z, 3);
        } else {
          logger.warn('Pathfinder not available, skipping movement');
        }
      }

      // Look at crop
      await this.bot.lookAt(block.position);

      // Break crop
      await this.bot.dig(block);
      
      this.harvestCount++;
      logger.debug(`Harvested ${block.name}`);
    } catch (error) {
      logger.error(`Failed to harvest crop at ${block.position}`, error);
    }
  }

  async replantCrop(block) {
    try {
      // Find seeds in inventory
      const seeds = this.findSeeds(block.name);
      
      if (!seeds) {
        logger.warn(`No seeds for ${block.name}`);
        return;
      }

      // Equip seeds
      await this.bot.equip(seeds, 'hand');

      // Place seeds
      const blockBelow = this.bot.blockAt(block.position.offset(0, -1, 0));
      if (blockBelow && blockBelow.name === 'farmland') {
        await this.bot.placeBlock(blockBelow, new this.bot.vec3(0, 1, 0));
        this.plantCount++;
        logger.debug(`Replanted ${block.name}`);
      }
    } catch (error) {
      logger.error(`Failed to replant at ${block.position}`, error);
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
              await this.sleep(100);
            }
          }
        } catch (error) {
          logger.error(`Failed to create farmland at offset ${x},${z}`, error);
        }
      }
    }

    logger.success('Farmland creation complete');
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
