/**
 * VectorFilter.ts
 *
 * Applies One Euro filtering across 3-dimensional vectors (X, Y, Z)
 * to smoothly filter 3D head position data.
 */

import { OneEuroFilter, OneEuroConfig } from './OneEuroFilter';

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface VectorFilterConfig extends OneEuroConfig {
  /** Independent minCutoff for depth Z (Hz). Lower = more damping on noisy landmark distance. Default: 0.5 */
  zMinCutoff?: number;
  /** Independent beta for depth Z. Default: 1.2 */
  zBeta?: number;
}

export interface FilteredMotionState {
  position: Vector3D;
  velocity: Vector3D;
}

export class VectorFilter {
  private filterX: OneEuroFilter;
  private filterY: OneEuroFilter;
  private filterZ: OneEuroFilter;

  constructor(config: Partial<VectorFilterConfig> = {}) {
    const defaultMin = config.minCutoff ?? 1.0;
    const defaultBeta = config.beta ?? 2.2;
    const defaultD = config.dCutoff ?? 1.0;

    this.filterX = new OneEuroFilter({ minCutoff: defaultMin, beta: defaultBeta, dCutoff: defaultD });
    this.filterY = new OneEuroFilter({ minCutoff: defaultMin, beta: defaultBeta, dCutoff: defaultD });
    // Depth Z is computed from inverse landmark scale and has ~10x more sensor noise,
    // so we use dedicated lower cutoff and beta for Z to eliminate depth swimming.
    this.filterZ = new OneEuroFilter({
      minCutoff: config.zMinCutoff ?? Math.max(0.3, defaultMin * 0.5),
      beta: config.zBeta ?? Math.max(0.6, defaultBeta * 0.5),
      dCutoff: defaultD
    });
  }

  public updateConfig(config: Partial<VectorFilterConfig>): void {
    if (config.minCutoff !== undefined) {
      this.filterX.minCutoff = config.minCutoff;
      this.filterY.minCutoff = config.minCutoff;
      this.filterZ.minCutoff = config.zMinCutoff ?? Math.max(0.3, config.minCutoff * 0.5);
    }
    if (config.beta !== undefined) {
      this.filterX.beta = config.beta;
      this.filterY.beta = config.beta;
      this.filterZ.beta = config.zBeta ?? Math.max(0.6, config.beta * 0.5);
    }
    if (config.dCutoff !== undefined) {
      this.filterX.dCutoff = config.dCutoff;
      this.filterY.dCutoff = config.dCutoff;
      this.filterZ.dCutoff = config.dCutoff;
    }
    if (config.zMinCutoff !== undefined) {
      this.filterZ.minCutoff = config.zMinCutoff;
    }
    if (config.zBeta !== undefined) {
      this.filterZ.beta = config.zBeta;
    }
  }

  public getConfig(): { minCutoff: number; beta: number } {
    return {
      minCutoff: this.filterX.minCutoff,
      beta: this.filterX.beta
    };
  }

  public filter(vec: Vector3D, timestampSeconds: number): Vector3D {
    return {
      x: this.filterX.filter(vec.x, timestampSeconds),
      y: this.filterY.filter(vec.y, timestampSeconds),
      z: this.filterZ.filter(vec.z, timestampSeconds)
    };
  }

  public filterWithVelocity(vec: Vector3D, timestampSeconds: number): FilteredMotionState {
    const resX = this.filterX.filterWithVelocity(vec.x, timestampSeconds);
    const resY = this.filterY.filterWithVelocity(vec.y, timestampSeconds);
    const resZ = this.filterZ.filterWithVelocity(vec.z, timestampSeconds);

    return {
      position: { x: resX.value, y: resY.value, z: resZ.value },
      velocity: { x: resX.velocity, y: resY.velocity, z: resZ.velocity }
    };
  }

  public getVelocity(): Vector3D {
    return {
      x: this.filterX.getVelocity(),
      y: this.filterY.getVelocity(),
      z: this.filterZ.getVelocity()
    };
  }

  public reset(): void {
    this.filterX.reset();
    this.filterY.reset();
    this.filterZ.reset();
  }
}

