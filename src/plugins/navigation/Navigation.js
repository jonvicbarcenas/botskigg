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
    this.stateMachine = null;
    this.behaviors = {};
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
    // Create moving behavior
    const movingBehavior = new BehaviorIdle();
    movingBehavior.stateName = 'moving';
    movingBehavior.onStateEntered = () => {
      logger.debug('Entered moving state');
    };
    this.stateMachine.addBehavior('moving', movingBehavior);
    
    // Create following behavior
    const followingBehavior = new BehaviorIdle();
    followingBehavior.stateName = 'following';
    followingBehavior.onStateEntered = () => {
      logger.debug('Entered following state');
    };
    this.stateMachine.addBehavior('following', followingBehavior);
    
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
    
    logger.info('Navigation behaviors and transitions registered');
  }

  async unload() {
    this.stopFollowing();
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
