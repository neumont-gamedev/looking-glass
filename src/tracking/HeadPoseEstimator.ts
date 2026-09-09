/**
 * HeadPoseEstimator.ts
 *
 * Converts raw MediaPipe 2D/3D landmarks into a metric ViewerPose
 * relative to the display screen.
 */

import { NormalizedLandmark, ViewerPose } from './TrackingState';
import { ScreenGeometry } from '../math/ScreenGeometry';
import { CoordinateMapper } from '../math/CoordinateMapper';
import { CalibrationData } from '../calibration/CalibrationData';

// Standard MediaPipe Face Landmark indices
const LANDMARK_NOSE_TIP = 1;
const LANDMARK_GLABELLA = 9; // Forehead / between eyebrows
const LANDMARK_CHIN = 152;
const LANDMARK_LEFT_EYE_OUTER = 33;
const LANDMARK_LEFT_EYE_INNER = 133;
const LANDMARK_RIGHT_EYE_INNER = 362;
const LANDMARK_RIGHT_EYE_OUTER = 263;
const LANDMARK_LEFT_IRIS = 468;
const LANDMARK_RIGHT_IRIS = 473;

// Typical human interpupillary distance (IPD) in meters (~63mm)
const AVERAGE_HUMAN_IPD_METERS = 0.063;

export class HeadPoseEstimator {
  private cameraHFOV: number = 60.0; // Standard webcam horizontal field of view in degrees

  constructor(cameraHFOV: number = 60.0) {
    this.cameraHFOV = cameraHFOV;
  }

  /**
   * Computes eye midpoint from landmarks.
   */
  public getEyeMidpoint(landmarks: NormalizedLandmark[]): NormalizedLandmark {
    if (!landmarks || landmarks.length === 0) {
      return { x: 0.5, y: 0.5, z: 0 };
    }

    // Prefer iris landmarks if available (478 landmark model)
    if (landmarks.length > 473 && landmarks[LANDMARK_LEFT_IRIS] && landmarks[LANDMARK_RIGHT_IRIS]) {
      const left = landmarks[LANDMARK_LEFT_IRIS];
      const right = landmarks[LANDMARK_RIGHT_IRIS];
      return {
        x: (left.x + right.x) / 2,
        y: (left.y + right.y) / 2,
        z: (left.z + right.z) / 2
      };
    }

    // Fallback to eye corners
    const leftOuter = landmarks[LANDMARK_LEFT_EYE_OUTER] ?? { x: 0.4, y: 0.45, z: 0 };
    const rightOuter = landmarks[LANDMARK_RIGHT_EYE_OUTER] ?? { x: 0.6, y: 0.45, z: 0 };
    return {
      x: (leftOuter.x + rightOuter.x) / 2,
      y: (leftOuter.y + rightOuter.y) / 2,
      z: (leftOuter.z + rightOuter.z) / 2
    };
  }

  /**
   * Estimates distance from the camera based on physical interpupillary distance (IPD).
   */
  public estimateDistanceMeters(landmarks: NormalizedLandmark[], screen: ScreenGeometry): number {
    if (!landmarks || landmarks.length < 264) {
      return 0.65;
    }

    // Interpupillary distance or outer eye corners in image space
    let leftEye = landmarks[LANDMARK_LEFT_EYE_INNER] ?? landmarks[LANDMARK_LEFT_EYE_OUTER];
    let rightEye = landmarks[LANDMARK_RIGHT_EYE_INNER] ?? landmarks[LANDMARK_RIGHT_EYE_OUTER];

    if (landmarks.length > 473 && landmarks[LANDMARK_LEFT_IRIS] && landmarks[LANDMARK_RIGHT_IRIS]) {
      leftEye = landmarks[LANDMARK_LEFT_IRIS];
      rightEye = landmarks[LANDMARK_RIGHT_IRIS];
    }

    const dx = rightEye.x - leftEye.x;
    // Account for screen aspect ratio when converting normalized Y to X equivalent
    const dy = (rightEye.y - leftEye.y) / screen.aspectRatio;
    const eyeDistNorm = Math.sqrt(dx * dx + dy * dy);

    if (eyeDistNorm < 0.02) {
      return 0.65; // Sanity fallback if too small or far
    }

    const hFovRad = (this.cameraHFOV * Math.PI) / 180;
    // Z = IPD / (2 * normDist * tan(HFOV / 2))
    const estimatedZ = AVERAGE_HUMAN_IPD_METERS / (eyeDistNorm * 2 * Math.tan(hFovRad / 2));

    // Clamp to realistic desktop viewing distance: [0.25m, 1.8m]
    return Math.max(0.25, Math.min(1.8, estimatedZ));
  }

  /**
   * Estimates approximate head rotation (yaw, pitch, roll) in degrees.
   */
  public estimateHeadRotation(landmarks: NormalizedLandmark[]): { yaw: number; pitch: number; roll: number } {
    if (!landmarks || landmarks.length < 153) {
      return { yaw: 0, pitch: 0, roll: 0 };
    }

    const leftEye = landmarks[LANDMARK_LEFT_EYE_OUTER];
    const rightEye = landmarks[LANDMARK_RIGHT_EYE_OUTER];
    const nose = landmarks[LANDMARK_NOSE_TIP];
    const forehead = landmarks[LANDMARK_GLABELLA];
    const chin = landmarks[LANDMARK_CHIN];

    // Roll: angle of eye line relative to horizontal
    const roll = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * (180 / Math.PI);

    // Yaw: asymmetry of nose relative to eye centers
    const eyeMidX = (leftEye.x + rightEye.x) / 2;
    const eyeDist = Math.abs(rightEye.x - leftEye.x);
    const yaw = eyeDist > 0.01 ? ((nose.x - eyeMidX) / eyeDist) * 90 : 0;

    // Pitch: vertical position of nose relative to forehead-chin
    const faceMidY = (forehead.y + chin.y) / 2;
    const faceHeight = Math.abs(chin.y - forehead.y);
    const pitch = faceHeight > 0.01 ? ((nose.y - faceMidY) / faceHeight) * 90 : 0;

    return { yaw, pitch, roll };
  }

  /**
   * Converts landmarks into calibrated ViewerPose in meters.
   */
  public estimatePose(
    landmarks: NormalizedLandmark[],
    screen: ScreenGeometry,
    calibration: CalibrationData,
    timestamp: number
  ): ViewerPose {
    const eyeMid = this.getEyeMidpoint(landmarks);
    const estimatedDistance = this.estimateDistanceMeters(landmarks, screen);

    // Convert normalized landmark to raw physical coordinates
    const rawPos = CoordinateMapper.landmarkToViewerPosition(
      eyeMid.x,
      eyeMid.y,
      estimatedDistance,
      screen,
      this.cameraHFOV,
      calibration.invertHorizontal ?? false
    );

    // Apply calibration offset and sensitivities
    const calibratedX = (rawPos.x - calibration.neutralOrigin.x) * calibration.sensitivity.x;
    const calibratedY = (rawPos.y - calibration.neutralOrigin.y) * calibration.sensitivity.y;
    // Depth is relative to calibrated viewing distance
    const depthDelta = (rawPos.z - calibration.neutralOrigin.z) * calibration.sensitivity.z;
    const calibratedZ = Math.max(0.2, calibration.viewingDistance + depthDelta);

    const rotation = this.estimateHeadRotation(landmarks);

    return {
      x: calibratedX,
      y: calibratedY,
      z: calibratedZ,
      yaw: rotation.yaw,
      pitch: rotation.pitch,
      roll: rotation.roll,
      confidence: 1.0,
      timestamp
    };
  }
}

