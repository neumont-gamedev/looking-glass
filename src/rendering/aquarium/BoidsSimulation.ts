/**
 * BoidsSimulation.ts
 *
 * Craig Reynolds Boids flocking simulation with tank boundary avoidance,
 * fright/startle response from glass taps, and food seeking.
 */

import * as THREE from 'three';
import { Fish } from './Fish';
import { ScreenGeometry } from '../../math/ScreenGeometry';

export interface FoodPellet {
  id: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  radius: number;
}

export interface StartleEvent {
  position: THREE.Vector3;
  radius: number;
  intensity: number;
  timestamp: number;
}

export class BoidsSimulation {
  public readonly fishes: Fish[] = [];
  public screen: ScreenGeometry;
  public depth: number;

  // Boids weights
  public separationWeight: number = 1.6;
  public alignmentWeight: number = 1.0;
  public cohesionWeight: number = 1.0;
  public boundaryWeight: number = 2.5;

  // Perception radiuses
  public perceptionRadius: number = 0.11; // meters
  public separationRadius: number = 0.035; // meters

  // Active stimuli
  private activeStartles: StartleEvent[] = [];
  public onFoodConsumed: ((id: number) => void) | null = null;

  constructor(screen: ScreenGeometry, depth: number = 0.8) {
    this.screen = screen;
    this.depth = depth;
  }

  public addFish(fish: Fish): void {
    this.fishes.push(fish);
  }

  public triggerStartle(tapX: number, tapY: number, intensity: number = 3.0): void {
    this.activeStartles.push({
      position: new THREE.Vector3(tapX, tapY, -0.02),
      radius: 0.35,
      intensity,
      timestamp: performance.now() / 1000
    });
  }

  public update(deltaTime: number, timeSeconds: number, foodPellets: FoodPellet[]): void {
    // 1. Clean up old startle events (active for 0.6s)
    this.activeStartles = this.activeStartles.filter(
      (s) => timeSeconds - s.timestamp < 0.6
    );

    // 2. Compute boid forces for each fish
    for (let i = 0; i < this.fishes.length; i++) {
      const fish = this.fishes[i];

      const separation = new THREE.Vector3();
      const alignment = new THREE.Vector3();
      const cohesion = new THREE.Vector3();
      let neighborCount = 0;
      let sameSpeciesCount = 0;

      for (let j = 0; j < this.fishes.length; j++) {
        if (i === j) continue;
        const other = this.fishes[j];
        const dist = fish.position.distanceTo(other.position);

        if (dist > 0 && dist < this.perceptionRadius) {
          // Separation from any fish
          if (dist < this.separationRadius) {
            const diff = fish.position.clone().sub(other.position).normalize().divideScalar(dist);
            separation.add(diff);
          }

          // Alignment (stronger with same species)
          if (fish.species === other.species) {
            alignment.add(other.velocity);
            cohesion.add(other.position);
            sameSpeciesCount++;
          }
          neighborCount++;
        }
      }

      if (sameSpeciesCount > 0) {
        // Average alignment of school
        alignment.divideScalar(sameSpeciesCount).normalize().multiplyScalar(fish.maxSpeed);
        const steerAlign = alignment.sub(fish.velocity).clampLength(0, fish.maxForce);
        fish.applyForce(steerAlign.multiplyScalar(this.alignmentWeight));

        // Average cohesion of school
        cohesion.divideScalar(sameSpeciesCount);
        const steerCoh = this.seek(fish, cohesion).multiplyScalar(this.cohesionWeight * 0.7);
        fish.applyForce(steerCoh);
      }

      if (separation.lengthSq() > 0) {
        separation.normalize().multiplyScalar(fish.maxSpeed);
        const steerSep = separation.sub(fish.velocity).clampLength(0, fish.maxForce * 2.0);
        fish.applyForce(steerSep.multiplyScalar(this.separationWeight));
      }

      // 3. Tank Boundary Avoidance
      const boundaryForce = this.calculateBoundaryForce(fish);
      fish.applyForce(boundaryForce.multiplyScalar(this.boundaryWeight));

      // 4. Startle stimulus (glass tap)
      for (const startle of this.activeStartles) {
        const distToTap = fish.position.distanceTo(startle.position);
        if (distToTap < startle.radius) {
          // Strong impulse away from tap point and back into depth
          const fleeDir = fish.position.clone().sub(startle.position);
          fleeDir.z -= 0.5; // Bias fleeing deeper into the tank away from the glass
          fleeDir.normalize().multiplyScalar(fish.maxForce * startle.intensity * (1.0 - distToTap / startle.radius));
          fish.applyForce(fleeDir);
        }
      }

      // 5. Food Attraction
      if (foodPellets.length > 0) {
        let closestPellet: FoodPellet | null = null;
        let closestDist = Infinity;

        for (const pellet of foodPellets) {
          const d = fish.position.distanceTo(pellet.position);
          if (d < closestDist && d < 0.45) { // 45cm scent radius
            closestDist = d;
            closestPellet = pellet;
          }
        }

        if (closestPellet) {
          const foodForce = this.seek(fish, closestPellet.position).multiplyScalar(2.0);
          fish.applyForce(foodForce);

          // Eat pellet on contact
          if (closestDist < 0.04) {
            if (this.onFoodConsumed) {
              this.onFoodConsumed(closestPellet.id);
            }
          }
        }
      }

      // 6. Natural gentle wandering force
      const wander = new THREE.Vector3(
        Math.sin(timeSeconds * 1.2 + i * 1.7) * 0.05,
        Math.sin(timeSeconds * 0.8 + i * 2.3) * 0.03,
        Math.cos(timeSeconds * 1.0 + i * 1.1) * 0.04
      );
      fish.applyForce(wander);

      // 7. Update physics and swimming wag
      fish.update(deltaTime, timeSeconds);
    }
  }

