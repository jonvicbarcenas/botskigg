import BaseBehavior from './BaseBehavior.js';
import logger from '../../utils/Logger.js';

/**
 * Farming Behavior Component - Handles autonomous farming
 */
class FarmingBehavior extends BaseBehavior {
  constructor(bot, pathfinder) {
    super('farming', { tickInterval: 5000 });
    this.bot = bot;
    this.pathfinder = pathfinder;
    this.stats = {
      cropsHarvested: 0,
      cropsPlanted: 0,
      cyclesCompleted: 0
    };
  }

  /**
   * Perform farming cycle
   */
  async tick() {
    try {
      const matureCrops = this.findMatureCrops(16);
      
      if (matureCrops.length > 0) {
        logger.info(`Found ${matureCrops.length} mature crops`);
        
        for (const crop of matureCrops.slice(0, 3)) {
          await this.harvestAndReplant(crop);
        }
        
        this.stats.cyclesCompleted++;
        logger.success(`Farming cycle ${this.stats.cyclesCompleted} completed`);
      } else {
        logger.debug('No mature crops found, waiting...');
      }
    } catch (error) {
      logger.error('Farming cycle error:', error);
    }
    
    return 'continue';
  }

  /**
   * Find mature crops nearby
   */
  findMatureCrops(range) {
    const crops = ['wheat', 'carrots', 'potatoes', 'beetroots'];
    const matureCrops = [];
    
    for (const cropType of crops) {
      const blocks = this.bot.findBlocks({
        matching: [cropType],
        maxDistance: range,
        count: 20
      });
      
      for (const pos of blocks) {
        const block = this.bot.blockAt(pos);
        if (this.isMatureCrop(block)) {
          matureCrops.push(block);
        }
      }
    }
    
    return matureCrops;
  }

  /**
   * Check if crop is mature
   */
  isMatureCrop(block) {
    const matureAges = { wheat: 7, carrots: 7, potatoes: 7, beetroots: 3 };
    return block.metadata >= (matureAges[block.name] || 7);
  }

  /**
   * Harvest and replant crop
   */
  async harvestAndReplant(block) {
    try {
      // Move to crop
      await this.pathfinder.goto(block.position.x, block.position.y, block.position.z, 1);
      
      // Harvest
      await this.bot.dig(block);
      this.stats.cropsHarvested++;
      
      // Wait a bit
      await this.sleep(500);
      
      // Replant if we have seeds
      const seeds = this.findSeeds(block.name);
      if (seeds) {
        await this.bot.equip(seeds, 'hand');
        await this.bot.placeBlock(this.bot.blockAt(block.position), new this.bot.Vec3(0, 1, 0));
        this.stats.cropsPlanted++;
      }
      
    } catch (error) {
      logger.error(`Error harvesting ${block.name}:`, error);
    }
  }

  /**
   * Find seeds for crop type
   */
  findSeeds(cropType) {
    const seedMap = {
      wheat: 'wheat_seeds',
      carrots: 'carrot',
      potatoes: 'potato',
      beetroots: 'beetroot_seeds'
    };
    
    const seedName = seedMap[cropType];
    return this.bot.inventory.items().find(item => item.name === seedName);
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Start farming
   */
  onEnter() {
    super.onEnter();
    logger.info('Started autonomous farming');
  }

  /**
   * Stop farming
   */
  onExit() {
    super.onExit();
    logger.info(`Farming stopped. Stats: ${JSON.stringify(this.stats)}`);
  }
}

export default FarmingBehavior;