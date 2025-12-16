import IPlugin from '../../interfaces/IPlugin.js';
import PathfinderUtil from '../../utils/Pathfinder.js';
import logger from '../../utils/Logger.js';
import ChatParser from '../../utils/ChatParser.js';
import mineflayerStateMachine from 'mineflayer-statemachine';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { BehaviorIdle, BehaviorFollowEntity, StateTransition } = mineflayerStateMachine;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Navigation Plugin - Handles bot movement and pathfinding
 */
class Navigation extends IPlugin {
  constructor(bot, config = {}) {
    super('Navigation', bot, config);
    this.pathfinder = null;
    this.waypoints = null;
    this.currentTarget = null;
    this.isFollowing = false;
    this.followTarget = null;
    this.isPatrolling = false;
    this.patrolRoute = [];
    this.currentPatrolIndex = 0;
    this.stateMachine = null;
    this.behaviors = {};
    this.movementInterval = null;
    this.followingInterval = null;
    this.patrolInterval = null;
  }

  async load() {
    try {
      // Get StateMachine reference
      this.stateMachine = this.bot.stateMachine;
      
      // Load waypoints
      this.loadWaypoints();
      
      // Initialize pathfinder
      this.pathfinder = new PathfinderUtil(this.bot, this.config.physics?.pathfinder || {});
      this.pathfinder.initialize();
      
      // Setup navigation behaviors if state machine is available
      if (this.stateMachine) {
        this.setupBehaviors();
      }
      
      // Register chat commands
      this.registerEvent('chat', this.handleChat);
      
      // Register pathfinding events
      this.bot.on('goal_reached', () => {
        logger.success('Navigation goal reached');
        this.currentTarget = null;
        
        // Return to idle if not following
        if (this.stateMachine && !this.isFollowing) {
          this.stateMachine.setState('idle');
        }
      });
      
      this.bot.on('path_update', (results) => {
        if (results.status === 'noPath') {
          logger.warn('No path found to target');
        }
      });
      
      this.isLoaded = true;
      logger.success('Navigation plugin loaded');
    } catch (error) {
      logger.error('Failed to load Navigation plugin', error);
      throw error;
    }
  }

  /**
   * Setup state machine behaviors for navigation
   */
  setupBehaviors() {
    // Create dynamic moving behavior
    const movingBehavior = this.createMovingBehavior();
    this.stateMachine.addBehavior('moving', movingBehavior);
    
    // Create dynamic following behavior
    const followingBehavior = this.createFollowingBehavior();
    this.stateMachine.addBehavior('following', followingBehavior);
    
    // Create dynamic patrolling behavior
    const patrollingBehavior = this.createPatrollingBehavior();
    this.stateMachine.addBehavior('patrolling', patrollingBehavior);
    
    // Create transitions
    this.stateMachine.createTransition({
      parent: 'idle',
      child: 'moving',
      name: 'idle_to_moving',
      shouldTransition: () => false, // Manual transition
      onTransition: () => {
        logger.debug('Transitioning from idle to moving');
      }
    });
    
    this.stateMachine.createTransition({
      parent: 'idle',
      child: 'following',
      name: 'idle_to_following',
      shouldTransition: () => false, // Manual transition
      onTransition: () => {
        logger.debug('Transitioning from idle to following');
      }
    });
    
    this.stateMachine.createTransition({
      parent: 'idle',
      child: 'patrolling',
      name: 'idle_to_patrolling',
      shouldTransition: () => false, // Manual transition
      onTransition: () => {
        logger.debug('Transitioning from idle to patrolling');
      }
    });
    
    this.stateMachine.createTransition({
      parent: 'moving',
      child: 'idle',
      name: 'moving_to_idle',
      shouldTransition: () => !this.pathfinder.isMoving(),
      onTransition: () => {
        logger.debug('Transitioning from moving to idle');
      }
    });
    
    this.stateMachine.createTransition({
      parent: 'following',
      child: 'idle',
      name: 'following_to_idle',
      shouldTransition: () => !this.isFollowing,
      onTransition: () => {
        logger.debug('Transitioning from following to idle');
      }
    });
    
    this.stateMachine.createTransition({
      parent: 'patrolling',
      child: 'idle',
      name: 'patrolling_to_idle',
      shouldTransition: () => !this.isPatrolling,
      onTransition: () => {
        logger.debug('Transitioning from patrolling to idle');
      }
    });
    
    logger.info('Dynamic navigation behaviors and transitions registered');
  }

