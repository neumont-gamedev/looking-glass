/**
 * CalibrationPanel.ts
 *
 * Guided multi-step calibration modal dialog with dual viewing distance methods:
 * 1. Approach A: Interactive Wireframe Alignment (3D box & corner guide brackets).
 * 2. Approach C: Biometric Iris & IPD Auto-Detection.
 * 3. Manual Fine-Tuning Slider.
 */

import { CalibrationManager } from '../calibration/CalibrationManager';
import { DistanceCalibrationMode } from '../calibration/CalibrationData';
import { ViewerPose } from '../tracking/TrackingState';
import { BiometricDistanceResult } from '../tracking/HeadPoseEstimator';

export interface CalibrationPanelCallbacks {
  getCurrentRawPose: () => ViewerPose | null;
  getBiometricDistance?: () => BiometricDistanceResult | null;
  onWireframeModeToggle?: (active: boolean) => void;
}

export class CalibrationPanel {
  private overlay: HTMLElement;
  private wireframeHud: HTMLElement;
  private manager: CalibrationManager;
  private callbacks: CalibrationPanelCallbacks;
  private isOpen: boolean = false;
  private isWireframeActive: boolean = false;
  private activeDistanceTab: DistanceCalibrationMode = 'wireframe';
  private biometricTimer: number | null = null;
  private latestBiometricResult: BiometricDistanceResult | null = null;

  constructor(
    manager: CalibrationManager,
    callbacksOrPose: CalibrationPanelCallbacks | (() => ViewerPose | null)
  ) {
    this.manager = manager;
    if (typeof callbacksOrPose === 'function') {
      this.callbacks = { getCurrentRawPose: callbacksOrPose };
    } else {
      this.callbacks = callbacksOrPose;
    }

    this.activeDistanceTab = this.manager.getData().distanceMode ?? 'wireframe';

    // 1. Modal Overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'calibration-modal-overlay';
    this.overlay.style.display = 'none';

    // 2. Wireframe Alignment HUD (Full-screen overlay bar)
    this.wireframeHud = document.createElement('div');
    this.wireframeHud.className = 'wireframe-align-hud';
    this.wireframeHud.style.display = 'none';

    this.render();
    this.buildWireframeHud();

    document.body.appendChild(this.overlay);
    document.body.appendChild(this.wireframeHud);

    window.addEventListener('keydown', this.handleKeyDown);
  }

  public open(): void {
    this.isOpen = true;
    this.activeDistanceTab = this.manager.getData().distanceMode ?? 'wireframe';
    this.render();
    this.overlay.style.display = 'flex';
    this.startBiometricPolling();
  }

  public close(): void {
    this.isOpen = false;
    this.overlay.style.display = 'none';
    this.stopBiometricPolling();
  }

  public toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (!this.isWireframeActive) return;

