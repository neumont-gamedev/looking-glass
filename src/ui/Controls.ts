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
import { ViewerPose } from '../tracking/TrackingState';
import { SettingsManager, InputMode, AppSettings, computeSmoothingParameters, getSmoothnessLabel } from '../settings/SettingsManager';

export { InputMode } from '../settings/SettingsManager';

export interface ControlsCallbacks {
  onInputModeChange: (mode: InputMode) => void;
  onSceneChange: (sceneType: SceneType) => void;
  onFeedFish?: () => void;
  onToggleDebugHud?: (visible: boolean) => void;
  getCurrentRawPose?: () => ViewerPose | null;
}

export class Controls {
  private topBar: HTMLElement;
  private settingsDrawer: HTMLElement;
  private isDrawerOpen: boolean = false;

  private currentInputMode: InputMode = InputMode.Webcam;
  private perspectiveController: PerspectiveController;
  private debugView: TrackingDebugView;
  private calibrationPanel: CalibrationPanel;
  public readonly calibrationManager: CalibrationManager;
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
    this.isDebugHudVisible = initialSettings.debugHudVisible;

    this.topBar = document.createElement('header');
    this.topBar.className = 'hud-topbar';

    this.settingsDrawer = document.createElement('div');
    this.settingsDrawer.className = 'settings-drawer';
    this.settingsDrawer.style.display = 'none';

    this.calibrationPanel.setOnOpenCallback(() => {
      if (this.isDrawerOpen) {
        this.closeDrawer();
      }
    });

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
        <button class="btn btn-hud btn-icon" id="btn-fullscreen" title="Toggle Fullscreen">⛶</button>
        <button class="btn btn-hud btn-sm" id="btn-calibrate" title="Display Calibration (Window, Depth, Sensitivity)">⚙ <span>Calibrate</span></button>
        <button class="btn btn-hud btn-sm" id="btn-toggle-settings" title="Settings (Scenes, Tracking, Filters, Debug)">
          <svg class="btn-svg-icon" viewBox="0 0 24 24">
            <line x1="4" y1="21" x2="4" y2="14"></line>
            <line x1="4" y1="10" x2="4" y2="3"></line>
            <line x1="12" y1="21" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12" y2="3"></line>
            <line x1="20" y1="21" x2="20" y2="16"></line>
            <line x1="20" y1="12" x2="20" y2="3"></line>
            <line x1="1" y1="14" x2="7" y2="14"></line>
            <line x1="9" y1="8" x2="15" y2="8"></line>
            <line x1="17" y1="16" x2="23" y2="16"></line>
          </svg>
          <span>Settings</span>
        </button>
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

    const openCalibrationHandler = () => {
      if (this.isDrawerOpen) {
        this.closeDrawer();
      }
      this.calibrationPanel.toggle();
    };

    this.topBar.querySelector('#btn-calibrate')?.addEventListener('click', openCalibrationHandler);
    this.topBar.querySelector('#btn-gear')?.addEventListener('click', openCalibrationHandler);

    this.topBar.querySelector('#btn-toggle-settings')?.addEventListener('click', () => {
      if (this.calibrationPanel.getIsOpen()) {
        this.calibrationPanel.close();
      }
      this.toggleDrawer();
    });
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
    const calibData = this.calibrationManager.getData();

    const isWebcamSelected = settings.inputMode === InputMode.Webcam ? 'selected' : '';
    const isMouseSelected = settings.inputMode === InputMode.Mouse ? 'selected' : '';
    const isAutoSelected = settings.inputMode === InputMode.Auto ? 'selected' : '';

    const isAccurateProj = settings.projectionMode === ProjectionMode.Accurate ? 'selected' : '';
    const isSimpleProj = settings.projectionMode === ProjectionMode.Simple ? 'selected' : '';

    const isAquarium = settings.sceneType === SceneType.Aquarium ? 'selected' : '';
    const isDiorama = settings.sceneType === SceneType.Diorama ? 'selected' : '';
    const isDebug = settings.sceneType === SceneType.Debug ? 'selected' : '';

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

        <!-- Projection Mode -->
        <div class="setting-group">
          <label for="proj-mode-select">Perspective Projection:</label>
          <select id="proj-mode-select">
            <option value="${ProjectionMode.Accurate}" ${isAccurateProj}>Off-Axis Asymmetric Window</option>
            <option value="${ProjectionMode.Simple}" ${isSimpleProj}>Camera Translation</option>
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

