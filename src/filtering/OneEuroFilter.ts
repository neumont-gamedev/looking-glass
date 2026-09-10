/**
 * OneEuroFilter.ts
 *
 * Implementation of the 1€ Filter (Casiez, Roussel, Vogel, 2012).
 * An adaptive low-pass filter with low latency during rapid movement
 * and high jitter reduction when stationary.
 */

class LowPassFilter {
  private y: number | null = null;
  private s: number | null = null;

  public filter(value: number, alpha: number): number {
    if (this.y === null) {
      this.s = value;
      this.y = value;
      return value;
    }
    this.y = value;
    this.s = alpha * value + (1.0 - alpha) * (this.s as number);
    return this.s;
  }

  public last(): number | null {
    return this.s;
  }

  public reset(): void {
    this.y = null;
    this.s = null;
  }
}

export interface OneEuroConfig {
  /** Minimum cutoff frequency in Hz (smaller = more filtering at low speeds). Default: 1.2 */
  minCutoff: number;
  /** Speed coefficient in metric space (higher = less lag during rapid movement). Default: 2.5 */
  beta: number;
  /** Cutoff frequency for derivative calculation in Hz. Default: 1.0 */
  dCutoff: number;
}

export class OneEuroFilter {
  public minCutoff: number;
  public beta: number;
  public dCutoff: number;

  private xFilter: LowPassFilter = new LowPassFilter();
  private dxFilter: LowPassFilter = new LowPassFilter();
  private lastTime: number | null = null;

  constructor(config: Partial<OneEuroConfig> = {}) {
    this.minCutoff = config.minCutoff ?? 1.2;
    this.beta = config.beta ?? 2.5;
    this.dCutoff = config.dCutoff ?? 1.0;
  }

  private alpha(rate: number, cutoff: number): number {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    const te = 1.0 / rate;
    return 1.0 / (1.0 + tau / te);
  }

  /**
   * Filters a raw scalar sample at a given timestamp.
   * @param x Raw value
   * @param timestamp Timestamp in seconds (or ms / 1000)
   */
  public filter(x: number, timestamp: number): number {
    if (this.lastTime === null) {
      this.lastTime = timestamp;
      return this.xFilter.filter(x, 1.0);
    }

    const dt = Math.max(0.0001, timestamp - this.lastTime);
    this.lastTime = timestamp;
    const rate = 1.0 / dt;

    // Estimate derivative
    const prevX = this.xFilter.last() ?? x;
    const dx = (x - prevX) * rate;
    const edx = this.dxFilter.filter(dx, this.alpha(rate, this.dCutoff));

    // Dynamic cutoff based on speed
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.xFilter.filter(x, this.alpha(rate, cutoff));
  }

  /**
   * Filters raw scalar and returns both filtered position and filtered velocity.
   */
  public filterWithVelocity(x: number, timestamp: number): { value: number; velocity: number } {
    const value = this.filter(x, timestamp);
    const velocity = this.getVelocity();
    return { value, velocity };
  }

  /**
   * Returns the current estimated filtered velocity (units per second).
   */
  public getVelocity(): number {
    return this.dxFilter.last() ?? 0;
  }

  public reset(): void {
    this.xFilter.reset();
    this.dxFilter.reset();
    this.lastTime = null;
  }
}

