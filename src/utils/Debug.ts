/**
 * Debug.ts
 *
 * FPS monitoring and latency profiling utility.
 */

export class FpsCounter {
  private frameTimes: number[] = [];
  private lastTimestamp: number = performance.now();
  public currentFps: number = 60;

  public update(): number {
    const now = performance.now();
    const delta = now - this.lastTimestamp;
    this.lastTimestamp = now;

    if (delta > 0) {
      this.frameTimes.push(1000 / delta);
      if (this.frameTimes.length > 30) {
        this.frameTimes.shift();
      }
      const sum = this.frameTimes.reduce((a, b) => a + b, 0);
      this.currentFps = Math.round(sum / this.frameTimes.length);
    }

    return this.currentFps;
  }
}

