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

export enum InputMode {
  Webcam = 'Webcam',
  Mouse = 'Mouse',
  Auto = 'Auto'
}

export interface ControlsCallbacks {
  onInputModeChange: (mode: InputMode) => void;
  onSceneChange: (sceneType: SceneType) => void;
  onFeedFish?: () => void;
  onToggleCamera?: (enable: boolean) => Promise<boolean> | boolean;
  onLoadCustomFish?: (source: string, count: number, options: CustomFishOptions) => Promise<number>;
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

        <!-- Camera Power Toggle -->
        <div class="setting-group">
          <label>Camera Tracking Power:</label>
          <button id="btn-toggle-camera" class="btn-camera-toggle btn-camera-on" title="Turn camera on or off">
            🟢 Camera On (Click to Turn Off)
          </button>
          <small style="color: var(--text-secondary); font-size: 0.72rem; line-height: 1.3; display: block; margin-top: 5px;">
            Turning off releases your webcam device and powers down the camera LED.
          </small>
        </div>

        <!-- Projection Mode -->
        <div class="setting-group">
          <label for="proj-mode-select">Perspective Projection:</label>
          <select id="proj-mode-select">
            <option value="${ProjectionMode.Accurate}">Off-Axis Asymmetric Window (Accurate)</option>
            <option value="${ProjectionMode.Simple}">Simple Camera Translation (LookAt)</option>
          </select>
        </div>

        <!-- Head Depth Behavior -->
        <div class="setting-group">
          <label for="depth-mode-select">Head Depth (Forward / Back) Behavior:</label>
          <select id="depth-mode-select">
            <option value="natural" selected>🔍 Natural Approach (Objects enlarge as you lean in)</option>
            <option value="aperture">🪟 Fixed Aperture (Strict window aperture)</option>
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
            <label>Model Size: <span id="val-custom-fish-scale">4.5</span> cm</label>
            <input type="range" id="slider-custom-fish-scale" min="2.0" max="15.0" step="0.5" value="4.5" />
          </div>

          <div class="slider-row">
            <label>Forward Axis:</label>
            <select id="select-custom-fish-axis" style="padding: 3px 8px; font-size: 0.75rem; width: auto; background: var(--bg-surface); color: var(--text-primary); border: 1px solid var(--bg-surface-border); border-radius: 4px;">
              <option value="+X" selected>+X (Default)</option>
              <option value="+Z">+Z (Blender standard)</option>
              <option value="-Z">-Z</option>
              <option value="-X">-X</option>
            </select>
          </div>

          <div id="custom-fish-status" style="font-size: 0.74rem; color: #34d399; margin-top: 6px; display: none;"></div>
        </div>

        <!-- Predictive Positioning & Kinematic Smoothing -->
        <div class="setting-group">
          <h4>Motion Smoothing & Predictive Tracking</h4>
          <div class="slider-row">
            <label>Predictive Lookahead: <span id="val-lookahead">${this.perspectiveController.getLookaheadMs()}</span> ms</label>
            <input type="range" id="slider-lookahead" min="0" max="80" step="5" value="${this.perspectiveController.getLookaheadMs()}" />
          </div>
          <div class="slider-row">
            <label>Translation Smoothing: <span id="val-smooth-time">${this.perspectiveController.getSmoothTimeMs()}</span> ms</label>
            <input type="range" id="slider-smooth-time" min="15" max="120" step="5" value="${this.perspectiveController.getSmoothTimeMs()}" />
          </div>
          <label class="checkbox-row" style="margin-top: 8px;">
            <input type="checkbox" id="toggle-deadband" ${this.perspectiveController.isDeadbandEnabled() ? 'checked' : ''} />
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
            <label>Min Cutoff (Hz): <span id="val-min-cutoff">1.0</span></label>
            <input type="range" id="slider-min-cutoff" min="0.2" max="4.0" step="0.1" value="1.0" />
          </div>
          <div class="slider-row">
            <label>Beta (Responsiveness): <span id="val-beta">2.2</span></label>
            <input type="range" id="slider-beta" min="0.2" max="8.0" step="0.1" value="2.2" />
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
    });

    // Head Depth Mode change (Natural Approach vs Fixed Aperture)
    const depthSelect = this.settingsDrawer.querySelector('#depth-mode-select') as HTMLSelectElement;
    depthSelect?.addEventListener('change', (e) => {
      const mode = (e.target as HTMLSelectElement).value as 'natural' | 'aperture';
      this.perspectiveController.setDepthMode(mode);
    });

    // Scene select
    const sceneSelect = this.settingsDrawer.querySelector('#scene-select') as HTMLSelectElement;
    sceneSelect?.addEventListener('change', (e) => {
      const type = (e.target as HTMLSelectElement).value as SceneType;
      this.callbacks.onSceneChange(type);
    });

    // Custom Fish Model Scale Slider
    const fishScaleSlider = this.settingsDrawer.querySelector('#slider-custom-fish-scale') as HTMLInputElement;
    const fishScaleVal = this.settingsDrawer.querySelector('#val-custom-fish-scale');
    fishScaleSlider?.addEventListener('input', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      if (fishScaleVal) fishScaleVal.textContent = val.toFixed(1);
    });

    const getCustomFishOptions = (): CustomFishOptions => {
      const scaleCm = fishScaleSlider ? parseFloat(fishScaleSlider.value) : 4.5;
      const axisSelect = this.settingsDrawer.querySelector('#select-custom-fish-axis') as HTMLSelectElement;
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
    });

    // Translation Smoothing Time (SmoothDamp) slider
    const smoothTimeSlider = this.settingsDrawer.querySelector('#slider-smooth-time') as HTMLInputElement;
    const smoothTimeVal = this.settingsDrawer.querySelector('#val-smooth-time');
    smoothTimeSlider?.addEventListener('input', (e) => {
      const val = parseInt((e.target as HTMLInputElement).value, 10);
      if (smoothTimeVal) smoothTimeVal.textContent = String(val);
      this.perspectiveController.setSmoothTimeMs(val);
    });

    // Stationary Anti-Jitter Deadband toggle
    const deadbandToggle = this.settingsDrawer.querySelector('#toggle-deadband') as HTMLInputElement;
    deadbandToggle?.addEventListener('change', (e) => {
      this.perspectiveController.setDeadbandEnabled((e.target as HTMLInputElement).checked);
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
      if (betaVal) betaVal.textContent = val.toFixed(1);
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

  public setCameraActiveState(active: boolean): void {
    this.isCameraActive = active;
    const btn = this.settingsDrawer.querySelector('#btn-toggle-camera') as HTMLButtonElement;
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
