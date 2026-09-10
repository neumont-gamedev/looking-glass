/**
 * KinematicPredictor.ts
 *
 * Physics-based kinematic motion predictor and inter-frame interpolator.
 * 
 * Solves tracking jitter and judder via:
 * 1. Dead Reckoning: Extrapolates position during 30Hz inter-frame gaps using filtered velocity.
 * 2. Predictive Lookahead: Compensates for camera exposure + MediaPipe inference latency (~35ms).
 * 3. Adaptive Stationary Deadband: Eliminates sub-millimeter landmark tremor when sitting still.
 * 4. Critically Damped Harmonic Oscillator (SmoothDamp): Closed-form analytical spring-damper
 *    guaranteeing C¹ continuous velocity, finite jerk, zero overshoot, and buttery smooth translation.
 */

import { Vector3D } from './VectorFilter';

export interface KinematicPredictorConfig {
  /** Predictive lookahead horizon in seconds (e.g. 0.035 for 35ms latency compensation). Default: 0.035 */
  lookaheadSeconds: number;
  /** Approximate time to reach target in seconds using critically damped spring-damper. Default: 0.055 */
  smoothTime: number;
  /** Velocity deadband threshold in m/s below which motion is treated as sensor tremor. Default: 0.006 */
  deadbandThreshold: number;
  /** Whether the stationary anti-jitter deadband is active. Default: true */
  enableDeadband: boolean;
  /** Maximum inter-frame extrapolation time in seconds before decaying velocity. Default: 0.070 */
  maxExtrapolationGap: number;
}

export class KinematicPredictor {
  public config: KinematicPredictorConfig;

  // Latest tracking sample from filter
  private samplePos: Vector3D = { x: 0, y: 0, z: 0.65 };
  private sampleVel: Vector3D = { x: 0, y: 0, z: 0 };
  private lastSampleTime: number | null = null;

  // Current interpolated state of the camera
  private currentPos: Vector3D = { x: 0, y: 0, z: 0.65 };
  private currentVel: Vector3D = { x: 0, y: 0, z: 0 };

  constructor(config: Partial<KinematicPredictorConfig> = {}) {
    this.config = {
      lookaheadSeconds: config.lookaheadSeconds ?? 0.035,
      smoothTime: config.smoothTime ?? 0.055,
      deadbandThreshold: config.deadbandThreshold ?? 0.006,
      enableDeadband: config.enableDeadband ?? true,
      maxExtrapolationGap: config.maxExtrapolationGap ?? 0.070
    };
  }

  /**
   * Resets predictor state to a given position.
   */
  public reset(pos: Vector3D = { x: 0, y: 0, z: 0.65 }): void {
    this.samplePos = { ...pos };
    this.sampleVel = { x: 0, y: 0, z: 0 };
    this.currentPos = { ...pos };
    this.currentVel = { x: 0, y: 0, z: 0 };
    this.lastSampleTime = null;
  }

  /**
   * Ingests a new filtered tracking sample.
   *
   * @param pos Filtered position in meters
   * @param vel Filtered velocity in meters/second
   * @param timestampSec Sample timestamp in seconds
   */
  public updateSample(pos: Vector3D, vel: Vector3D, timestampSec: number): void {
    this.samplePos = { ...pos };
    this.sampleVel = { ...vel };
    this.lastSampleTime = timestampSec;

    // First sample initialization
    if (this.lastSampleTime === null) {
      this.currentPos = { ...pos };
    }
  }

  /**
   * Sets target directly without velocity (e.g. for mouse or fallback simulation).
   */
  public setTargetDirect(pos: Vector3D): void {
    this.samplePos = { ...pos };
    this.sampleVel = { x: 0, y: 0, z: 0 };
    this.lastSampleTime = null;
  }

