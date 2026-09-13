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
  private onOpenCb: (() => void) | null = null;

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

  public setOnOpenCallback(cb: () => void): void {
    this.onOpenCb = cb;
  }

  public open(): void {
    if (this.onOpenCb) {
      this.onOpenCb();
    }
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
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  public getIsOpen(): boolean {
    return this.isOpen;
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' || e.code === 'Escape') {
      if (this.isWireframeActive) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.exitWireframeAlignment();
        return;
      }
      if (this.isOpen) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.close();
        return;
      }
    }

    if (!this.isWireframeActive) return;

    if (e.code === 'Space') {
      e.preventDefault();
      this.lockWireframeAlignment();
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
        <span class="hud-instructions" id="wireframe-hud-instructions">Sit centered. Adjust distance until the 3D green box aligns with the amber corner brackets.</span>
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

  public updateWireframeFeedback(message: string, isAligned: boolean): void {
    if (!this.isWireframeActive) return;
    const inst = this.wireframeHud.querySelector('#wireframe-hud-instructions');
    if (inst) {
      inst.textContent = message;
      (inst as HTMLElement).style.color = isAligned ? '#00ff66' : '#94a3b8';
      (inst as HTMLElement).style.fontWeight = isAligned ? 'bold' : 'normal';
    }
    const lockBtn = this.wireframeHud.querySelector('#wireframe-hud-lock-btn') as HTMLElement;
    if (lockBtn) {
      if (isAligned) {
        lockBtn.style.boxShadow = '0 0 16px rgba(0, 255, 102, 0.6)';
        lockBtn.style.borderColor = '#00ff66';
      } else {
        lockBtn.style.boxShadow = 'none';
        lockBtn.style.borderColor = 'transparent';
      }
    }
  }

  private render(): void {
    const data = this.manager.getData();
    const cm = (data.viewingDistance * 100).toFixed(0);
    const inches = (data.viewingDistance * 39.3701).toFixed(1);
    const currentDiagIn = data.screenDiagonalInches ?? (Math.hypot(data.screenWidth, data.screenHeight) * 39.3701);

    this.overlay.innerHTML = `
      <div class="calibration-modal">
        <div class="modal-header">
          <h2>⚙ Calibration Controls</h2>
          <button class="close-btn" id="calib-close-btn" title="Close (Esc)">&times;</button>
        </div>
        <div class="modal-body">
          <!-- Step 1: Center Position -->
          <section class="calib-step">
            <h3>Step 1 — Neutral Center Position</h3>
            <p>Sit comfortably centered in front of your display and look directly at the center of the screen.</p>
            <div style="display: flex; gap: 8px;">
              <button class="btn btn-primary" id="calib-set-center-btn" style="flex: 1;">🎯 Set Center Position</button>
              <button class="btn btn-secondary" id="calib-reset-center-btn" style="padding: 7px 10px; font-size: 0.78rem;" title="Reset Center to (0, 0)">↺ (0, 0)</button>
            </div>
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
            <p>Physical size of the display window:</p>
            <div class="calib-preset-group">
              <div class="calib-presets-header">
                <span>Monitor Presets:</span>
              </div>
              <div class="calib-preset-buttons">
                <button type="button" class="btn-preset calib-preset-btn ${Math.abs(currentDiagIn - 14) < 0.8 ? 'active' : ''}" data-diag="14">14"</button>
                <button type="button" class="btn-preset calib-preset-btn ${Math.abs(currentDiagIn - 16) < 0.8 ? 'active' : ''}" data-diag="16">16"</button>
                <button type="button" class="btn-preset calib-preset-btn ${Math.abs(currentDiagIn - 24) < 0.8 ? 'active' : ''}" data-diag="24">24"</button>
                <button type="button" class="btn-preset calib-preset-btn ${Math.abs(currentDiagIn - 27) < 0.8 ? 'active' : ''}" data-diag="27">27"</button>
                <button type="button" class="btn-preset calib-preset-btn ${Math.abs(currentDiagIn - 32) < 0.8 ? 'active' : ''}" data-diag="32">32"</button>
              </div>
            </div>
            <div class="input-row">
              <label for="calib-width-slider">
                Width: <span id="calib-width-val">${(data.screenWidth * 100).toFixed(1)} cm (${(data.screenWidth * 39.3701).toFixed(1)} in)</span>
              </label>
              <input type="range" id="calib-width-slider" min="20" max="150" step="0.5" value="${(data.screenWidth * 100).toFixed(1)}" />
            </div>
            <div class="input-row">
              <label for="calib-height-slider">
                Height: <span id="calib-height-val">${(data.screenHeight * 100).toFixed(1)} cm (${(data.screenHeight * 39.3701).toFixed(1)} in)</span>
              </label>
              <input type="range" id="calib-height-slider" min="12" max="100" step="0.5" value="${(data.screenHeight * 100).toFixed(1)}" />
            </div>
            <div class="screen-metric-readout" id="calib-dim-readout">
              Physical Window: ${(data.screenWidth * 100).toFixed(1)} cm × ${(data.screenHeight * 100).toFixed(1)} cm (${(data.screenWidth * 39.3701).toFixed(1)}" × ${(data.screenHeight * 39.3701).toFixed(1)}")
              <br><span style="font-size: 0.72rem; color: var(--text-secondary);">Diagonal: ${(Math.hypot(data.screenWidth, data.screenHeight) * 39.3701).toFixed(1)}" • Aspect: ${(data.screenWidth / data.screenHeight).toFixed(2)}:1</span>
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

    // Center buttons
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

    this.overlay.querySelector('#calib-reset-center-btn')?.addEventListener('click', () => {
      this.manager.resetCenterOrigin();
      const feedback = this.overlay.querySelector('#calib-center-feedback');
      if (feedback) feedback.textContent = '✓ Center reset to default (0, 0)';
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

    // Screen dimensions width and height sliders
    const widthSlider = this.overlay.querySelector('#calib-width-slider') as HTMLInputElement;
    const widthVal = this.overlay.querySelector('#calib-width-val');
    const heightSlider = this.overlay.querySelector('#calib-height-slider') as HTMLInputElement;
    const heightVal = this.overlay.querySelector('#calib-height-val');
    const dimReadout = this.overlay.querySelector('#calib-dim-readout');
    const presetBtns = this.overlay.querySelectorAll('.calib-preset-btn');

    const syncPresetActiveStates = (wMeters: number, hMeters: number) => {
      const diagIn = Math.hypot(wMeters, hMeters) * 39.3701;
      presetBtns.forEach((b) => {
        const d = parseFloat(b.getAttribute('data-diag') || '0');
        b.classList.toggle('active', Math.abs(diagIn - d) < 0.8);
      });
    };

    const updateDimReadout = (wMeters: number, hMeters: number) => {
      if (dimReadout) {
        const wCm = (wMeters * 100).toFixed(1);
        const hCm = (hMeters * 100).toFixed(1);
        const wIn = (wMeters * 39.3701).toFixed(1);
        const hIn = (hMeters * 39.3701).toFixed(1);
        const diagIn = (Math.hypot(wMeters, hMeters) * 39.3701).toFixed(1);
        const aspect = (wMeters / hMeters).toFixed(2);
        dimReadout.innerHTML = `Physical Window: ${wCm} cm × ${hCm} cm (${wIn}" × ${hIn}")<br><span style="font-size: 0.72rem; color: var(--text-secondary);">Diagonal: ${diagIn}" • Aspect: ${aspect}:1</span>`;
      }
    };

    presetBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const diag = parseFloat((e.currentTarget as HTMLElement).getAttribute('data-diag') || '0');
        if (diag > 0) {
          this.manager.setMonitorPreset(diag);
          const currentData = this.manager.getData();
          if (widthSlider) widthSlider.value = (currentData.screenWidth * 100).toFixed(1);
          if (widthVal) {
            const wCm = (currentData.screenWidth * 100).toFixed(1);
            const wIn = (currentData.screenWidth * 39.3701).toFixed(1);
            widthVal.textContent = `${wCm} cm (${wIn} in)`;
          }
          if (heightSlider) heightSlider.value = (currentData.screenHeight * 100).toFixed(1);
          if (heightVal) {
            const hCm = (currentData.screenHeight * 100).toFixed(1);
            const hIn = (currentData.screenHeight * 39.3701).toFixed(1);
            heightVal.textContent = `${hCm} cm (${hIn} in)`;
          }
          updateDimReadout(currentData.screenWidth, currentData.screenHeight);
          presetBtns.forEach(b => b.classList.remove('active'));
          (e.currentTarget as HTMLElement).classList.add('active');
        }
      });
    });

    widthSlider?.addEventListener('input', (e) => {
      const valCm = parseFloat((e.target as HTMLInputElement).value);
      const valIn = (valCm * 0.393701).toFixed(1);
      if (widthVal) widthVal.textContent = `${valCm.toFixed(1)} cm (${valIn} in)`;
      const currentH = this.manager.getData().screenHeight;
      const newW = valCm / 100;
      this.manager.setScreenDimensions(newW, currentH);
      updateDimReadout(newW, currentH);
      syncPresetActiveStates(newW, currentH);
    });

    heightSlider?.addEventListener('input', (e) => {
      const valCm = parseFloat((e.target as HTMLInputElement).value);
      const valIn = (valCm * 0.393701).toFixed(1);
      if (heightVal) heightVal.textContent = `${valCm.toFixed(1)} cm (${valIn} in)`;
      const currentW = this.manager.getData().screenWidth;
      const newH = valCm / 100;
      this.manager.setScreenDimensions(currentW, newH);
      updateDimReadout(currentW, newH);
      syncPresetActiveStates(currentW, newH);
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

    // Reset button
    this.overlay.querySelector('#calib-reset-btn')?.addEventListener('click', () => {
      this.manager.resetToDefaults();
      this.activeDistanceTab = this.manager.getData().distanceMode ?? 'wireframe';
      this.render();
    });
  }
}
