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
import { KinematicPredictor } from '../filtering/KinematicPredictor';
import { computeSmoothingParameters } from '../settings/SettingsManager';

export enum ProjectionMode {
  Accurate = 'Accurate',
  Simple = 'Simple'
}

export class PerspectiveController {
  public readonly camera: THREE.PerspectiveCamera;
  private screen: ScreenGeometry;
  private projectionMode: ProjectionMode = ProjectionMode.Accurate;
  private depthMode: 'natural' | 'aperture' = 'aperture';
  private referenceDistance: number = 0.65;

  // Current interpolated camera pose in world space (meters)
  private currentX: number = 0;
  private currentY: number = 0;
  private currentZ: number = 0.65;

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
  // Physics-based kinematic motion predictor & inter-frame interpolator
  public readonly predictor: KinematicPredictor;

  constructor(screen: ScreenGeometry) {
    this.screen = screen;
    this.camera = new THREE.PerspectiveCamera(50, screen.aspectRatio, this.near, this.far);
    this.filter = new VectorFilter({
      minCutoff: 1.0,
      beta: 2.2,
      dCutoff: 1.0,
      zMinCutoff: 0.5,
      zBeta: 1.2
    });
    this.predictor = new KinematicPredictor({
      lookaheadSeconds: 0.035,
      smoothTime: 0.055,
      deadbandThreshold: 0.006,
      enableDeadband: true
    });

    this.currentZ = 0.65;
    this.predictor.reset({ x: 0, y: 0, z: 0.65 });
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
    this.camera.aspect = screen.aspectRatio;
    this.camera.updateProjectionMatrix();
    this.applyCurrentProjection();
  }

  public setDepthMode(mode: 'natural' | 'aperture'): void {
    this.depthMode = mode;
    this.applyCurrentProjection();
  }

  public getDepthMode(): 'natural' | 'aperture' {
    return this.depthMode;
  }

  public setReferenceDistance(dist: number): void {
    this.referenceDistance = Math.max(0.2, dist);
    this.applyCurrentProjection();
  }

  public setLookaheadMs(ms: number): void {
    this.predictor.config.lookaheadSeconds = Math.max(0, ms / 1000);
  }

  public getLookaheadMs(): number {
    return Math.round(this.predictor.config.lookaheadSeconds * 1000);
  }

  public setSmoothTimeMs(ms: number): void {
    this.predictor.config.smoothTime = Math.max(0.005, ms / 1000);
  }

  public getSmoothTimeMs(): number {
    return Math.round(this.predictor.config.smoothTime * 1000);
  }

  public setDeadbandEnabled(enabled: boolean): void {
    this.predictor.config.enableDeadband = enabled;
  }

  public isDeadbandEnabled(): boolean {
    return this.predictor.config.enableDeadband;
  }

  public getMinCutoff(): number {
    return this.filter.getConfig().minCutoff;
  }

  public getBeta(): number {
    return this.filter.getConfig().beta;
  }

  /**
   * Configures tracking smoothing from a consolidated percentage (0 = Snappy, 50 = Balanced, 100 = Ultra-Smooth).
   */
  public setTrackingSmoothnessPercent(percent: number): void {
    const params = computeSmoothingParameters(percent);
    this.setLookaheadMs(params.lookaheadMs);
    this.setSmoothTimeMs(params.smoothTimeMs);
    this.setDeadbandEnabled(params.deadbandEnabled);
    this.filter.updateConfig({ minCutoff: params.minCutoff, beta: params.beta });
  }

  /**
   * Updates target pose from real-time tracking.
   */
  public updatePose(pose: ViewerPose, isTrackingValid: boolean, timestampSeconds: number): void {
    if (isTrackingValid) {
      this.isFaceLost = false;

      // Filter raw input and extract filtered 3D velocity
      const filteredState = this.filter.filterWithVelocity(
        { x: pose.x, y: pose.y, z: pose.z },
        timestampSeconds
      );

      // Clamp within safe limits
      const clampedX = Math.max(-this.MAX_X_OFFSET, Math.min(this.MAX_X_OFFSET, filteredState.position.x));
      const clampedY = Math.max(-this.MAX_Y_OFFSET, Math.min(this.MAX_Y_OFFSET, filteredState.position.y));
      const clampedZ = Math.max(this.MIN_Z, Math.min(this.MAX_Z, filteredState.position.z));

      // Feed position and velocity into kinematic dead reckoning predictor
      this.predictor.updateSample(
        { x: clampedX, y: clampedY, z: clampedZ },
        filteredState.velocity,
        timestampSeconds
      );
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
    const clampedX = Math.max(-this.MAX_X_OFFSET, Math.min(this.MAX_X_OFFSET, x));
    const clampedY = Math.max(-this.MAX_Y_OFFSET, Math.min(this.MAX_Y_OFFSET, y));
    const clampedZ = Math.max(this.MIN_Z, Math.min(this.MAX_Z, z));
    this.predictor.setTargetDirect({ x: clampedX, y: clampedY, z: clampedZ });
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
        const currentTarget = this.predictor.getCurrentPosition();
        const returnX = currentTarget.x + (0 - currentTarget.x) * lerpFactor;
        const returnY = currentTarget.y + (0 - currentTarget.y) * lerpFactor;
        const returnZ = currentTarget.z + (neutralZ - currentTarget.z) * lerpFactor;
        this.predictor.setTargetDirect({ x: returnX, y: returnY, z: returnZ });
      }
    }

    // Advance kinematic predictor using critically damped harmonic oscillation (SmoothDamp)
    const smoothPos = this.predictor.step(deltaTimeSeconds, currentTimestampSeconds);
    this.currentX = smoothPos.x;
    this.currentY = smoothPos.y;
    this.currentZ = smoothPos.z;

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
        this.far,
        this.referenceDistance,
        this.depthMode
      );
    } else {
      ProjectionMath.applySimplePerspective(
        this.camera,
        this.currentX,
        this.currentY,
        this.currentZ,
        this.screen,
        this.near,
        this.far,
        this.referenceDistance,
        this.depthMode
      );
    }
  }
}

