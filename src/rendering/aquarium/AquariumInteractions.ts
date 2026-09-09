/**
 * AquariumInteractions.ts
 *
 * Handles user interactions with the aquarium:
 * 1. Glass Tap: Visual ripple shockwave at Z = 0 and boid startle stimulus.
 * 2. Food Pellets: Physics-simulated sinking pellets that fish can hunt and eat.
 */

import * as THREE from 'three';
import { FoodPellet, BoidsSimulation } from './BoidsSimulation';
import { ScreenGeometry } from '../../math/ScreenGeometry';

interface Shockwave {
  mesh: THREE.Mesh;
  startTime: number;
  duration: number;
}

export class AquariumInteractions {
  public readonly group: THREE.Group = new THREE.Group();
  private boids: BoidsSimulation;
  private screen: ScreenGeometry;

  // Shockwave visual pool
  private shockwaves: Shockwave[] = [];
  private shockwaveGeo: THREE.RingGeometry;
  private shockwaveMat: THREE.MeshBasicMaterial;

  // Food pellets
  public foodPellets: FoodPellet[] = [];
  private pelletMeshes: Map<number, THREE.Mesh> = new Map();
  private nextPelletId: number = 1;
  private pelletGeo: THREE.SphereGeometry;
  private pelletMat: THREE.MeshStandardMaterial;

  constructor(boids: BoidsSimulation, screen: ScreenGeometry) {
    this.boids = boids;
    this.screen = screen;

    // Shockwave assets
    this.shockwaveGeo = new THREE.RingGeometry(0.01, 0.018, 32);
    this.shockwaveMat = new THREE.MeshBasicMaterial({
      color: 0x88ffff,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide
    });

    // Food assets
    this.pelletGeo = new THREE.SphereGeometry(0.005, 8, 8);
    this.pelletMat = new THREE.MeshStandardMaterial({
      color: 0xcc8833,
      roughness: 0.7,
      metalness: 0.1
    });

    // Listen for food consumption
    this.boids.onFoodConsumed = (id) => this.removePellet(id);
  }

  public setScreenGeometry(screen: ScreenGeometry): void {
    this.screen = screen;
  }

  /**
   * Triggers a glass tap at normalized screen coordinates [-1, 1].
   */
  public tapGlass(normX: number, normY: number): void {
    const xMeters = (normX * this.screen.width) / 2;
    const yMeters = (normY * this.screen.height) / 2;

    // 1. Create visual shockwave ring on the glass (Z = -0.002)
    const ringMat = this.shockwaveMat.clone();
    const mesh = new THREE.Mesh(this.shockwaveGeo, ringMat);
    mesh.position.set(xMeters, yMeters, -0.002);
    this.group.add(mesh);

    this.shockwaves.push({
      mesh,
      startTime: performance.now() / 1000,
      duration: 0.55
    });

    // 2. Trigger fright reflex in boids
    this.boids.triggerStartle(xMeters, yMeters, 3.5);
  }

  /**
   * Drops food pellets into the tank at normalized screen X.
   */
  public dropFood(normX: number): void {
    const xMeters = (normX * this.screen.width) / 2;
    const yMeters = this.screen.height / 2 - 0.02; // Dropped right below surface
    // Random depth between front and mid-tank
    const zMeters = -0.15 - Math.random() * 0.35;

    // Drop 3-4 pellets with slight scatter
    const count = Math.floor(Math.random() * 2) + 2;
    for (let i = 0; i < count; i++) {
      const id = this.nextPelletId++;
      const pos = new THREE.Vector3(
        xMeters + (Math.random() - 0.5) * 0.04,
        yMeters + (Math.random() - 0.5) * 0.02,
        zMeters + (Math.random() - 0.5) * 0.04
      );

      const pellet: FoodPellet = {
        id,
        position: pos,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.01,
          -0.04 - Math.random() * 0.02, // Sinks at 4-6 cm/sec
          (Math.random() - 0.5) * 0.01
        ),
        radius: 0.005
      };

      this.foodPellets.push(pellet);

      const mesh = new THREE.Mesh(this.pelletGeo, this.pelletMat);
      mesh.position.copy(pos);
      mesh.castShadow = true;
      this.group.add(mesh);
      this.pelletMeshes.set(id, mesh);
    }
  }

  public update(deltaTime: number, timeSeconds: number): void {
    // 1. Update shockwaves
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const s = this.shockwaves[i];
      const elapsed = timeSeconds - s.startTime;
      const progress = elapsed / s.duration;

      if (progress >= 1.0) {
        this.group.remove(s.mesh);
        (s.mesh.material as THREE.Material).dispose();
        this.shockwaves.splice(i, 1);
      } else {
        const scale = 1.0 + progress * 6.0;
        s.mesh.scale.set(scale, scale, 1.0);
        (s.mesh.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1.0 - progress);
      }
    }

    // 2. Update food pellets
    const floorY = -this.screen.height / 2 + 0.01;

    for (let i = this.foodPellets.length - 1; i >= 0; i--) {
      const pellet = this.foodPellets[i];
      const mesh = this.pelletMeshes.get(pellet.id);

      if (pellet.position.y > floorY) {
        // Sinking with gentle lateral water turbulence
        pellet.velocity.x += Math.sin(timeSeconds * 4.0 + pellet.id) * 0.002;
        pellet.velocity.x *= 0.95;
        pellet.position.addScaledVector(pellet.velocity, deltaTime);
      } else {
        // Rest on floor
        pellet.position.y = floorY;
        pellet.velocity.set(0, 0, 0);
      }

      if (mesh) {
        mesh.position.copy(pellet.position);
      }
    }
  }

  public removePellet(id: number): void {
    const idx = this.foodPellets.findIndex((p) => p.id === id);
    if (idx !== -1) {
      this.foodPellets.splice(idx, 1);
    }

    const mesh = this.pelletMeshes.get(id);
    if (mesh) {
      this.group.remove(mesh);
      this.pelletMeshes.delete(id);
    }
  }

  public dispose(): void {
    while (this.group.children.length > 0) {
      const child = this.group.children[0];
      this.group.remove(child);
    }
    this.shockwaveGeo.dispose();
    this.shockwaveMat.dispose();
    this.pelletGeo.dispose();
    this.pelletMat.dispose();
    this.foodPellets = [];
    this.pelletMeshes.clear();
  }
}

