/**
 * FaceTracker.ts
 *
 * Manages webcam media stream and MediaPipe FaceLandmarker detection.
 * Offloads inference to a dedicated Web Worker to prevent blocking the main
 * thread, with graceful main-thread fallback. Fully decoupled from Three.js rendering.
 */

import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';
import { FaceTrackingResult, TrackingStatus } from './TrackingState';
import { FpsCounter } from '../utils/Debug';

export type TrackingResultCallback = (result: FaceTrackingResult) => void;
export type TrackingStatusCallback = (status: TrackingStatus, message?: string) => void;

export class FaceTracker {
  private video: HTMLVideoElement;
  private faceLandmarker: FaceLandmarker | null = null;
  private worker: Worker | null = null;
  private useWorker: boolean = false;
  private isRunning: boolean = false;
  private animationFrameId: number | null = null;
  private rVfcHandle: number | null = null;
  private lastVideoTime: number = -1;

  // Inference rate limiting & decoupling (target max 30 FPS tracking so rendering has 100% headroom)
  private isProcessing: boolean = false;
  private readonly minInferenceIntervalMs: number = 33.3; // 30 FPS
  private lastInferenceTime: number = 0;

  private trackFpsCounter: FpsCounter = new FpsCounter();
  public trackFps: number = 0;
  public inferenceLatencyMs: number = 0;

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
   * Checks if camera stream is active and running with live video tracks.
   */
  public isCameraRunning(): boolean {
    if (!this.isRunning || !this.video.srcObject) return false;
    const stream = this.video.srcObject as MediaStream;
    const tracks = stream.getVideoTracks ? stream.getVideoTracks() : [];
    return tracks.length > 0 && tracks.some((t) => t.readyState === 'live');
  }

