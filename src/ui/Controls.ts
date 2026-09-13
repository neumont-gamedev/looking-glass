/**
 * Controls.ts
 *
 * Top bar navigation and unified settings & calibration drawer component.
 * Allows live switching between Webcam tracking, Mouse simulation, Auto demo,
 * Projection modes, Filter tuning, Monitor presets & dimension sliders,
 * Neutral center calibration, and Viewing distance calibration.
 */

import { CalibrationPanel } from './CalibrationPanel';
import { PerspectiveController, ProjectionMode } from '../rendering/PerspectiveController';
import { TrackingDebugView } from '../tracking/TrackingDebugView';
import { SceneType } from '../rendering/DemoScene';
import { CalibrationManager } from '../calibration/CalibrationManager';
import { DistanceCalibrationMode } from '../calibration/CalibrationData';
import { ViewerPose } from '../tracking/TrackingState';
import { BiometricDistanceResult } from '../tracking/HeadPoseEstimator';
import { SettingsManager, InputMode, AppSettings, computeSmoothingParameters, getSmoothnessLabel } from '../settings/SettingsManager';

export { InputMode } from '../settings/SettingsManager';

export interface ControlsCallbacks {
  onInputModeChange: (mode: InputMode) => void;
  onSceneChange: (sceneType: SceneType) => void;
  onFeedFish?: () => void;
  onToggleDebugHud?: (visible: boolean) => void;
  getCurrentRawPose?: () => ViewerPose | null;
  getBiometricDistance?: () => BiometricDistanceResult | null;
  onModelChange?: (modelUrl: string) => void;
  onTextureChange?: (textureUrl: string) => void;
  onAmbientLightColorChange?: (colorHex: string) => void;
  onDirLightColorChange?: (colorHex: string) => void;
  onDirLightRotationChange?: (rotXDeg: number, rotZDeg: number) => void;
}

export class Controls {
  private topBar: HTMLElement;
  private settingsDrawer: HTMLElement;
  private scenePopover: HTMLElement;
  private isDrawerOpen: boolean = false;
  private isSceneOpen: boolean = false;
  private currentSceneType: SceneType = SceneType.Aquarium;

  private currentInputMode: InputMode = InputMode.Webcam;
  private perspectiveController: PerspectiveController;
  private debugView: TrackingDebugView;
  private calibrationPanel: CalibrationPanel;
  public readonly calibrationManager: CalibrationManager;
  private settingsManager: SettingsManager;
  private callbacks: ControlsCallbacks;

  private activeDistanceTab: DistanceCalibrationMode = 'wireframe';
  private biometricTimer: number | null = null;
  private latestBiometricResult: BiometricDistanceResult | null = null;

  private debugFpsValEl: HTMLElement | null = null;
  private debugTrackFpsValEl: HTMLElement | null = null;
  private debugLatencyValEl: HTMLElement | null = null;
  private debugPoseXEl: HTMLElement | null = null;
  private debugPoseYEl: HTMLElement | null = null;
  private debugPoseZEl: HTMLElement | null = null;
  private debugHudBoxEl: HTMLElement | null = null;
  private feedFishBtn: HTMLElement | null = null;
  private isDebugHudVisible: boolean = true;

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
    this.isDebugHudVisible = initialSettings.debugHudVisible;
    this.currentSceneType = initialSettings.sceneType;
    this.activeDistanceTab = this.calibrationManager.getData().distanceMode ?? 'wireframe';

    this.topBar = document.createElement('header');
    this.topBar.className = 'hud-topbar';

    this.settingsDrawer = document.createElement('div');
    this.settingsDrawer.className = 'settings-drawer';
    this.settingsDrawer.style.display = 'none';

    this.scenePopover = document.createElement('div');
    this.scenePopover.className = 'scene-popover';
    this.scenePopover.style.display = 'none';

    this.buildTopBar();
    this.buildScenePopover();
    this.buildSettingsDrawer();

    document.body.appendChild(this.topBar);
    document.body.appendChild(this.scenePopover);
    document.body.appendChild(this.settingsDrawer);

    this.setupEventListeners();

