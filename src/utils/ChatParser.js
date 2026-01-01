/**
 * ChatParser - Utility class for parsing and cleaning chat messages
 */
class ChatParser {
  /**
   * Remove Minecraft color codes from text
   */
  static stripColors(text) {
    return text.replace(/§[0-9a-fk-or]/gi, '');
  }

  /**
   * Parse JSON chat format to plain text
   */
  static jsonToText(json) {
    if (typeof json === 'string') return json;
    if (!json) return '';

    let text = json.text || '';
    
    if (json.extra) {
      text += json.extra.map(extra => this.jsonToText(extra)).join('');
    }
    
    return text;
  }

  /**
   * Extract command and arguments from chat message
   */
  static parseCommand(message, prefix = '!') {
    const cleaned = this.stripColors(message).trim();
    
    // Find where the prefix starts
    let startIndex = cleaned.indexOf(prefix);
    
    // If prefix not found, return null
    if (startIndex === -1) {
      return null;
    }

    // Check if prefix is at the start or preceded by a space/colon (common in some chat formats)
    // This allows matching "User: !command" or "[Global] User: !command"
    if (startIndex > 0) {
      const charBefore = cleaned[startIndex - 1];
      if (charBefore !== ' ' && charBefore !== ':') {
        // Try finding another occurrence of prefix
        startIndex = cleaned.indexOf(prefix, startIndex + 1);
        if (startIndex === -1) return null;
      }
    }

    const withoutPrefix = cleaned.slice(startIndex + prefix.length);
    const parts = withoutPrefix.split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    return {
      command,
      args,
      rawArgs: withoutPrefix.slice(command.length).trim(),
      fullMessage: message
    };
  }

  /**
   * Check if message is from a player (not system)
   */
  static isPlayerMessage(jsonMsg) {
    const text = this.jsonToText(jsonMsg);
    // Common patterns for player messages
    return /<[^>]+>/.test(text) || /^\[[^\]]+\]/.test(text);
  }

  /**
   * Extract username from chat message
   */
  static extractUsername(message) {
    const text = typeof message === 'string' ? message : this.jsonToText(message);
    
    // Try <username> format
    const angleBrackets = text.match(/<([^>]+)>/);
    if (angleBrackets) return angleBrackets[1];
    
    // Try [username] format
    const squareBrackets = text.match(/^\[([^\]]+)\]/);
    if (squareBrackets) return squareBrackets[1];
    
    return null;
  }

  /**
   * Extract message content (without username prefix)
   */
  static extractMessage(message) {
    const text = typeof message === 'string' ? message : this.jsonToText(message);
    
    // Remove <username> or [username] prefix
    const cleaned = text
      .replace(/^<[^>]+>\s*/, '')
      .replace(/^\[[^\]]+\]\s*/, '');
    
    return this.stripColors(cleaned).trim();
  }

  /**
   * Validate if string is a valid Minecraft username
   */
  static isValidUsername(username) {
    return /^[a-zA-Z0-9_]{3,16}$/.test(username);
  }

  /**
   * Split long message into chunks (for chat length limits)
   */
  static splitMessage(message, maxLength = 256) {
    if (message.length <= maxLength) return [message];
    
    const chunks = [];
    let current = '';
    
    const words = message.split(' ');
    for (const word of words) {
      if ((current + ' ' + word).length > maxLength) {
        if (current) chunks.push(current.trim());
        current = word;
      } else {
        current += (current ? ' ' : '') + word;
      }
    }
    
    if (current) chunks.push(current.trim());
    return chunks;
  }

  /**
   * Check if message contains mentions of specific players
   */
  static containsMention(message, username) {
    const text = typeof message === 'string' ? message : this.jsonToText(message);
    const cleaned = this.stripColors(text).toLowerCase();
    return cleaned.includes(username.toLowerCase());
  }

  /**
   * Parse coordinates from message (e.g., "100 64 200" or "x:100 y:64 z:200")
   */
  static parseCoordinates(message) {
    const text = typeof message === 'string' ? message : this.jsonToText(message);
    
    // Try "x:100 y:64 z:200" format
    const namedMatch = text.match(/x:\s*(-?\d+)\s+y:\s*(-?\d+)\s+z:\s*(-?\d+)/i);
    if (namedMatch) {
      return {
        x: parseInt(namedMatch[1]),
        y: parseInt(namedMatch[2]),
        z: parseInt(namedMatch[3])
      };
    }
    
    // Try "100 64 200" format
    const numbersMatch = text.match(/(-?\d+)\s+(-?\d+)\s+(-?\d+)/);
    if (numbersMatch) {
      return {
        x: parseInt(numbersMatch[1]),
        y: parseInt(numbersMatch[2]),
        z: parseInt(numbersMatch[3])
      };
    }
    
    return null;
  }

  /**
   * Escape special characters for safe chat output
   */
  static escape(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

export default ChatParser;