  /**
   * Create dynamic moving behavior
   */
  createMovingBehavior() {
    const movingBehavior = new BehaviorIdle();
    movingBehavior.stateName = 'moving';
    
    movingBehavior.onStateEntered = () => {
      logger.info('Bot started moving to destination');
      this.startMovementMonitoring();
    };
    
    movingBehavior.onStateExited = () => {
      logger.debug('Bot stopped moving');
      this.stopMovementMonitoring();
    };
    
    return movingBehavior;
  }

  /**
   * Create dynamic following behavior
   */
  createFollowingBehavior() {
    const followingBehavior = new BehaviorIdle();
    followingBehavior.stateName = 'following';
    
    followingBehavior.onStateEntered = () => {
      logger.info(`Bot started following ${this.followTarget}`);
      this.startFollowingMonitoring();
    };
    
    followingBehavior.onStateExited = () => {
      logger.debug('Bot stopped following');
      this.stopFollowingMonitoring();
    };
    
    return followingBehavior;
  }

  /**
   * Create dynamic patrolling behavior
   */
  createPatrollingBehavior() {
    const patrollingBehavior = new BehaviorIdle();
    patrollingBehavior.stateName = 'patrolling';
    
    patrollingBehavior.onStateEntered = () => {
      logger.info('Bot started patrolling route');
      this.startPatrolling();
    };
    
    patrollingBehavior.onStateExited = () => {
      logger.debug('Bot stopped patrolling');
      this.stopPatrolling();
    };
    
    return patrollingBehavior;
  }

  /**
   * Start movement monitoring
   */
  startMovementMonitoring() {
    this.movementInterval = setInterval(() => {
      if (!this.pathfinder.isMoving() && this.stateMachine.getState() === 'moving') {
        logger.success('Movement completed, returning to idle');
        this.stateMachine.setState('idle');
      }
    }, 1000);
  }

  /**
   * Stop movement monitoring
   */
  stopMovementMonitoring() {
    if (this.movementInterval) {
      clearInterval(this.movementInterval);
      this.movementInterval = null;
    }
  }

  /**
   * Start following monitoring
   */
  startFollowingMonitoring() {
    this.followingInterval = setInterval(() => {
      if (!this.isFollowing && this.stateMachine.getState() === 'following') {
        logger.info('Following stopped, returning to idle');
        this.stateMachine.setState('idle');
      } else if (this.isFollowing && this.followTarget) {
        // Continuously update following target
        const player = this.bot.players[this.followTarget]?.entity;
        if (!player) {
          logger.warn(`Lost sight of ${this.followTarget}, stopping follow`);
          this.stopFollowing();
          this.stateMachine.setState('idle');
        }
      }
    }, 2000);
  }

  /**
   * Stop following monitoring
   */
  stopFollowingMonitoring() {
    if (this.followingInterval) {
      clearInterval(this.followingInterval);
      this.followingInterval = null;
    }
  }

  /**
   * Start patrolling
   */
  startPatrolling() {
    this.isPatrolling = true;
    this.currentPatrolIndex = 0;
    this.patrolRoute = this.getPatrolRoute();
    
    if (this.patrolRoute.length === 0) {
      logger.warn('No patrol route defined, returning to idle');
      this.stateMachine.setState('idle');
      return;
    }
    
    this.performPatrolStep();
  }

  /**
   * Stop patrolling
   */
  stopPatrolling() {
    this.isPatrolling = false;
    if (this.patrolInterval) {
      clearInterval(this.patrolInterval);
      this.patrolInterval = null;
    }
  }

