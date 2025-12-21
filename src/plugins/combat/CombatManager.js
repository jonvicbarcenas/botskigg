import BaseBehaviorPlugin from '../base/BaseBehaviorPlugin.js';
import logger from '../../utils/Logger.js';
import { filterTargets } from '../../utils/targets.js';

/**
 * CombatManager Plugin - Handles combat and target management
 */
class CombatManager extends BaseBehaviorPlugin {
  constructor(bot, config = {}) {
    super('CombatManager', bot, config);
    this.isInCombat = false;
    this.currentTarget = null;
    this.hostileMobs = [
      'zombie', 'skeleton', 'creeper', 'spider', 'enderman',
      'witch', 'slime', 'phantom', 'drowned', 'husk',
      'stray', 'cave_spider', 'silverfish', 'blaze', 'ghast'
    ];
    this.attackRange = 3;
    // Check both plugin-specific config and global features config
    this.autoAttack = config.autoCombat || this.bot.config?.features?.autoCombat || false;
    this.combatInterval = null;
  }

  async onLoad() {
    this.setupBehaviors();
    
    // Register event handlers
    this.registerEvent('entityHurt', this.onEntityHurt);
    this.registerEvent('physicsTick', this.onPhysicsTick);
    this.registerEvent('chat', this.handleChat);
  }

  /**
   * Setup state machine behaviors for combat
   */
  setupBehaviors() {
    // Register fighting behavior
    this.registerBehavior('fighting', undefined, 
      () => {
        logger.debug('Entered fighting state');
        this.isInCombat = true;
      },
      () => {
        logger.debug('Exited fighting state');
        this.isInCombat = false;
      }
    );
    
    // Create transitions
    this.createTransition('idle', 'fighting', 
      () => this.autoAttack && this.findNearestHostile() !== null
    );
    
    this.createTransition('fighting', 'idle', 
      () => !this.autoAttack || this.currentTarget === null || !this.currentTarget.isValid
    );
    
    logger.info('Combat behaviors and transitions registered');
  }

  async unload() {
    this.stopCombat();
    this.unregisterAllEvents();
    this.isLoaded = false;
    logger.info('CombatManager plugin unloaded');
  }

  onEntityHurt(entity) {
    // Check if bot was hurt
    if (entity === this.bot.entity && this.autoAttack) {
      const attacker = this.findNearestHostile();
      if (attacker) {
        this.attackEntity(attacker);
      }
    }
  }

  onPhysicsTick() {
    if (!this.autoAttack || !this.isInCombat) return;

    // Continue attacking current target
    if (this.currentTarget && this.currentTarget.isValid) {
      const distance = this.bot.entity.position.distanceTo(this.currentTarget.position);
      
      if (distance <= this.attackRange) {
        this.bot.attack(this.currentTarget);
      } else if (distance > 10) {
        // Target too far, find new target
        this.currentTarget = null;
        this.findAndAttackTarget();
      }
    } else {
      this.findAndAttackTarget();
    }
  }

  async handleChat(username, message) {
    if (username === this.bot.username) return;
    
    if (message === '!attack') {
      this.autoAttack = true;
      this.bot.chat('Auto-attack enabled');
      this.findAndAttackTarget();
    } else if (message === '!defend') {
      this.autoAttack = false;
      this.stopCombat();
      this.bot.chat('Auto-attack disabled');
    } else if (message === '!combat') {
      const status = this.getStatus();
      this.bot.chat(`Combat: ${status.isInCombat ? 'Active' : 'Inactive'}, Auto: ${status.autoAttack ? 'On' : 'Off'}`);
    }
  }

  findNearestHostile() {
    const entities = Object.values(this.bot.entities);
    const hostiles = filterTargets(entities, {
      hostile: true,
      maxDistance: 16,
      position: this.bot.entity.position,
      hostileMobs: this.hostileMobs
    });

    if (hostiles.length === 0) return null;

    // Find closest
    return hostiles.reduce((closest, entity) => {
      const distEntity = this.bot.entity.position.distanceTo(entity.position);
      const distClosest = closest ? this.bot.entity.position.distanceTo(closest.position) : Infinity;
      return distEntity < distClosest ? entity : closest;
    }, null);
  }

  findAndAttackTarget() {
    if (!this.autoAttack) return;

    const target = this.findNearestHostile();
    if (target) {
      this.attackEntity(target);
    } else {
      this.isInCombat = false;
      this.currentTarget = null;
    }
  }

  attackEntity(entity) {
    this.isInCombat = true;
    this.currentTarget = entity;
    
    // Set state to fighting
    if (this.stateMachine) {
      this.stateMachine.setState('fighting');
    }
    
    logger.info(`Attacking ${entity.name || entity.displayName || 'entity'}`);
    
    // Look at target
    this.bot.lookAt(entity.position.offset(0, entity.height, 0));
    
    // Attack
    this.bot.attack(entity);
  }

  stopCombat() {
    this.isInCombat = false;
    this.currentTarget = null;
    
    if (this.combatInterval) {
      clearInterval(this.combatInterval);
      this.combatInterval = null;
    }
    
    // Return to idle state
    if (this.stateMachine) {
      this.stateMachine.setState('idle');
    }
    
    logger.info('Combat stopped');
  }

  equipBestWeapon() {
    try {
      const weapons = this.bot.inventory.items().filter(item => {
        return item.name.includes('sword') || 
               item.name.includes('axe') ||
               item.name === 'bow' ||
               item.name === 'crossbow';
      });

      if (weapons.length === 0) return false;

      // Sort by attack damage (approximation)
      const weaponPriority = { 
        'netherite_sword': 10, 'diamond_sword': 9, 'iron_sword': 8,
        'netherite_axe': 9, 'diamond_axe': 8, 'iron_axe': 7,
        'stone_sword': 7, 'wooden_sword': 6
      };

      weapons.sort((a, b) => {
        const priorityA = weaponPriority[a.name] || 0;
        const priorityB = weaponPriority[b.name] || 0;
        return priorityB - priorityA;
      });

      const bestWeapon = weapons[0];
      this.bot.equip(bestWeapon, 'hand');
      logger.info(`Equipped ${bestWeapon.name}`);
      return true;
    } catch (error) {
      logger.error('Failed to equip weapon', error);
      return false;
    }
  }

  equipShield() {
    try {
      const shield = this.bot.inventory.items().find(item => item.name === 'shield');
      if (shield) {
        this.bot.equip(shield, 'off-hand');
        logger.info('Equipped shield');
        return true;
      }
      return false;
    } catch (error) {
      logger.error('Failed to equip shield', error);
      return false;
    }
  }

  getStatus() {
    return {
      ...super.getStatus(),
      isInCombat: this.isInCombat,
      autoAttack: this.autoAttack,
      currentTarget: this.currentTarget ? this.currentTarget.name : null,
      health: this.bot.health,
      food: this.bot.food
    };
  }
}

export default CombatManager;
