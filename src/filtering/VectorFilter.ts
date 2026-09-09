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

export class VectorFilter {
  private filterX: OneEuroFilter;
  private filterY: OneEuroFilter;
  private filterZ: OneEuroFilter;

  constructor(config: Partial<OneEuroConfig> = {}) {
    this.filterX = new OneEuroFilter(config);
    this.filterY = new OneEuroFilter(config);
    this.filterZ = new OneEuroFilter(config);
  }

  public updateConfig(config: Partial<OneEuroConfig>): void {
    if (config.minCutoff !== undefined) {
      this.filterX.minCutoff = config.minCutoff;
      this.filterY.minCutoff = config.minCutoff;
      this.filterZ.minCutoff = config.minCutoff;
    }
    if (config.beta !== undefined) {
      this.filterX.beta = config.beta;
      this.filterY.beta = config.beta;
      this.filterZ.beta = config.beta;
    }
    if (config.dCutoff !== undefined) {
      this.filterX.dCutoff = config.dCutoff;
      this.filterY.dCutoff = config.dCutoff;
      this.filterZ.dCutoff = config.dCutoff;
    }
  }

  public filter(vec: Vector3D, timestampSeconds: number): Vector3D {
    return {
      x: this.filterX.filter(vec.x, timestampSeconds),
      y: this.filterY.filter(vec.y, timestampSeconds),
      z: this.filterZ.filter(vec.z, timestampSeconds)
    };
  }

  public reset(): void {
    this.filterX.reset();
    this.filterY.reset();
    this.filterZ.reset();
  }
}

