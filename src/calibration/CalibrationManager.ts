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
    if (typeof window !== 'undefined' && window.innerWidth > 0 && window.innerHeight > 0) {
      this.updateViewport(window.innerWidth, window.innerHeight);
    }
  }

  /**
   * Adapts physical screen dimensions to match the viewport's exact aspect ratio
   * based on the display's physical pixel pitch.
   *
   * Physical display pixels are square (1:1 aspect ratio). Therefore, the physical width
   * and height of any viewport rectangle on screen must have the exact same aspect ratio
   * as the viewport pixel dimensions: W_meters / H_meters = widthPx / heightPx.
   *
   * @param widthPx Viewport width in pixels (typically window.innerWidth)
   * @param heightPx Viewport height in pixels (typically window.innerHeight)
   */
  public updateViewport(widthPx: number, heightPx: number): void {
    if (widthPx <= 0 || heightPx <= 0) return;

    // Monitor diagonal in meters
    const diagMeters = (this.data.screenDiagonalInches ?? 24) * 0.0254;

    // Physical screen resolution in pixels
    // Use window.screen if available to determine physical pixel pitch
    const screenW = (typeof window !== 'undefined' && window.screen?.width > 0)
      ? window.screen.width
      : widthPx;
    const screenH = (typeof window !== 'undefined' && window.screen?.height > 0)
      ? window.screen.height
      : heightPx;

    const screenDiagPx = Math.hypot(screenW, screenH);
    const pixelPitch = diagMeters / (screenDiagPx > 0 ? screenDiagPx : Math.hypot(1920, 1080));

    // Viewport physical dimensions in meters
    const viewportWidthMeters = widthPx * pixelPitch;
    const viewportHeightMeters = heightPx * pixelPitch;

    // Avoid redundant notifications if dimensions haven't changed meaningfully (< 0.2 mm)
    const dw = Math.abs(this.screenGeometry.width - viewportWidthMeters);
    const dh = Math.abs(this.screenGeometry.height - viewportHeightMeters);
    if (dw < 0.0002 && dh < 0.0002) {
      return;
    }

    this.data.screenWidth = viewportWidthMeters;
    this.data.screenHeight = viewportHeightMeters;
    this.screenGeometry.width = viewportWidthMeters;
    this.screenGeometry.height = viewportHeightMeters;

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
    if (typeof window !== 'undefined' && window.innerWidth > 0 && window.innerHeight > 0) {
      this.updateViewport(window.innerWidth, window.innerHeight);
    } else {
      const geom = ScreenGeometry.fromDiagonal(inches, 16, 9);
      this.data.screenWidth = geom.width;
      this.data.screenHeight = geom.height;
      this.screenGeometry.width = geom.width;
      this.screenGeometry.height = geom.height;
      this.save();
      this.notify();
    }
  }

  public setScreenDimensions(widthMeters: number, heightMeters: number): void {
    this.data.screenWidth = Math.max(0.1, widthMeters);
    this.data.screenHeight = Math.max(0.1, heightMeters);
    this.screenGeometry.width = this.data.screenWidth;
    this.screenGeometry.height = this.data.screenHeight;
    this.data.screenDiagonalInches = Math.hypot(this.data.screenWidth, this.data.screenHeight) * 39.3701;
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

  public resetToDefaults(): void {
    this.data = JSON.parse(JSON.stringify(DEFAULT_CALIBRATION_DATA));
    if (typeof window !== 'undefined' && window.innerWidth > 0 && window.innerHeight > 0) {
      this.updateViewport(window.innerWidth, window.innerHeight);
    } else {
      this.screenGeometry.width = this.data.screenWidth;
      this.screenGeometry.height = this.data.screenHeight;
      this.save();
      this.notify();
    }
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