  /**
   * Advances the kinematic simulation by deltaTimeSeconds to produce the next camera pose.
   *
   * @param dt Frame delta time in seconds
   * @param currentTimeSec Current high-resolution timestamp in seconds
   * @returns Smooth, continuous, interpolated camera position
   */
  public step(dt: number, currentTimeSec: number): Vector3D {
    // Clamp delta time to avoid instability during tab suspension or frame drops
    const safeDt = Math.max(0.0001, Math.min(0.08, dt));

    // 1. Calculate effective velocity with adaptive stationary deadband
    let effVx = this.sampleVel.x;
    let effVy = this.sampleVel.y;
    let effVz = this.sampleVel.z;

    if (this.config.enableDeadband) {
      const speed = Math.hypot(effVx, effVy, effVz);
      const threshold = this.config.deadbandThreshold;

      if (speed < threshold) {
        // Smooth Hermite ramp (3x^2 - 2x^3) to avoid discontinuous deadzone snapping
        const t = Math.max(0, Math.min(1, speed / threshold));
        const factor = t * t * (3 - 2 * t);
        effVx *= factor;
        effVy *= factor;
        effVz *= factor;
      }
    }

    // 2. Dead Reckoning: Extrapolate target forward in time
    // If tracking packets stop arriving (> maxExtrapolationGap), decay velocity to zero
    let extrapolationDt = this.config.lookaheadSeconds;
    if (this.lastSampleTime !== null) {
      const elapsedSinceSample = Math.max(0, currentTimeSec - this.lastSampleTime);
      if (elapsedSinceSample < this.config.maxExtrapolationGap) {
        extrapolationDt += elapsedSinceSample;
      } else {
        // Fade velocity when tracking updates stall
        const fadeFactor = Math.max(0, 1 - (elapsedSinceSample - this.config.maxExtrapolationGap) / 0.1);
        effVx *= fadeFactor;
        effVy *= fadeFactor;
        effVz *= fadeFactor;
      }
    }

    const targetX = this.samplePos.x + effVx * extrapolationDt;
    const targetY = this.samplePos.y + effVy * extrapolationDt;
    const targetZ = this.samplePos.z + effVz * extrapolationDt;

    // 3. Critically Damped Harmonic Oscillator (SmoothDamp)
    // Closed-form solution: ensures zero overshoot and C¹ velocity continuity
    const smoothTime = Math.max(0.005, this.config.smoothTime);
    const resX = this.smoothDamp1D(this.currentPos.x, targetX, this.currentVel.x, smoothTime, safeDt);
    const resY = this.smoothDamp1D(this.currentPos.y, targetY, this.currentVel.y, smoothTime, safeDt);
    const resZ = this.smoothDamp1D(this.currentPos.z, targetZ, this.currentVel.z, smoothTime, safeDt);

    this.currentPos = { x: resX.position, y: resY.position, z: resZ.position };
    this.currentVel = { x: resX.velocity, y: resY.velocity, z: resZ.velocity };

    return { ...this.currentPos };
  }

  /**
   * Closed-form Critically Damped Harmonic Oscillator (Game Programming Gems / Unity SmoothDamp).
   * Solves: x''(t) + 2*omega*x'(t) + omega^2 * (x(t) - target) = 0
   */
  private smoothDamp1D(
    current: number,
    target: number,
    currentVelocity: number,
    smoothTime: number,
    dt: number
  ): { position: number; velocity: number } {
    const omega = 2.0 / smoothTime;
    const x = omega * dt;
    // 4th order rational approximation of exp(-omega * dt)
    const exp = 1.0 / (1.0 + x + 0.48 * x * x + 0.235 * x * x * x);

    const change = current - target;
    const temp = (currentVelocity + omega * change) * dt;

    const newVelocity = (currentVelocity - omega * temp) * exp;
    let newPosition = target + (change + temp) * exp;

    // Prevent floating point drift when target and current converge
    if ((target - current > 0.0) === (newPosition > target)) {
      newPosition = target;
    }

    return { position: newPosition, velocity: newVelocity };
  }

  public getCurrentPosition(): Vector3D {
    return { ...this.currentPos };
  }

  public getCurrentVelocity(): Vector3D {
    return { ...this.currentVel };
  }
}
