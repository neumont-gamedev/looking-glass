/**
 * CalibrationManager.ts
 *
 * Manages loading, saving, and updating user calibration settings.
 */

import { Storage } from '../utils/Storage';
import { CalibrationData, DEFAULT_CALIBRATION_DATA, DistanceCalibrationMode } from './CalibrationData';
import { ScreenGeometry } from '../math/ScreenGeometry';

const STORAGE_KEY = 'looking_glass_calibration_v3';

export class CalibrationManager {
  private data: CalibrationData;
  private screenGeometry: ScreenGeometry;
  private onChangeCallbacks: Array<(data: CalibrationData) => void> = [];

  constructor() {
    this.data = this.load();
    this.screenGeometry = new ScreenGeometry(this.data.screenWidth, this.data.screenHeight);
    if (typeof window !== 'undefined' && window.innerWidth > 0 && window.innerHeight > 0) {
      this.updateViewport(window.innerWidth, window.innerHeight);
    }
  }

  /** Derive the canvas aperture from immutable full-monitor dimensions.
   * window.screen and innerWidth/Height are CSS pixels at the same scale at
   * 100% browser zoom. No viewport dimensions are persisted as monitor size.
   */
  public updateViewport(widthPx: number, heightPx: number): void {
    if (![widthPx, heightPx].every(Number.isFinite) || widthPx <= 0 || heightPx <= 0) return;
    const screenW = typeof window !== 'undefined' && window.screen?.width > 0 ? window.screen.width : widthPx;
    const screenH = typeof window !== 'undefined' && window.screen?.height > 0 ? window.screen.height : heightPx;
    const width = this.data.screenWidth * widthPx / screenW;
    const height = this.data.screenHeight * heightPx / screenH;
    if (Math.abs(this.screenGeometry.width - width) < .00001 && Math.abs(this.screenGeometry.height - height) < .00001) return;
    this.screenGeometry.width = width;
    this.screenGeometry.height = height;
    this.notify();
  }

  private refreshViewport(): void {
    if (typeof window !== 'undefined') {
      this.updateViewport(window.innerWidth, window.innerHeight);
    } else {
      this.screenGeometry.width = this.data.screenWidth;
      this.screenGeometry.height = this.data.screenHeight;
    }
  }

  public setCameraHFOV(degrees: number): void {
    if (!Number.isFinite(degrees) || degrees < 30 || degrees > 120) return;
    // X/Y cancel focal length when both distance and offset are estimated from
    // the same image; raw Z rescales. Preserve the existing neutral calibration.
    const ratio = Math.tan(this.data.cameraHFOV * Math.PI / 360) / Math.tan(degrees * Math.PI / 360);
    this.data.neutralOrigin.z *= ratio;
    this.data.cameraHFOV = degrees;
    this.save();
    this.notify();
  }

  public getData(): CalibrationData {
    return { ...this.data, neutralOrigin: { ...this.data.neutralOrigin }, sensitivity: { ...this.data.sensitivity } };
  }

  public getScreenGeometry(): ScreenGeometry {
    return this.screenGeometry;
  }

  public setNeutralOrigin(x: number, y: number, z: number): void {
    this.data.neutralOrigin = { x, y, z };
    this.data.isCalibrated = true;
    this.save();
    this.notify();
  }

  public setViewingDistance(distanceMeters: number, measuredNeutralDepth?: number): void {
    this.data.viewingDistance = Math.max(0.2, distanceMeters);
    // Keep the measured biometric baseline separate from the physical distance.
    // Overwriting it here cancels the distance adjustment in estimatePose().
    // A biometric lock can explicitly supply a fresh measurement as its baseline.
    if (measuredNeutralDepth !== undefined && Number.isFinite(measuredNeutralDepth) && measuredNeutralDepth > 0) {
      this.data.neutralOrigin.z = measuredNeutralDepth;
    }
    this.save();
    this.notify();
  }

  /** Save center and camera-estimated resting distance together, with one notification. */
  public calibrateViewer(x: number, y: number, z: number, distance: number): void {
    if (![x, y, z, distance].every(Number.isFinite) || z <= 0 || distance < 0.2) return;
    this.data.neutralOrigin = { x, y, z };
    this.data.viewingDistance = distance;
    this.data.continuousDepthTracking = true;
    this.data.distanceMode = 'biometric';
    this.data.isCalibrated = true;
    this.save();
    this.notify();
  }

  public setDistanceMode(mode: DistanceCalibrationMode): void {
    this.data.distanceMode = mode;
    this.save();
    this.notify();
  }

