/**
 * FaceTracker.ts
 *
 * Manages webcam media stream and MediaPipe FaceLandmarker detection.
 * Fully decoupled from Three.js rendering.
 */

import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';
import { FaceTrackingResult, TrackingStatus } from './TrackingState';

export type TrackingResultCallback = (result: FaceTrackingResult) => void;
export type TrackingStatusCallback = (status: TrackingStatus, message?: string) => void;

export class FaceTracker {
  private video: HTMLVideoElement;
  private faceLandmarker: FaceLandmarker | null = null;
  private isRunning: boolean = false;
  private animationFrameId: number | null = null;
  private lastVideoTime: number = -1;

  private onResultCallback: TrackingResultCallback | null = null;
  private onStatusCallback: TrackingStatusCallback | null = null;

  constructor() {
    this.video = document.createElement('video');
    this.video.autoplay = true;
    this.video.playsInline = true;
    this.video.muted = true;
    this.video.style.display = 'none';
    document.body.appendChild(this.video);
  }

  public getVideoElement(): HTMLVideoElement {
    return this.video;
  }

  public onResult(cb: TrackingResultCallback): void {
    this.onResultCallback = cb;
  }

  public onStatusChange(cb: TrackingStatusCallback): void {
    this.onStatusCallback = cb;
  }

  /**
   * Initializes MediaPipe FaceLandmarker and starts webcam capture.
   */
  public async initialize(): Promise<void> {
    this.updateStatus(TrackingStatus.Initializing, 'Loading FaceLandmarker model...');

    try {
      // 1. Load MediaPipe Vision WASM files
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );

      // 2. Instantiate FaceLandmarker with GPU delegate when available
      this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'GPU'
        },
        runningMode: 'VIDEO',
        numFaces: 1,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false
      });

      // 3. Request webcam stream
      await this.startWebcam();

      this.isRunning = true;
      this.updateStatus(TrackingStatus.Active, 'Tracking active');
      this.processLoop();
    } catch (err: unknown) {
      const error = err as Error;
      console.error('[FaceTracker] Initialization failed:', error);
      if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
        this.updateStatus(TrackingStatus.CameraDenied, 'Camera access denied by user');
      } else {
        this.updateStatus(TrackingStatus.Error, error?.message || 'Failed to initialize face tracker');
      }
      throw error;
    }
  }

  private async startWebcam(): Promise<void> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Webcam media devices API not supported in this browser');
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30 }
      },
      audio: false
    });

    this.video.srcObject = stream;
    await new Promise<void>((resolve) => {
      this.video.onloadedmetadata = () => {
        this.video.play().then(() => resolve());
      };
    });
  }

  private processLoop = (): void => {
    if (!this.isRunning) return;

    const nowInMs = performance.now();

    if (this.video.readyState >= 2 && this.video.currentTime !== this.lastVideoTime && this.faceLandmarker) {
      this.lastVideoTime = this.video.currentTime;

      try {
        const results = this.faceLandmarker.detectForVideo(this.video, nowInMs);

        if (results && results.faceLandmarks && results.faceLandmarks.length > 0) {
          const landmarks = results.faceLandmarks[0];
          if (this.onResultCallback) {
            this.onResultCallback({
              visible: true,
              confidence: 1.0,
              timestamp: nowInMs / 1000,
              landmarks
            });
          }
        } else {
          if (this.onResultCallback) {
            this.onResultCallback({
              visible: false,
              confidence: 0.0,
              timestamp: nowInMs / 1000,
              landmarks: []
            });
          }
        }
      } catch (e) {
        console.warn('[FaceTracker] Detection frame error:', e);
      }
    }

    this.animationFrameId = requestAnimationFrame(this.processLoop);
  };

  private updateStatus(status: TrackingStatus, message?: string): void {
    if (this.onStatusCallback) {
      this.onStatusCallback(status, message);
    }
  }

  public stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.video.srcObject) {
      const stream = this.video.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      this.video.srcObject = null;
    }

    if (this.faceLandmarker) {
      this.faceLandmarker.close();
      this.faceLandmarker = null;
    }
  }
}