        <!-- Screen & Calibration Section -->
        <div class="setting-group" style="margin-top: 14px; border-top: 1px solid var(--bg-surface-border); padding-top: 12px;">
          <h4>Screen & Calibration</h4>
          <div style="font-size: 0.76rem; color: var(--text-secondary); margin-bottom: 8px; line-height: 1.45; background: rgba(0, 0, 0, 0.2); padding: 8px 10px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.05);">
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
              <span>Display Window:</span>
              <strong id="drawer-calib-dim" style="color: var(--accent-cyan); font-family: var(--font-mono);">${(calibData.screenWidth * 100).toFixed(1)} × ${(calibData.screenHeight * 100).toFixed(1)} cm</strong>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span>Viewing Distance:</span>
              <strong id="drawer-calib-dist" style="color: var(--accent-cyan); font-family: var(--font-mono);">${(calibData.viewingDistance * 100).toFixed(0)} cm</strong>
            </div>
          </div>
          <div style="margin-bottom: 8px;">
            <div style="font-size: 0.70rem; color: var(--text-secondary); margin-bottom: 5px;">Monitor Presets:</div>
            <div class="calib-preset-buttons">
              <button type="button" class="btn-preset drawer-preset-btn ${Math.abs((calibData.screenDiagonalInches ?? 24) - 14) < 0.8 ? 'active' : ''}" data-diag="14">14"</button>
              <button type="button" class="btn-preset drawer-preset-btn ${Math.abs((calibData.screenDiagonalInches ?? 24) - 16) < 0.8 ? 'active' : ''}" data-diag="16">16"</button>
              <button type="button" class="btn-preset drawer-preset-btn ${Math.abs((calibData.screenDiagonalInches ?? 24) - 27) < 0.8 ? 'active' : ''}" data-diag="27">27"</button>
              <button type="button" class="btn-preset drawer-preset-btn ${Math.abs((calibData.screenDiagonalInches ?? 24) - 32) < 0.8 ? 'active' : ''}" data-diag="32">32"</button>
            </div>
          </div>
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <button id="btn-drawer-recalibrate-center" class="btn" style="width: 100%; border: 1px solid rgba(0, 229, 255, 0.4); color: var(--accent-cyan); background: rgba(0, 229, 255, 0.08); cursor: pointer; padding: 7px 12px; font-size: 0.78rem; transition: background 0.2s;">
              🎯 Set Center Position
            </button>
            <button id="btn-drawer-open-calibration" class="btn btn-primary" style="width: 100%; cursor: pointer; padding: 7px 12px; font-size: 0.78rem;">
              ⚙ Open Guided Calibration Window
            </button>
          </div>
          <div id="drawer-center-feedback" class="status-note" style="display: none; margin-top: 6px; font-size: 0.75rem; color: #10b981; font-weight: 500;"></div>
        </div>

        <!-- Reset Settings to Defaults -->
        <div class="setting-group" style="margin-top: 10px;">
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

    const drawerPresetBtns = this.settingsDrawer.querySelectorAll('.drawer-preset-btn');
    drawerPresetBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const diag = parseFloat((e.currentTarget as HTMLElement).getAttribute('data-diag') || '0');
        if (diag > 0) {
          this.calibrationManager.setMonitorPreset(diag);
          drawerPresetBtns.forEach(b => b.classList.remove('active'));
          (e.currentTarget as HTMLElement).classList.add('active');
        }
      });
    });

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

    this.settingsDrawer.querySelector('#btn-drawer-open-calibration')?.addEventListener('click', () => {
      this.closeDrawer();
      this.calibrationPanel.open();
    });

    // Keep drawer calibration readout synced with live calibration changes
    this.calibrationManager.subscribe((data) => {
      const dimEl = this.settingsDrawer.querySelector('#drawer-calib-dim');
      const distEl = this.settingsDrawer.querySelector('#drawer-calib-dist');
      if (dimEl) {
        dimEl.textContent = `${(data.screenWidth * 100).toFixed(1)} × ${(data.screenHeight * 100).toFixed(1)} cm`;
      }
      if (distEl) {
        distEl.textContent = `${(data.viewingDistance * 100).toFixed(0)} cm`;
      }
      const diagIn = data.screenDiagonalInches ?? (Math.hypot(data.screenWidth, data.screenHeight) * 39.3701);
      const btns = this.settingsDrawer.querySelectorAll('.drawer-preset-btn');
      btns.forEach((btn) => {
        const d = parseFloat(btn.getAttribute('data-diag') || '0');
        btn.classList.toggle('active', Math.abs(diagIn - d) < 0.8);
      });
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

    // Scene select
    const sceneSelect = this.settingsDrawer.querySelector('#scene-select') as HTMLSelectElement;
    sceneSelect?.addEventListener('change', (e) => {
      const type = (e.target as HTMLSelectElement).value as SceneType;
      this.setScene(type);
      this.settingsManager.updateSettings({ sceneType: type });
      this.callbacks.onSceneChange(type);
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
  }

  public syncUiFromSettings(settings: AppSettings): void {
    const inputSelect = this.settingsDrawer.querySelector('#input-mode-select') as HTMLSelectElement;
    if (inputSelect) inputSelect.value = settings.inputMode;
    this.currentInputMode = settings.inputMode;

    const projSelect = this.settingsDrawer.querySelector('#proj-mode-select') as HTMLSelectElement;
    if (projSelect) projSelect.value = settings.projectionMode;

    const sceneSelect = this.settingsDrawer.querySelector('#scene-select') as HTMLSelectElement;
    if (sceneSelect) sceneSelect.value = settings.sceneType;
    this.setScene(settings.sceneType);

    const smoothnessSlider = this.settingsDrawer.querySelector('#slider-tracking-smoothness') as HTMLInputElement;
    const smoothnessVal = this.settingsDrawer.querySelector('#val-tracking-smoothness');
    const smoothnessPct = settings.trackingSmoothnessPercent ?? 50;
    if (smoothnessSlider) smoothnessSlider.value = String(smoothnessPct);
    if (smoothnessVal) smoothnessVal.textContent = getSmoothnessLabel(smoothnessPct);
    this.perspectiveController.setTrackingSmoothnessPercent(smoothnessPct);

    this.setDebugHudVisible(settings.debugHudVisible);
  }
}
