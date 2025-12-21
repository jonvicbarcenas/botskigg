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

    // Hostile player settings from config
    this.hostilePlayers = this.bot.config?.hostilePlayer?.target || [];
    this.autoAttackHostile = this.bot.config?.hostilePlayer?.autoAttack || false;
    this.useMelee = this.bot.config?.hostilePlayer?.useMelee !== false;
    this.useLongRange = this.bot.config?.hostilePlayer?.useLongRange || false;

    this.combatInterval = null;
    this.combatMode = 'melee'; // 'melee' or 'ranged'
  }

    async onLoad() {
      this.setupBehaviors();
      
      // Configure plugins if available
      if (this.bot.movement) {
        logger.info('Movement plugin detected and ready');
      } else {
        logger.warn('Movement plugin NOT detected on bot');
      }
      
      if (this.bot.pvp) {
        this.bot.pvp.followDistance = 2;
        logger.info('PVP plugin detected and configured');
      } else {
        logger.warn('PVP plugin NOT detected on bot');
      }
  
      if (this.bot.hawkEye) {
        logger.info('Hawkeye plugin detected and ready');
      } else {
        logger.warn('Hawkeye plugin NOT detected on bot');
      }
      
      // Register event handlers    this.registerEvent('entityHurt', this.onEntityHurt);
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
      () => (this.autoAttack || this.autoAttackHostile) && this.findNearestHostile() !== null
    );

    this.createTransition('fighting', 'idle',
      () => (!this.autoAttack && !this.autoAttackHostile) || this.currentTarget === null || !this.currentTarget.isValid
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
    if (entity === this.bot.entity && (this.autoAttack || this.autoAttackHostile)) {
      const attacker = this.findNearestHostile();
      if (attacker) {
        this.attackEntity(attacker);
      }
    }
  }

  onPhysicsTick() {
    if (!this.autoAttack && !this.autoAttackHostile) return;

    // Continue attacking current target
    if (this.isInCombat && this.currentTarget && this.currentTarget.isValid) {
      const distance = this.bot.entity.position.distanceTo(this.currentTarget.position);
      
      if (distance > 32) { // Increased distance check
        logger.info(`Target ${this.currentTarget.username || this.currentTarget.name} too far, stopping combat`);
        this.stopCombat();
      }
    } else {
      // Not in combat or target invalid, look for new target
      this.findAndAttackTarget();
    }
  }

  updateCombatMode(distance) {
    const hasBow = this.bot.inventory.items().some(item => item.name === 'bow' || item.name === 'crossbow');
    const newMode = (distance > this.attackRange && this.useLongRange && hasBow) ? 'ranged' : 'melee';

    if (newMode !== this.combatMode) {
      logger.info(`Switching combat mode: ${this.combatMode} -> ${newMode}`);

      // Stop previous mode's plugin
      if (this.combatMode === 'ranged' && this.bot.hawkEye) {
        this.bot.hawkEye.stop();
      } else if (this.combatMode === 'melee' && this.bot.pvp) {
        this.bot.pvp.stop();
      }

      this.combatMode = newMode;

      // Equip appropriate weapon for new mode
      if (this.combatMode === 'ranged') {
        this.equipWeapon('ranged');
        this.bot.hawkEye.autoAttack(this.currentTarget, 'bow');
      } else {
        this.equipWeapon('melee');
        this.bot.pvp.attack(this.currentTarget);
      }
    }
  }

  async handleChat(username, message) {
    if (username === this.bot.username) return;

    if (message === '!attack') {
      this.autoAttack = true;
      this.bot.chat('Auto-attack enabled');
      this.findAndAttackTarget();
    } else if (message === '!attack player hostile' || message === '!attackHostile') {
      this.autoAttack = true; // Enable general combat loop
      this.autoAttackHostile = true;
      this.bot.chat(`Attacking hostile players enabled. Targets: ${this.hostilePlayers.join(', ')}`);
      this.findAndAttackTarget();
    } else if (message === '!defend') {
      this.autoAttack = false;
      this.autoAttackHostile = false;
      this.stopCombat();
      this.bot.chat('Auto-attack disabled');
    } else if (message === '!combat') {
      const status = this.getStatus();
      this.bot.chat(`Combat: ${status.isInCombat ? 'Active' : 'Inactive'}, Auto: ${status.autoAttack ? 'On' : 'Off'}, Hostile: ${status.autoAttackHostile ? 'On' : 'Off'}`);
    }
  }

    findNearestHostile() {
      const entities = Object.values(this.bot.entities);
      const hostiles = [];
      
      // Get hostile mobs if autoAttack is enabled
      if (this.autoAttack) {
        const mobs = filterTargets(entities, {
          hostile: true,
          maxDistance: 32,
          position: this.bot.entity.position,
          hostileMobs: this.hostileMobs
        });
        hostiles.push(...mobs);
      }
  
      // Get hostile players if configured
      if (this.autoAttackHostile && this.hostilePlayers.length > 0) {
        const hostilePlayers = filterTargets(entities, {
          players: true,
          maxDistance: 64, // Increased player detection range
          position: this.bot.entity.position,
          includeNames: this.hostilePlayers
        });
        
        if (hostilePlayers.length > 0) {
          logger.debug(`Found ${hostilePlayers.length} hostile players: ${hostilePlayers.map(p => p.username).join(', ')}`);
        }
        hostiles.push(...hostilePlayers);
      }
  
      if (hostiles.length === 0) return null;
  
      // Find closest
      return hostiles.reduce((closest, entity) => {
        const distEntity = this.bot.entity.position.distanceTo(entity.position);
        const distClosest = closest ? this.bot.entity.position.distanceTo(closest.position) : Infinity;
        return distEntity < distClosest ? entity : closest;
      }, null);
    }
  
    findAndAttackTarget() {
      if (!this.autoAttack && !this.autoAttackHostile) return;
  
      const target = this.findNearestHostile();
      if (target) {
        if (!this.isInCombat || this.currentTarget !== target) {
          logger.info(`New target found: ${target.username || target.name}`);
          this.attackEntity(target);
        }
      } else if (this.isInCombat) {
        logger.debug('No more targets found, stopping combat');
        this.stopCombat();
      }
    }
  attackEntity(entity) {
    this.isInCombat = true;
    this.currentTarget = entity;

    // Set state to fighting
    if (this.stateMachine) {
      this.stateMachine.setState('fighting');
    }

    logger.info(`Attacking ${entity.name || entity.displayName || entity.username || 'entity'}`);

    const distance = this.bot.entity.position.distanceTo(entity.position);

    // Initial mode setup
    const hasBow = this.bot.inventory.items().some(item => item.name === 'bow' || item.name === 'crossbow');
    this.combatMode = (distance > this.attackRange && this.useLongRange && hasBow) ? 'ranged' : 'melee';

    logger.info(`Starting combat in ${this.combatMode} mode`);

    this.equipWeapon(this.combatMode);
    this.equipShield();

    if (this.combatMode === 'ranged') {
      this.bot.hawkEye.autoAttack(entity, 'bow');
    } else {
      this.bot.pvp.attack(entity);
    }
  }

  stopCombat() {
    this.isInCombat = false;
    this.currentTarget = null;

    if (this.bot.pvp) {
      this.bot.pvp.stop();
    }

    if (this.bot.hawkEye) {
      this.bot.hawkEye.stop();
    }

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

  equipWeapon(type) {
    try {
      const items = this.bot.inventory.items();
      let bestWeapon = null;

      if (type === 'ranged') {
        bestWeapon = items.find(item => item.name === 'bow' || item.name === 'crossbow');
      } else {
        const meleeWeapons = items.filter(item => item.name.includes('sword') || item.name.includes('axe'));

        const weaponPriority = {
          'netherite_sword': 10, 'diamond_sword': 9, 'iron_sword': 8,
          'netherite_axe': 9, 'diamond_axe': 8, 'iron_axe': 7,
          'stone_sword': 7, 'wooden_sword': 6
        };

        meleeWeapons.sort((a, b) => {
          const priorityA = weaponPriority[a.name] || 0;
          const priorityB = weaponPriority[b.name] || 0;
          return priorityB - priorityA;
        });

        bestWeapon = meleeWeapons[0];
      }

      if (bestWeapon) {
        this.bot.equip(bestWeapon, 'hand');
        logger.info(`Equipped ${bestWeapon.name} for ${type} combat`);
        return true;
      }
      return false;
    } catch (error) {
      logger.error(`Failed to equip ${type} weapon`, error);
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
      autoAttackHostile: this.autoAttackHostile,
      currentTarget: this.currentTarget ? (this.currentTarget.name || this.currentTarget.username) : null,
      health: this.bot.health,
      food: this.bot.food
    };
  }
}

export default CombatManager;