  /**
   * Perform one step of patrol
   */
  async performPatrolStep() {
    if (!this.isPatrolling || this.patrolRoute.length === 0) return;
    
    const waypoint = this.patrolRoute[this.currentPatrolIndex];
    logger.info(`Patrolling to waypoint: ${waypoint.name}`);
    
    try {
      await this.gotoCoords(waypoint.x, waypoint.y, waypoint.z, true);
      
      // Move to next waypoint
      this.currentPatrolIndex = (this.currentPatrolIndex + 1) % this.patrolRoute.length;
      
      // Wait a bit before next waypoint
      setTimeout(() => {
        if (this.isPatrolling) {
          this.performPatrolStep();
        }
      }, 3000);
      
    } catch (error) {
      logger.error('Error during patrol step:', error);
      this.stopPatrolling();
      this.stateMachine.setState('idle');
    }
  }

  /**
   * Get patrol route from waypoints
   */
  getPatrolRoute() {
    // Create a simple patrol route from existing waypoints
    const waypoints = Object.entries(this.waypoints?.waypoints || {});
    return waypoints.map(([name, pos]) => ({
      name,
      x: pos.x,
      y: pos.y,
      z: pos.z
    }));
  }

  async unload() {
    this.stopFollowing();
    this.stopPatrolling();
    this.stopMovementMonitoring();
    this.stopFollowingMonitoring();
    this.pathfinder.stop();
    this.unregisterAllEvents();
    this.isLoaded = false;
    logger.info('Navigation plugin unloaded');
  }

  loadWaypoints() {
    try {
      const waypointsPath = path.join(__dirname, '../../../data/waypoints.json');
      if (fs.existsSync(waypointsPath)) {
        this.waypoints = JSON.parse(fs.readFileSync(waypointsPath, 'utf8'));
        logger.info(`Loaded ${Object.keys(this.waypoints.waypoints || {}).length} waypoints`);
      }
    } catch (error) {
      logger.error('Failed to load waypoints', error);
      this.waypoints = { waypoints: {}, routes: {}, areas: {} };
    }
  }

  saveWaypoints() {
    try {
      const waypointsPath = path.join(__dirname, '../../../data/waypoints.json');
      fs.writeFileSync(waypointsPath, JSON.stringify(this.waypoints, null, 2));
      logger.success('Waypoints saved');
    } catch (error) {
      logger.error('Failed to save waypoints', error);
    }
  }

  async handleChat(username, message) {
    if (username === this.bot.username) return;
    
    const parsed = ChatParser.parseCommand(message, '!');
    if (!parsed) return;
    
    const { command, args } = parsed;
    
    try {
      switch (command) {
        case 'come':
          await this.comeToPlayer(username);
          break;
        case 'follow':
          this.followPlayer(username);
          break;
        case 'stop':
          this.stop();
          break;
        case 'goto':
          if (args.length === 0) {
            this.bot.chat('Usage: !goto <waypoint> or !goto <x> <y> <z>');
            return;
          }
          if (args.length === 3) {
            await this.gotoCoords(parseInt(args[0]), parseInt(args[1]), parseInt(args[2]));
          } else {
            await this.gotoWaypoint(args[0]);
          }
          break;
        case 'waypoint':
          if (args[0] === 'add' && args[1]) {
            this.addWaypoint(args[1]);
          } else if (args[0] === 'list') {
            this.listWaypoints();
          }
          break;
        case 'patrol':
          if (args[0] === 'start') {
            this.startPatrolCommand();
          } else if (args[0] === 'stop') {
            this.stopPatrolCommand();
          } else if (args[0] === 'status') {
            this.getPatrolStatus();
          }
          break;
      }
    } catch (error) {
      logger.error('Navigation command error', error);
      this.bot.chat(`Error: ${error.message}`);
    }
  }

  async comeToPlayer(username) {
    const player = this.bot.players[username]?.entity;
    if (!player) {
      this.bot.chat(`Cannot find ${username}`);
      return;
    }
    
    // Set state to moving
    if (this.stateMachine) {
      this.stateMachine.setState('moving');
    }
    
    this.bot.chat(`Coming to ${username}...`);
    await this.pathfinder.gotoPlayer(username, 2);
    this.bot.chat('I have arrived!');
  }

