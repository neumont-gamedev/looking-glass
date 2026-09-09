/**
 * CalibrationManager.ts
 *
 * Manages loading, saving, and updating user calibration settings.
 */

import { Storage } from '../utils/Storage';
import { CalibrationData, DEFAULT_CALIBRATION_DATA, DistanceCalibrationMode } from './CalibrationData';
import { ScreenGeometry } from '../math/ScreenGeometry';

const STORAGE_KEY = 'looking_glass_calibration_v1';

export class CalibrationManager {
  private data: CalibrationData;
  private screenGeometry: ScreenGeometry;
  private onChangeCallbacks: Array<(data: CalibrationData) => void> = [];

  constructor() {
    this.data = this.load();
    this.screenGeometry = new ScreenGeometry(this.data.screenWidth, this.data.screenHeight);
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

  public setViewingDistance(distanceMeters: number): void {
    this.data.viewingDistance = Math.max(0.2, distanceMeters);
    this.data.neutralOrigin.z = this.data.viewingDistance;
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
    this.data.screenDiagonalInches = inches;
    const geom = ScreenGeometry.fromDiagonal(inches, 16, 9);
    this.data.screenWidth = geom.width;
    this.data.screenHeight = geom.height;
    this.screenGeometry.width = geom.width;
    this.screenGeometry.height = geom.height;
    this.save();
    this.notify();
  }

  public setScreenDimensions(widthMeters: number, heightMeters: number): void {
    this.data.screenWidth = Math.max(0.1, widthMeters);
    this.data.screenHeight = Math.max(0.1, heightMeters);
    this.screenGeometry.width = this.data.screenWidth;
    this.screenGeometry.height = this.data.screenHeight;
    this.save();
    this.notify();
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

  public resetToDefaults(): void {
    this.data = JSON.parse(JSON.stringify(DEFAULT_CALIBRATION_DATA));
    this.screenGeometry.width = this.data.screenWidth;
    this.screenGeometry.height = this.data.screenHeight;
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
    const loaded = Storage.get<CalibrationData>(STORAGE_KEY, DEFAULT_CALIBRATION_DATA);
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

