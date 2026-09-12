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
  /** Custom fish model scale in centimeters */
  customFishScaleCm: number;
  /** Custom fish forward axis orientation */
  customFishForwardAxis: ForwardAxis;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  sceneType: SceneType.Aquarium,
  inputMode: InputMode.Webcam,
  isCameraActive: true,
  projectionMode: ProjectionMode.Accurate,
  depthMode: 'natural',
  lookaheadMs: 35,
  smoothTimeMs: 55,
  deadbandEnabled: true,
  minCutoff: 1.0,
  beta: 2.2,
  debugHudVisible: true,
  webcamPipVisible: false,
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
    if (s.depthMode !== 'natural' && s.depthMode !== 'aperture') {
      s.depthMode = DEFAULT_APP_SETTINGS.depthMode;
    }
    if (!['+X', '-X', '+Z', '-Z'].includes(s.customFishForwardAxis)) {
      s.customFishForwardAxis = DEFAULT_APP_SETTINGS.customFishForwardAxis;
    }

    // Clamp numeric values to valid UI slider ranges
    s.lookaheadMs = Math.max(0, Math.min(80, isNaN(s.lookaheadMs) ? DEFAULT_APP_SETTINGS.lookaheadMs : s.lookaheadMs));
    s.smoothTimeMs = Math.max(15, Math.min(120, isNaN(s.smoothTimeMs) ? DEFAULT_APP_SETTINGS.smoothTimeMs : s.smoothTimeMs));
    s.minCutoff = Math.max(0.2, Math.min(4.0, isNaN(s.minCutoff) ? DEFAULT_APP_SETTINGS.minCutoff : s.minCutoff));
    s.beta = Math.max(0.2, Math.min(8.0, isNaN(s.beta) ? DEFAULT_APP_SETTINGS.beta : s.beta));
    s.customFishScaleCm = Math.max(2.0, Math.min(15.0, isNaN(s.customFishScaleCm) ? DEFAULT_APP_SETTINGS.customFishScaleCm : s.customFishScaleCm));

    // Ensure boolean fields are boolean
    s.deadbandEnabled = typeof s.deadbandEnabled === 'boolean' ? s.deadbandEnabled : DEFAULT_APP_SETTINGS.deadbandEnabled;
    s.debugHudVisible = typeof s.debugHudVisible === 'boolean' ? s.debugHudVisible : DEFAULT_APP_SETTINGS.debugHudVisible;
    s.webcamPipVisible = typeof s.webcamPipVisible === 'boolean' ? s.webcamPipVisible : DEFAULT_APP_SETTINGS.webcamPipVisible;
    s.isCameraActive = typeof s.isCameraActive === 'boolean' ? s.isCameraActive : DEFAULT_APP_SETTINGS.isCameraActive;

    return s;
  }
}