    if (e.code === 'Space') {
      e.preventDefault();
      this.lockWireframeAlignment();
    } else if (e.code === 'Escape') {
      e.preventDefault();
      this.exitWireframeAlignment();
    }
  };

  private startBiometricPolling(): void {
    this.stopBiometricPolling();
    this.biometricTimer = window.setInterval(() => {
      if (!this.isOpen || this.activeDistanceTab !== 'biometric') return;

      const bio = this.callbacks.getBiometricDistance?.();
      this.latestBiometricResult = bio ?? null;

      const bioVal = this.overlay.querySelector('#bio-dist-val');
      const bioStatus = this.overlay.querySelector('#bio-status-text');
      const bioDot = this.overlay.querySelector('#bio-dot') as HTMLElement;
      const bioLockBtn = this.overlay.querySelector('#bio-lock-btn') as HTMLButtonElement;

      if (bio && bio.confidence > 0.4) {
        const cm = bio.distanceMeters * 100;
        const inches = bio.distanceMeters * 39.3701;
        if (bioVal) bioVal.textContent = `${cm.toFixed(0)} cm (${inches.toFixed(1)} in)`;

        const methodText = bio.hasIris
          ? 'Tracking Iris (~11.7mm) & Pupils'
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

  private buildWireframeHud(): void {
    const data = this.manager.getData();
    const cm = data.viewingDistance * 100;
    const inches = data.viewingDistance * 39.3701;

    this.wireframeHud.innerHTML = `
      <div class="hud-left">
        <span class="hud-badge">📐 Wireframe Perspective Alignment</span>
        <span class="hud-instructions">Sit centered. Adjust distance until the 3D green box aligns with your screen's corner brackets.</span>
      </div>
      <div class="hud-center">
        <label>Distance: <span id="wireframe-hud-val">${cm.toFixed(0)} cm (${inches.toFixed(1)} in)</span></label>
        <input type="range" id="wireframe-hud-slider" min="30" max="120" step="1" value="${cm.toFixed(0)}" />
      </div>
      <div class="hud-right">
        <button class="btn btn-primary" id="wireframe-hud-lock-btn">Lock Distance (Space)</button>
        <button class="btn btn-secondary" id="wireframe-hud-exit-btn">Done (Esc)</button>
      </div>
    `;

    const slider = this.wireframeHud.querySelector('#wireframe-hud-slider') as HTMLInputElement;
    const label = this.wireframeHud.querySelector('#wireframe-hud-val');

    slider?.addEventListener('input', (e) => {
      const valCm = parseFloat((e.target as HTMLInputElement).value);
      const valIn = (valCm / 2.54).toFixed(1);
      if (label) label.textContent = `${valCm.toFixed(0)} cm (${valIn} in)`;
      this.manager.setViewingDistance(valCm / 100);
    });

    this.wireframeHud.querySelector('#wireframe-hud-lock-btn')?.addEventListener('click', () => {
      this.lockWireframeAlignment();
    });

    this.wireframeHud.querySelector('#wireframe-hud-exit-btn')?.addEventListener('click', () => {
      this.exitWireframeAlignment();
    });
  }

  private startWireframeAlignment(): void {
    this.isWireframeActive = true;
    this.overlay.style.display = 'none';
    this.stopBiometricPolling();

    // Update slider in HUD to current viewing distance
    const data = this.manager.getData();
    const cm = data.viewingDistance * 100;
    const inches = data.viewingDistance * 39.3701;
    const slider = this.wireframeHud.querySelector('#wireframe-hud-slider') as HTMLInputElement;
    const label = this.wireframeHud.querySelector('#wireframe-hud-val');
    if (slider) slider.value = cm.toFixed(0);
    if (label) label.textContent = `${cm.toFixed(0)} cm (${inches.toFixed(1)} in)`;

    this.wireframeHud.style.display = 'flex';
    this.callbacks.onWireframeModeToggle?.(true);
  }

  private lockWireframeAlignment(): void {
    const slider = this.wireframeHud.querySelector('#wireframe-hud-slider') as HTMLInputElement;
    if (slider) {
      const cm = parseFloat(slider.value);
      this.manager.setViewingDistance(cm / 100);
    }
    this.exitWireframeAlignment(true);
  }

  private exitWireframeAlignment(showConfirmation: boolean = false): void {
    this.isWireframeActive = false;
    this.wireframeHud.style.display = 'none';
    this.callbacks.onWireframeModeToggle?.(false);

    // Reopen calibration modal
    this.overlay.style.display = 'flex';
    this.render();
    if (showConfirmation) {
      const feedback = this.overlay.querySelector('#wireframe-feedback');
      if (feedback) feedback.textContent = '✓ Viewing distance calibrated & locked successfully!';
    }
  }

  private render(): void {
    const data = this.manager.getData();
    const cm = (data.viewingDistance * 100).toFixed(0);
    const inches = (data.viewingDistance * 39.3701).toFixed(1);

    this.overlay.innerHTML = `
      <div class="calibration-modal">
        <div class="modal-header">
          <h2>Display & Viewer Calibration</h2>
          <button class="close-btn" id="calib-close-btn">&times;</button>
        </div>
        <div class="modal-body">
          <!-- Step 1: Center Position -->
          <section class="calib-step">
            <h3>Step 1 — Neutral Center Position</h3>
            <p>Sit comfortably centered in front of your display and look directly at the center of the screen.</p>
            <button class="btn btn-primary" id="calib-set-center-btn">Set Current Position as Center</button>
            <div class="status-note" id="calib-center-feedback">
              ${data.isCalibrated ? '✓ Calibrated center saved' : 'Origin: Default center (0, 0)'}
            </div>
          </section>

          <!-- Step 2: Dual-Method Viewing Distance -->
          <section class="calib-step">
            <h3>Step 2 — Viewing Distance</h3>
            <p>Choose your preferred calibration method to establish viewer depth:</p>

            <div class="calib-tabs">
              <button class="calib-tab-btn ${this.activeDistanceTab === 'wireframe' ? 'active' : ''}" data-tab="wireframe">
                📐 Wireframe Alignment
              </button>
              <button class="calib-tab-btn ${this.activeDistanceTab === 'biometric' ? 'active' : ''}" data-tab="biometric">
                👁️ Biometric Auto-Detect
              </button>
              <button class="calib-tab-btn ${this.activeDistanceTab === 'manual' ? 'active' : ''}" data-tab="manual">
                📏 Manual Slider
              </button>
            </div>

            <!-- Tab 1: Wireframe Alignment (Approach A) -->
            <div class="calib-tab-content ${this.activeDistanceTab === 'wireframe' ? 'active' : ''}" id="tab-content-wireframe">
              <div class="wireframe-launcher-card">
                <p style="margin-bottom: 10px;">
                  Aligns a 3D wireframe box with corner guide brackets using live head-coupled perspective.
                </p>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                  <span style="font-size: 0.8rem; color: var(--text-secondary);">Current Distance:</span>
                  <strong style="color: var(--accent-cyan); font-family: var(--font-mono);">${cm} cm (${inches} in)</strong>
                </div>
                <button class="btn btn-primary" id="btn-start-wireframe" style="width: 100%;">
                  Launch Wireframe Alignment Mode
                </button>
                <div class="status-note" id="wireframe-feedback"></div>
              </div>
            </div>

            <!-- Tab 2: Biometric Auto-Detect (Approach C) -->
            <div class="calib-tab-content ${this.activeDistanceTab === 'biometric' ? 'active' : ''}" id="tab-content-biometric">
              <div class="biometric-readout-card">
                <div class="biometric-status">
                  <span class="status-dot" id="bio-dot"></span>
                  <span id="bio-status-text">Detecting face landmarks...</span>
                </div>
                <div class="biometric-distance-display" id="bio-dist-val">-- cm (-- in)</div>
                <button class="btn btn-primary" id="bio-lock-btn" style="width: 100%;" disabled>
                  Lock Detected Distance
                </button>
                <div style="margin-top: 10px;">
                  <label class="checkbox-row">
                    <input type="checkbox" id="bio-continuous-toggle" ${data.continuousDepthTracking ? 'checked' : ''} />
                    <span>Continuous Auto-Depth (dynamically updates depth as you lean)</span>
                  </label>
                </div>
                <div class="status-note" id="bio-feedback"></div>
              </div>
            </div>

            <!-- Tab 3: Manual Slider -->
            <div class="calib-tab-content ${this.activeDistanceTab === 'manual' ? 'active' : ''}" id="tab-content-manual">
              <div class="input-row">
                <label for="calib-dist-slider">Distance: <span id="calib-dist-val">${cm} cm (${inches} in)</span></label>
                <input type="range" id="calib-dist-slider" min="30" max="120" step="1" value="${cm}" />
              </div>
            </div>
          </section>

          <!-- Step 3: Screen Dimensions -->
          <section class="calib-step">
            <h3>Step 3 — Screen Dimensions</h3>
            <p>Monitor diagonal size:</p>
            <div class="input-row">
              <label for="calib-diag-select">Monitor Size:</label>
              <select id="calib-diag-select">
                <option value="14" ${data.screenDiagonalInches === 14 ? 'selected' : ''}>14" Laptop</option>
                <option value="16" ${data.screenDiagonalInches === 16 ? 'selected' : ''}>16" Laptop</option>
                <option value="21.5" ${data.screenDiagonalInches === 21.5 ? 'selected' : ''}>21.5" Desktop</option>
                <option value="24" ${data.screenDiagonalInches === 24 ? 'selected' : ''}>24" Standard Desktop</option>
                <option value="27" ${data.screenDiagonalInches === 27 ? 'selected' : ''}>27" Standard Desktop</option>
                <option value="32" ${data.screenDiagonalInches === 32 ? 'selected' : ''}>32" Large Display</option>
              </select>
            </div>
            <div class="screen-metric-readout">
              Physical Window: ${(data.screenWidth * 100).toFixed(1)} cm × ${(data.screenHeight * 100).toFixed(1)} cm (${(data.screenWidth * 39.3701).toFixed(1)}" × ${(data.screenHeight * 39.3701).toFixed(1)}")
            </div>
          </section>

          <!-- Step 4: Sensitivity Tuning -->
          <section class="calib-step">
            <h3>Step 4 — Sensitivity Tuning</h3>
            <div class="input-row">
              <label>Horizontal (X): <span id="sens-x-val">${data.sensitivity.x.toFixed(1)}x</span></label>
              <input type="range" id="sens-x-slider" min="0.3" max="2.5" step="0.1" value="${data.sensitivity.x}" />
            </div>
            <div class="input-row">
              <label>Vertical (Y): <span id="sens-y-val">${data.sensitivity.y.toFixed(1)}x</span></label>
              <input type="range" id="sens-y-slider" min="0.3" max="2.5" step="0.1" value="${data.sensitivity.y}" />
            </div>
            <div class="input-row">
              <label>Depth (Z): <span id="sens-z-val">${data.sensitivity.z.toFixed(1)}x</span></label>
              <input type="range" id="sens-z-slider" min="0.3" max="2.5" step="0.1" value="${data.sensitivity.z}" />
            </div>
            <div style="margin-top: 14px;">
              <label class="checkbox-row">
                <input type="checkbox" id="calib-invert-x" ${data.invertHorizontal ? 'checked' : ''} />
                <span>Invert Horizontal Tracking Direction</span>
              </label>
            </div>
          </section>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="calib-reset-btn">Reset Defaults</button>
          <button class="btn btn-primary" id="calib-done-btn">Done</button>
        </div>
      </div>
    `;

    // Bind event listeners
    this.overlay.querySelector('#calib-close-btn')?.addEventListener('click', () => this.close());
    this.overlay.querySelector('#calib-done-btn')?.addEventListener('click', () => this.close());

    // Tabs
    const tabBtns = this.overlay.querySelectorAll('.calib-tab-btn');
    tabBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const targetTab = (e.currentTarget as HTMLElement).getAttribute('data-tab') as DistanceCalibrationMode;
        if (targetTab) {
          this.activeDistanceTab = targetTab;
          this.manager.setDistanceMode(targetTab);
          this.render();
          if (targetTab === 'biometric') {
            this.startBiometricPolling();
          }
        }
      });
    });

    // Wireframe Alignment launcher
    this.overlay.querySelector('#btn-start-wireframe')?.addEventListener('click', () => {
      this.startWireframeAlignment();
    });

    // Biometric lock button
    this.overlay.querySelector('#bio-lock-btn')?.addEventListener('click', () => {
      if (this.latestBiometricResult && this.latestBiometricResult.confidence > 0.4) {
        this.manager.setViewingDistance(this.latestBiometricResult.distanceMeters);
        const feedback = this.overlay.querySelector('#bio-feedback');
        const cmVal = (this.latestBiometricResult.distanceMeters * 100).toFixed(0);
        const inVal = (this.latestBiometricResult.distanceMeters * 39.3701).toFixed(1);
        if (feedback) feedback.textContent = `✓ Biometric distance locked: ${cmVal} cm (${inVal} in)`;
      }
    });

    // Continuous depth tracking toggle
    const contToggle = this.overlay.querySelector('#bio-continuous-toggle') as HTMLInputElement;
    contToggle?.addEventListener('change', (e) => {
      this.manager.setContinuousDepthTracking((e.target as HTMLInputElement).checked);
    });

    // Center button
    this.overlay.querySelector('#calib-set-center-btn')?.addEventListener('click', () => {
      const raw = this.callbacks.getCurrentRawPose();
      if (raw) {
        this.manager.setNeutralOrigin(raw.x, raw.y, raw.z);
        const feedback = this.overlay.querySelector('#calib-center-feedback');
        if (feedback) feedback.textContent = '✓ Neutral center calibrated successfully!';
      } else {
        this.manager.setNeutralOrigin(0, 0, this.manager.getData().viewingDistance);
        const feedback = this.overlay.querySelector('#calib-center-feedback');
        if (feedback) feedback.textContent = '✓ Default center (0, 0) set';
      }
    });

    // Distance manual slider
    const distSlider = this.overlay.querySelector('#calib-dist-slider') as HTMLInputElement;
    const distVal = this.overlay.querySelector('#calib-dist-val');
    distSlider?.addEventListener('input', (e) => {
      const cmVal = parseFloat((e.target as HTMLInputElement).value);
      const inVal = (cmVal / 2.54).toFixed(1);
      if (distVal) distVal.textContent = `${cmVal.toFixed(0)} cm (${inVal} in)`;
      this.manager.setViewingDistance(cmVal / 100);
    });

    // Screen size select
    const diagSelect = this.overlay.querySelector('#calib-diag-select') as HTMLSelectElement;
    diagSelect?.addEventListener('change', (e) => {
      const diag = parseFloat((e.target as HTMLSelectElement).value);
      this.manager.setScreenDiagonal(diag);
      this.render();
    });

    // Sensitivity sliders
    const setupSens = (id: string, labelId: string, axis: 'x' | 'y' | 'z') => {
      const slider = this.overlay.querySelector(`#${id}`) as HTMLInputElement;
      const label = this.overlay.querySelector(`#${labelId}`);
      slider?.addEventListener('input', (e) => {
        const val = parseFloat((e.target as HTMLInputElement).value);
        if (label) label.textContent = `${val.toFixed(1)}x`;
        const sens = this.manager.getData().sensitivity;
        sens[axis] = val;
        this.manager.setSensitivity(sens.x, sens.y, sens.z);
      });
    };
    setupSens('sens-x-slider', 'sens-x-val', 'x');
    setupSens('sens-y-slider', 'sens-y-val', 'y');
    setupSens('sens-z-slider', 'sens-z-val', 'z');

    // Invert horizontal tracking toggle
    const invertXToggle = this.overlay.querySelector('#calib-invert-x') as HTMLInputElement;
    invertXToggle?.addEventListener('change', (e) => {
      this.manager.setInvertHorizontal((e.target as HTMLInputElement).checked);
    });

    // Reset button
    this.overlay.querySelector('#calib-reset-btn')?.addEventListener('click', () => {
      this.manager.resetToDefaults();
      this.activeDistanceTab = this.manager.getData().distanceMode ?? 'wireframe';
      this.render();
    });
  }
}
