import BaseBehaviorPlugin from '../base/_BaseBehaviorPlugin.js';
import logger from '../../utils/Logger.js';
import toolPluginPkg from 'mineflayer-tool';
const toolPlugin = toolPluginPkg.plugin || toolPluginPkg.default || toolPluginPkg;

/**
 * ToolManager Plugin - Automatically selects the best tool for the job
 */
class ToolManager extends BaseBehaviorPlugin {
    constructor(bot, config = {}) {
        super('ToolManager', bot, config);
    }

    async onLoad() {
        // Load the mineflayer-tool plugin if not already loaded
        if (!this.bot.tool) {
            this.bot.loadPlugin(toolPlugin.plugin);
            logger.info('Tool plugin loaded into mineflayer');
        }

        logger.success('ToolManager behavior plugin initialized');
    }

    /**
     * Equip the best tool for a specific block
     * @param {Block} block The block to mine
     */
    async equipForBlock(block) {
        if (this.bot.tool) {
            try {
                await this.bot.tool.equipForBlock(block);
                return true;
            } catch (error) {
                logger.error(`Failed to equip tool for block ${block.name}`, error);
            }
        }
        return false;
    }

    /**
     * Equip the best weapon for a specific entity
     * @param {Entity} entity The entity to attack
     */
    async equipForEntity(entity) {
        // mineflayer-tool doesn't have equipForEntity, but we can provide a wrapper
        // or use the bot's native inventory management if needed.
        // For now, we'll focus on block mining as that's what mineflayer-tool is best at.
        return false;
    }

    getStatus() {
        return {
            ...super.getStatus(),
            hasToolPlugin: !!this.bot.tool
        };
    }
}

export default ToolManager;
