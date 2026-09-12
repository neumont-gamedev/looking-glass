/**
 * Controls.ts
 *
 * Top bar navigation and settings drawer component.
 * Allows live switching between Webcam tracking, Mouse simulation, Auto demo,
 * Projection modes, Filter tuning, and Debug visualizations.
 */

import { CalibrationPanel } from './CalibrationPanel';
import { PerspectiveController, ProjectionMode } from '../rendering/PerspectiveController';
import { TrackingDebugView } from '../tracking/TrackingDebugView';
import { SceneType } from '../rendering/DemoScene';
import { CalibrationManager } from '../calibration/CalibrationManager';
import { CustomFishOptions } from '../rendering/aquarium/CustomModelLoader';
import { SettingsManager, InputMode, AppSettings } from '../settings/SettingsManager';

export { InputMode } from '../settings/SettingsManager';

export interface ControlsCallbacks {
  onInputModeChange: (mode: InputMode) => void;
  onSceneChange: (sceneType: SceneType) => void;
  onFeedFish?: () => void;
  onToggleCamera?: (enable: boolean) => Promise<boolean> | boolean;
  onLoadCustomFish?: (source: string, count: number, options: CustomFishOptions) => Promise<number>;
  onToggleDebugHud?: (visible: boolean) => void;
}

export class Controls {
  private topBar: HTMLElement;
  private settingsDrawer: HTMLElement;
  private isDrawerOpen: boolean = false;
  private isCameraActive: boolean = true;

  private currentInputMode: InputMode = InputMode.Webcam;
  private perspectiveController: PerspectiveController;
  private debugView: TrackingDebugView;
  private calibrationPanel: CalibrationPanel;
  private calibrationManager: CalibrationManager;
  private settingsManager: SettingsManager;
  private callbacks: ControlsCallbacks;

  constructor(
    perspectiveController: PerspectiveController,
    debugView: TrackingDebugView,
    calibrationPanel: CalibrationPanel,
    calibrationManager: CalibrationManager,
    settingsManager: SettingsManager,
    callbacks: ControlsCallbacks
  ) {
    this.perspectiveController = perspectiveController;
    this.debugView = debugView;
    this.calibrationPanel = calibrationPanel;
    this.calibrationManager = calibrationManager;
    this.settingsManager = settingsManager;
    this.callbacks = callbacks;

    const initialSettings = this.settingsManager.getSettings();
    this.currentInputMode = initialSettings.inputMode;
    this.isCameraActive = initialSettings.isCameraActive;
    this.isDebugHudVisible = initialSettings.debugHudVisible;

    this.topBar = document.createElement('header');
    this.topBar.className = 'hud-topbar';

    this.settingsDrawer = document.createElement('div');
    this.settingsDrawer.className = 'settings-drawer';
    this.settingsDrawer.style.display = 'none';

    this.buildTopBar();
    this.buildDrawer();

    document.body.appendChild(this.topBar);
    document.body.appendChild(this.settingsDrawer);
  }

  public setInputMode(mode: InputMode): void {
    this.currentInputMode = mode;
    this.settingsManager.updateSettings({ inputMode: mode });
    const select = this.settingsDrawer.querySelector('#input-mode-select') as HTMLSelectElement;
    if (select) select.value = mode;
    this.callbacks.onInputModeChange(mode);
  }

  public getInputMode(): InputMode {
    return this.currentInputMode;
  }

  private debugFpsValEl: HTMLElement | null = null;
  private debugTrackFpsValEl: HTMLElement | null = null;
  private debugLatencyValEl: HTMLElement | null = null;
  private debugPoseXEl: HTMLElement | null = null;
  private debugPoseYEl: HTMLElement | null = null;
  private debugPoseZEl: HTMLElement | null = null;
  private debugHudBoxEl: HTMLElement | null = null;
  private feedFishBtn: HTMLElement | null = null;
  private isDebugHudVisible: boolean = true;

