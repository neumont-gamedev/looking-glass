/**
 * TrackingDebugView.ts
 *
 * Provides a Picture-in-Picture webcam preview with 2D visual overlay:
 * - Facial landmarks dots
 * - Eye midpoint crosshairs
 * - Face bounding box
 * - Tracking confidence & pose metrics
 */

import { NormalizedLandmark, ViewerPose } from './TrackingState';

export class TrackingDebugView {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private video: HTMLVideoElement | null = null;
  private isVisible: boolean = false;

  constructor(parentContainer?: HTMLElement) {
    this.container = document.createElement('div');
    this.container.id = 'tracking-debug-container';
    this.container.style.display = 'none';

    this.canvas = document.createElement('canvas');
    this.canvas.id = 'tracking-debug-canvas';
    this.container.appendChild(this.canvas);

    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to create 2D context for tracking debug view');
    }
    this.ctx = ctx;

    const target = parentContainer ?? document.body;
    target.appendChild(this.container);
  }

  public attachVideo(video: HTMLVideoElement): void {
    this.video = video;
  }

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    this.container.style.display = visible ? 'block' : 'none';
  }

  public toggle(): boolean {
    this.setVisible(!this.isVisible);
    return this.isVisible;
  }

  public render(
    landmarks: NormalizedLandmark[] | null,
    eyeMidpoint: NormalizedLandmark | null,
    pose: ViewerPose | null,
    fps: number
  ): void {
    if (!this.isVisible) return;

    const width = this.video?.videoWidth || 320;
    const height = this.video?.videoHeight || 240;

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    this.ctx.clearRect(0, 0, width, height);

    // 1. Draw video background (mirrored if video is playing)
    if (this.video && this.video.readyState >= 2) {
      this.ctx.save();
      // Mirror horizontal for intuitive selfie view
      this.ctx.translate(width, 0);
      this.ctx.scale(-1, 1);
      this.ctx.drawImage(this.video, 0, 0, width, height);
      this.ctx.restore();
    } else {
      this.ctx.fillStyle = 'rgba(15, 20, 25, 0.9)';
      this.ctx.fillRect(0, 0, width, height);
    }

    if (!landmarks || landmarks.length === 0) {
      this.ctx.fillStyle = '#ff4444';
      this.ctx.font = '12px monospace';
      this.ctx.fillText('NO FACE DETECTED', 10, 20);
      return;
    }

    // 2. Draw face landmarks
    // Note: Landmarks are in unmirrored [0, 1] camera coords.
    // If we mirrored the video preview, we mirror landmark drawing as: x_draw = (1 - lm.x) * width
    this.ctx.fillStyle = 'rgba(0, 255, 180, 0.6)';
    for (let i = 0; i < landmarks.length; i += 4) { // Step to keep debug view performant
      const lm = landmarks[i];
      const px = (1 - lm.x) * width;
      const py = lm.y * height;
      this.ctx.beginPath();
      this.ctx.arc(px, py, 1.5, 0, Math.PI * 2);
      this.ctx.fill();
    }

    // 3. Draw Eye Midpoint Crosshair
    if (eyeMidpoint) {
      const ex = (1 - eyeMidpoint.x) * width;
      const ey = eyeMidpoint.y * height;

      this.ctx.strokeStyle = '#00ffff';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.arc(ex, ey, 6, 0, Math.PI * 2);
      this.ctx.stroke();

      this.ctx.beginPath();
      this.ctx.moveTo(ex - 10, ey);
      this.ctx.lineTo(ex + 10, ey);
      this.ctx.moveTo(ex, ey - 10);
      this.ctx.lineTo(ex, ey + 10);
      this.ctx.stroke();
    }

    // 4. Metric HUD overlay
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    this.ctx.fillRect(5, 5, 160, 75);

    this.ctx.fillStyle = '#00ffcc';
    this.ctx.font = '11px monospace';
    this.ctx.fillText(`FPS: ${fps.toFixed(0)}`, 10, 18);
    if (pose) {
      this.ctx.fillText(`X: ${(pose.x * 100).toFixed(1)} cm`, 10, 32);
      this.ctx.fillText(`Y: ${(pose.y * 100).toFixed(1)} cm`, 10, 46);
      this.ctx.fillText(`Z: ${(pose.z * 100).toFixed(1)} cm`, 10, 60);
      this.ctx.fillText(`Conf: ${(pose.confidence * 100).toFixed(0)}%`, 10, 74);
    }
  }

  public destroy(): void {
    this.container.remove();
  }
}

