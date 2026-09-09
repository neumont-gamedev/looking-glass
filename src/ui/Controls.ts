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

export enum InputMode {
  Webcam = 'Webcam',
  Mouse = 'Mouse',
  Auto = 'Auto'
}

export interface ControlsCallbacks {
  onInputModeChange: (mode: InputMode) => void;
  onSceneChange: (sceneType: SceneType) => void;
  onFeedFish?: () => void;
}

export class Controls {
  private topBar: HTMLElement;
  private settingsDrawer: HTMLElement;
  private isDrawerOpen: boolean = false;

  private currentInputMode: InputMode = InputMode.Webcam;
  private perspectiveController: PerspectiveController;
  private debugView: TrackingDebugView;
  private calibrationPanel: CalibrationPanel;
  private calibrationManager: CalibrationManager;
  private callbacks: ControlsCallbacks;

  constructor(
    perspectiveController: PerspectiveController,
    debugView: TrackingDebugView,
    calibrationPanel: CalibrationPanel,
    calibrationManager: CalibrationManager,
    callbacks: ControlsCallbacks
  ) {
    this.perspectiveController = perspectiveController;
    this.debugView = debugView;
    this.calibrationPanel = calibrationPanel;
    this.calibrationManager = calibrationManager;
    this.callbacks = callbacks;

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
    const select = this.settingsDrawer.querySelector('#input-mode-select') as HTMLSelectElement;
    if (select) select.value = mode;
    this.callbacks.onInputModeChange(mode);
  }

  public getInputMode(): InputMode {
    return this.currentInputMode;
  }

  private buildTopBar(): void {
    this.topBar.innerHTML = `
      <div class="logo-group">
        <h1 class="app-title">LOOKING GLASS</h1>
        <span class="app-tagline">A head-tracked window into 3D space</span>
      </div>
      <div class="topbar-actions">
        <button class="btn btn-hud" id="btn-feed-fish">Feed Fish 🦐</button>
        <button class="btn btn-hud" id="btn-calibrate">Calibrate</button>
        <button class="btn btn-hud" id="btn-toggle-settings">Settings ⚙</button>
        <button class="btn btn-hud" id="btn-fullscreen">⛶ Fullscreen</button>
      </div>
    `;

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

  private toggleDrawer(): void {
    this.isDrawerOpen = !this.isDrawerOpen;
    this.settingsDrawer.style.display = this.isDrawerOpen ? 'block' : 'none';
  }

  private buildDrawer(): void {
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
            <option value="${InputMode.Webcam}">📷 Webcam Head Tracking</option>
            <option value="${InputMode.Mouse}">🖱️ Mouse Simulation Mode</option>
            <option value="${InputMode.Auto}">🔄 Auto Demo Orbit Mode</option>
          </select>
        </div>

        <!-- Projection Mode -->
        <div class="setting-group">
          <label for="proj-mode-select">Perspective Projection:</label>
          <select id="proj-mode-select">
            <option value="${ProjectionMode.Accurate}">Off-Axis Asymmetric Window (Accurate)</option>
            <option value="${ProjectionMode.Simple}">Simple Camera Translation (LookAt)</option>
          </select>
        </div>

        <!-- Scene Mode -->
        <div class="setting-group">
          <label for="scene-select">Virtual 3D Scene:</label>
          <select id="scene-select">
            <option value="${SceneType.Aquarium}" selected>🐠 Virtual Aquarium</option>
            <option value="${SceneType.Diorama}">📦 Diorama Shadow Box</option>
            <option value="${SceneType.Debug}">📐 Debug Calibration Grids</option>
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

        <!-- Smoothing Filter -->
        <div class="setting-group">
          <h4>One Euro Filter Tuning</h4>
          <div class="slider-row">
            <label>Min Cutoff (Hz): <span id="val-min-cutoff">1.0</span></label>
            <input type="range" id="slider-min-cutoff" min="0.1" max="4.0" step="0.1" value="1.0" />
          </div>
          <div class="slider-row">
            <label>Beta (Lag/Speed): <span id="val-beta">0.007</span></label>
            <input type="range" id="slider-beta" min="0.001" max="0.05" step="0.001" value="0.007" />
          </div>
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
            <input type="checkbox" id="toggle-webcam-pip" />
            <span>Show Webcam PIP & Face Landmarks</span>
          </label>
        </div>

        <!-- Privacy notice as specified in AGENTS.md -->
        <div class="privacy-notice">
          <small>🛡️ <strong>Privacy:</strong> Camera images are processed locally in your browser and are not uploaded or recorded.</small>
        </div>
      </div>
    `;

    this.settingsDrawer.querySelector('#drawer-close-btn')?.addEventListener('click', () => {
      this.toggleDrawer();
    });

    // Input mode change
    const inputSelect = this.settingsDrawer.querySelector('#input-mode-select') as HTMLSelectElement;
    inputSelect?.addEventListener('change', (e) => {
      const mode = (e.target as HTMLSelectElement).value as InputMode;
      this.currentInputMode = mode;
      this.callbacks.onInputModeChange(mode);
    });

    // Projection mode change
    const projSelect = this.settingsDrawer.querySelector('#proj-mode-select') as HTMLSelectElement;
    projSelect?.addEventListener('change', (e) => {
      const mode = (e.target as HTMLSelectElement).value as ProjectionMode;
      this.perspectiveController.setProjectionMode(mode);
    });

    // Scene select
    const sceneSelect = this.settingsDrawer.querySelector('#scene-select') as HTMLSelectElement;
    sceneSelect?.addEventListener('change', (e) => {
      const type = (e.target as HTMLSelectElement).value as SceneType;
      this.callbacks.onSceneChange(type);
    });

    // Filter tuning sliders
    const minCutoffSlider = this.settingsDrawer.querySelector('#slider-min-cutoff') as HTMLInputElement;
    const minCutoffVal = this.settingsDrawer.querySelector('#val-min-cutoff');
    minCutoffSlider?.addEventListener('input', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      if (minCutoffVal) minCutoffVal.textContent = val.toFixed(1);
      this.perspectiveController.filter.updateConfig({ minCutoff: val });
    });

    const betaSlider = this.settingsDrawer.querySelector('#slider-beta') as HTMLInputElement;
    const betaVal = this.settingsDrawer.querySelector('#val-beta');
    betaSlider?.addEventListener('input', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      if (betaVal) betaVal.textContent = val.toFixed(3);
      this.perspectiveController.filter.updateConfig({ beta: val });
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

    // Webcam PIP toggle
    const pipToggle = this.settingsDrawer.querySelector('#toggle-webcam-pip') as HTMLInputElement;
    pipToggle?.addEventListener('change', (e) => {
      this.debugView.setVisible((e.target as HTMLInputElement).checked);
    });
  }
}
