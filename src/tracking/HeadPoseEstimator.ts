/**
 * HeadPoseEstimator.ts
 *
 * Converts raw MediaPipe 2D/3D landmarks into a metric ViewerPose
 * relative to the display screen.
 */

import { NormalizedLandmark, ViewerPose } from './TrackingState';
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
export const AVERAGE_HUMAN_IPD_METERS = 0.063;
// Typical human corneal iris horizontal diameter in meters (~11.7mm)
export const AVERAGE_HUMAN_IRIS_DIAMETER_METERS = 0.0117;

export interface BiometricDistanceResult {
  distanceMeters: number;
  confidence: number;
  hasIris: boolean;
  ipdMeters: number;
  method: 'iris+ipd' | 'ipd' | 'fallback';
}

export class HeadPoseEstimator {
  private cameraHFOV: number = 60.0; // Standard webcam horizontal field of view in degrees

  constructor(cameraHFOV: number = 60.0) {
    this.setCameraHFOV(cameraHFOV);
  }

  public setCameraHFOV(degrees: number): void {
    if (Number.isFinite(degrees) && degrees >= 30 && degrees <= 120) this.cameraHFOV = degrees;
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
   * Estimates biometric distance combining iris diameter (if available) and IPD.
   */
  public estimateBiometricDistance(landmarks: NormalizedLandmark[], cameraAspectRatio: number): BiometricDistanceResult {
    if (!landmarks || landmarks.length < 264) {
      return { distanceMeters: 0.65, confidence: 0.2, hasIris: false, ipdMeters: AVERAGE_HUMAN_IPD_METERS, method: 'fallback' };
    }

    const hFovRad = (this.cameraHFOV * Math.PI) / 180;
    const tanHalfFov = Math.tan(hFovRad / 2);

    // 1. IPD Estimation
    let leftEye = landmarks[LANDMARK_LEFT_EYE_INNER] ?? landmarks[LANDMARK_LEFT_EYE_OUTER];
    let rightEye = landmarks[LANDMARK_RIGHT_EYE_INNER] ?? landmarks[LANDMARK_RIGHT_EYE_OUTER];
    let hasIris = false;

    if (landmarks.length > 477 && landmarks[LANDMARK_LEFT_IRIS] && landmarks[LANDMARK_RIGHT_IRIS]) {
      leftEye = landmarks[LANDMARK_LEFT_IRIS];
      rightEye = landmarks[LANDMARK_RIGHT_IRIS];
      hasIris = true;
    }

    const dx = rightEye.x - leftEye.x;
    // Landmarks normalize X by image width and Y by image height. Convert Y
    // to width units before taking Euclidean distances (square camera pixels).
    const dy = (rightEye.y - leftEye.y) / cameraAspectRatio;
    // MediaPipe relative Z is in the same approximate units as normalized X.
    // Include the inter-eye depth difference to undo yaw foreshortening rather
    // than interpreting a narrower projected eye span as greater distance.
    const dz = rightEye.z - leftEye.z;
    const eyeDistNorm = Math.hypot(dx, dy, dz);

    if (eyeDistNorm < 0.02) {
      return { distanceMeters: 0.65, confidence: 0.3, hasIris: false, ipdMeters: AVERAGE_HUMAN_IPD_METERS, method: 'fallback' };
    }

    const ipdDistance = AVERAGE_HUMAN_IPD_METERS / (eyeDistNorm * 2 * tanHalfFov);

    // 2. Iris Diameter Estimation (if landmarks 468-477 exist)
    if (hasIris && landmarks[469] && landmarks[471] && landmarks[474] && landmarks[476]) {
      const leftIrisDiam = this.irisMajorDiameter(landmarks, 469, cameraAspectRatio);
      const rightIrisDiam = this.irisMajorDiameter(landmarks, 474, cameraAspectRatio);
      const avgIrisDiam = (leftIrisDiam + rightIrisDiam) / 2;

      if (avgIrisDiam > 0.004) {
        const irisDistance = AVERAGE_HUMAN_IRIS_DIAMETER_METERS / (avgIrisDiam * 2 * tanHalfFov);
        // Weighted blend: 65% IPD, 35% Iris (IPD is less noisy, Iris calibrates individual head size)
        const blended = ipdDistance * 0.65 + irisDistance * 0.35;
        const clamped = Math.max(0.25, Math.min(1.8, blended));
        return {
          distanceMeters: clamped,
          confidence: 0.95,
          hasIris: true,
          ipdMeters: AVERAGE_HUMAN_IPD_METERS,
          method: 'iris+ipd'
        };
      }
    }

    const clamped = Math.max(0.25, Math.min(1.8, ipdDistance));
    return {
      distanceMeters: clamped,
      confidence: 0.8,
      hasIris: false,
      ipdMeters: AVERAGE_HUMAN_IPD_METERS,
      method: 'ipd'
    };
  }

  private irisMajorDiameter(landmarks: NormalizedLandmark[], start: number, aspect: number): number {
    // The two opposite rim pairs are projected perpendicular iris diameters.
    // Their 2x2 matrix's largest singular value recovers the ellipse major axis,
    // which does not shrink under a head turn in the weak-perspective model.
    const a = landmarks[start], b = landmarks[start + 2];
    const c = landmarks[start + 1], d = landmarks[start + 3];
    const ux = a.x - b.x, uy = (a.y - b.y) / aspect;
    const vx = c.x - d.x, vy = (c.y - d.y) / aspect;
    const trace = ux * ux + uy * uy + vx * vx + vy * vy;
    const det = ux * vy - uy * vx;
    return Math.sqrt((trace + Math.sqrt(Math.max(0, trace * trace - 4 * det * det))) / 2);
  }

  /**
   * Estimates distance from the camera based on physical interpupillary distance (IPD).
   */
  public estimateDistanceMeters(landmarks: NormalizedLandmark[], cameraAspectRatio: number): number {
    return this.estimateBiometricDistance(landmarks, cameraAspectRatio).distanceMeters;
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
   * Computes the uncalibrated raw metric head pose relative to the physical camera center.
   * Used for calibrating the neutral origin position.
   */
  public estimateRawPose(
    landmarks: NormalizedLandmark[],
    cameraAspectRatio: number,
    timestamp: number
  ): ViewerPose {
    const eyeMid = this.getEyeMidpoint(landmarks);
    const estimatedDistance = this.estimateDistanceMeters(landmarks, cameraAspectRatio);

    const rawPos = CoordinateMapper.landmarkToViewerPosition(
      eyeMid.x,
      eyeMid.y,
      estimatedDistance,
      cameraAspectRatio,
      this.cameraHFOV,
      false
    );

    const rotation = this.estimateHeadRotation(landmarks);

    return {
      x: rawPos.x,
      y: rawPos.y,
      z: rawPos.z,
      yaw: rotation.yaw,
      pitch: rotation.pitch,
      roll: rotation.roll,
      confidence: 1.0,
      timestamp
    };
  }

  /**
   * Converts landmarks into calibrated ViewerPose in meters.
   */
  public estimatePose(
    landmarks: NormalizedLandmark[],
    cameraAspectRatio: number,
    calibration: CalibrationData,
    timestamp: number
  ): ViewerPose {
    const eyeMid = this.getEyeMidpoint(landmarks);
    const estimatedDistance = this.estimateDistanceMeters(landmarks, cameraAspectRatio);

    // Convert normalized landmark to raw physical coordinates
    const rawPos = CoordinateMapper.landmarkToViewerPosition(
      eyeMid.x,
      eyeMid.y,
      estimatedDistance,
      cameraAspectRatio,
      this.cameraHFOV,
      calibration.invertHorizontal ?? false
    );

    // Apply calibration offset and sensitivities
    const calibratedX = (rawPos.x - calibration.neutralOrigin.x) * calibration.sensitivity.x;
    const calibratedY = (rawPos.y - calibration.neutralOrigin.y) * calibration.sensitivity.y;
    // Depth calculation
    let calibratedZ: number;
    if (calibration.continuousDepthTracking) {
      // Scale depth motion around the physical resting distance, not the origin.
      const biometricRatio = rawPos.z / Math.max(0.2, calibration.neutralOrigin.z);
      calibratedZ = Math.max(0.2, calibration.viewingDistance * (1 + (biometricRatio - 1) * calibration.sensitivity.z));
    } else {
      // Relative depth delta from neutral seating pose
      const depthDelta = (rawPos.z - calibration.neutralOrigin.z) * calibration.sensitivity.z;
      calibratedZ = Math.max(0.2, calibration.viewingDistance + depthDelta);
    }

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