  private seek(fish: Fish, target: THREE.Vector3): THREE.Vector3 {
    const desired = target.clone().sub(fish.position);
    const dist = desired.length();
    desired.normalize();

    if (dist < 0.1) {
      desired.multiplyScalar(fish.maxSpeed * (dist / 0.1));
    } else {
      desired.multiplyScalar(fish.maxSpeed);
    }

    const steer = desired.sub(fish.velocity);
    steer.clampLength(0, fish.maxForce);
    return steer;
  }

  private calculateBoundaryForce(fish: Fish): THREE.Vector3 {
    const force = new THREE.Vector3();
    const margin = 0.06; // 6cm soft cushion margin

    const minX = -this.screen.width / 2 + margin;
    const maxX = this.screen.width / 2 - margin;
    const minY = -this.screen.height / 2 + margin;
    const maxY = this.screen.height / 2 - margin;
    const minZ = -this.depth + margin;
    const maxZ = -0.08; // Keep at least 8cm behind the glass window

    // X bounds (Left / Right)
    if (fish.position.x < minX) {
      force.x = Math.pow((minX - fish.position.x) / margin, 2) * fish.maxForce;
    } else if (fish.position.x > maxX) {
      force.x = -Math.pow((fish.position.x - maxX) / margin, 2) * fish.maxForce;
    }

    // Y bounds (Floor / Surface)
    if (fish.position.y < minY) {
      force.y = Math.pow((minY - fish.position.y) / margin, 2) * fish.maxForce;
    } else if (fish.position.y > maxY) {
      force.y = -Math.pow((fish.position.y - maxY) / margin, 2) * fish.maxForce;
    }

    // Z bounds (Back Wall / Front Glass)
    if (fish.position.z < minZ) {
      force.z = Math.pow((minZ - fish.position.z) / margin, 2) * fish.maxForce;
    } else if (fish.position.z > maxZ) {
      force.z = -Math.pow((fish.position.z - maxZ) / margin, 2) * fish.maxForce * 1.5;
    }

    return force;
  }
}

