import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import BotClient from './core/BotClient.js';
import logger from './utils/Logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load environment variables
 */
dotenv.config();

/**
 * Load configuration files
 */
function loadConfig() {
  const configDir = path.join(__dirname, '../config');
  
  try {
    const settings = JSON.parse(fs.readFileSync(path.join(configDir, 'settings.json'), 'utf8'));
    const physics = JSON.parse(fs.readFileSync(path.join(configDir, 'physics.json'), 'utf8'));
    const permissions = JSON.parse(fs.readFileSync(path.join(configDir, 'permissions.json'), 'utf8'));
    
    // Override with environment variables if present
    if (process.env.MC_HOST) settings.server.host = process.env.MC_HOST;
    if (process.env.MC_PORT) settings.server.port = parseInt(process.env.MC_PORT);
    if (process.env.MC_USERNAME) settings.bot.username = process.env.MC_USERNAME;
    if (process.env.MC_PASSWORD) settings.bot.password = process.env.MC_PASSWORD;
    if (process.env.MC_VERSION) settings.server.version = process.env.MC_VERSION;
    if (process.env.MC_AUTH) settings.server.auth = process.env.MC_AUTH;
    
    // Web viewer settings
    if (process.env.WEB_VIEWER_ENABLED === 'true') {
      settings.features.webViewer = true;
    }
    if (process.env.WEB_VIEWER_PORT) {
      settings.webViewer.port = parseInt(process.env.WEB_VIEWER_PORT);
    }
    
    return {
      settings,
      physics,
      permissions
    };
  } catch (error) {
    logger.error('Failed to load configuration files', error);
    throw error;
  }
}

/**
 * Main application entry point
 */
async function main() {
  logger.info('='.repeat(60));
  logger.info('Mineflayer Advanced MVP Bot');
  logger.info('='.repeat(60));
  
  try {
    // Load configuration
    logger.info('Loading configuration...');
    const config = loadConfig();
    
    logger.info(`Server: ${config.settings.server.host}:${config.settings.server.port}`);
    logger.info(`Username: ${config.settings.bot.username}`);
    logger.info(`Version: ${config.settings.server.version}`);
    logger.info('='.repeat(60));
    
    // Merge all configs
    const fullConfig = {
      ...config.settings,
      physics: config.physics,
      permissions: config.permissions
    };
    
    // Create and start bot
    const botClient = new BotClient(fullConfig);
    await botClient.start();
    
    // Setup graceful shutdown
    setupGracefulShutdown(botClient);
    
  } catch (error) {
    logger.error('Fatal error during startup', error);
    process.exit(1);
  }
}

/**
 * Setup graceful shutdown handlers
 */
function setupGracefulShutdown(botClient) {
  const shutdown = async (signal) => {
    logger.info(`\nReceived ${signal}, shutting down gracefully...`);
    
    try {
      await botClient.stop();
      logger.success('Shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', error);
      process.exit(1);
    }
  };
  
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', error);
    shutdown('uncaughtException');
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection', { reason, promise });
  });
}

// Start the application
main();
