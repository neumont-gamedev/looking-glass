/**
 * SettingsManager.ts
 *
 * Manages loading, saving, validating, and updating application runtime settings
 * persisted in browser localStorage.
 */

import { Storage } from '../utils/Storage';
import { SceneType } from '../rendering/DemoScene';
import { ProjectionMode } from '../rendering/PerspectiveController';

export enum InputMode {
  Webcam = 'Webcam',
  Mouse = 'Mouse',
  Auto = 'Auto'
}

export type HeadDepthMode = 'natural' | 'aperture';
export type ForwardAxis = '+X' | '-X' | '+Z' | '-Z';

export interface AppSettings {
  /** Active 3D virtual scene */
  sceneType: SceneType;
  /** Input tracking source */
  inputMode: InputMode;
  /** Camera power toggle state */
  isCameraActive: boolean;
  /** Perspective projection method */
  projectionMode: ProjectionMode;
  /** Forward/backward head movement perspective behavior */
  depthMode: HeadDepthMode;
  /** Predictive lookahead in milliseconds */
  lookaheadMs: number;
  /** Harmonic oscillator translation smoothing time in milliseconds */
  smoothTimeMs: number;
  /** Stationary anti-jitter deadband lock */
  deadbandEnabled: boolean;
  /** One Euro filter minimum cutoff frequency in Hz */
  minCutoff: number;
  /** One Euro filter beta responsiveness coefficient */
  beta: number;
  /** Telemetry HUD & coordinate origin axes visibility */
  debugHudVisible: boolean;
  /** Picture-in-Picture webcam & landmarks overlay visibility */
  webcamPipVisible: boolean;
  /** Consolidated tracking smoothness percentage (0 = Snappy, 50 = Balanced, 100 = Ultra-Smooth) */
  trackingSmoothnessPercent: number;
  /** Custom fish model scale in centimeters */
  customFishScaleCm: number;
  /** Custom fish forward axis orientation */
  customFishForwardAxis: ForwardAxis;
}

export function computeSmoothingParameters(percent: number) {
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  const u = p <= 50 ? p / 50 : (p - 50) / 50;

  // smoothTime: 20ms at 0%, 55ms at 50%, 95ms at 100%
  const smoothTimeMs = Math.round(p <= 50 ? 20 + u * 35 : 55 + u * 40);

  // minCutoff: 1.8 Hz at 0%, 1.0 Hz at 50%, 0.4 Hz at 100%
  const minCutoff = parseFloat((p <= 50 ? 1.8 - u * 0.8 : 1.0 - u * 0.6).toFixed(2));

  // beta: 3.5 at 0%, 2.2 at 50%, 1.0 at 100%
  const beta = parseFloat((p <= 50 ? 3.5 - u * 1.3 : 2.2 - u * 1.2).toFixed(2));

  // lookahead: 35ms standard
  const lookaheadMs = 35;
  const deadbandEnabled = true;

  return {
    trackingSmoothnessPercent: p,
    smoothTimeMs,
    minCutoff,
    beta,
    lookaheadMs,
    deadbandEnabled
  };
}

export function getSmoothnessLabel(percent: number): string {
  if (percent <= 25) return `Snappy (${percent}%)`;
  if (percent <= 70) return `Balanced (${percent}%)`;
  return `Ultra-Smooth (${percent}%)`;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  sceneType: SceneType.Aquarium,
  inputMode: InputMode.Webcam,
  isCameraActive: true,
  projectionMode: ProjectionMode.Accurate,
  depthMode: 'aperture',
  lookaheadMs: 35,
  smoothTimeMs: 55,
  deadbandEnabled: true,
  minCutoff: 1.0,
  beta: 2.2,
  debugHudVisible: true,
  webcamPipVisible: false,
  trackingSmoothnessPercent: 50,
  customFishScaleCm: 4.5,
  customFishForwardAxis: '+X'
};

const STORAGE_KEY = 'looking_glass_settings_v1';

export class SettingsManager {
  private settings: AppSettings;
  private subscribers: Array<(settings: AppSettings) => void> = [];

