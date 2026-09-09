/**
 * TrackingState.ts
 *
 * State models and interfaces for face tracking, pose estimation, and status reporting.
 */

export enum TrackingStatus {
  Initializing = 'Initializing',
  Active = 'Active',
  LowConfidence = 'LowConfidence',
  FaceLost = 'FaceLost',
  CameraDenied = 'CameraDenied',
  Error = 'Error',
  FallbackMouse = 'FallbackMouse',
  FallbackAuto = 'FallbackAuto'
}

export interface NormalizedLandmark {
  x: number;
  y: number;
  z: number;
}

export interface FaceTrackingResult {
  visible: boolean;
  confidence: number;
  timestamp: number;
  landmarks: NormalizedLandmark[];
}

export interface ViewerPose {
  /** Metric displacement relative to screen center in meters (+X: right, +Y: up, +Z: away) */
  x: number;
  y: number;
  z: number;

  /** Estimated head rotation in degrees (optional) */
  yaw?: number;
  pitch?: number;
  roll?: number;

  confidence: number;
  timestamp: number;
}

