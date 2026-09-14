/**
 * FaceTrackerWorker.ts
 *
 * Dedicated Web Worker for MediaPipe FaceLandmarker inference.
 * Offloads heavy neural network inference off the main UI/render thread,
 * ensuring Three.js rendering and simulation remain at a rock-solid 60 FPS.
 */

import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';

let faceLandmarker: FaceLandmarker | null = null;
let isInitializing = false;

self.onmessage = async (e: MessageEvent) => {
  const { type, data } = e.data;

  if (type === 'init') {
    if (faceLandmarker || isInitializing) return;
    isInitializing = true;

    try {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );

      // In Web Worker, GPU delegate uses OffscreenCanvas WebGL2 if available; fallback to CPU SIMD
      let landmarker: FaceLandmarker | null = null;
      try {
        landmarker = await FaceLandmarker.createFromOptions(vision, {
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
      } catch (gpuErr) {
        console.warn('[FaceTrackerWorker] GPU delegate unavailable in worker, falling back to CPU:', gpuErr);
        landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'CPU'
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

      faceLandmarker = landmarker;
      isInitializing = false;
      self.postMessage({ type: 'init_ok' });
    } catch (err: any) {
      isInitializing = false;
      self.postMessage({ type: 'init_error', error: err?.message || String(err) });
    }
  } else if (type === 'detect') {
    const { bitmap, timestamp } = data;
    if (!faceLandmarker) {
      if (bitmap) bitmap.close();
      self.postMessage({ type: 'detect_error', error: 'FaceLandmarker not initialized' });
      return;
    }

    const startTime = performance.now();
    try {
      const results = faceLandmarker.detectForVideo(bitmap, timestamp);
      const latencyMs = Math.round((performance.now() - startTime) * 10) / 10;
      bitmap.close();

      if (results && results.faceLandmarks && results.faceLandmarks.length > 0) {
        self.postMessage({
          type: 'result',
          visible: true,
          landmarks: results.faceLandmarks[0],
          timestamp,
          latencyMs
        });
      } else {
        self.postMessage({
          type: 'result',
          visible: false,
          landmarks: [],
          timestamp,
          latencyMs
        });
      }
    } catch (detectErr: any) {
      if (bitmap) bitmap.close();
      self.postMessage({
        type: 'detect_error',
        error: detectErr?.message || String(detectErr)
      });
    }
  }
};