    // Link calibrationPanel open/toggle to the drawer
    this.calibrationPanel.setOnOpenCallback(() => {
      this.openDrawer();
    });
  }

  private buildTopBar(): void {
    this.topBar.innerHTML = `
      <div class="topbar-left">
        <div class="topbar-brand">
          <span class="brand-logo">🪞</span>
          <div class="brand-text">
            <span class="brand-title">Looking Glass</span>
            <span class="brand-subtitle">Head-Coupled 3D Window</span>
          </div>
        </div>
        <div class="debug-hud-compact" id="debug-hud-box">
          <div class="debug-hud-row">
            <div class="debug-hud-item">
              <span class="debug-hud-label">RENDER</span>
              <span class="debug-hud-val" id="debug-fps-val">--</span>
              <span class="debug-hud-unit">fps</span>
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
        <button class="btn btn-hud btn-icon" id="btn-feed-fish" title="Feed Fish (F)">🦐</button>
        <button class="btn btn-hud btn-icon" id="btn-fullscreen" title="Toggle Fullscreen">⛶</button>
        <button class="btn btn-hud btn-icon" id="btn-scene-menu" title="Scenes (Aquarium, Model Viewer, Calibration)">🎬</button>
        <button class="btn btn-hud btn-icon" id="btn-toggle-settings" title="Settings & Calibration (S)">⚙</button>
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

    this.topBar.querySelector('#btn-fullscreen')?.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch((err) => console.warn(err));
      } else {
        document.exitFullscreen().catch((err) => console.warn(err));
      }
    });

    this.topBar.querySelector('#btn-scene-menu')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleScenePopover();
    });

    this.topBar.querySelector('#btn-toggle-settings')?.addEventListener('click', () => {
      if (this.calibrationPanel.getIsOpen()) {
        this.calibrationPanel.close();
      }
      if (this.isSceneOpen) {
        this.closeScenePopover();
      }
      this.toggleDrawer();
    });

    // Close scene popover on click outside
    document.addEventListener('pointerdown', (e) => {
      if (this.isSceneOpen) {
        const target = e.target as HTMLElement;
        const btn = this.topBar.querySelector('#btn-scene-menu');
        if (!this.scenePopover.contains(target) && !btn?.contains(target)) {
          this.closeScenePopover();
        }
      }
    });
  }

  private buildScenePopover(): void {
    const currentScene = this.currentSceneType;

    const isAquarium = currentScene === SceneType.Aquarium ? 'selected' : '';
    const isDiorama = currentScene === SceneType.Diorama ? 'selected' : '';
    const isDebug = currentScene === SceneType.Debug ? 'selected' : '';

    this.scenePopover.innerHTML = `
      <div class="drawer-header">
        <h3>🎬 Scenes</h3>
        <button class="close-btn" id="scene-popover-close-btn">&times;</button>
      </div>
      <div class="drawer-content">
        <div class="setting-group">
          <label for="scene-dropdown-select">Select Scene:</label>
          <select id="scene-dropdown-select">
            <option value="${SceneType.Aquarium}" ${isAquarium}>🐠 Aquarium</option>
            <option value="${SceneType.Diorama}" ${isDiorama}>📦 Model Viewer</option>
            <option value="${SceneType.Debug}" ${isDebug}>📐 Calibration</option>
          </select>
        </div>

        <div id="scene-model-viewer-options" style="display: ${currentScene === SceneType.Diorama ? 'block' : 'none'};">
          <div class="settings-subsection-title">📦 Model & Texture</div>

          <div class="setting-group">
            <label for="scene-select-model">Select 3D Model:</label>
            <select id="scene-select-model">
              <option value="models/fish01.glb">🐠 Fish 1</option>
              <option value="models/fish02.glb">🐡 Fish 2</option>
              <option value="models/log.glb">🪵 Log</option>
              <option value="models/plant01.glb">🌿 Plant</option>
            </select>
          </div>

          <div class="setting-group">
            <label for="scene-select-texture">Wall Texture (10cm Grid):</label>
            <select id="scene-select-texture">
              <option value="textures/orange_grid.png">🟧 Orange Grid</option>
              <option value="textures/cyan_grid.png">🟦 Cyan Grid</option>
              <option value="textures/dark_grid.png">⬛ Dark Grid</option>
              <option value="textures/checkerboard.png">🏁 Checkerboard</option>
            </select>
          </div>

          <div class="settings-subsection-title">💡 Model Viewer Lighting</div>

          <div class="setting-group setting-color-group">
            <label for="input-ambient-color">Ambient Light Color</label>
            <div class="color-picker-wrapper">
              <input type="color" id="input-ambient-color" value="#333333">
              <span id="ambient-color-val" class="color-hex-val">#333333</span>
            </div>
          </div>

          <div class="setting-group setting-color-group">
            <label for="input-dir-color">Directional Light Color</label>
            <div class="color-picker-wrapper">
              <input type="color" id="input-dir-color" value="#ffffff">
              <span id="dir-color-val" class="color-hex-val">#ffffff</span>
            </div>
          </div>

          <div class="setting-group">
            <div class="setting-header">
              <label for="slider-light-rot-x">Directional Tilt X:</label>
              <span id="val-light-rot-x" class="slider-value">0°</span>
            </div>
            <input type="range" id="slider-light-rot-x" min="-75" max="75" step="1" value="0">
          </div>

          <div class="setting-group">
            <div class="setting-header">
              <label for="slider-light-rot-z">Directional Tilt Z:</label>
              <span id="val-light-rot-z" class="slider-value">0°</span>
            </div>
            <input type="range" id="slider-light-rot-z" min="-75" max="75" step="1" value="0">
          </div>
        </div>
      </div>
    `;

    this.scenePopover.querySelector('#scene-popover-close-btn')?.addEventListener('click', () => {
      this.closeScenePopover();
    });

    const select = this.scenePopover.querySelector('#scene-dropdown-select') as HTMLSelectElement;
    select?.addEventListener('change', (e) => {
      const scene = (e.target as HTMLSelectElement).value as SceneType;
      if (scene) {
        this.setScene(scene);
        this.settingsManager.updateSettings({ sceneType: scene });
        this.callbacks.onSceneChange(scene);
      }
    });

    const modelSelect = this.scenePopover.querySelector('#scene-select-model') as HTMLSelectElement;
    modelSelect?.addEventListener('change', (e) => {
      const url = (e.target as HTMLSelectElement).value;
      if (url && this.callbacks.onModelChange) {
        this.callbacks.onModelChange(url);
      }
    });

    const textureSelect = this.scenePopover.querySelector('#scene-select-texture') as HTMLSelectElement;
    textureSelect?.addEventListener('change', (e) => {
      const url = (e.target as HTMLSelectElement).value;
      if (url && this.callbacks.onTextureChange) {
        this.callbacks.onTextureChange(url);
      }
    });

    const ambientInput = this.scenePopover.querySelector('#input-ambient-color') as HTMLInputElement;
    const ambientVal = this.scenePopover.querySelector('#ambient-color-val') as HTMLElement;
    ambientInput?.addEventListener('input', (e) => {
      const color = (e.target as HTMLInputElement).value;
      if (ambientVal) ambientVal.textContent = color;
      if (this.callbacks.onAmbientLightColorChange) {
        this.callbacks.onAmbientLightColorChange(color);
      }
    });

    const dirInput = this.scenePopover.querySelector('#input-dir-color') as HTMLInputElement;
    const dirVal = this.scenePopover.querySelector('#dir-color-val') as HTMLElement;
    dirInput?.addEventListener('input', (e) => {
      const color = (e.target as HTMLInputElement).value;
      if (dirVal) dirVal.textContent = color;
      if (this.callbacks.onDirLightColorChange) {
        this.callbacks.onDirLightColorChange(color);
      }
    });

    const rotXSlider = this.scenePopover.querySelector('#slider-light-rot-x') as HTMLInputElement;
    const rotZSlider = this.scenePopover.querySelector('#slider-light-rot-z') as HTMLInputElement;
    const rotXVal = this.scenePopover.querySelector('#val-light-rot-x') as HTMLElement;
    const rotZVal = this.scenePopover.querySelector('#val-light-rot-z') as HTMLElement;

    const onRotChange = () => {
      const rotX = parseFloat(rotXSlider?.value || '0');
      const rotZ = parseFloat(rotZSlider?.value || '0');
      if (rotXVal) rotXVal.textContent = `${rotX > 0 ? '+' : ''}${rotX}°`;
      if (rotZVal) rotZVal.textContent = `${rotZ > 0 ? '+' : ''}${rotZ}°`;
      if (this.callbacks.onDirLightRotationChange) {
        this.callbacks.onDirLightRotationChange(rotX, rotZ);
      }
    };

    rotXSlider?.addEventListener('input', onRotChange);
    rotZSlider?.addEventListener('input', onRotChange);
  }

  public isScenePopoverOpen(): boolean {
    return this.isSceneOpen;
  }

  public openScenePopover(): void {
    if (this.calibrationPanel.getIsOpen()) {
      this.calibrationPanel.close();
    }
    if (this.isDrawerOpen) {
      this.closeDrawer();
    }
    this.isSceneOpen = true;
    this.scenePopover.style.display = 'block';
  }

  public closeScenePopover(): void {
    this.isSceneOpen = false;
    this.scenePopover.style.display = 'none';
  }

  public toggleScenePopover(): void {
    if (this.isSceneOpen) {
      this.closeScenePopover();
    } else {
      this.openScenePopover();
    }
  }

  public getCurrentSceneType(): SceneType {
    return this.currentSceneType;
  }

  public toggleDebugHud(): boolean {
    return this.setDebugHudVisible(!this.isDebugHudVisible);
  }

  public setDebugHudVisible(visible: boolean): boolean {
    this.isDebugHudVisible = visible;
    this.settingsManager.updateSettings({
      debugHudVisible: visible,
      webcamPipVisible: visible
    });
    if (this.debugHudBoxEl) {
      this.debugHudBoxEl.style.display = this.isDebugHudVisible ? 'flex' : 'none';
    }
    this.debugView.setVisible(visible);
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
    if (this.calibrationPanel.getIsOpen()) {
      this.calibrationPanel.close();
    }
    if (this.isSceneOpen) {
      this.closeScenePopover();
    }
    this.isDrawerOpen = true;
    this.settingsDrawer.style.display = 'block';
    if (this.activeDistanceTab === 'biometric') {
      this.startBiometricPolling();
    }
    this.updateDrawerCalibrationReadouts();
  }

  public closeDrawer(): void {
    this.isDrawerOpen = false;
    this.settingsDrawer.style.display = 'none';
    this.stopBiometricPolling();
  }

  public toggleDrawer(): void {
    if (this.isDrawerOpen) {
      this.closeDrawer();
    } else {
      this.openDrawer();
    }
  }

  public setScene(sceneType: SceneType): void {
    this.currentSceneType = sceneType;
    if (this.feedFishBtn) {
      this.feedFishBtn.style.display = sceneType === SceneType.Aquarium ? '' : 'none';
    }
    const modelOptions = this.scenePopover?.querySelector('#scene-model-viewer-options') as HTMLElement;
    if (modelOptions) {
      modelOptions.style.display = sceneType === SceneType.Diorama ? 'block' : 'none';
    }
    const select = this.scenePopover?.querySelector('#scene-dropdown-select') as HTMLSelectElement;
    if (select && select.value !== sceneType) {
      select.value = sceneType;
    }
  }

  public setInputMode(mode: InputMode): void {
    this.currentInputMode = mode;
    const select = this.settingsDrawer.querySelector('#input-mode-select') as HTMLSelectElement;
    if (select && select.value !== mode) {
      select.value = mode;
    }
  }

  public getInputMode(): InputMode {
    return this.currentInputMode;
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
        this.debugTrackFpsValEl.textContent = data.isTrackingActive ? data.trackFps.toString() : '0';
        this.debugTrackFpsValEl.style.color = data.isTrackingActive ? '#00ff88' : '#6b7280';
      } else if (this.currentInputMode === InputMode.Mouse) {
        this.debugTrackFpsValEl.textContent = 'M';
        this.debugTrackFpsValEl.style.color = '#00e5ff';
      } else {
        this.debugTrackFpsValEl.textContent = 'A';
        this.debugTrackFpsValEl.style.color = '#a855f7';
      }
    }

    if (this.debugLatencyValEl) {
      if (this.currentInputMode === InputMode.Webcam) {
        this.debugLatencyValEl.textContent = data.isTrackingActive ? data.latencyMs.toFixed(1) : '--';
      } else {
        this.debugLatencyValEl.textContent = '0.0';
      }
    }

    if (this.debugPoseXEl) {
      const cmX = data.poseX * 100;
      this.debugPoseXEl.textContent = (cmX >= 0 ? '+' : '') + cmX.toFixed(1);
    }
    if (this.debugPoseYEl) {
      const cmY = data.poseY * 100;
      this.debugPoseYEl.textContent = (cmY >= 0 ? '+' : '') + cmY.toFixed(1);
    }
    if (this.debugPoseZEl) {
      const cmZ = data.poseZ * 100;
      this.debugPoseZEl.textContent = cmZ.toFixed(1);
    }
  }

  private setupEventListeners(): void {
    window.addEventListener('keydown', (e) => {
      // Don't intercept hotkeys if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
        return;
      }
      if (e.key === 'c' || e.key === 'C' || e.key === 's' || e.key === 'S') {
        this.toggleDrawer();
      }
      if (e.key === 'f' || e.key === 'F') {
        if (this.currentSceneType === SceneType.Aquarium && this.callbacks.onFeedFish) {
          this.callbacks.onFeedFish();
        }
      }
      if (e.key === 'd' || e.key === 'D') {
        this.toggleDebugHud();
      }
      if (e.key === 'Escape' || e.code === 'Escape') {
        if (this.isSceneOpen) this.closeScenePopover();
        if (this.isDrawerOpen) this.closeDrawer();
      }
    });
  }

  private startBiometricPolling(): void {
    this.stopBiometricPolling();
    this.biometricTimer = window.setInterval(() => {
      if (!this.isDrawerOpen || this.activeDistanceTab !== 'biometric') return;

      const bio = this.callbacks.getBiometricDistance?.();
      this.latestBiometricResult = bio ?? null;

      const bioVal = this.settingsDrawer.querySelector('#drawer-bio-dist-val');
      const bioStatus = this.settingsDrawer.querySelector('#drawer-bio-status');
      const bioDot = this.settingsDrawer.querySelector('#drawer-bio-dot') as HTMLElement;
      const bioLockBtn = this.settingsDrawer.querySelector('#btn-drawer-bio-lock') as HTMLButtonElement;

      if (bio && bio.confidence > 0.4) {
        const cm = bio.distanceMeters * 100;
        const inches = bio.distanceMeters * 39.3701;
        if (bioVal) bioVal.textContent = `${cm.toFixed(0)} cm (${inches.toFixed(1)} in)`;

        const methodText = bio.hasIris
          ? 'Tracking Iris & Pupils'
          : 'Tracking Interpupillary Distance (~63mm)';
        if (bioStatus) bioStatus.textContent = `Active • ${methodText}`;
        if (bioDot) {
          bioDot.style.background = '#10b981';
          bioDot.style.boxShadow = '0 0 8px #10b981';
        }
        if (bioLockBtn) bioLockBtn.disabled = false;
      } else {
        if (bioVal) bioVal.textContent = '-- cm (-- in)';
        if (bioStatus) bioStatus.textContent = 'Look at webcam to detect face...';
        if (bioDot) {
          bioDot.style.background = '#f59e0b';
          bioDot.style.boxShadow = '0 0 8px #f59e0b';
        }
        if (bioLockBtn) bioLockBtn.disabled = true;
      }
    }, 120);
  }

  private stopBiometricPolling(): void {
    if (this.biometricTimer !== null) {
      clearInterval(this.biometricTimer);
      this.biometricTimer = null;
    }
  }

  private updateDrawerCalibrationReadouts(): void {
    const data = this.calibrationManager.getData();
    const wCm = (data.screenWidth * 100).toFixed(1);
    const hCm = (data.screenHeight * 100).toFixed(1);
    const wIn = (data.screenWidth * 39.3701).toFixed(1);
    const hIn = (data.screenHeight * 39.3701).toFixed(1);
    const diagIn = (data.screenDiagonalInches ?? (Math.hypot(data.screenWidth, data.screenHeight) * 39.3701)).toFixed(1);
    const aspect = (data.screenWidth / data.screenHeight).toFixed(2);
    const distCm = (data.viewingDistance * 100).toFixed(0);
    const distIn = (data.viewingDistance * 39.3701).toFixed(1);

    // Width & Height sliders & labels
    const widthSlider = this.settingsDrawer.querySelector('#drawer-width-slider') as HTMLInputElement;
    const widthVal = this.settingsDrawer.querySelector('#drawer-width-val');
    if (widthSlider && document.activeElement !== widthSlider) widthSlider.value = wCm;
    if (widthVal) widthVal.textContent = `${wCm} cm (${wIn} in)`;

    const heightSlider = this.settingsDrawer.querySelector('#drawer-height-slider') as HTMLInputElement;
    const heightVal = this.settingsDrawer.querySelector('#drawer-height-val');
    if (heightSlider && document.activeElement !== heightSlider) heightSlider.value = hCm;
    if (heightVal) heightVal.textContent = `${hCm} cm (${hIn} in)`;

    // Readout box
    const dimReadout = this.settingsDrawer.querySelector('#drawer-dim-readout');
    if (dimReadout) {
      dimReadout.innerHTML = `Physical Window: ${wCm} × ${hCm} cm (${wIn}" × ${hIn}")<br><span style="font-size: 0.68rem; opacity: 0.8;">Diagonal: ${diagIn}" • Aspect: ${aspect}:1</span>`;
    }

    // Preset buttons active state
    const currentDiag = parseFloat(diagIn);
    const presetBtns = this.settingsDrawer.querySelectorAll('.drawer-preset-btn');
    presetBtns.forEach((btn) => {
      const d = parseFloat(btn.getAttribute('data-diag') || '0');
      btn.classList.toggle('active', Math.abs(currentDiag - d) < 0.8);
    });

    // Distance readouts
    const wireframeDistVal = this.settingsDrawer.querySelector('#drawer-wireframe-dist-val');
    if (wireframeDistVal) wireframeDistVal.textContent = `${distCm} cm (${distIn} in)`;

    const manualSlider = this.settingsDrawer.querySelector('#drawer-dist-slider') as HTMLInputElement;
    const manualVal = this.settingsDrawer.querySelector('#drawer-dist-val');
    if (manualSlider && document.activeElement !== manualSlider) manualSlider.value = distCm;
    if (manualVal) manualVal.textContent = `${distCm} cm (${distIn} in)`;
  }

  private buildSettingsDrawer(): void {
    const settings = this.settingsManager.getSettings();
    const calibData = this.calibrationManager.getData();

    const isWebcamSelected = settings.inputMode === InputMode.Webcam ? 'selected' : '';
    const isMouseSelected = settings.inputMode === InputMode.Mouse ? 'selected' : '';
    const isAutoSelected = settings.inputMode === InputMode.Auto ? 'selected' : '';

    const isAccurateProj = settings.projectionMode === ProjectionMode.Accurate ? 'selected' : '';
    const isSimpleProj = settings.projectionMode === ProjectionMode.Simple ? 'selected' : '';

    this.settingsDrawer.innerHTML = `
      <div class="drawer-header">
        <h3>⚙ Settings & Calibration</h3>
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

        <!-- Projection Mode -->
        <div class="setting-group">
          <label for="proj-mode-select">Perspective Projection:</label>
          <select id="proj-mode-select">
            <option value="${ProjectionMode.Accurate}" ${isAccurateProj}>Off-Axis Asymmetric Window</option>
            <option value="${ProjectionMode.Simple}" ${isSimpleProj}>Camera Translation</option>
          </select>
        </div>

        <!-- Tracking Smoothing & Responsiveness -->
        <div class="setting-group">
          <h4>Tracking Smoothing</h4>
          <div class="slider-row">
            <label>Smoothing: <span id="val-tracking-smoothness">${getSmoothnessLabel(settings.trackingSmoothnessPercent ?? 50)}</span></label>
            <input type="range" id="slider-tracking-smoothness" min="0" max="100" step="5" value="${settings.trackingSmoothnessPercent ?? 50}" />
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 0.68rem; color: var(--text-secondary); margin-top: 2px;">
            <span>⚡ Snappy</span>
            <span>Balanced</span>
            <span>Smooth 🛡️</span>
          </div>
        </div>

        <!-- Screen Dimensions Section -->
        <div class="setting-group" style="margin-top: 14px; border-top: 1px solid var(--bg-surface-border); padding-top: 12px;">
          <h4>Screen Dimensions</h4>
          <div style="font-size: 0.70rem; color: var(--text-secondary); margin-bottom: 5px;">Monitor Presets:</div>
          <div class="calib-preset-buttons" style="margin-bottom: 10px;">
            <button type="button" class="btn-preset drawer-preset-btn" data-diag="14">14"</button>
            <button type="button" class="btn-preset drawer-preset-btn" data-diag="16">16"</button>
            <button type="button" class="btn-preset drawer-preset-btn" data-diag="24">24"</button>
            <button type="button" class="btn-preset drawer-preset-btn" data-diag="27">27"</button>
            <button type="button" class="btn-preset drawer-preset-btn" data-diag="32">32"</button>
          </div>
          <div class="slider-row">
            <label>Width: <span id="drawer-width-val">${(calibData.screenWidth * 100).toFixed(1)} cm (${(calibData.screenWidth * 39.3701).toFixed(1)} in)</span></label>
            <input type="range" id="drawer-width-slider" min="20" max="150" step="0.5" value="${(calibData.screenWidth * 100).toFixed(1)}" />
          </div>
          <div class="slider-row">
            <label>Height: <span id="drawer-height-val">${(calibData.screenHeight * 100).toFixed(1)} cm (${(calibData.screenHeight * 39.3701).toFixed(1)} in)</span></label>
            <input type="range" id="drawer-height-slider" min="12" max="100" step="0.5" value="${(calibData.screenHeight * 100).toFixed(1)}" />
          </div>
          <div class="screen-metric-readout" id="drawer-dim-readout" style="font-size: 0.73rem; color: var(--text-secondary); margin-top: 6px; line-height: 1.4; background: rgba(0,0,0,0.25); padding: 6px 8px; border-radius: 6px;">
            Physical Window: ${(calibData.screenWidth * 100).toFixed(1)} × ${(calibData.screenHeight * 100).toFixed(1)} cm (${(calibData.screenWidth * 39.3701).toFixed(1)}" × ${(calibData.screenHeight * 39.3701).toFixed(1)}")
            <br><span style="font-size: 0.68rem; opacity: 0.8;">Diagonal: ${(Math.hypot(calibData.screenWidth, calibData.screenHeight) * 39.3701).toFixed(1)}" • Aspect: ${(calibData.screenWidth / calibData.screenHeight).toFixed(2)}:1</span>
          </div>
        </div>

        <!-- Neutral Center Position Section -->
        <div class="setting-group" style="margin-top: 14px; border-top: 1px solid var(--bg-surface-border); padding-top: 12px;">
          <h4>Neutral Center</h4>
          <p style="font-size: 0.74rem; color: var(--text-secondary); margin-bottom: 8px;">Sit centered in front of your display and look directly at the center of the screen:</p>
          <div style="display: flex; gap: 6px;">
            <button id="btn-drawer-recalibrate-center" class="btn" style="flex: 1; border: 1px solid rgba(0, 229, 255, 0.4); color: var(--accent-cyan); background: rgba(0, 229, 255, 0.08); cursor: pointer; padding: 7px 10px; font-size: 0.76rem; transition: background 0.2s;">
              🎯 Set Center Position
            </button>
            <button id="btn-drawer-reset-center" class="btn" style="border: 1px solid rgba(255, 255, 255, 0.15); color: var(--text-secondary); background: rgba(255, 255, 255, 0.05); cursor: pointer; padding: 7px 10px; font-size: 0.76rem; transition: background 0.2s;" title="Reset Center to (0, 0)">
              ↺ (0, 0)
            </button>
          </div>
          <div id="drawer-center-feedback" class="status-note" style="display: none; margin-top: 6px; font-size: 0.74rem; color: #10b981; font-weight: 500;"></div>
        </div>

        <!-- Viewing Distance Section -->
        <div class="setting-group" style="margin-top: 14px; border-top: 1px solid var(--bg-surface-border); padding-top: 12px;">
          <h4>Viewing Distance</h4>
          <div class="calib-tabs" style="margin-bottom: 10px;">
            <button type="button" class="calib-tab-btn ${this.activeDistanceTab === 'wireframe' ? 'active' : ''}" data-tab="wireframe">
              📐 Wireframe
            </button>
            <button type="button" class="calib-tab-btn ${this.activeDistanceTab === 'biometric' ? 'active' : ''}" data-tab="biometric">
              👁️ Biometric
            </button>
            <button type="button" class="calib-tab-btn ${this.activeDistanceTab === 'manual' ? 'active' : ''}" data-tab="manual">
              📏 Manual
            </button>
          </div>

          <!-- Wireframe Mode -->
          <div class="calib-tab-content ${this.activeDistanceTab === 'wireframe' ? 'active' : ''}" id="drawer-tab-wireframe">
            <div class="wireframe-launcher-card" style="padding: 10px; margin-bottom: 6px;">
              <p style="font-size: 0.74rem; color: var(--text-secondary); margin-bottom: 8px; line-height: 1.35;">
                Aligns a 3D wireframe box with corner guide brackets using live head-coupled perspective.
              </p>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="font-size: 0.74rem; color: var(--text-secondary);">Current Distance:</span>
                <strong id="drawer-wireframe-dist-val" style="color: var(--accent-cyan); font-family: var(--font-mono); font-size: 0.78rem;">${(calibData.viewingDistance * 100).toFixed(0)} cm (${(calibData.viewingDistance * 39.3701).toFixed(1)} in)</strong>
              </div>
              <button class="btn btn-primary" id="btn-drawer-wireframe" style="width: 100%; font-size: 0.76rem; padding: 7px 10px;">
                Launch Wireframe Alignment Mode
              </button>
              <div class="status-note" id="drawer-wireframe-feedback" style="font-size: 0.72rem; margin-top: 6px;"></div>
            </div>
          </div>

          <!-- Biometric Mode -->
          <div class="calib-tab-content ${this.activeDistanceTab === 'biometric' ? 'active' : ''}" id="drawer-tab-biometric">
            <div class="biometric-readout-card" style="padding: 10px; margin-bottom: 6px;">
              <div class="biometric-status" style="margin-bottom: 6px;">
                <span class="status-dot" id="drawer-bio-dot"></span>
                <span id="drawer-bio-status" style="font-size: 0.74rem;">Detecting face landmarks...</span>
              </div>
              <div class="biometric-distance-display" id="drawer-bio-dist-val" style="font-size: 1.15rem; margin-bottom: 8px;">-- cm (-- in)</div>
              <button class="btn btn-primary" id="btn-drawer-bio-lock" style="width: 100%; font-size: 0.76rem; padding: 7px 10px;" disabled>
                Lock Detected Distance
              </button>
              <div style="margin-top: 8px;">
                <label class="checkbox-row" style="font-size: 0.72rem;">
                  <input type="checkbox" id="drawer-bio-continuous-toggle" ${calibData.continuousDepthTracking ? 'checked' : ''} />
                  <span>Continuous Auto-Depth (dynamically updates depth as you lean)</span>
                </label>
              </div>
              <div class="status-note" id="drawer-bio-feedback" style="font-size: 0.72rem; margin-top: 6px;"></div>
            </div>
          </div>

          <!-- Manual Mode -->
          <div class="calib-tab-content ${this.activeDistanceTab === 'manual' ? 'active' : ''}" id="drawer-tab-manual">
            <div class="slider-row" style="margin-bottom: 4px;">
              <label>Distance: <span id="drawer-dist-val">${(calibData.viewingDistance * 100).toFixed(0)} cm (${(calibData.viewingDistance * 39.3701).toFixed(1)} in)</span></label>
              <input type="range" id="drawer-dist-slider" min="30" max="120" step="1" value="${(calibData.viewingDistance * 100).toFixed(0)}" />
            </div>
          </div>
        </div>

        <!-- Reset Settings to Defaults -->
        <div class="setting-group" style="margin-top: 14px;">
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

    // Monitor Presets buttons
    const drawerPresetBtns = this.settingsDrawer.querySelectorAll('.drawer-preset-btn');
    drawerPresetBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const diag = parseFloat((e.currentTarget as HTMLElement).getAttribute('data-diag') || '0');
        if (diag > 0) {
          this.calibrationManager.setMonitorPreset(diag);
          this.updateDrawerCalibrationReadouts();
        }
      });
    });

    // Screen Dimensions Width Slider
    const widthSlider = this.settingsDrawer.querySelector('#drawer-width-slider') as HTMLInputElement;
    widthSlider?.addEventListener('input', (e) => {
      const valCm = parseFloat((e.target as HTMLInputElement).value);
      this.calibrationManager.setScreenWidth(valCm / 100);
      this.updateDrawerCalibrationReadouts();
    });

    // Screen Dimensions Height Slider
    const heightSlider = this.settingsDrawer.querySelector('#drawer-height-slider') as HTMLInputElement;
    heightSlider?.addEventListener('input', (e) => {
      const valCm = parseFloat((e.target as HTMLInputElement).value);
      this.calibrationManager.setScreenHeight(valCm / 100);
      this.updateDrawerCalibrationReadouts();
    });

    // Set Neutral Center
    this.settingsDrawer.querySelector('#btn-drawer-recalibrate-center')?.addEventListener('click', () => {
      const raw = this.callbacks.getCurrentRawPose ? this.callbacks.getCurrentRawPose() : null;
      if (raw) {
        this.calibrationManager.setNeutralOrigin(raw.x, raw.y, raw.z);
      } else {
        this.calibrationManager.setNeutralOrigin(0, 0, this.calibrationManager.getData().viewingDistance);
      }
      const feedback = this.settingsDrawer.querySelector('#drawer-center-feedback') as HTMLElement;
      if (feedback) {
        feedback.textContent = '✓ Neutral center calibrated successfully!';
        feedback.style.display = 'block';
        setTimeout(() => {
          if (feedback) feedback.style.display = 'none';
        }, 3000);
      }
    });

    // Reset Neutral Center
    this.settingsDrawer.querySelector('#btn-drawer-reset-center')?.addEventListener('click', () => {
      this.calibrationManager.resetCenterOrigin();
      const feedback = this.settingsDrawer.querySelector('#drawer-center-feedback') as HTMLElement;
      if (feedback) {
        feedback.textContent = '✓ Center reset to default (0, 0)';
        feedback.style.display = 'block';
        setTimeout(() => {
          if (feedback) feedback.style.display = 'none';
        }, 3000);
      }
    });

    // Distance Mode Tabs
    const tabBtns = this.settingsDrawer.querySelectorAll('.calib-tab-btn');
    tabBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const targetTab = (e.currentTarget as HTMLElement).getAttribute('data-tab') as DistanceCalibrationMode;
        if (targetTab) {
          this.activeDistanceTab = targetTab;
          this.calibrationManager.setDistanceMode(targetTab);

          tabBtns.forEach(b => b.classList.remove('active'));
          (e.currentTarget as HTMLElement).classList.add('active');

          const contents = this.settingsDrawer.querySelectorAll('.calib-tab-content');
          contents.forEach(c => c.classList.remove('active'));
          const activeContent = this.settingsDrawer.querySelector(`#drawer-tab-${targetTab}`);
          activeContent?.classList.add('active');

          if (targetTab === 'biometric') {
            this.startBiometricPolling();
          } else {
            this.stopBiometricPolling();
          }
        }
      });
    });

    // Wireframe Alignment launcher button
    this.settingsDrawer.querySelector('#btn-drawer-wireframe')?.addEventListener('click', () => {
      this.closeDrawer();
      this.calibrationPanel.startWireframeAlignment(() => {
        this.openDrawer();
        this.updateDrawerCalibrationReadouts();
        const feedback = this.settingsDrawer.querySelector('#drawer-wireframe-feedback') as HTMLElement;
        if (feedback) {
          feedback.textContent = '✓ Viewing distance calibrated & locked successfully!';
          feedback.style.display = 'block';
          setTimeout(() => {
            if (feedback) feedback.style.display = 'none';
          }, 3000);
        }
      });
    });

    // Biometric lock button
    this.settingsDrawer.querySelector('#btn-drawer-bio-lock')?.addEventListener('click', () => {
      if (this.latestBiometricResult && this.latestBiometricResult.confidence > 0.4) {
        this.calibrationManager.setViewingDistance(this.latestBiometricResult.distanceMeters);
        this.updateDrawerCalibrationReadouts();
        const feedback = this.settingsDrawer.querySelector('#drawer-bio-feedback') as HTMLElement;
        const cmVal = (this.latestBiometricResult.distanceMeters * 100).toFixed(0);
        const inVal = (this.latestBiometricResult.distanceMeters * 39.3701).toFixed(1);
        if (feedback) {
          feedback.textContent = `✓ Biometric distance locked: ${cmVal} cm (${inVal} in)`;
          feedback.style.display = 'block';
          setTimeout(() => {
            if (feedback) feedback.style.display = 'none';
          }, 3000);
        }
      }
    });

    // Biometric continuous auto-depth toggle
    const bioContToggle = this.settingsDrawer.querySelector('#drawer-bio-continuous-toggle') as HTMLInputElement;
    bioContToggle?.addEventListener('change', (e) => {
      this.calibrationManager.setContinuousDepthTracking((e.target as HTMLInputElement).checked);
    });

    // Distance manual slider
    const distSlider = this.settingsDrawer.querySelector('#drawer-dist-slider') as HTMLInputElement;
    distSlider?.addEventListener('input', (e) => {
      const valCm = parseFloat((e.target as HTMLInputElement).value);
      this.calibrationManager.setViewingDistance(valCm / 100);
      this.updateDrawerCalibrationReadouts();
    });

    // Subscribe to external calibration updates
    this.calibrationManager.subscribe(() => {
      this.updateDrawerCalibrationReadouts();
    });

    // Input mode change
    const inputSelect = this.settingsDrawer.querySelector('#input-mode-select') as HTMLSelectElement;
    inputSelect?.addEventListener('change', (e) => {
      const mode = (e.target as HTMLSelectElement).value as InputMode;
      this.currentInputMode = mode;
      this.settingsManager.updateSettings({ inputMode: mode });
      this.callbacks.onInputModeChange(mode);
    });

    // Projection mode change
    const projSelect = this.settingsDrawer.querySelector('#proj-mode-select') as HTMLSelectElement;
    projSelect?.addEventListener('change', (e) => {
      const mode = (e.target as HTMLSelectElement).value as ProjectionMode;
      this.perspectiveController.setProjectionMode(mode);
      this.settingsManager.updateSettings({ projectionMode: mode });
    });

    // Consolidated Tracking Smoothing slider
    const smoothnessSlider = this.settingsDrawer.querySelector('#slider-tracking-smoothness') as HTMLInputElement;
    const smoothnessVal = this.settingsDrawer.querySelector('#val-tracking-smoothness');
    smoothnessSlider?.addEventListener('input', (e) => {
      const pct = parseInt((e.target as HTMLInputElement).value, 10);
      if (smoothnessVal) smoothnessVal.textContent = getSmoothnessLabel(pct);
      this.perspectiveController.setTrackingSmoothnessPercent(pct);
      const params = computeSmoothingParameters(pct);
      this.settingsManager.updateSettings({
        trackingSmoothnessPercent: pct,
        lookaheadMs: params.lookaheadMs,
        smoothTimeMs: params.smoothTimeMs,
        minCutoff: params.minCutoff,
        beta: params.beta,
        deadbandEnabled: params.deadbandEnabled
      });
    });

    // Reset Settings to Defaults button
    const resetSettingsBtn = this.settingsDrawer.querySelector('#btn-reset-settings') as HTMLButtonElement;
    resetSettingsBtn?.addEventListener('click', () => {
      this.calibrationManager.resetCenterOrigin();
      const defaults = this.settingsManager.resetToDefaults();
      this.syncUiFromSettings(defaults);
      this.perspectiveController.setProjectionMode(defaults.projectionMode);
      this.perspectiveController.setDepthMode(defaults.depthMode);
      this.perspectiveController.setTrackingSmoothnessPercent(defaults.trackingSmoothnessPercent);
      this.callbacks.onSceneChange(defaults.sceneType);
      this.callbacks.onInputModeChange(defaults.inputMode);
    });

    // Initialize scene-dependent UI elements from persisted settings
    this.setScene(settings.sceneType);
    this.updateDrawerCalibrationReadouts();
  }

  public syncUiFromSettings(settings: AppSettings): void {
    const inputSelect = this.settingsDrawer.querySelector('#input-mode-select') as HTMLSelectElement;
    if (inputSelect) inputSelect.value = settings.inputMode;
    this.currentInputMode = settings.inputMode;

    const projSelect = this.settingsDrawer.querySelector('#proj-mode-select') as HTMLSelectElement;
    if (projSelect) projSelect.value = settings.projectionMode;

    this.setScene(settings.sceneType);

    const smoothnessSlider = this.settingsDrawer.querySelector('#slider-tracking-smoothness') as HTMLInputElement;
    const smoothnessVal = this.settingsDrawer.querySelector('#val-tracking-smoothness');
    const smoothnessPct = settings.trackingSmoothnessPercent ?? 50;
    if (smoothnessSlider) smoothnessSlider.value = String(smoothnessPct);
    if (smoothnessVal) smoothnessVal.textContent = getSmoothnessLabel(smoothnessPct);
    this.perspectiveController.setTrackingSmoothnessPercent(smoothnessPct);

    this.setDebugHudVisible(settings.debugHudVisible);
    this.updateDrawerCalibrationReadouts();
  }
}
