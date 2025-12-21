import BaseBehaviorPlugin from '../base/_BaseBehaviorPlugin.js';
import logger from '../../utils/Logger.js';
import armorManagerPkg from 'mineflayer-armor-manager';
const armorManager = armorManagerPkg.default || armorManagerPkg;

/**
 * ArmorManager Plugin - Automatically equips the best armor
 */
class ArmorManager extends BaseBehaviorPlugin {
    constructor(bot, config = {}) {
        super('ArmorManager', bot, config);
    }

    async onLoad() {
        // Load the mineflayer-armor-manager plugin if not already loaded
        if (!this.bot.armorManager) {
            this.bot.loadPlugin(armorManager);
            logger.info('Armor Manager plugin loaded into mineflayer');
        }

        // Register events
        this.registerEvent('playerCollect', this.onCollect);

        // Initial equip
        this.equipAll();

        logger.success('ArmorManager behavior plugin initialized');
    }

    onCollect(collector, item) {
        if (collector === this.bot.entity) {
            // Small delay to allow item to enter inventory
            setTimeout(() => {
                this.equipAll();
            }, 500);
        }
    }

    equipAll() {
        if (this.bot.armorManager) {
            this.bot.armorManager.equipAll();
        }
    }

    getStatus() {
        return {
            ...super.getStatus(),
            armor: this.bot.inventory.armor
        };
    }
}

export default ArmorManager;
