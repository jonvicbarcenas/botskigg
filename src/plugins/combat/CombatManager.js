import BaseBehaviorPlugin from '../base/_BaseBehaviorPlugin.js';
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
    this.attackRange = 6; // Distance to switch from melee to ranged
    // Check both plugin-specific config and global features config
    this.autoAttack = config.autoCombat || this.bot.config?.features?.autoCombat || false;

    // Hostile player settings from config
    this.hostilePlayers = this.bot.config?.hostilePlayer?.target || [];
    this.autoAttackHostile = this.bot.config?.hostilePlayer?.autoAttack || false;
    this.useMelee = this.bot.config?.hostilePlayer?.useMelee !== false;
    this.useLongRange = this.bot.config?.hostilePlayer?.useLongRange || false;

    // Auto-retaliate when hurt (works on any attacker - mobs or players)
    this.autoRetaliate = this.bot.config?.combat?.autoRetaliate !== false; // Default true

    this.combatInterval = null;
    this.combatMode = 'melee'; // 'melee' or 'ranged'
    
    // Track pending hurt events for fallback (if bloodhound doesn't fire)
    this.pendingHurtTime = null;
    this.bloodhoundHandled = false;
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

    // Register event handlers
    this.registerEvent('entityHurt', this.onEntityHurt);
    this.registerEvent('physicsTick', this.onPhysicsTick);
    this.registerEvent('chat', this.handleChat);
    this.registerEvent('onCorrelateAttack', this.onCorrelateAttack);
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
      () => (!this.autoAttack && !this.autoAttackHostile) || this.currentTarget === null || !this.bot.entities[this.currentTarget.id]
    );

    logger.info('Combat behaviors and transitions registered');
  }

  async unload() {
    this.stopCombat();
    this.unregisterAllEvents();
    this.isLoaded = false;
    logger.info('CombatManager plugin unloaded');
  }

  /**
   * Called when any entity is hurt - starts fallback timer
   */
  onEntityHurt(entity) {
    // Only care if the bot was hurt
    if (entity !== this.bot.entity) return;
    if (!this.autoRetaliate && !this.autoAttack && !this.autoAttackHostile) return;

    logger.info('CombatManager: Bot was hurt, waiting for bloodhound...');
    
    // Mark that we're waiting for bloodhound
    this.pendingHurtTime = Date.now();
    this.bloodhoundHandled = false;
    
    // Fallback after 150ms if bloodhound doesn't fire
    setTimeout(() => {
      if (!this.bloodhoundHandled && this.pendingHurtTime) {
        logger.info('CombatManager: Bloodhound did not fire, using fallback');
        this.fallbackRetaliate();
      }
    }, 150);
  }

  /**
   * Fallback retaliation - find nearest potential attacker
   */
  fallbackRetaliate() {
    const attacker = this.findNearestAttacker();
    if (attacker) {
      const attackerName = attacker.username || attacker.name || 'unknown';
      logger.info(`CombatManager: Fallback identified attacker: ${attackerName}`);
      this.bot.chat(`${attackerName} just hit me! Time to fight back!`);
      this.retaliate(attacker);
    } else {
      logger.warn('CombatManager: No attacker found nearby');
    }
    this.pendingHurtTime = null;
  }

  /**
   * Find nearest entity that could have attacked (player or mob within attack range)
   */
  findNearestAttacker() {
    const entities = Object.values(this.bot.entities);
    const maxAttackRange = 6;
    
    const potentialAttackers = entities.filter(e => {
      if (!e.position || e === this.bot.entity) return false;
      const dist = this.bot.entity.position.distanceTo(e.position);
      if (dist > maxAttackRange) return false;
      
      // Include players (except self)
      if (e.type === 'player' && e.username !== this.bot.username) return true;
      
      // Include hostile mobs
      if (e.type === 'mob' && this.hostileMobs.includes(e.name)) return true;
      
      return false;
    });

    if (potentialAttackers.length === 0) return null;

    return potentialAttackers.reduce((closest, entity) => {
      const dist = this.bot.entity.position.distanceTo(entity.position);
      const closestDist = closest ? this.bot.entity.position.distanceTo(closest.position) : Infinity;
      return dist < closestDist ? entity : closest;
    }, null);
  }

  /**
   * Bloodhound correlation event - identifies who attacked whom (accurate)
   */
  onCorrelateAttack(attacker, victim, weapon) {
    logger.info(`CombatManager: Bloodhound onCorrelateAttack fired - attacker: ${attacker?.username || attacker?.name}, victim: ${victim?.username || 'bot'}`);
    
    // Mark that bloodhound handled this hurt event (prevents fallback)
    this.bloodhoundHandled = true;
    this.pendingHurtTime = null;
    
    // Only care if the bot was the victim
    if (victim !== this.bot.entity) {
      logger.debug('CombatManager: Bloodhound - victim is not the bot, ignoring');
      return;
    }
    if (!this.autoRetaliate && !this.autoAttack && !this.autoAttackHostile) {
      logger.debug('CombatManager: Bloodhound - retaliation disabled, ignoring');
      return;
    }

    const attackerName = attacker.username || attacker.name || 'unknown';
    logger.info(`CombatManager: Bloodhound identified attacker: ${attackerName} (weapon: ${weapon?.name || 'fist'})`);
    this.bot.chat(`${attackerName} just hit me! Time to fight back!`);
    this.retaliate(attacker);
  }

  retaliate(attacker) {
    logger.debug(`CombatManager: Retaliate called for ${attacker.username || attacker.name}`);
    // Don't switch targets if already in combat with a player, 
    // unless the new attacker is also a player and closer/more dangerous
    if (this.isInCombat && this.currentTarget) {
      const currentDist = this.bot.entity.position.distanceTo(this.currentTarget.position);
      const newDist = this.bot.entity.position.distanceTo(attacker.position);

      const currentIsPlayer = this.currentTarget.type === 'player';
      const newIsPlayer = attacker.type === 'player';

      logger.debug(`CombatManager: Retaliate check - currentIsPlayer=${currentIsPlayer}, newIsPlayer=${newIsPlayer}, currentDist=${currentDist.toFixed(1)}, newDist=${newDist.toFixed(1)}`);

      if (currentIsPlayer && !newIsPlayer) {
        logger.debug('CombatManager: Staying on current player target instead of retaliating against mob');
        return;
      }
      if (newDist > currentDist && (currentIsPlayer === newIsPlayer)) {
        logger.debug('CombatManager: Staying on closer target');
        return;
      }
    }

    logger.info(`CombatManager: Retaliating against ${attacker.username || attacker.name}`);
    this.attackEntity(attacker);
  }

  async onPhysicsTick() {
    if (!this.autoAttack && !this.autoAttackHostile) return;

    // Continue attacking current target
    const targetEntity = this.currentTarget ? this.bot.entities[this.currentTarget.id] : null;

    if (this.isInCombat && targetEntity) {
      const distance = this.bot.entity.position.distanceTo(targetEntity.position);

      // Dynamically update combat mode based on distance
      await this.updateCombatMode(distance);

      if (distance > 64) {
        logger.info(`Target ${targetEntity.username || targetEntity.name} too far (${distance.toFixed(1)}m), stopping combat`);
        this.stopCombat();
      }
    } else {
      if (this.isInCombat) {
        logger.info('Target lost or invalid, looking for new target');
        this.stopCombat();
      }
      // Not in combat or target invalid, look for new target
      this.findAndAttackTarget();
    }
  }

  async updateCombatMode(distance) {
    const hasBow = this.bot.inventory.items().some(item => item.name === 'bow' || item.name === 'crossbow');

    // Hysteresis buffer (2 blocks)
    const buffer = 2;
    let newMode = this.combatMode;

    if (this.combatMode === 'melee') {
      // If in melee, stay in melee until target is further than attackRange + buffer
      if (distance > (this.attackRange + buffer) && this.useLongRange && hasBow) {
        newMode = 'ranged';
      }
    } else {
      // If in ranged, stay in ranged until target is closer than attackRange
      if (distance <= this.attackRange || !this.useLongRange || !hasBow) {
        newMode = 'melee';
      }
    }

    if (newMode !== this.combatMode) {
      logger.info(`Switching combat mode: ${this.combatMode} -> ${newMode} (Distance: ${distance.toFixed(1)}m, Range: ${this.attackRange}m)`);

      // Stop previous mode's plugin
      if (this.combatMode === 'ranged' && this.bot.hawkEye) {
        this.bot.hawkEye.stop();
      } else if (this.combatMode === 'melee' && this.bot.pvp) {
        this.bot.pvp.stop();
      }

      this.combatMode = newMode;

      // Equip appropriate weapon for new mode
      if (this.combatMode === 'ranged') {
        await this.equipWeapon('ranged');
        this.bot.hawkEye.autoAttack(this.currentTarget, 'bow');
      } else {
        await this.equipWeapon('melee');
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

  async attackEntity(entity) {
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

    await this.equipWeapon(this.combatMode);
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

  async equipWeapon(type) {
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
        await this.bot.equip(bestWeapon, 'hand');
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
