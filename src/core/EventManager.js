import logger from '../utils/Logger.js';
import ChatParser from '../utils/ChatParser.js';

/**
 * EventManager - Central hub that routes Minecraft events to specific handlers
 */
class EventManager {
  constructor(bot, stateManager) {
    this.bot = bot;
    this.stateManager = stateManager;
    this.handlers = new Map();
    this.eventStats = new Map();
  }

  /**
   * Initialize core event listeners
   */
  initialize() {
    this.registerCoreEvents();
    logger.success('EventManager initialized');
  }

  /**
   * Register core Minecraft events
   */
  registerCoreEvents() {
    // Connection events
    this.on('login', this.onLogin.bind(this));
    this.on('spawn', this.onSpawn.bind(this));
    this.on('end', this.onEnd.bind(this));
    this.on('kicked', this.onKicked.bind(this));
    this.on('error', this.onError.bind(this));

    // Chat events
    this.on('chat', this.onChat.bind(this));
    this.on('whisper', this.onWhisper.bind(this));
    this.on('message', this.onMessage.bind(this));

    // Health events
    this.on('health', this.onHealth.bind(this));
    this.on('death', this.onDeath.bind(this));

    // Player events
    this.on('playerJoined', this.onPlayerJoined.bind(this));
    this.on('playerLeft', this.onPlayerLeft.bind(this));

    // Entity events
    this.on('entityHurt', this.onEntityHurt.bind(this));
    this.on('entityDead', this.onEntityDead.bind(this));

    // Time event
    this.on('time', this.onTime.bind(this));
  }

  /**
   * Register an event handler
   */
  on(eventName, handler, priority = 0) {
    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, []);
      this.eventStats.set(eventName, 0);
      
      // Attach listener to bot
      this.bot.on(eventName, (...args) => this.handleEvent(eventName, ...args));
    }

    this.handlers.get(eventName).push({ handler, priority });
    
    // Sort by priority (higher priority first)
    this.handlers.get(eventName).sort((a, b) => b.priority - a.priority);
  }

  /**
   * Remove an event handler
   */
  off(eventName, handler) {
    if (!this.handlers.has(eventName)) return;

    const handlers = this.handlers.get(eventName);
    const index = handlers.findIndex(h => h.handler === handler);
    
    if (index > -1) {
      handlers.splice(index, 1);
    }
  }

  /**
   * Handle event and route to registered handlers
   */
  async handleEvent(eventName, ...args) {
    if (!this.handlers.has(eventName)) return;

    // Increment event counter
    this.eventStats.set(eventName, this.eventStats.get(eventName) + 1);

    const handlers = this.handlers.get(eventName);
    
    for (const { handler } of handlers) {
      try {
        await handler(...args);
      } catch (error) {
        logger.error(`Error in event handler for ${eventName}`, error);
      }
    }
  }

  /**
   * Core event handlers
   */
  onLogin() {
    logger.success(`Bot logged in as ${this.bot.username}`);
    this.stateManager.setState('isLoggedIn', true);
    this.stateManager.setState('loginTime', Date.now());
  }

  onSpawn() {
    const pos = this.bot.entity.position;
    logger.success(`Bot spawned at ${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}`);
    this.stateManager.setState('hasSpawned', true);
    this.stateManager.setState('spawnPosition', pos);
  }

  onEnd(reason) {
    logger.warn(`Connection ended: ${reason}`);
    this.stateManager.setState('isLoggedIn', false);
    this.stateManager.setState('hasSpawned', false);
  }

  onKicked(reason) {
    logger.error(`Bot was kicked: ${reason}`);
  }

  onError(error) {
    logger.error('Bot error occurred', error);
  }

  onChat(username, message) {
    if (username === this.bot.username) return;
    
    logger.chat(username, message);
    this.stateManager.incrementState('chatMessagesReceived');
  }

  onWhisper(username, message) {
    logger.info(`[WHISPER] ${username}: ${message}`);
  }

  onMessage(jsonMsg, position) {
    const text = ChatParser.jsonToText(jsonMsg);
    // Position: chat = 0, system = 1, game_info = 2
    if (position === 1) {
      logger.bot(`[SYSTEM] ${text}`);
    } else if (position === 0) {
      logger.debug(`[CHAT_RAW] ${text}`);
    } else if (position === 2) {
      logger.debug(`[GAME_INFO] ${text}`);
    }
  }

  onHealth() {
    const health = this.bot.health;
    const food = this.bot.food;
    
    this.stateManager.setState('health', health);
    this.stateManager.setState('food', food);

    if (health < 10) {
      logger.warn(`Low health: ${health}/20`);
    }
    
    if (food < 6) {
      logger.warn(`Low food: ${food}/20`);
    }
  }

  onDeath() {
    logger.error('Bot died!');
    this.stateManager.setState('isDead', true);
    this.stateManager.incrementState('deathCount');
  }

  onPlayerJoined(player) {
    logger.info(`Player joined: ${player.username}`);
  }

  onPlayerLeft(player) {
    logger.info(`Player left: ${player.username}`);
  }

  onEntityHurt(entity) {
    if (entity === this.bot.entity) {
      logger.warn('Bot was hurt!');
    }
  }

  onEntityDead(entity) {
    if (entity === this.bot.entity) {
      this.onDeath();
    }
  }

  onTime() {
    const time = this.bot.time.timeOfDay;
    this.stateManager.setState('timeOfDay', time);
  }

  /**
   * Get event statistics
   */
  getStats() {
    return {
      totalEvents: Array.from(this.eventStats.values()).reduce((sum, count) => sum + count, 0),
      eventCounts: Object.fromEntries(this.eventStats),
      registeredEvents: Array.from(this.handlers.keys())
    };
  }

  /**
   * Clear event statistics
   */
  clearStats() {
    for (const key of this.eventStats.keys()) {
      this.eventStats.set(key, 0);
    }
  }

  /**
   * Remove all handlers for an event
   */
  removeAllHandlers(eventName) {
    if (this.handlers.has(eventName)) {
      this.handlers.delete(eventName);
      this.bot.removeAllListeners(eventName);
    }
  }

  /**
   * Clean up all event handlers
   */
  cleanup() {
    for (const eventName of this.handlers.keys()) {
      this.bot.removeAllListeners(eventName);
    }
    this.handlers.clear();
    this.eventStats.clear();
    logger.info('EventManager cleaned up');
  }
}

export default EventManager;
