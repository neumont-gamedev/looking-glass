/**
 * CalibrationPanel.ts
 *
 * Manages full-screen interactive wireframe perspective alignment:
 * - 3D wireframe box & corner guide brackets HUD
 * - Real-time alignment feedback & distance locking
 */

import { CalibrationManager } from '../calibration/CalibrationManager';
import { ViewerPose } from '../tracking/TrackingState';
import { BiometricDistanceResult } from '../tracking/HeadPoseEstimator';

export interface CalibrationPanelCallbacks {
  getCurrentRawPose: () => ViewerPose | null;
  getBiometricDistance?: () => BiometricDistanceResult | null;
  onWireframeModeToggle?: (active: boolean) => void;
}

export class CalibrationPanel {
  private wireframeHud: HTMLElement;
  private manager: CalibrationManager;
  private callbacks: CalibrationPanelCallbacks;
  private isWireframeActive: boolean = false;
  private onWireframeComplete: ((lockedDistMeters: number) => void) | null = null;
  private onOpenDrawerCb: (() => void) | null = null;

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

    // Full-screen Wireframe Alignment HUD overlay
    this.wireframeHud = document.createElement('div');
    this.wireframeHud.className = 'wireframe-align-hud';
    this.wireframeHud.style.display = 'none';

    this.buildWireframeHud();
    document.body.appendChild(this.wireframeHud);

    window.addEventListener('keydown', this.handleKeyDown);
  }

  public setOnOpenCallback(cb: () => void): void {
    this.onOpenDrawerCb = cb;
  }

  public open(): void {
    if (this.onOpenDrawerCb) {
      this.onOpenDrawerCb();
    }
  }

  public close(): void {
    if (this.isWireframeActive) {
      this.exitWireframeAlignment();
    }
  }

  public toggle(): void {
    if (this.onOpenDrawerCb) {
      this.onOpenDrawerCb();
    }
  }

  public getIsOpen(): boolean {
    return this.isWireframeActive;
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (!this.isWireframeActive) return;

    if (e.key === 'Escape' || e.code === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.exitWireframeAlignment();
      return;
    }

    if (e.code === 'Space') {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.lockWireframeAlignment();
    }
  };

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

  public startWireframeAlignment(onComplete?: (lockedDistMeters: number) => void): void {
    this.isWireframeActive = true;
    this.onWireframeComplete = onComplete ?? null;

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

  public lockWireframeAlignment(): void {
    const slider = this.wireframeHud.querySelector('#wireframe-hud-slider') as HTMLInputElement;
    if (slider) {
      const cm = parseFloat(slider.value);
      this.manager.setViewingDistance(cm / 100);
    }
    this.exitWireframeAlignment();
  }

  public exitWireframeAlignment(): void {
    this.isWireframeActive = false;
    this.wireframeHud.style.display = 'none';
    this.callbacks.onWireframeModeToggle?.(false);

    if (this.onWireframeComplete) {
      const cb = this.onWireframeComplete;
      this.onWireframeComplete = null;
      cb(this.manager.getData().viewingDistance);
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
}
