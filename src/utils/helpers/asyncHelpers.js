/**
 * Common async utility functions
 */

/**
 * Sleep/delay utility function
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get BotClient instance
 * Standardized way to import and get BotClient singleton
 * @returns {Promise<Object>} BotClient instance
 */
export async function getBotClient() {
  const BotClientModule = await import('../../core/BotClient.js');
  const BotClient = BotClientModule.default;
  return BotClient.getInstance();
}
