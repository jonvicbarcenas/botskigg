/**
 * ICommand - Base interface for chat command structure
 */
class ICommand {
  constructor(name, description, usage, permission = null) {
    if (new.target === ICommand) {
      throw new Error('Cannot instantiate abstract class ICommand directly');
    }

    this.name = name;
    this.description = description;
    this.usage = usage;
    this.permission = permission;
    this.aliases = [];
    this.cooldown = 0; // milliseconds
    this.lastUsed = new Map(); // username -> timestamp
  }

  /**
   * Execute the command - must be implemented by child classes
   * @param {Object} bot - The bot instance
   * @param {string} username - The user who executed the command
   * @param {Array} args - Command arguments
   * @param {string} rawArgs - Raw argument string
   */
  async execute(bot, username, args, rawArgs) {
    throw new Error('Method execute() must be implemented');
  }

  /**
   * Check if user is on cooldown
   */
  isOnCooldown(username) {
    if (this.cooldown === 0) return false;

    const lastUsed = this.lastUsed.get(username);
    if (!lastUsed) return false;

    const elapsed = Date.now() - lastUsed;
    return elapsed < this.cooldown;
  }

  /**
   * Get remaining cooldown time in seconds
   */
  getRemainingCooldown(username) {
    if (this.cooldown === 0) return 0;

    const lastUsed = this.lastUsed.get(username);
    if (!lastUsed) return 0;

    const elapsed = Date.now() - lastUsed;
    const remaining = this.cooldown - elapsed;
    
    return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
  }

  /**
   * Update cooldown for user
   */
  updateCooldown(username) {
    this.lastUsed.set(username, Date.now());
  }

  /**
   * Add command alias
   */
  addAlias(alias) {
    if (!this.aliases.includes(alias)) {
      this.aliases.push(alias);
    }
  }

  /**
   * Check if name matches this command (including aliases)
   */
  matches(commandName) {
    return this.name === commandName || this.aliases.includes(commandName);
  }

  /**
   * Validate command arguments - override for custom validation
   */
  validate(args) {
    return { valid: true };
  }

  /**
   * Get help text for this command
   */
  getHelp() {
    let help = `§e${this.name}§r - ${this.description}\n`;
    help += `§7Usage: ${this.usage}§r`;
    
    if (this.aliases.length > 0) {
      help += `\n§7Aliases: ${this.aliases.join(', ')}§r`;
    }
    
    if (this.cooldown > 0) {
      help += `\n§7Cooldown: ${this.cooldown / 1000}s§r`;
    }
    
    return help;
  }

  /**
   * Lifecycle hook - called before execution
   */
  beforeExecute(bot, username, args) {
    // Optional override
  }

  /**
   * Lifecycle hook - called after execution
   */
  afterExecute(bot, username, args, result) {
    // Optional override
  }

  /**
   * Error handler - override for custom error handling
   */
  onError(error, bot, username) {
    bot.chat(`Error executing command: ${error.message}`);
  }
}

export default ICommand;
