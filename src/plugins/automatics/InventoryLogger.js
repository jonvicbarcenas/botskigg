import IPlugin from '../../interfaces/IPlugin.js';
import logger from '../../utils/Logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class InventoryLogger extends IPlugin {
  constructor(bot, config = {}) {
    super('InventoryLogger', bot, config);
    this.interval = null;
    this.periodMs = config.periodMs ?? 10000; // every 10s
    this.lastSnapshotKey = null;
    this.filePath = path.join(__dirname, '../../../data/inventory_log.json');
  }

  async load() {
    try {
      // Ensure file exists
      this.ensureLogFile();

      // Periodic snapshots
      this.interval = setInterval(() => {
        this.snapshot().catch(err => logger.debug(`InventoryLogger snapshot error: ${err.message}`));
      }, this.periodMs);

      // Snapshot on key inventory events
      const onWindowOpen = () => this.snapshot().catch(() => {});
      const onWindowClose = () => this.snapshot().catch(() => {});
      const onHeldItem = () => this.snapshot().catch(() => {});
      this.registerEvent('windowOpen', onWindowOpen);
      this.registerEvent('windowClose', onWindowClose);
      this.registerEvent('heldItemChanged', onHeldItem);

      this.isLoaded = true;
      logger.success('InventoryLogger plugin loaded');
    } catch (err) {
      logger.error('Failed to load InventoryLogger plugin', err);
      throw err;
    }
  }

  async unload() {
    if (this.interval) clearInterval(this.interval);
    this.unregisterAllEvents();
    this.isLoaded = false;
  }

  ensureLogFile() {
    try {
      if (!fs.existsSync(this.filePath)) {
        const initial = { lastUpdated: null, items: [] };
        fs.writeFileSync(this.filePath, JSON.stringify(initial, null, 2));
      }
    } catch (e) {
      logger.error('Failed to ensure inventory_log.json exists', e);
    }
  }

  getMaintenanceState() {
    const modes = [];
    if (this.bot.memory?.isDepositing) modes.push('depositing');
    if (this.bot.memory?.isEating) modes.push('eating');
    return modes.join(',') || 'normal';
  }

  buildSnapshot() {
    const items = this.bot.inventory.items();
    const snapshot = items.map(it => ({
      slot: it.slot,
      id: it.type,
      name: this.bot.registry?.items[it.type]?.name || 'unknown',
      count: it.count
    }));
    const data = {
      ts: Date.now(),
      maintenance: this.getMaintenanceState(),
      items: snapshot
    };
    return data;
  }

  keyOf(data) {
    // Simple key: item counts by id aggregated
    const counts = {};
    for (const it of data.items) {
      counts[it.id] = (counts[it.id] || 0) + it.count;
    }
    return JSON.stringify(counts);
  }

  async snapshot() {
    try {
      const data = this.buildSnapshot();
      const key = this.keyOf(data);
      if (this.lastSnapshotKey === key) return; // skip unchanged
      this.lastSnapshotKey = key;

      const raw = fs.readFileSync(this.filePath, 'utf8');
      let obj = {};
      try { obj = JSON.parse(raw || '{}'); } catch { obj = {}; }
      if (!obj || typeof obj !== 'object') obj = {};
      // Only write current inventory (no history)
      obj.lastUpdated = data.ts;
      obj.items = data.items;
      fs.writeFileSync(this.filePath, JSON.stringify(obj, null, 2));
      logger.info(`Inventory snapshot logged (${data.items.length} items)`);
    } catch (e) {
      logger.error('Failed to write inventory snapshot', e);
    }
  }

  getStatus() {
    return {
      ...super.getStatus(),
      periodMs: this.periodMs
    };
  }
}

export default InventoryLogger;