  followPlayer(username) {
    const player = this.bot.players[username]?.entity;
    if (!player) {
      this.bot.chat(`Cannot find ${username}`);
      return;
    }
    
    this.isFollowing = true;
    this.followTarget = username;
    
    // Set state to following
    if (this.stateMachine) {
      this.stateMachine.setState('following');
    }
    
    this.pathfinder.followPlayer(username, 3);
    this.bot.chat(`Following ${username}`);
  }

  stopFollowing() {
    this.isFollowing = false;
    this.followTarget = null;
  }

  stop(silent = false) {
    this.stopFollowing();
    this.pathfinder.stop();
    this.currentTarget = null;
    
    // Return to idle state
    if (this.stateMachine) {
      this.stateMachine.setState('idle');
    }
    
    if (!silent) {
      this.bot.chat('Stopped');
    }
  }

  async gotoCoords(x, y, z, silent = false) {
    // Set state to moving
    if (this.stateMachine) {
      this.stateMachine.setState('moving');
    }
    
    if (!silent) {
      this.bot.chat(`Going to ${x}, ${y}, ${z}...`);
    }
    this.currentTarget = { x, y, z };
    await this.pathfinder.goto(x, y, z);
    if (!silent) {
      this.bot.chat('Destination reached!');
    }
  }

  async gotoWaypoint(name) {
    if (!this.waypoints.waypoints[name]) {
      this.bot.chat(`Waypoint '${name}' not found`);
      return;
    }
    
    const { x, y, z } = this.waypoints.waypoints[name];
    await this.gotoCoords(x, y, z);
  }

  addWaypoint(name) {
    const pos = this.bot.entity.position;
    this.waypoints.waypoints[name] = {
      x: Math.floor(pos.x),
      y: Math.floor(pos.y),
      z: Math.floor(pos.z),
      description: `Added by command`
    };
    this.saveWaypoints();
    this.bot.chat(`Waypoint '${name}' saved at current location`);
  }

  listWaypoints() {
    const names = Object.keys(this.waypoints.waypoints);
    if (names.length === 0) {
      this.bot.chat('No waypoints saved');
      return;
    }
    this.bot.chat(`Waypoints: ${names.join(', ')}`);
  }

  startPatrolCommand() {
    if (this.isPatrolling) {
      this.bot.chat('Already patrolling');
      return;
    }
    
    const waypointCount = Object.keys(this.waypoints?.waypoints || {}).length;
    if (waypointCount < 2) {
      this.bot.chat('Need at least 2 waypoints to patrol');
      return;
    }
    
    if (this.stateMachine) {
      this.stateMachine.setState('patrolling');
      this.bot.chat(`Started patrolling ${waypointCount} waypoints`);
    } else {
      this.bot.chat('State machine not available');
    }
  }

  stopPatrolCommand() {
    if (!this.isPatrolling) {
      this.bot.chat('Not currently patrolling');
      return;
    }
    
    this.stopPatrolling();
    if (this.stateMachine) {
      this.stateMachine.setState('idle');
    }
    this.bot.chat('Patrol stopped');
  }

  getPatrolStatus() {
    if (this.isPatrolling) {
      const currentWaypoint = this.patrolRoute[this.currentPatrolIndex];
      this.bot.chat(`Patrolling: ${this.currentPatrolIndex + 1}/${this.patrolRoute.length} - Next: ${currentWaypoint?.name || 'unknown'}`);
    } else {
      this.bot.chat('Not patrolling');
    }
  }

  getStatus() {
    return {
      ...super.getStatus(),
      isFollowing: this.isFollowing,
      followTarget: this.followTarget,
      currentTarget: this.currentTarget,
      isMoving: this.pathfinder?.isMoving() || false,
      waypointCount: Object.keys(this.waypoints?.waypoints || {}).length
    };
  }
}

export default Navigation;
