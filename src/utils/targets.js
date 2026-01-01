/**
 * Target filtering utilities for combat
 */

/**
 * Filter entities based on criteria
 */
export function filterTargets(entities, options = {}) {
  const {
    hostile = false,
    passive = false,
    players = false,
    maxDistance = null,
    position = null,
    hostileMobs = [],
    passiveMobs = [],
    excludeNames = [],
    includeNames = []
  } = options;

  return entities.filter(entity => {
    // Skip invalid entities
    if (!entity || !entity.position) return false;

    // Check distance
    if (maxDistance && position) {
      const distance = position.distanceTo(entity.position);
      if (distance > maxDistance) return false;
    }

    // Exclude specific names
    const entityName = entity.type === 'player' ? entity.username : entity.name;

    if (excludeNames.length > 0 && excludeNames.includes(entityName)) {
      return false;
    }

    // Include specific names (overrides other filters)
    if (includeNames.length > 0) {
      return includeNames.includes(entityName);
    }

    // Filter by type
    if (players && entity.type === 'player') return true;
    
    if (hostile && hostileMobs.includes(entity.name)) return true;
    
    if (passive && passiveMobs.includes(entity.name)) return true;

    return false;
  });
}

/**
 * Find nearest entity from a list
 */
export function findNearest(entities, position) {
  if (!entities || entities.length === 0) return null;

  return entities.reduce((nearest, entity) => {
    const distEntity = position.distanceTo(entity.position);
    const distNearest = nearest ? position.distanceTo(nearest.position) : Infinity;
    return distEntity < distNearest ? entity : nearest;
  }, null);
}

/**
 * Check if entity is hostile
 */
export function isHostile(entityName) {
  const hostileMobs = [
    'zombie', 'skeleton', 'creeper', 'spider', 'enderman',
    'witch', 'slime', 'phantom', 'drowned', 'husk',
    'stray', 'cave_spider', 'silverfish', 'blaze', 'ghast',
    'magma_cube', 'wither_skeleton', 'piglin', 'hoglin',
    'zoglin', 'pillager', 'vindicator', 'evoker', 'vex',
    'ravager', 'guardian', 'elder_guardian', 'shulker'
  ];
  return hostileMobs.includes(entityName);
}

/**
 * Check if entity is passive
 */
export function isPassive(entityName) {
  const passiveMobs = [
    'cow', 'pig', 'sheep', 'chicken', 'rabbit', 'horse',
    'donkey', 'mule', 'cat', 'parrot', 'bat', 'squid',
    'cod', 'salmon', 'tropical_fish', 'pufferfish',
    'villager', 'iron_golem', 'snow_golem'
  ];
  return passiveMobs.includes(entityName);
}

/**
 * Check if entity is neutral (can become hostile)
 */
export function isNeutral(entityName) {
  const neutralMobs = [
    'enderman', 'spider', 'cave_spider', 'zombie_pigman',
    'piglin', 'wolf', 'bee', 'dolphin', 'polar_bear',
    'llama', 'panda', 'iron_golem'
  ];
  return neutralMobs.includes(entityName);
}

/**
 * Get entity threat level (0-10)
 */
export function getThreatLevel(entityName) {
  const threats = {
    'wither': 10,
    'ender_dragon': 10,
    'warden': 10,
    'wither_skeleton': 8,
    'blaze': 8,
    'ghast': 7,
    'creeper': 7,
    'skeleton': 6,
    'zombie': 5,
    'spider': 5,
    'enderman': 6,
    'witch': 7,
    'phantom': 6,
    'drowned': 5,
    'guardian': 7,
    'elder_guardian': 9
  };

  return threats[entityName] || (isHostile(entityName) ? 5 : 0);
}

/**
 * Sort entities by threat level
 */
export function sortByThreat(entities) {
  return entities.sort((a, b) => {
    return getThreatLevel(b.name) - getThreatLevel(a.name);
  });
}

/**
 * Filter entities in range
 */
export function getEntitiesInRange(entities, position, range) {
  return entities.filter(entity => {
    if (!entity || !entity.position) return false;
    const distance = position.distanceTo(entity.position);
    return distance <= range;
  });
}

/**
 * Check if entity is a friend (from whitelist)
 */
export function isFriend(entityName, whitelist = []) {
  return whitelist.includes(entityName);
}

/**
 * Check if entity is an enemy (from blacklist or is hostile)
 */
export function isEnemy(entityName, blacklist = []) {
  return blacklist.includes(entityName) || isHostile(entityName);
}

export default {
  filterTargets,
  findNearest,
  isHostile,
  isPassive,
  isNeutral,
  getThreatLevel,
  sortByThreat,
  getEntitiesInRange,
  isFriend,
  isEnemy
};