  public setContinuousDepthTracking(enabled: boolean): void {
    this.data.continuousDepthTracking = enabled;
    this.save();
    this.notify();
  }

  public setScreenDiagonal(inches: number): void {
    this.setMonitorPreset(inches);
  }

  public setMonitorPreset(diagonalInches: number, customWidthMeters?: number, customHeightMeters?: number): void {
    if (!Number.isFinite(diagonalInches) || diagonalInches <= 0) return;
    if (customWidthMeters && customHeightMeters) {
      this.setScreenDimensions(customWidthMeters, customHeightMeters);
      return;
    }
    const aspect = typeof window !== 'undefined' && window.screen?.height > 0
      ? window.screen.width / window.screen.height : 16 / 9;
    const geometry = ScreenGeometry.fromDiagonal(diagonalInches, aspect, 1);
    this.setScreenDimensions(geometry.width, geometry.height);
  }

  public setScreenDimensions(widthMeters: number, heightMeters: number): void {
    if (![widthMeters, heightMeters].every(Number.isFinite)) return;
    this.data.screenWidth = Math.max(.1, widthMeters);
    this.data.screenHeight = Math.max(.1, heightMeters);
    this.data.screenDiagonalInches = Math.hypot(this.data.screenWidth, this.data.screenHeight) / .0254;
    this.refreshViewport();
    this.save();
    this.notify();
  }

  public setScreenWidth(widthMeters: number): void {
    this.setScreenDimensions(widthMeters, this.data.screenHeight);
  }

  public setScreenHeight(heightMeters: number): void {
    this.setScreenDimensions(this.data.screenWidth, heightMeters);
  }

  public setSensitivity(x: number, y: number, z: number): void {
    this.data.sensitivity = {
      x: Math.max(0.1, Math.min(3.0, x)),
      y: Math.max(0.1, Math.min(3.0, y)),
      z: Math.max(0.1, Math.min(3.0, z))
    };
    this.save();
    this.notify();
  }

  public setInvertHorizontal(invert: boolean): void {
    this.data.invertHorizontal = invert;
    this.save();
    this.notify();
  }

  public resetCenterOrigin(): void {
    this.data.neutralOrigin.x = 0;
    this.data.neutralOrigin.y = 0;
    this.data.isCalibrated = false;
    this.save();
    this.notify();
  }

  public resetToDefaults(): void {
    this.data = structuredClone(DEFAULT_CALIBRATION_DATA);
    this.refreshViewport();
    this.save();
    this.notify();
  }

  public subscribe(cb: (data: CalibrationData) => void): () => void {
    this.onChangeCallbacks.push(cb);
    return () => {
      this.onChangeCallbacks = this.onChangeCallbacks.filter(c => c !== cb);
    };
  }

  private load(): CalibrationData {
    let loaded = Storage.get<CalibrationData | null>(STORAGE_KEY, null);
    if (!loaded) {
      const legacy = Storage.get<CalibrationData | null>('looking_glass_calibration_v2', null)
        ?? Storage.get<CalibrationData | null>('looking_glass_calibration_v1', null);
      if (legacy) {
        // v2 saved viewport W/H. Recover full-monitor dimensions from its diagonal.
        const aspect = typeof window !== 'undefined' && window.screen?.height > 0
          ? window.screen.width / window.screen.height : 16 / 9;
        const diagonal = Number.isFinite(legacy.screenDiagonalInches) && legacy.screenDiagonalInches > 0
          ? legacy.screenDiagonalInches : 24;
        const monitor = ScreenGeometry.fromDiagonal(diagonal, aspect, 1);
        loaded = { ...DEFAULT_CALIBRATION_DATA, ...legacy,
          screenWidth: monitor.width, screenHeight: monitor.height,
          cameraHFOV: 60, isCalibrated: false };
        Storage.set(STORAGE_KEY, loaded);
      }
    }
    if (loaded && (!Number.isFinite(loaded.cameraHFOV) || loaded.cameraHFOV < 30 || loaded.cameraHFOV > 120)) {
      loaded.cameraHFOV = 60;
    }

    return {
      ...DEFAULT_CALIBRATION_DATA,
      ...loaded,
      neutralOrigin: { ...DEFAULT_CALIBRATION_DATA.neutralOrigin, ...loaded?.neutralOrigin },
      sensitivity: { ...DEFAULT_CALIBRATION_DATA.sensitivity, ...loaded?.sensitivity }
    };
  }

  private save(): void {
    Storage.set(STORAGE_KEY, this.data);
  }

  private notify(): void {
    for (const cb of this.onChangeCallbacks) {
      cb(this.getData());
    }
  }
}
