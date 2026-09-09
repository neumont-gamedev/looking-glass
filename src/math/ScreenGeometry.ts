/**
 * ScreenGeometry.ts
 *
 * Represents the physical dimensions of the monitor/display in real-world metric units (meters).
 * Used for accurate off-axis frustum calculations where the screen acts as a physical window.
 */

export interface ScreenDimensions {
  /** Physical screen width in meters */
  width: number;
  /** Physical screen height in meters */
  height: number;
}

export class ScreenGeometry {
  private _width: number;
  private _height: number;

  /**
   * @param width Physical width in meters (default ~0.53m for standard 24" 16:9 screen)
   * @param height Physical height in meters (default ~0.30m for standard 24" 16:9 screen)
   */
  constructor(width: number = 0.531, height: number = 0.299) {
    this._width = Math.max(0.1, width);
    this._height = Math.max(0.1, height);
  }

  get width(): number {
    return this._width;
  }

  set width(value: number) {
    this._width = Math.max(0.1, value);
  }

  get height(): number {
    return this._height;
  }

  set height(value: number) {
    this._height = Math.max(0.1, value);
  }

  get aspectRatio(): number {
    return this._width / this._height;
  }

  /**
   * Calculates width and height in meters given diagonal in inches and aspect ratio.
   * @param diagonalInches Screen diagonal size in inches (e.g. 24, 27, 32)
   * @param aspectWidth Aspect width ratio (e.g. 16)
   * @param aspectHeight Aspect height ratio (e.g. 9)
   */
  public static fromDiagonal(diagonalInches: number, aspectWidth: number = 16, aspectHeight: number = 9): ScreenGeometry {
    const diagonalMeters = diagonalInches * 0.0254;
    const angle = Math.atan2(aspectHeight, aspectWidth);
    const width = diagonalMeters * Math.cos(angle);
    const height = diagonalMeters * Math.sin(angle);
    return new ScreenGeometry(width, height);
  }

  /**
   * Calculates width and height in meters given dimensions in centimeters.
   */
  public static fromCentimeters(widthCm: number, heightCm: number): ScreenGeometry {
    return new ScreenGeometry(widthCm / 100, heightCm / 100);
  }

  public toJSON(): ScreenDimensions {
    return {
      width: this._width,
      height: this._height
    };
  }

  public fromJSON(data: Partial<ScreenDimensions>): void {
    if (typeof data.width === 'number' && data.width > 0) {
      this._width = data.width;
    }
    if (typeof data.height === 'number' && data.height > 0) {
      this._height = data.height;
    }
  }
}

