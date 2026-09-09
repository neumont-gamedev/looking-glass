/**
 * PerspectiveController.ts
 *
 * Updates the virtual Three.js PerspectiveCamera based on viewer pose.
 * Supports:
 * - Accurate Off-Axis Projection (asymmetric frustum)
 * - Simple Translation + LookAt Mode
 * - Face-lost holding & smooth lerp back to neutral
 * - Motion limits clamping
 */

import * as THREE from 'three';
import { ScreenGeometry } from '../math/ScreenGeometry';
import { ProjectionMath } from '../math/ProjectionMath';
import { ViewerPose } from '../tracking/TrackingState';
import { VectorFilter } from '../filtering/VectorFilter';

export enum ProjectionMode {
  Accurate = 'Accurate',
  Simple = 'Simple'
}

export class PerspectiveController {
  public readonly camera: THREE.PerspectiveCamera;
  private screen: ScreenGeometry;
  private projectionMode: ProjectionMode = ProjectionMode.Accurate;

  // Current interpolated camera pose in world space (meters)
  private currentX: number = 0;
  private currentY: number = 0;
  private currentZ: number = 0.65;

  // Target pose from tracking or fallback
  private targetX: number = 0;
  private targetY: number = 0;
  private targetZ: number = 0.65;

  // Face lost handling
  private isFaceLost: boolean = false;
  private faceLostTimestamp: number = 0;
  private readonly HOLD_DURATION_SEC: number = 0.4;
  private readonly RETURN_SPEED_SEC: number = 2.0;

  // Motion bounds (clamping limits in meters)
  private readonly MAX_X_OFFSET: number = 0.75;
  private readonly MAX_Y_OFFSET: number = 0.50;
  private readonly MIN_Z: number = 0.20;
  private readonly MAX_Z: number = 1.80;

  // Near & Far planes
  public near: number = 0.05;
  public far: number = 50.0;

  // Smoothing filter for raw tracking updates
  public readonly filter: VectorFilter;

  constructor(screen: ScreenGeometry) {
    this.screen = screen;
    this.camera = new THREE.PerspectiveCamera(50, screen.aspectRatio, this.near, this.far);
    this.filter = new VectorFilter({ minCutoff: 1.0, beta: 0.007, dCutoff: 1.0 });

    this.currentZ = 0.65;
    this.targetZ = 0.65;
    this.applyCurrentProjection();
  }

  public setProjectionMode(mode: ProjectionMode): void {
    this.projectionMode = mode;
    this.applyCurrentProjection();
  }

  public getProjectionMode(): ProjectionMode {
    return this.projectionMode;
  }

  public setScreenGeometry(screen: ScreenGeometry): void {
    this.screen = screen;
    this.applyCurrentProjection();
  }

  /**
   * Updates target pose from real-time tracking.
   */
  public updatePose(pose: ViewerPose, isTrackingValid: boolean, timestampSeconds: number): void {
    if (isTrackingValid) {
      this.isFaceLost = false;

      // Filter raw input
      const filtered = this.filter.filter({ x: pose.x, y: pose.y, z: pose.z }, timestampSeconds);

      // Clamp within safe limits
      this.targetX = Math.max(-this.MAX_X_OFFSET, Math.min(this.MAX_X_OFFSET, filtered.x));
      this.targetY = Math.max(-this.MAX_Y_OFFSET, Math.min(this.MAX_Y_OFFSET, filtered.y));
      this.targetZ = Math.max(this.MIN_Z, Math.min(this.MAX_Z, filtered.z));
    } else {
      if (!this.isFaceLost) {
        this.isFaceLost = true;
        this.faceLostTimestamp = timestampSeconds;
      }
    }
  }

  /**
   * Directly sets simulated target position (e.g. Mouse fallback mode).
   */
  public setSimulatedTarget(x: number, y: number, z: number): void {
    this.isFaceLost = false;
    this.targetX = Math.max(-this.MAX_X_OFFSET, Math.min(this.MAX_X_OFFSET, x));
    this.targetY = Math.max(-this.MAX_Y_OFFSET, Math.min(this.MAX_Y_OFFSET, y));
    this.targetZ = Math.max(this.MIN_Z, Math.min(this.MAX_Z, z));
  }

  /**
   * Per-frame render loop update to interpolate toward target.
   */
  public update(deltaTimeSeconds: number, currentTimestampSeconds: number): void {
    if (this.isFaceLost) {
      const elapsedSinceLost = currentTimestampSeconds - this.faceLostTimestamp;
      if (elapsedSinceLost > this.HOLD_DURATION_SEC) {
        // Slowly interpolate back to neutral center (0, 0, defaultDistance)
        const neutralZ = 0.65;
        const lerpFactor = Math.min(1.0, deltaTimeSeconds * (1.0 / this.RETURN_SPEED_SEC));
        this.targetX += (0 - this.targetX) * lerpFactor;
        this.targetY += (0 - this.targetY) * lerpFactor;
        this.targetZ += (neutralZ - this.targetZ) * lerpFactor;
      }
    }

    // Smooth frame-to-frame convergence
    const followFactor = Math.min(1.0, deltaTimeSeconds * 20.0);
    this.currentX += (this.targetX - this.currentX) * followFactor;
    this.currentY += (this.targetY - this.currentY) * followFactor;
    this.currentZ += (this.targetZ - this.currentZ) * followFactor;

    this.applyCurrentProjection();
  }

  public getCurrentPose(): { x: number; y: number; z: number } {
    return { x: this.currentX, y: this.currentY, z: this.currentZ };
  }

  private applyCurrentProjection(): void {
    if (this.projectionMode === ProjectionMode.Accurate) {
      ProjectionMath.applyOffAxisProjection(
        this.camera,
        this.currentX,
        this.currentY,
        this.currentZ,
        this.screen,
        this.near,
        this.far
      );
    } else {
      ProjectionMath.applySimplePerspective(
        this.camera,
        this.currentX,
        this.currentY,
        this.currentZ,
        this.screen,
        this.near,
        this.far
      );
    }
  }
}

