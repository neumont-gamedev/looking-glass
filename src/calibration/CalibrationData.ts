/**
 * CalibrationData.ts
 *
 * Data models for user calibration, monitor dimensions, neutral head pose,
 * and sensitivity configurations.
 */

export interface SensitivitySettings {
  x: number; // Multiplier for lateral movement (default: 1.0)
  y: number; // Multiplier for vertical movement (default: 1.0)
  z: number; // Multiplier for depth movement (default: 1.0)
}

export type DistanceCalibrationMode = 'wireframe' | 'biometric' | 'manual';

export interface CalibrationData {
  /** Calibrated neutral head position in meters */
  neutralOrigin: {
    x: number;
    y: number;
    z: number;
  };
  /** Physical screen dimensions in meters */
  screenWidth: number;
  screenHeight: number;
  /** Screen diagonal in inches (for UI display/input) */
  screenDiagonalInches: number;
  /** Calibrated standard viewing distance in meters (default: 0.65m) */
  viewingDistance: number;
  /** Active distance calibration method */
  distanceMode: DistanceCalibrationMode;
  /** Whether to continuously auto-track viewing depth via biometric estimation */
  continuousDepthTracking: boolean;
  /** Motion sensitivity multipliers */
  sensitivity: SensitivitySettings;
  /** Whether calibration has been completed by the user */
  isCalibrated: boolean;
  /** Invert horizontal tracking direction */
  invertHorizontal: boolean;
}

export const DEFAULT_CALIBRATION_DATA: CalibrationData = {
  neutralOrigin: {
    x: 0,
    y: 0,
    z: 0.65
  },
  screenWidth: 0.531, // ~24" 16:9
  screenHeight: 0.299,
  screenDiagonalInches: 24,
  viewingDistance: 0.65,
  distanceMode: 'wireframe',
  continuousDepthTracking: false,
  sensitivity: {
    x: 1.0,
    y: 1.0,
    z: 1.0
  },
  isCalibrated: false,
  invertHorizontal: false
};

