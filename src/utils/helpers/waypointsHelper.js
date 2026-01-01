/**
 * Waypoints utility for loading waypoint data from configuration
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../Logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load waypoints data from waypoints.json
 * @returns {Object|null} Waypoints data or null if not found
 */
export function loadWaypoints() {
  try {
    const waypointsPath = path.join(__dirname, '../../../data/waypoints.json');
    if (!fs.existsSync(waypointsPath)) {
      logger.warn('waypoints.json not found');
      return null;
    }
    
    const data = JSON.parse(fs.readFileSync(waypointsPath, 'utf8'));
    return data;
  } catch (error) {
    logger.error('Failed to load waypoints.json', error);
    return null;
  }
}

/**
 * Load a specific farm area from waypoints
 * @param {string} areaName - Name of the area to load (e.g., 'sugarcane_farm')
 * @returns {Object|null} Farm area data or null if not found
 */
export function loadFarmArea(areaName) {
  try {
    const data = loadWaypoints();
    if (!data) return null;
    
    const farmArea = data.areas?.[areaName];
    
    if (farmArea && farmArea.corner1 && farmArea.corner2) {
      return farmArea;
    } else {
      logger.warn(`Farm area '${areaName}' not defined in waypoints.json`);
      return null;
    }
  } catch (error) {
    logger.error(`Failed to load farm area '${areaName}'`, error);
    return null;
  }
}

/**
 * Load a chest area with radius from waypoints
 * @param {string} areaName - Name of the chest area (e.g., 'sugarcane_chest_area')
 * @returns {Object|null} Chest area with center and radius, or null if not found
 */
export function loadChestArea(areaName) {
  try {
    const data = loadWaypoints();
    if (!data) return null;
    
    const areaRadius = data.areas?.[areaName]?.area_radius;
    if (!areaRadius) {
      logger.warn(`No area_radius defined for '${areaName}' in waypoints.json`);
      return null;
    }
    
    return {
      center: { x: areaRadius.x, y: areaRadius.y, z: areaRadius.z },
      radius: areaRadius.radius ?? 10
    };
  } catch (error) {
    logger.error(`Failed to load chest area '${areaName}'`, error);
    return null;
  }
}

/**
 * Get center position of a farm area
 * @param {Object} farmArea - Farm area with corner1 and corner2
 * @returns {Object|null} Center position {x, y, z} or null
 */
export function getFarmCenter(farmArea) {
  if (!farmArea || !farmArea.corner1 || !farmArea.corner2) return null;
  
  const { corner1, corner2 } = farmArea;
  return {
    x: Math.floor((corner1.x + corner2.x) / 2),
    y: corner1.y,
    z: Math.floor((corner1.z + corner2.z) / 2)
  };
}
