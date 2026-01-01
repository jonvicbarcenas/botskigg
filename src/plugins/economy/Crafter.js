import IPlugin from '../../interfaces/IPlugin.js';
import logger from '../../utils/Logger.js';
import { sleep } from '../../utils/helpers/asyncHelpers.js';

/**
 * Crafter Plugin - Handles item crafting automation
 */
class Crafter extends IPlugin {
  constructor(bot, config = {}) {
    super('Crafter', bot, config);
    this.craftingTable = null;
    this.recipes = new Map();
    this.isCrafting = false;
  }

  async load() {
    try {
      // Register chat commands
      this.registerEvent('chat', this.handleChat);
      
      // Load recipes when spawned
      this.bot.once('spawn', () => {
        this.loadRecipes();
      });
      
      this.isLoaded = true;
      logger.success('Crafter plugin loaded');
    } catch (error) {
      logger.error('Failed to load Crafter plugin', error);
      throw error;
    }
  }

  async unload() {
    this.unregisterAllEvents();
    this.isLoaded = false;
    logger.info('Crafter plugin unloaded');
  }

  loadRecipes() {
    try {
      // Load all available recipes from minecraft-data
      const mcData = require('minecraft-data')(this.bot.version);
      const recipes = mcData.recipes;
      
      for (const recipe of recipes) {
        if (recipe.result) {
          const itemName = mcData.items[recipe.result.id]?.name;
          if (itemName) {
            if (!this.recipes.has(itemName)) {
              this.recipes.set(itemName, []);
            }
            this.recipes.get(itemName).push(recipe);
          }
        }
      }
      
      logger.info(`Loaded ${this.recipes.size} craftable items`);
    } catch (error) {
      logger.warn('Could not load recipes from minecraft-data', error);
    }
  }

  async handleChat(username, message) {
    if (username === this.bot.username) return;
    
    const args = message.split(' ');
    const command = args[0];
    
    if (command === '!craft') {
      if (args.length < 2) {
        this.bot.chat('Usage: !craft <item> [amount]');
        return;
      }
      
      const itemName = args[1];
      const amount = args[2] ? parseInt(args[2]) : 1;
      
      await this.craftItem(itemName, amount);
    } else if (command === '!recipes') {
      if (args.length < 2) {
        this.bot.chat(`I know ${this.recipes.size} recipes. Use !recipes <item> for details`);
        return;
      }
      
      const itemName = args[1];
      this.showRecipes(itemName);
    }
  }

  async craftItem(itemName, amount = 1) {
    if (this.isCrafting) {
      this.bot.chat('Already crafting something');
      return;
    }

    this.isCrafting = true;

    try {
      this.bot.chat(`Attempting to craft ${amount}x ${itemName}...`);
      
      // Find the item by name
      const item = this.bot.registry.itemsByName[itemName];
      if (!item) {
        this.bot.chat(`Unknown item: ${itemName}`);
        return;
      }

      // Find recipe
      const recipe = this.bot.recipesFor(item.id, null, 1, null)[0];
      if (!recipe) {
        // Try with crafting table
        const craftingTable = await this.findCraftingTable();
        if (craftingTable) {
          const recipeWithTable = this.bot.recipesFor(item.id, null, 1, craftingTable)[0];
          if (recipeWithTable) {
            await this.craftWithTable(recipeWithTable, amount, craftingTable);
            return;
          }
        }
        
        this.bot.chat(`No recipe found for ${itemName}`);
        return;
      }

      // Craft the item
      await this.bot.craft(recipe, amount, null);
      this.bot.chat(`Successfully crafted ${amount}x ${itemName}`);
      logger.success(`Crafted ${amount}x ${itemName}`);
      
    } catch (error) {
      logger.error('Crafting error', error);
      this.bot.chat(`Failed to craft: ${error.message}`);
    } finally {
      this.isCrafting = false;
    }
  }

  async craftWithTable(recipe, amount, craftingTable) {
    // Move to crafting table
    const distance = this.bot.entity.position.distanceTo(craftingTable.position);
    if (distance > 4) {
      await this.bot.pathfinder.goto(
        craftingTable.position.x,
        craftingTable.position.y,
        craftingTable.position.z,
        3
      );
    }

    // Craft with table
    await this.bot.craft(recipe, amount, craftingTable);
    this.bot.chat(`Successfully crafted ${amount}x ${recipe.name} using crafting table`);
    logger.success(`Crafted ${amount}x ${recipe.name}`);
  }

  async findCraftingTable() {
    const craftingTableBlock = this.bot.findBlock({
      matching: (block) => block.name === 'crafting_table',
      maxDistance: 32
    });

    if (craftingTableBlock) {
      logger.info('Found crafting table');
      return craftingTableBlock;
    }

    logger.warn('No crafting table found nearby');
    return null;
  }

  async placeCraftingTable() {
    try {
      // Find crafting table in inventory
      const craftingTable = this.bot.inventory.items().find(
        item => item.name === 'crafting_table'
      );

      if (!craftingTable) {
        this.bot.chat('No crafting table in inventory');
        return null;
      }

      // Find a suitable place to put it
      const pos = this.bot.entity.position;
      const referenceBlock = this.bot.blockAt(pos.offset(0, -1, 0));

      if (!referenceBlock) {
        this.bot.chat('Cannot place crafting table here');
        return null;
      }

      // Place the crafting table
      await this.bot.equip(craftingTable, 'hand');
      await this.bot.placeBlock(referenceBlock, new this.bot.vec3(0, 1, 0));
      
      logger.success('Placed crafting table');
      this.bot.chat('Placed crafting table');

      // Return the placed block
      return this.bot.blockAt(pos);
      
    } catch (error) {
      logger.error('Failed to place crafting table', error);
      this.bot.chat('Failed to place crafting table');
      return null;
    }
  }

  showRecipes(itemName) {
    const recipes = this.recipes.get(itemName);
    
    if (!recipes || recipes.length === 0) {
      this.bot.chat(`No recipes found for ${itemName}`);
      return;
    }

    this.bot.chat(`Found ${recipes.length} recipe(s) for ${itemName}`);
    
    // Show first recipe details (simplified)
    const recipe = recipes[0];
    this.bot.chat(`Recipe uses ${recipe.inShape ? 'shaped' : 'shapeless'} crafting`);
  }

  canCraft(itemName, amount = 1) {
    const item = this.bot.registry.itemsByName[itemName];
    if (!item) return false;

    const recipe = this.bot.recipesFor(item.id, null, amount, null)[0];
    return recipe !== null;
  }

  async autoCraft(itemList) {
    // Auto-craft a list of items in order
    logger.info(`Auto-crafting ${itemList.length} items`);
    
    for (const { item, amount } of itemList) {
      try {
        await this.craftItem(item, amount);
        await sleep(1000); // Wait between crafts
      } catch (error) {
        logger.error(`Failed to craft ${item}`, error);
      }
    }
    
    logger.success('Auto-craft complete');
  }

  getStatus() {
    return {
      ...super.getStatus(),
      isCrafting: this.isCrafting,
      knownRecipes: this.recipes.size,
      hasCraftingTable: this.craftingTable !== null
    };
  }
}

export default Crafter;