  private buildTopBar(): void {
    this.topBar.innerHTML = `
      <div class="topbar-left">
        <div class="logo-group">
          <h1 class="app-title">LOOKING GLASS</h1>
        </div>
        <div class="debug-hud-box" id="debug-hud-box">
          <div class="debug-hud-row">
            <div class="debug-hud-item">
              <span class="debug-hud-label">FPS</span>
              <span class="debug-hud-val" id="debug-fps-val">60</span>
            </div>
            <div class="debug-hud-divider"></div>
            <div class="debug-hud-item">
              <span class="debug-hud-label">TRACK</span>
              <span class="debug-hud-val" id="debug-track-fps-val">--</span>
              <span class="debug-hud-unit">fps</span>
            </div>
            <div class="debug-hud-divider"></div>
            <div class="debug-hud-item">
              <span class="debug-hud-label">LATENCY</span>
              <span class="debug-hud-val" id="debug-latency-val">--</span>
              <span class="debug-hud-unit">ms</span>
            </div>
          </div>
          <div class="debug-hud-row debug-hud-subrow">
            <span class="debug-hud-label">HEAD</span>
            <span class="debug-hud-pose">
              X: <span id="debug-pose-x" class="pose-coord">+0.0</span>
              Y: <span id="debug-pose-y" class="pose-coord">+0.0</span>
              Z: <span id="debug-pose-z" class="pose-coord">65.0</span>
              <span class="debug-hud-unit">cm</span>
            </span>
          </div>
        </div>
      </div>
      <div class="topbar-actions">
        <button class="btn btn-hud" id="btn-feed-fish">Feed Fish 🦐</button>
        <button class="btn btn-hud" id="btn-calibrate">Calibrate</button>
        <button class="btn btn-hud" id="btn-toggle-settings">Settings ⚙</button>
        <button class="btn btn-hud" id="btn-fullscreen">⛶ Fullscreen</button>
      </div>
    `;

    this.debugFpsValEl = this.topBar.querySelector('#debug-fps-val');
    this.debugTrackFpsValEl = this.topBar.querySelector('#debug-track-fps-val');
    this.debugLatencyValEl = this.topBar.querySelector('#debug-latency-val');
    this.debugPoseXEl = this.topBar.querySelector('#debug-pose-x');
    this.debugPoseYEl = this.topBar.querySelector('#debug-pose-y');
    this.debugPoseZEl = this.topBar.querySelector('#debug-pose-z');
    this.debugHudBoxEl = this.topBar.querySelector('#debug-hud-box');
    this.feedFishBtn = this.topBar.querySelector('#btn-feed-fish');

    if (this.debugHudBoxEl) {
      this.debugHudBoxEl.style.display = this.isDebugHudVisible ? 'flex' : 'none';
    }

    this.topBar.querySelector('#btn-feed-fish')?.addEventListener('click', () => {
      if (this.callbacks.onFeedFish) this.callbacks.onFeedFish();
    });

    this.topBar.querySelector('#btn-calibrate')?.addEventListener('click', () => {
      this.calibrationPanel.open();
    });

    this.topBar.querySelector('#btn-toggle-settings')?.addEventListener('click', () => {
      this.toggleDrawer();
    });

    this.topBar.querySelector('#btn-fullscreen')?.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch((err) => console.warn(err));
      } else {
        document.exitFullscreen().catch((err) => console.warn(err));
      }
    });
  }

  public toggleDebugHud(): boolean {
    return this.setDebugHudVisible(!this.isDebugHudVisible);
  }

  public setDebugHudVisible(visible: boolean): boolean {
    this.isDebugHudVisible = visible;
    this.settingsManager.updateSettings({ debugHudVisible: visible });
    if (this.debugHudBoxEl) {
      this.debugHudBoxEl.style.display = this.isDebugHudVisible ? 'flex' : 'none';
    }
    const debugHudToggle = this.settingsDrawer?.querySelector('#toggle-debug-hud') as HTMLInputElement;
    if (debugHudToggle && debugHudToggle.checked !== this.isDebugHudVisible) {
      debugHudToggle.checked = this.isDebugHudVisible;
    }
    if (this.callbacks.onToggleDebugHud) {
      this.callbacks.onToggleDebugHud(this.isDebugHudVisible);
    }
    return this.isDebugHudVisible;
  }

  public getIsDebugHudVisible(): boolean {
    return this.isDebugHudVisible;
  }

  public isSettingsOpen(): boolean {
    return this.isDrawerOpen;
  }

  public openDrawer(): void {
    this.isDrawerOpen = true;
    this.settingsDrawer.style.display = 'block';
  }

  public closeDrawer(): void {
    this.isDrawerOpen = false;
    this.settingsDrawer.style.display = 'none';
  }

  public toggleDrawer(): void {
    if (this.isDrawerOpen) {
      this.closeDrawer();
    } else {
      this.openDrawer();
    }
  }

  public setScene(sceneType: SceneType): void {
    if (this.feedFishBtn) {
      this.feedFishBtn.style.display = sceneType === SceneType.Aquarium ? '' : 'none';
    }
    const sceneSelect = this.settingsDrawer.querySelector('#scene-select') as HTMLSelectElement;
    if (sceneSelect && sceneSelect.value !== sceneType) {
      sceneSelect.value = sceneType;
    }
  }

  public updateDebugHud(data: {
    fps: number;
    trackFps: number;
    latencyMs: number;
    poseX: number;
    poseY: number;
    poseZ: number;
    isTrackingActive: boolean;
  }): void {
    if (this.debugFpsValEl) {
      this.debugFpsValEl.textContent = data.fps.toString();
      if (data.fps >= 55) {
        this.debugFpsValEl.style.color = '#00ff88';
      } else if (data.fps >= 30) {
        this.debugFpsValEl.style.color = '#00e5ff';
      } else {
        this.debugFpsValEl.style.color = '#ff3366';
      }
    }

    if (this.debugTrackFpsValEl) {
      if (this.currentInputMode === InputMode.Webcam) {
        this.debugTrackFpsValEl.textContent = data.trackFps > 0 ? data.trackFps.toString() : '--';
        this.debugTrackFpsValEl.style.color = data.trackFps >= 25 ? '#00ff88' : data.trackFps >= 15 ? '#00e5ff' : '#94a3b8';
      } else {
        this.debugTrackFpsValEl.textContent = this.currentInputMode === InputMode.Mouse ? 'Mouse' : 'Auto';
        this.debugTrackFpsValEl.style.color = '#38bdf8';
      }
    }

    if (this.debugLatencyValEl) {
      if (this.currentInputMode === InputMode.Webcam && data.latencyMs > 0) {
        this.debugLatencyValEl.textContent = data.latencyMs.toFixed(1);
        this.debugLatencyValEl.style.color = data.latencyMs <= 20 ? '#00ff88' : data.latencyMs <= 35 ? '#00e5ff' : '#ffb703';
      } else {
        this.debugLatencyValEl.textContent = '--';
        this.debugLatencyValEl.style.color = '#64748b';
      }
    }

    if (this.debugPoseXEl && this.debugPoseYEl && this.debugPoseZEl) {
      const xCm = data.poseX * 100;
      const yCm = data.poseY * 100;
      const zCm = data.poseZ * 100;

      const xSign = xCm >= 0 ? '+' : '';
      const ySign = yCm >= 0 ? '+' : '';

      this.debugPoseXEl.textContent = `${xSign}${xCm.toFixed(1)}`;
      this.debugPoseYEl.textContent = `${ySign}${yCm.toFixed(1)}`;
      this.debugPoseZEl.textContent = `${zCm.toFixed(1)}`;
    }
  }


  private buildDrawer(): void {
    const settings = this.settingsManager.getSettings();

    const isWebcamSelected = settings.inputMode === InputMode.Webcam ? 'selected' : '';
    const isMouseSelected = settings.inputMode === InputMode.Mouse ? 'selected' : '';
    const isAutoSelected = settings.inputMode === InputMode.Auto ? 'selected' : '';

    const isCamOn = settings.isCameraActive;
    const camBtnText = isCamOn ? '🟢 Camera On (Click to Turn Off)' : '🔴 Camera Off (Click to Turn On)';
    const camBtnClass = isCamOn ? 'btn-camera-toggle btn-camera-on' : 'btn-camera-toggle btn-camera-off';
    const camBtnTitle = isCamOn ? 'Click to turn off camera' : 'Click to turn on camera';

    const isAccurateProj = settings.projectionMode === ProjectionMode.Accurate ? 'selected' : '';
    const isSimpleProj = settings.projectionMode === ProjectionMode.Simple ? 'selected' : '';

    const isNaturalDepth = settings.depthMode === 'natural' ? 'selected' : '';
    const isApertureDepth = settings.depthMode === 'aperture' ? 'selected' : '';

    const isAquarium = settings.sceneType === SceneType.Aquarium ? 'selected' : '';
    const isDiorama = settings.sceneType === SceneType.Diorama ? 'selected' : '';
    const isDebug = settings.sceneType === SceneType.Debug ? 'selected' : '';

    const isAxisPlusX = settings.customFishForwardAxis === '+X' ? 'selected' : '';
    const isAxisPlusZ = settings.customFishForwardAxis === '+Z' ? 'selected' : '';
    const isAxisMinusZ = settings.customFishForwardAxis === '-Z' ? 'selected' : '';
    const isAxisMinusX = settings.customFishForwardAxis === '-X' ? 'selected' : '';

    this.settingsDrawer.innerHTML = `
      <div class="drawer-header">
        <h3>Configuration & Settings</h3>
        <button class="close-btn" id="drawer-close-btn">&times;</button>
      </div>
      <div class="drawer-content">
        <!-- Input Mode -->
        <div class="setting-group">
          <label for="input-mode-select">Input Control Source:</label>
          <select id="input-mode-select">
            <option value="${InputMode.Webcam}" ${isWebcamSelected}>📷 Webcam Head Tracking</option>
            <option value="${InputMode.Mouse}" ${isMouseSelected}>🖱️ Mouse Simulation Mode</option>
            <option value="${InputMode.Auto}" ${isAutoSelected}>🔄 Auto Demo Orbit Mode</option>
          </select>
        </div>

        <!-- Camera Power Toggle -->
        <div class="setting-group">
          <label>Camera Tracking Power:</label>
          <button id="btn-toggle-camera" class="${camBtnClass}" title="${camBtnTitle}">
            ${camBtnText}
          </button>
          <small style="color: var(--text-secondary); font-size: 0.72rem; line-height: 1.3; display: block; margin-top: 5px;">
            Turning off releases your webcam device and powers down the camera LED.
          </small>
        </div>

        <!-- Projection Mode -->
        <div class="setting-group">
          <label for="proj-mode-select">Perspective Projection:</label>
          <select id="proj-mode-select">
            <option value="${ProjectionMode.Accurate}" ${isAccurateProj}>Off-Axis Asymmetric Window (Accurate)</option>
            <option value="${ProjectionMode.Simple}" ${isSimpleProj}>Simple Camera Translation (LookAt)</option>
          </select>
        </div>

        <!-- Head Depth Behavior -->
        <div class="setting-group">
          <label for="depth-mode-select">Head Depth (Forward / Back) Behavior:</label>
          <select id="depth-mode-select">
            <option value="natural" ${isNaturalDepth}>🔍 Natural Approach (Objects enlarge as you lean in)</option>
            <option value="aperture" ${isApertureDepth}>🪟 Fixed Aperture (Strict window aperture)</option>
          </select>
        </div>

        <!-- Scene Mode -->
        <div class="setting-group">
          <label for="scene-select">Virtual 3D Scene:</label>
          <select id="scene-select">
            <option value="${SceneType.Aquarium}" ${isAquarium}>🐠 Virtual Aquarium</option>
            <option value="${SceneType.Diorama}" ${isDiorama}>📦 Diorama Shadow Box</option>
            <option value="${SceneType.Debug}" ${isDebug}>📐 Debug Calibration Grids</option>
          </select>
        </div>

        <!-- Aquarium Interaction Guide -->
        <div class="setting-group interaction-guide">
          <h4>Aquarium Interactions</h4>
          <p style="font-size: 0.78rem; color: var(--text-secondary); line-height: 1.4;">
            • <strong>Left-Click / Tap:</strong> Tap on the glass window to startle the fish.<br/>
            • <strong>Right-Click or 'F' key:</strong> Drop sinking food pellets into the tank.
          </p>
        </div>

        <!-- Custom 3D Fish Models (.glb) -->
        <div class="setting-group">
          <h4>Custom 3D Fish Models (.glb)</h4>
          <p style="font-size: 0.74rem; color: var(--text-secondary); line-height: 1.35; margin-bottom: 8px;">
            Load custom fish models into the aquarium. Drop <code>.glb</code> files in <code>public/models/</code> or import directly below.
          </p>

          <div style="display: flex; gap: 8px; margin-bottom: 8px;">
            <label class="btn btn-primary" style="flex: 1; text-align: center; cursor: pointer; padding: 7px 10px; font-size: 0.78rem;">
              📁 Import .glb Fish File
              <input type="file" id="input-custom-fish-file" accept=".glb,.gltf" style="display: none;" />
            </label>
          </div>

          <div style="display: flex; gap: 6px; margin-bottom: 8px;">
            <input type="text" id="input-custom-fish-path" placeholder="e.g. models/my_fish.glb" style="flex: 1; padding: 6px 10px; font-size: 0.78rem; border-radius: 5px; background: rgba(15, 23, 42, 0.7); border: 1px solid var(--bg-surface-border); color: #fff;" />
            <button id="btn-load-custom-fish" class="btn" style="padding: 6px 12px; font-size: 0.78rem;">Spawn</button>
          </div>

          <div class="slider-row">
            <label>Model Size: <span id="val-custom-fish-scale">${settings.customFishScaleCm.toFixed(1)}</span> cm</label>
            <input type="range" id="slider-custom-fish-scale" min="2.0" max="15.0" step="0.5" value="${settings.customFishScaleCm}" />
          </div>

          <div class="slider-row">
            <label>Forward Axis:</label>
            <select id="select-custom-fish-axis" style="padding: 3px 8px; font-size: 0.75rem; width: auto; background: var(--bg-surface); color: var(--text-primary); border: 1px solid var(--bg-surface-border); border-radius: 4px;">
              <option value="+X" ${isAxisPlusX}>+X (Default)</option>
              <option value="+Z" ${isAxisPlusZ}>+Z (Blender standard)</option>
              <option value="-Z" ${isAxisMinusZ}>-Z</option>
              <option value="-X" ${isAxisMinusX}>-X</option>
            </select>
          </div>

          <div id="custom-fish-status" style="font-size: 0.74rem; color: #34d399; margin-top: 6px; display: none;"></div>
        </div>

        <!-- Predictive Positioning & Kinematic Smoothing -->
        <div class="setting-group">
          <h4>Motion Smoothing & Predictive Tracking</h4>
          <div class="slider-row">
            <label>Predictive Lookahead: <span id="val-lookahead">${settings.lookaheadMs}</span> ms</label>
            <input type="range" id="slider-lookahead" min="0" max="80" step="5" value="${settings.lookaheadMs}" />
          </div>
          <div class="slider-row">
            <label>Translation Smoothing: <span id="val-smooth-time">${settings.smoothTimeMs}</span> ms</label>
            <input type="range" id="slider-smooth-time" min="15" max="120" step="5" value="${settings.smoothTimeMs}" />
          </div>
          <label class="checkbox-row" style="margin-top: 8px;">
            <input type="checkbox" id="toggle-deadband" ${settings.deadbandEnabled ? 'checked' : ''} />
            <span>Stationary Anti-Jitter Lock (Freezes tremor when still)</span>
          </label>
          <small style="color: var(--text-secondary); font-size: 0.72rem; line-height: 1.3; display: block; margin-top: 6px;">
            Lookahead compensates for camera/model latency. Smoothing uses a critically damped harmonic oscillator to eliminate 30Hz inter-frame stutter.
          </small>
        </div>

        <!-- Smoothing Filter -->
        <div class="setting-group">
          <h4>One Euro Filter Tuning</h4>
          <div class="slider-row">
            <label>Min Cutoff (Hz): <span id="val-min-cutoff">${settings.minCutoff.toFixed(1)}</span></label>
            <input type="range" id="slider-min-cutoff" min="0.2" max="4.0" step="0.1" value="${settings.minCutoff}" />
          </div>
          <div class="slider-row">
            <label>Beta (Responsiveness): <span id="val-beta">${settings.beta.toFixed(1)}</span></label>
            <input type="range" id="slider-beta" min="0.2" max="8.0" step="0.1" value="${settings.beta}" />
          </div>
          <small style="color: var(--text-secondary); font-size: 0.72rem; line-height: 1.3; display: block; margin-top: 4px;">
            Higher Beta eliminates motion lag during head movement. Min Cutoff stabilizes stationary jitter.
          </small>
        </div>

        <!-- Tracking Direction -->
        <div class="setting-group">
          <h4>Tracking Direction</h4>
          <label class="checkbox-row">
            <input type="checkbox" id="toggle-invert-x" ${this.calibrationManager.getData().invertHorizontal ? 'checked' : ''} />
            <span>Invert Horizontal Tracking</span>
          </label>
        </div>

        <!-- Debug Visuals -->
        <div class="setting-group">
          <h4>Visual Overlays</h4>
          <label class="checkbox-row">
            <input type="checkbox" id="toggle-debug-hud" ${settings.debugHudVisible ? 'checked' : ''} />
            <span>Show Debug Telemetry HUD & Origin Axes (Hot-key: ~)</span>
          </label>
          <label class="checkbox-row">
            <input type="checkbox" id="toggle-webcam-pip" ${settings.webcamPipVisible ? 'checked' : ''} />
            <span>Show Webcam PIP & Face Landmarks</span>
          </label>
        </div>

        <!-- Reset Settings to Defaults -->
        <div class="setting-group" style="margin-top: 14px; border-top: 1px solid var(--bg-surface-border); padding-top: 12px;">
          <button id="btn-reset-settings" class="btn" style="width: 100%; border: 1px solid rgba(239, 68, 68, 0.4); color: #f87171; background: rgba(239, 68, 68, 0.08); cursor: pointer; padding: 7px 12px; font-size: 0.78rem; transition: background 0.2s;">
            ↺ Reset Settings to Defaults
          </button>
        </div>

        <!-- Privacy notice as specified in AGENTS.md -->
        <div class="privacy-notice">
          <small>🛡️ <strong>Privacy:</strong> Camera images are processed locally in your browser and are not uploaded or recorded.</small>
        </div>
      </div>
    `;

    this.settingsDrawer.querySelector('#drawer-close-btn')?.addEventListener('click', () => {
      this.closeDrawer();
    });

    // Input mode change
    const inputSelect = this.settingsDrawer.querySelector('#input-mode-select') as HTMLSelectElement;
    inputSelect?.addEventListener('change', (e) => {
      const mode = (e.target as HTMLSelectElement).value as InputMode;
      this.currentInputMode = mode;
      this.settingsManager.updateSettings({ inputMode: mode });
      this.callbacks.onInputModeChange(mode);
    });

    // Camera power toggle button
    const cameraToggleBtn = this.settingsDrawer.querySelector('#btn-toggle-camera') as HTMLButtonElement;
    cameraToggleBtn?.addEventListener('click', async () => {
      const targetState = !this.isCameraActive;
      if (this.callbacks.onToggleCamera) {
        cameraToggleBtn.disabled = true;
        try {
          const actualState = await this.callbacks.onToggleCamera(targetState);
          this.setCameraActiveState(actualState);
        } finally {
          cameraToggleBtn.disabled = false;
        }
      }
    });

    // Projection mode change
    const projSelect = this.settingsDrawer.querySelector('#proj-mode-select') as HTMLSelectElement;
    projSelect?.addEventListener('change', (e) => {
      const mode = (e.target as HTMLSelectElement).value as ProjectionMode;
      this.perspectiveController.setProjectionMode(mode);
      this.settingsManager.updateSettings({ projectionMode: mode });
    });

    // Head Depth Mode change (Natural Approach vs Fixed Aperture)
    const depthSelect = this.settingsDrawer.querySelector('#depth-mode-select') as HTMLSelectElement;
    depthSelect?.addEventListener('change', (e) => {
      const mode = (e.target as HTMLSelectElement).value as 'natural' | 'aperture';
      this.perspectiveController.setDepthMode(mode);
      this.settingsManager.updateSettings({ depthMode: mode });
    });

    // Scene select
    const sceneSelect = this.settingsDrawer.querySelector('#scene-select') as HTMLSelectElement;
    sceneSelect?.addEventListener('change', (e) => {
      const type = (e.target as HTMLSelectElement).value as SceneType;
      this.setScene(type);
      this.settingsManager.updateSettings({ sceneType: type });
      this.callbacks.onSceneChange(type);
    });

    // Custom Fish Model Scale Slider
    const fishScaleSlider = this.settingsDrawer.querySelector('#slider-custom-fish-scale') as HTMLInputElement;
    const fishScaleVal = this.settingsDrawer.querySelector('#val-custom-fish-scale');
    fishScaleSlider?.addEventListener('input', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      if (fishScaleVal) fishScaleVal.textContent = val.toFixed(1);
      this.settingsManager.updateSettings({ customFishScaleCm: val });
    });

    const axisSelect = this.settingsDrawer.querySelector('#select-custom-fish-axis') as HTMLSelectElement;
    axisSelect?.addEventListener('change', (e) => {
      const forwardAxis = (e.target as HTMLSelectElement).value as '+X' | '-X' | '+Z' | '-Z';
      this.settingsManager.updateSettings({ customFishForwardAxis: forwardAxis });
    });

    const getCustomFishOptions = (): CustomFishOptions => {
      const scaleCm = fishScaleSlider ? parseFloat(fishScaleSlider.value) : 4.5;
      const forwardAxis = (axisSelect?.value ?? '+X') as '+X' | '-X' | '+Z' | '-Z';
      return {
        targetLength: scaleCm / 100, // convert cm to meters
        forwardAxis
      };
    };

    const fishStatusEl = this.settingsDrawer.querySelector('#custom-fish-status') as HTMLElement;
    const showFishStatus = (msg: string, isError: boolean = false) => {
      if (!fishStatusEl) return;
      fishStatusEl.textContent = msg;
      fishStatusEl.style.color = isError ? '#f87171' : '#34d399';
      fishStatusEl.style.display = 'block';
      setTimeout(() => {
        if (fishStatusEl) fishStatusEl.style.display = 'none';
      }, 5000);
    };

    // 1. File Input Picker (Instant in-browser loading)
    const fileInput = this.settingsDrawer.querySelector('#input-custom-fish-file') as HTMLInputElement;
    fileInput?.addEventListener('change', async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;
      const file = files[0];
      const blobUrl = URL.createObjectURL(file);
      const options = getCustomFishOptions();
      options.name = file.name;

      if (this.callbacks.onLoadCustomFish) {
        showFishStatus(`Loading "${file.name}"...`);
        try {
          const count = await this.callbacks.onLoadCustomFish(blobUrl, 5, options);
          showFishStatus(`✓ Spawned ${count} custom fish from "${file.name}"!`);
        } catch (err: any) {
          showFishStatus(`Error loading model: ${err?.message || err}`, true);
        }
      }
    });

    // 2. Path Input (Loading from public/models/)
    const pathInput = this.settingsDrawer.querySelector('#input-custom-fish-path') as HTMLInputElement;
    const loadPathBtn = this.settingsDrawer.querySelector('#btn-load-custom-fish') as HTMLButtonElement;
    loadPathBtn?.addEventListener('click', async () => {
      let path = pathInput?.value.trim() ?? '';
      if (!path) {
        showFishStatus('Please enter a model path (e.g. models/my_fish.glb)', true);
        return;
      }
      if (!path.startsWith('/') && !path.startsWith('http')) {
        path = '/' + path;
      }
      const options = getCustomFishOptions();

      if (this.callbacks.onLoadCustomFish) {
        showFishStatus(`Loading "${path}"...`);
        try {
          const count = await this.callbacks.onLoadCustomFish(path, 5, options);
          showFishStatus(`✓ Spawned ${count} custom fish from "${path}"!`);
        } catch (err: any) {
          showFishStatus(`Could not find or load "${path}". Check public/models/`, true);
        }
      }
    });

    // Predictive Lookahead slider
    const lookaheadSlider = this.settingsDrawer.querySelector('#slider-lookahead') as HTMLInputElement;
    const lookaheadVal = this.settingsDrawer.querySelector('#val-lookahead');
    lookaheadSlider?.addEventListener('input', (e) => {
      const val = parseInt((e.target as HTMLInputElement).value, 10);
      if (lookaheadVal) lookaheadVal.textContent = String(val);
      this.perspectiveController.setLookaheadMs(val);
      this.settingsManager.updateSettings({ lookaheadMs: val });
    });

    // Translation Smoothing Time (SmoothDamp) slider
    const smoothTimeSlider = this.settingsDrawer.querySelector('#slider-smooth-time') as HTMLInputElement;
    const smoothTimeVal = this.settingsDrawer.querySelector('#val-smooth-time');
    smoothTimeSlider?.addEventListener('input', (e) => {
      const val = parseInt((e.target as HTMLInputElement).value, 10);
      if (smoothTimeVal) smoothTimeVal.textContent = String(val);
      this.perspectiveController.setSmoothTimeMs(val);
      this.settingsManager.updateSettings({ smoothTimeMs: val });
    });

    // Stationary Anti-Jitter Deadband toggle
    const deadbandToggle = this.settingsDrawer.querySelector('#toggle-deadband') as HTMLInputElement;
    deadbandToggle?.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      this.perspectiveController.setDeadbandEnabled(checked);
      this.settingsManager.updateSettings({ deadbandEnabled: checked });
    });

    // Filter tuning sliders
    const minCutoffSlider = this.settingsDrawer.querySelector('#slider-min-cutoff') as HTMLInputElement;
    const minCutoffVal = this.settingsDrawer.querySelector('#val-min-cutoff');
    minCutoffSlider?.addEventListener('input', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      if (minCutoffVal) minCutoffVal.textContent = val.toFixed(1);
      this.perspectiveController.filter.updateConfig({ minCutoff: val });
      this.settingsManager.updateSettings({ minCutoff: val });
    });

    const betaSlider = this.settingsDrawer.querySelector('#slider-beta') as HTMLInputElement;
    const betaVal = this.settingsDrawer.querySelector('#val-beta');
    betaSlider?.addEventListener('input', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      if (betaVal) betaVal.textContent = val.toFixed(1);
      this.perspectiveController.filter.updateConfig({ beta: val });
      this.settingsManager.updateSettings({ beta: val });
    });

    // Invert horizontal toggle
    const invertXToggle = this.settingsDrawer.querySelector('#toggle-invert-x') as HTMLInputElement;
    invertXToggle?.addEventListener('change', (e) => {
      this.calibrationManager.setInvertHorizontal((e.target as HTMLInputElement).checked);
    });

    this.calibrationManager.subscribe((calib) => {
      if (invertXToggle) {
        invertXToggle.checked = !!calib.invertHorizontal;
      }
    });

    // Debug HUD & Origin Axes toggle
    const debugHudToggle = this.settingsDrawer.querySelector('#toggle-debug-hud') as HTMLInputElement;
    debugHudToggle?.addEventListener('change', (e) => {
      this.setDebugHudVisible((e.target as HTMLInputElement).checked);
    });

    // Webcam PIP toggle
    const pipToggle = this.settingsDrawer.querySelector('#toggle-webcam-pip') as HTMLInputElement;
    pipToggle?.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      this.debugView.setVisible(checked);
      this.settingsManager.updateSettings({ webcamPipVisible: checked });
    });

    // Reset Settings to Defaults button
    const resetSettingsBtn = this.settingsDrawer.querySelector('#btn-reset-settings') as HTMLButtonElement;
    resetSettingsBtn?.addEventListener('click', () => {
      const defaults = this.settingsManager.resetToDefaults();
      this.syncUiFromSettings(defaults);
      this.perspectiveController.setProjectionMode(defaults.projectionMode);
      this.perspectiveController.setDepthMode(defaults.depthMode);
      this.perspectiveController.setLookaheadMs(defaults.lookaheadMs);
      this.perspectiveController.setSmoothTimeMs(defaults.smoothTimeMs);
      this.perspectiveController.setDeadbandEnabled(defaults.deadbandEnabled);
      this.perspectiveController.filter.updateConfig({ minCutoff: defaults.minCutoff, beta: defaults.beta });
      this.callbacks.onSceneChange(defaults.sceneType);
      this.callbacks.onInputModeChange(defaults.inputMode);
    });

    // Initialize scene-dependent UI elements from persisted settings
    this.setScene(settings.sceneType);
  }

  public syncUiFromSettings(settings: AppSettings): void {
    const inputSelect = this.settingsDrawer.querySelector('#input-mode-select') as HTMLSelectElement;
    if (inputSelect) inputSelect.value = settings.inputMode;
    this.currentInputMode = settings.inputMode;

    this.setCameraActiveState(settings.isCameraActive);

    const projSelect = this.settingsDrawer.querySelector('#proj-mode-select') as HTMLSelectElement;
    if (projSelect) projSelect.value = settings.projectionMode;

    const depthSelect = this.settingsDrawer.querySelector('#depth-mode-select') as HTMLSelectElement;
    if (depthSelect) depthSelect.value = settings.depthMode;

    const sceneSelect = this.settingsDrawer.querySelector('#scene-select') as HTMLSelectElement;
    if (sceneSelect) sceneSelect.value = settings.sceneType;
    this.setScene(settings.sceneType);

    const fishScaleSlider = this.settingsDrawer.querySelector('#slider-custom-fish-scale') as HTMLInputElement;
    const fishScaleVal = this.settingsDrawer.querySelector('#val-custom-fish-scale');
    if (fishScaleSlider) fishScaleSlider.value = String(settings.customFishScaleCm);
    if (fishScaleVal) fishScaleVal.textContent = settings.customFishScaleCm.toFixed(1);

    const axisSelect = this.settingsDrawer.querySelector('#select-custom-fish-axis') as HTMLSelectElement;
    if (axisSelect) axisSelect.value = settings.customFishForwardAxis;

    const lookaheadSlider = this.settingsDrawer.querySelector('#slider-lookahead') as HTMLInputElement;
    const lookaheadVal = this.settingsDrawer.querySelector('#val-lookahead');
    if (lookaheadSlider) lookaheadSlider.value = String(settings.lookaheadMs);
    if (lookaheadVal) lookaheadVal.textContent = String(settings.lookaheadMs);

    const smoothTimeSlider = this.settingsDrawer.querySelector('#slider-smooth-time') as HTMLInputElement;
    const smoothTimeVal = this.settingsDrawer.querySelector('#val-smooth-time');
    if (smoothTimeSlider) smoothTimeSlider.value = String(settings.smoothTimeMs);
    if (smoothTimeVal) smoothTimeVal.textContent = String(settings.smoothTimeMs);

    const deadbandToggle = this.settingsDrawer.querySelector('#toggle-deadband') as HTMLInputElement;
    if (deadbandToggle) deadbandToggle.checked = settings.deadbandEnabled;

    const minCutoffSlider = this.settingsDrawer.querySelector('#slider-min-cutoff') as HTMLInputElement;
    const minCutoffVal = this.settingsDrawer.querySelector('#val-min-cutoff');
    if (minCutoffSlider) minCutoffSlider.value = String(settings.minCutoff);
    if (minCutoffVal) minCutoffVal.textContent = settings.minCutoff.toFixed(1);

    const betaSlider = this.settingsDrawer.querySelector('#slider-beta') as HTMLInputElement;
    const betaVal = this.settingsDrawer.querySelector('#val-beta');
    if (betaSlider) betaSlider.value = String(settings.beta);
    if (betaVal) betaVal.textContent = settings.beta.toFixed(1);

    this.setDebugHudVisible(settings.debugHudVisible);
    this.debugView.setVisible(settings.webcamPipVisible);
    const pipToggle = this.settingsDrawer.querySelector('#toggle-webcam-pip') as HTMLInputElement;
    if (pipToggle) pipToggle.checked = settings.webcamPipVisible;
  }

  public setCameraActiveState(active: boolean): void {
    this.isCameraActive = active;
    this.settingsManager.updateSettings({ isCameraActive: active });
    const btn = this.settingsDrawer?.querySelector('#btn-toggle-camera') as HTMLButtonElement;
    if (!btn) return;

    if (active) {
      btn.textContent = '🟢 Camera On (Click to Turn Off)';
      btn.className = 'btn-camera-toggle btn-camera-on';
      btn.title = 'Click to turn off camera';
    } else {
      btn.textContent = '🔴 Camera Off (Click to Turn On)';
      btn.className = 'btn-camera-toggle btn-camera-off';
      btn.title = 'Click to turn on camera';
    }
  }

  public getCameraActiveState(): boolean {
    return this.isCameraActive;
  }
}