  /**
   * Starts or restarts the webcam stream. Reuses loaded FaceLandmarker model if available.
   */
  public async startCamera(): Promise<void> {
    if (this.isCameraRunning()) return;

    if (!this.worker && !this.faceLandmarker) {
      await this.initialize();
      return;
    }

    try {
      this.updateStatus(TrackingStatus.Initializing, 'Starting camera...');
      await this.startWebcam();
      this.isRunning = true;
      this.updateStatus(TrackingStatus.Active, 'Tracking active');
      this.startProcessingLoop();
    } catch (err: unknown) {
      const error = err as Error;
      console.error('[FaceTracker] Camera start failed:', error);
      if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
        this.updateStatus(TrackingStatus.CameraDenied, 'Camera access denied by user');
      } else {
        this.updateStatus(TrackingStatus.Error, error?.message || 'Failed to start camera');
      }
      throw error;
    }
  }

  /**
   * Stops the webcam stream and turns off hardware camera indicator LED.
   */
  public stopCamera(): void {
    this.isRunning = false;
    this.isProcessing = false;

    if (this.rVfcHandle !== null && 'cancelVideoFrameCallback' in this.video) {
      (this.video as any).cancelVideoFrameCallback(this.rVfcHandle);
      this.rVfcHandle = null;
    }
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.video.srcObject) {
      const stream = this.video.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      this.video.srcObject = null;
    }

    this.trackFps = 0;
    this.inferenceLatencyMs = 0;
    this.updateStatus(TrackingStatus.CameraOff, 'Camera Off');
  }

  /**
   * Initializes MediaPipe FaceLandmarker (via Web Worker or main-thread fallback)
   * and starts webcam capture.
   */
  public async initialize(): Promise<void> {
    if (this.worker || this.faceLandmarker) {
      await this.startCamera();
      return;
    }

    this.updateStatus(TrackingStatus.Initializing, 'Loading FaceLandmarker model...');

    try {
      // 1. Attempt initializing dedicated Web Worker for background inference
      let workerReady = false;
      if (typeof Worker !== 'undefined') {
        workerReady = await this.initWorker();
      }

      if (!workerReady) {
        // 2. Fallback to main-thread FaceLandmarker if worker cannot be instantiated
        await this.initMainThreadModel();
      }

      // 3. Request webcam stream
      await this.startWebcam();

      this.isRunning = true;
      this.updateStatus(
        TrackingStatus.Active,
        this.useWorker ? 'Tracking active (Web Worker)' : 'Tracking active'
      );
      this.startProcessingLoop();
    } catch (err: unknown) {
      const error = err as Error;
      console.error('[FaceTracker] Initialization failed:', error);
      if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
        this.updateStatus(TrackingStatus.CameraDenied, 'Camera access denied by user');
      } else {
        this.updateStatus(TrackingStatus.Error, error?.message || 'Failed to initialize tracking');
      }
      throw error;
    }
  }

  private initWorker(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const worker = new Worker(new URL('./FaceTrackerWorker.ts', import.meta.url), { type: 'module' });
        const timeoutId = setTimeout(() => {
          console.warn('[FaceTracker] Worker init timeout, will use main-thread fallback');
          worker.terminate();
          resolve(false);
        }, 8000);

        worker.onmessage = (e: MessageEvent) => {
          const { type, visible, landmarks, timestamp, latencyMs, error } = e.data;

          if (type === 'init_ok') {
            clearTimeout(timeoutId);
            this.worker = worker;
            this.useWorker = true;
            this.setupWorkerListeners();
            resolve(true);
          } else if (type === 'init_error') {
            clearTimeout(timeoutId);
            console.warn('[FaceTracker] Worker model init failed:', error);
            worker.terminate();
            resolve(false);
          } else if (type === 'result') {
            this.handleWorkerResult(visible, landmarks, timestamp, latencyMs);
          }
        };

        worker.onerror = (err) => {
          clearTimeout(timeoutId);
          console.warn('[FaceTracker] Worker error:', err);
          worker.terminate();
          resolve(false);
        };

        worker.postMessage({ type: 'init', data: { delegate: 'GPU' } });
      } catch (err) {
        resolve(false);
      }
    });
  }

  private setupWorkerListeners(): void {
    if (!this.worker) return;

    this.worker.onmessage = (e: MessageEvent) => {
      const { type, visible, landmarks, timestamp, latencyMs } = e.data;
      if (type === 'result') {
        this.handleWorkerResult(visible, landmarks, timestamp, latencyMs);
      } else if (type === 'detect_error') {
        this.isProcessing = false;
      }
    };

    this.worker.onerror = (err) => {
      console.warn('[FaceTracker] Worker runtime error:', err);
      this.isProcessing = false;
    };
  }

  private handleWorkerResult(
    visible: boolean,
    landmarks: any[],
    timestampMs: number,
    latencyMs: number
  ): void {
    this.isProcessing = false;
    this.inferenceLatencyMs = latencyMs;
    this.trackFps = this.trackFpsCounter.update();

    if (this.onResultCallback) {
      this.onResultCallback({
        visible,
        confidence: visible ? 1.0 : 0.0,
        timestamp: timestampMs / 1000,
        landmarks: landmarks || [],
        inferenceLatencyMs: latencyMs
      });
    }
  }

  private async initMainThreadModel(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    );

    this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        delegate: 'GPU'
      },
      runningMode: 'VIDEO',
      numFaces: 1,
      minFaceDetectionConfidence: 0.4,
      minFacePresenceConfidence: 0.4,
      minTrackingConfidence: 0.4,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false
    });
  }

  private async startWebcam(): Promise<void> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Webcam media devices API not supported in this browser');
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30, max: 60 }
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

  private startProcessingLoop(): void {
    if ('requestVideoFrameCallback' in this.video) {
      this.rVfcHandle = (this.video as any).requestVideoFrameCallback(this.onVideoFrame);
    } else {
      const loop = () => {
        if (!this.isRunning) return;
        if (this.video.readyState >= 2 && this.video.currentTime !== this.lastVideoTime) {
          this.lastVideoTime = this.video.currentTime;
          this.queueFrameInference(performance.now());
        }
        this.animationFrameId = requestAnimationFrame(loop);
      };
      this.animationFrameId = requestAnimationFrame(loop);
    }
  }

  private onVideoFrame = (now: DOMHighResTimeStamp, _metadata?: any): void => {
    if (!this.isRunning) return;

    this.queueFrameInference(now);

    if (this.isRunning && 'requestVideoFrameCallback' in this.video) {
      this.rVfcHandle = (this.video as any).requestVideoFrameCallback(this.onVideoFrame);
    }
  };

  /**
   * Dispatches a video frame to the worker or main-thread pipeline.
   * Throttled to 30 FPS to leave ample CPU/GPU budget for 60 FPS Three.js rendering.
   */
  private queueFrameInference(now: number): void {
    if (this.isProcessing || this.video.readyState < 2) return;

    const elapsed = now - this.lastInferenceTime;
    if (elapsed < this.minInferenceIntervalMs) return;

    this.isProcessing = true;
    this.lastInferenceTime = now;

    if (this.useWorker && this.worker) {
      // Offload to Web Worker with zero-copy ImageBitmap
      createImageBitmap(this.video)
        .then((bitmap) => {
          if (this.worker && this.isRunning) {
            this.worker.postMessage({ type: 'detect', data: { bitmap, timestamp: now } }, [bitmap]);
          } else {
            bitmap.close();
            this.isProcessing = false;
          }
        })
        .catch(() => {
          this.isProcessing = false;
        });
    } else if (this.faceLandmarker) {
      // Main-thread fallback: defer outside the rendering frame callback
      setTimeout(() => {
        if (this.isRunning) {
          this.processCurrentFrame(now);
        } else {
          this.isProcessing = false;
        }
      }, 0);
    } else {
      this.isProcessing = false;
    }
  }

  private processCurrentFrame(frameNow?: number): void {
    if (!this.faceLandmarker || this.video.readyState < 2) {
      this.isProcessing = false;
      return;
    }

    const nowInMs = frameNow ?? performance.now();
    const startInference = performance.now();

    try {
      const results = this.faceLandmarker.detectForVideo(this.video, nowInMs);
      this.inferenceLatencyMs = Math.round((performance.now() - startInference) * 10) / 10;
      this.trackFps = this.trackFpsCounter.update();

      if (results && results.faceLandmarks && results.faceLandmarks.length > 0) {
        const landmarks = results.faceLandmarks[0];
        if (this.onResultCallback) {
          this.onResultCallback({
            visible: true,
            confidence: 1.0,
            timestamp: nowInMs / 1000,
            landmarks,
            inferenceLatencyMs: this.inferenceLatencyMs
          });
        }
      } else {
        if (this.onResultCallback) {
          this.onResultCallback({
            visible: false,
            confidence: 0.0,
            timestamp: nowInMs / 1000,
            landmarks: [],
            inferenceLatencyMs: this.inferenceLatencyMs
          });
        }
      }
    } catch (e) {
      console.warn('[FaceTracker] Detection frame error:', e);
    } finally {
      this.isProcessing = false;
    }
  }

  private updateStatus(status: TrackingStatus, message?: string): void {
    if (this.onStatusCallback) {
      this.onStatusCallback(status, message);
    }
  }

  public stop(): void {
    this.stopCamera();

    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.useWorker = false;
    }

    if (this.faceLandmarker) {
      this.faceLandmarker.close();
      this.faceLandmarker = null;
    }
  }
}