  constructor() {
    this.settings = this.load();
  }

  public getSettings(): AppSettings {
    return { ...this.settings };
  }

  public updateSettings(partial: Partial<AppSettings>): void {
    this.settings = this.validate({ ...this.settings, ...partial });
    this.save();
    this.notify();
  }

  public resetToDefaults(): AppSettings {
    this.settings = { ...DEFAULT_APP_SETTINGS };
    this.save();
    this.notify();
    return this.getSettings();
  }

  public subscribe(cb: (settings: AppSettings) => void): () => void {
    this.subscribers.push(cb);
    return () => {
      this.subscribers = this.subscribers.filter((s) => s !== cb);
    };
  }

  private load(): AppSettings {
    const raw = Storage.get<Partial<AppSettings>>(STORAGE_KEY, DEFAULT_APP_SETTINGS);
    return this.validate(raw);
  }

  private save(): void {
    Storage.set(STORAGE_KEY, this.settings);
  }

  private notify(): void {
    for (const cb of this.subscribers) {
      cb(this.getSettings());
    }
  }

  private validate(settings: Partial<AppSettings>): AppSettings {
    const s = { ...DEFAULT_APP_SETTINGS, ...settings };

    // Validate enums
    if (!Object.values(SceneType).includes(s.sceneType)) {
      s.sceneType = DEFAULT_APP_SETTINGS.sceneType;
    }
    if (!Object.values(InputMode).includes(s.inputMode)) {
      s.inputMode = DEFAULT_APP_SETTINGS.inputMode;
    }
    if (!Object.values(ProjectionMode).includes(s.projectionMode)) {
      s.projectionMode = DEFAULT_APP_SETTINGS.projectionMode;
    }
    // Always use fixed aperture
    s.depthMode = 'aperture';
    if (!['+X', '-X', '+Z', '-Z'].includes(s.customFishForwardAxis)) {
      s.customFishForwardAxis = DEFAULT_APP_SETTINGS.customFishForwardAxis;
    }

    // Clamp numeric values to valid UI slider ranges
    s.lookaheadMs = Math.max(0, Math.min(80, isNaN(s.lookaheadMs) ? DEFAULT_APP_SETTINGS.lookaheadMs : s.lookaheadMs));
    s.smoothTimeMs = Math.max(15, Math.min(120, isNaN(s.smoothTimeMs) ? DEFAULT_APP_SETTINGS.smoothTimeMs : s.smoothTimeMs));
    s.minCutoff = Math.max(0.2, Math.min(4.0, isNaN(s.minCutoff) ? DEFAULT_APP_SETTINGS.minCutoff : s.minCutoff));
    s.beta = Math.max(0.2, Math.min(8.0, isNaN(s.beta) ? DEFAULT_APP_SETTINGS.beta : s.beta));
    s.trackingSmoothnessPercent = Math.max(0, Math.min(100, isNaN(s.trackingSmoothnessPercent) ? DEFAULT_APP_SETTINGS.trackingSmoothnessPercent : s.trackingSmoothnessPercent));
    s.customFishScaleCm = Math.max(2.0, Math.min(15.0, isNaN(s.customFishScaleCm) ? DEFAULT_APP_SETTINGS.customFishScaleCm : s.customFishScaleCm));

    // Ensure boolean fields are boolean
    s.deadbandEnabled = typeof s.deadbandEnabled === 'boolean' ? s.deadbandEnabled : DEFAULT_APP_SETTINGS.deadbandEnabled;
    s.debugHudVisible = typeof s.debugHudVisible === 'boolean' ? s.debugHudVisible : DEFAULT_APP_SETTINGS.debugHudVisible;
    s.webcamPipVisible = typeof s.webcamPipVisible === 'boolean' ? s.webcamPipVisible : DEFAULT_APP_SETTINGS.webcamPipVisible;
    s.isCameraActive = typeof s.isCameraActive === 'boolean' ? s.isCameraActive : DEFAULT_APP_SETTINGS.isCameraActive;

    return s;
  }
}

