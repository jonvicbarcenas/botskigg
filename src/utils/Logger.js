import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Custom Logger class with formatting, timestamps, and file saving capabilities
 */
class Logger {
  constructor(logToFile = true, logLevel = 'info') {
    this.logToFile = logToFile;
    this.logLevel = logLevel;
    this.logLevels = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3
    };
    
    // Ensure logs directory exists
    this.logsDir = path.join(__dirname, '../../logs');
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
    
    this.latestLogPath = path.join(this.logsDir, 'latest.log');
    this.errorLogPath = path.join(this.logsDir, 'error.log');
    
    // Clear latest.log on startup
    if (this.logToFile) {
      fs.writeFileSync(this.latestLogPath, '');
    }
  }

  /**
   * Get formatted timestamp
   */
  getTimestamp() {
    const now = new Date();
    return now.toISOString();
  }

  /**
   * Check if message should be logged based on level
   */
  shouldLog(level) {
    return this.logLevels[level] >= this.logLevels[this.logLevel];
  }

  /**
   * Format log message
   */
  formatMessage(level, message, metadata = null) {
    const timestamp = this.getTimestamp();
    const levelStr = level.toUpperCase().padEnd(5);
    let formatted = `[${timestamp}] [${levelStr}] ${message}`;
    
    if (metadata) {
      formatted += `\n${JSON.stringify(metadata, null, 2)}`;
    }
    
    return formatted;
  }

  /**
   * Write to log file
   */
  writeToFile(message, isError = false) {
    if (!this.logToFile) return;
    
    try {
      // Write to latest.log
      fs.appendFileSync(this.latestLogPath, message + '\n');
      
      // Also write errors to error.log
      if (isError) {
        fs.appendFileSync(this.errorLogPath, message + '\n');
      }
    } catch (err) {
      console.error('Failed to write to log file:', err);
    }
  }

  /**
   * Debug level logging
   */
  debug(message, metadata = null) {
    if (!this.shouldLog('debug')) return;
    
    const formatted = this.formatMessage('debug', message, metadata);
    console.log('\x1b[36m%s\x1b[0m', formatted); // Cyan
    this.writeToFile(formatted);
  }

  /**
   * Info level logging
   */
  info(message, metadata = null) {
    if (!this.shouldLog('info')) return;
    
    const formatted = this.formatMessage('info', message, metadata);
    console.log('\x1b[32m%s\x1b[0m', formatted); // Green
    this.writeToFile(formatted);
  }

  /**
   * Warning level logging
   */
  warn(message, metadata = null) {
    if (!this.shouldLog('warn')) return;
    
    const formatted = this.formatMessage('warn', message, metadata);
    console.log('\x1b[33m%s\x1b[0m', formatted); // Yellow
    this.writeToFile(formatted);
  }

  /**
   * Error level logging
   */
  error(message, error = null) {
    if (!this.shouldLog('error')) return;
    
    const metadata = error ? {
      message: error.message,
      stack: error.stack,
      ...error
    } : null;
    
    const formatted = this.formatMessage('error', message, metadata);
    console.log('\x1b[31m%s\x1b[0m', formatted); // Red
    this.writeToFile(formatted, true);
  }

  /**
   * Success logging (special case)
   */
  success(message, metadata = null) {
    const formatted = this.formatMessage('info', `✓ ${message}`, metadata);
    console.log('\x1b[32m%s\x1b[0m', formatted); // Green
    this.writeToFile(formatted);
  }

  /**
   * Bot-specific logging
   */
  bot(message, metadata = null) {
    const formatted = this.formatMessage('bot', message, metadata);
    console.log('\x1b[35m%s\x1b[0m', formatted); // Magenta
    this.writeToFile(formatted);
  }

  /**
   * Chat message logging
   */
  chat(username, message) {
    const formatted = `[${this.getTimestamp()}] [CHAT ] <${username}> ${message}`;
    console.log('\x1b[37m%s\x1b[0m', formatted); // White
    this.writeToFile(formatted);
  }
}

// Export singleton instance
export default new Logger(
  process.env.LOG_TO_FILE !== 'false',
  process.env.LOG_LEVEL || 'info'
);
