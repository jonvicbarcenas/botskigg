/**
 * Routes helper - Manages patrol routes and route execution
 */
class RouteManager {
  constructor(pathfinder) {
    this.pathfinder = pathfinder;
    this.routes = new Map();
    this.currentRoute = null;
    this.currentIndex = 0;
    this.isPatrolling = false;
    this.patrolInterval = null;
  }

  /**
   * Add a route
   */
  addRoute(name, waypoints) {
    this.routes.set(name, {
      name,
      waypoints,
      length: waypoints.length
    });
  }

  /**
   * Remove a route
   */
  removeRoute(name) {
    if (this.currentRoute === name) {
      this.stopPatrol();
    }
    return this.routes.delete(name);
  }

  /**
   * Get a route
   */
  getRoute(name) {
    return this.routes.get(name);
  }

  /**
   * List all routes
   */
  listRoutes() {
    return Array.from(this.routes.keys());
  }

  /**
   * Start patrolling a route
   */
  async startPatrol(routeName, loop = true) {
    const route = this.routes.get(routeName);
    if (!route) {
      throw new Error(`Route ${routeName} not found`);
    }

    this.currentRoute = routeName;
    this.currentIndex = 0;
    this.isPatrolling = true;

    await this.patrolNext(loop);
  }

  /**
   * Move to next waypoint in patrol
   */
  async patrolNext(loop = true) {
    if (!this.isPatrolling) return;

    const route = this.routes.get(this.currentRoute);
    if (!route) {
      this.stopPatrol();
      return;
    }

    const waypoint = route.waypoints[this.currentIndex];
    
    try {
      await this.pathfinder.goto(waypoint.x, waypoint.y, waypoint.z);
      
      this.currentIndex++;
      
      // Check if route complete
      if (this.currentIndex >= route.waypoints.length) {
        if (loop) {
          this.currentIndex = 0; // Start over
        } else {
          this.stopPatrol();
          return;
        }
      }

      // Continue to next waypoint
      if (this.isPatrolling) {
        await this.patrolNext(loop);
      }
    } catch (error) {
      console.error('Patrol error:', error);
      this.stopPatrol();
    }
  }

  /**
   * Stop patrolling
   */
  stopPatrol() {
    this.isPatrolling = false;
    this.currentRoute = null;
    this.currentIndex = 0;
    this.pathfinder.stop();
    
    if (this.patrolInterval) {
      clearInterval(this.patrolInterval);
      this.patrolInterval = null;
    }
  }

  /**
   * Get patrol status
   */
  getStatus() {
    return {
      isPatrolling: this.isPatrolling,
      currentRoute: this.currentRoute,
      currentIndex: this.currentIndex,
      totalRoutes: this.routes.size
    };
  }

  /**
   * Calculate route distance
   */
  calculateDistance(routeName) {
    const route = this.routes.get(routeName);
    if (!route) return 0;

    let totalDistance = 0;
    for (let i = 0; i < route.waypoints.length - 1; i++) {
      const p1 = route.waypoints[i];
      const p2 = route.waypoints[i + 1];
      
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dz = p2.z - p1.z;
      
      totalDistance += Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    return totalDistance;
  }

  /**
   * Reverse a route
   */
  reverseRoute(routeName) {
    const route = this.routes.get(routeName);
    if (!route) return false;

    route.waypoints.reverse();
    return true;
  }

  /**
   * Get next waypoint in current patrol
   */
  getNextWaypoint() {
    if (!this.currentRoute) return null;
    
    const route = this.routes.get(this.currentRoute);
    if (!route) return null;

    return route.waypoints[this.currentIndex];
  }
}

export default RouteManager;
