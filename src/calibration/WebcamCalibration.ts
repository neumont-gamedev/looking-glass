import { NormalizedLandmark } from '../tracking/TrackingState';

/** A short-lived buffer of scalar measurements; no images or landmarks are retained. */
export class WebcamCalibration {
  private samples: Array<{ timestamp: number; span: number }> = [];

  public reset(): void { this.samples = []; }

  public add(landmarks: NormalizedLandmark[], aspect: number, timestamp: number): void {
    const left = landmarks[468], right = landmarks[473];
    if (!left || !right) { this.reset(); return; }
    const span = Math.hypot(right.x - left.x, (right.y - left.y) / aspect);
    // Require a nearly frontal pose; calibration must not absorb a head turn.
    if (!Number.isFinite(span) || span < .02 || Math.abs(right.z - left.z) / span > .18) {
      this.reset(); return;
    }
    this.samples.push({ timestamp, span });
    this.samples = this.samples.filter(sample => timestamp - sample.timestamp <= 1).slice(-60);
  }

  public estimate(distanceMeters: number, ipdMeters: number, now: number): number {
    if (!Number.isFinite(distanceMeters) || distanceMeters < .3 || distanceMeters > 1.5 ||
        !Number.isFinite(ipdMeters) || ipdMeters < .045 || ipdMeters > .08) {
      throw new Error('Enter a camera-to-eye distance of 30–150 cm and pupil distance of 45–80 mm.');
    }
    const recent = this.samples.filter(sample => now - sample.timestamp <= 1);
    if (recent.length < 12 || now - recent[recent.length - 1].timestamp > .2) {
      throw new Error('Enable the camera and look straight at it for one second, then try again.');
    }
    const spans = recent.map(sample => sample.span).sort((a, b) => a - b);
    const span = spans[Math.floor(spans.length / 2)];
    if ((spans[spans.length - 1] - spans[0]) / span > .06) {
      throw new Error('Hold still at the measured distance for one second, then try again.');
    }
    // span = IPD / (2 * distance * tan(horizontalFOV / 2)).
    const degrees = 2 * Math.atan(ipdMeters / (2 * distanceMeters * span)) * 180 / Math.PI;
    if (degrees < 30 || degrees > 120) throw new Error('Measurement is outside the supported 30–120° range. Check distance and pupil spacing.');
    return degrees;
  }
}
