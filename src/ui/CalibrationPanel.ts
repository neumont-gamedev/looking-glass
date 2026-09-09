/**
 * CalibrationPanel.ts
 *
 * Guided multi-step calibration modal dialog.
 */

import { CalibrationManager } from '../calibration/CalibrationManager';
import { ViewerPose } from '../tracking/TrackingState';

export class CalibrationPanel {
  private overlay: HTMLElement;
  private manager: CalibrationManager;
  private getCurrentRawPose: () => ViewerPose | null;
  private isOpen: boolean = false;

  constructor(manager: CalibrationManager, getCurrentRawPose: () => ViewerPose | null) {
    this.manager = manager;
    this.getCurrentRawPose = getCurrentRawPose;

    this.overlay = document.createElement('div');
    this.overlay.className = 'calibration-modal-overlay';
    this.overlay.style.display = 'none';

    this.render();
    document.body.appendChild(this.overlay);
  }

  public open(): void {
    this.isOpen = true;
    this.render();
    this.overlay.style.display = 'flex';
  }

  public close(): void {
    this.isOpen = false;
    this.overlay.style.display = 'none';
  }

  public toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  private render(): void {
    const data = this.manager.getData();

    this.overlay.innerHTML = `
      <div class="calibration-modal">
        <div class="modal-header">
          <h2>Display & Viewer Calibration</h2>
          <button class="close-btn" id="calib-close-btn">&times;</button>
        </div>
        <div class="modal-body">
          <section class="calib-step">
            <h3>Step 1 — Neutral Center Position</h3>
            <p>Sit comfortably centered in front of your display and look directly at the center of the screen.</p>
            <button class="btn btn-primary" id="calib-set-center-btn">Set Current Position as Center</button>
            <div class="status-note" id="calib-center-feedback">
              ${data.isCalibrated ? '✓ Calibrated center saved' : 'Origin: Default center (0, 0)'}
            </div>
          </section>

          <section class="calib-step">
            <h3>Step 2 — Viewing Distance</h3>
            <p>Approximate distance between your eyes and the physical monitor screen:</p>
            <div class="input-row">
              <label for="calib-dist-slider">Distance: <span id="calib-dist-val">${(data.viewingDistance * 100).toFixed(0)}</span> cm</label>
              <input type="range" id="calib-dist-slider" min="30" max="120" step="1" value="${(data.viewingDistance * 100).toFixed(0)}" />
            </div>
          </section>

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
              Physical Window: ${(data.screenWidth * 100).toFixed(1)} cm × ${(data.screenHeight * 100).toFixed(1)} cm
            </div>
          </section>

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

    // Center button
    this.overlay.querySelector('#calib-set-center-btn')?.addEventListener('click', () => {
      const raw = this.getCurrentRawPose();
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

    // Distance slider
    const distSlider = this.overlay.querySelector('#calib-dist-slider') as HTMLInputElement;
    const distVal = this.overlay.querySelector('#calib-dist-val');
    distSlider?.addEventListener('input', (e) => {
      const cm = parseFloat((e.target as HTMLInputElement).value);
      if (distVal) distVal.textContent = cm.toFixed(0);
      this.manager.setViewingDistance(cm / 100);
    });

    // Screen size select
    const diagSelect = this.overlay.querySelector('#calib-diag-select') as HTMLSelectElement;
    diagSelect?.addEventListener('change', (e) => {
      const diag = parseFloat((e.target as HTMLSelectElement).value);
      this.manager.setScreenDiagonal(diag);
      this.render(); // Re-render to update metric readout
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
      this.render();
    });
  }
}

