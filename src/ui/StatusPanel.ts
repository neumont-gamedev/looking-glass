/**
 * StatusPanel.ts
 *
 * Minimal HUD indicator displaying tracking status with color dot and helper text.
 */

import { TrackingStatus } from '../tracking/TrackingState';

export class StatusPanel {
  private element: HTMLElement;
  private dot: HTMLElement;
  private text: HTMLElement;

  constructor(parent: HTMLElement = document.body) {
    this.element = document.createElement('div');
    this.element.className = 'hud-status-panel';

    this.dot = document.createElement('span');
    this.dot.className = 'status-dot';

    this.text = document.createElement('span');
    this.text.className = 'status-text';
    this.text.textContent = 'Initializing...';

    this.element.appendChild(this.dot);
    this.element.appendChild(this.text);
    parent.appendChild(this.element);

    this.setStatus(TrackingStatus.Initializing);
  }

  public setStatus(status: TrackingStatus, customMessage?: string): void {
    this.element.className = 'hud-status-panel';

    switch (status) {
      case TrackingStatus.Active:
        this.element.classList.add('status-active');
        this.text.textContent = customMessage ?? 'Tracking Active';
        break;
      case TrackingStatus.LowConfidence:
        this.element.classList.add('status-warning');
        this.text.textContent = customMessage ?? 'Low Confidence (check lighting)';
        break;
      case TrackingStatus.FaceLost:
        this.element.classList.add('status-warning');
        this.text.textContent = customMessage ?? 'Face Lost (move into view)';
        break;
      case TrackingStatus.CameraDenied:
        this.element.classList.add('status-error');
        this.text.textContent = customMessage ?? 'Camera Denied (using mouse fallback)';
        break;
      case TrackingStatus.Error:
        this.element.classList.add('status-error');
        this.text.textContent = customMessage ?? 'Tracking Error';
        break;
      case TrackingStatus.FallbackMouse:
        this.element.classList.add('status-mouse');
        this.text.textContent = customMessage ?? 'Mouse Control Mode';
        break;
      case TrackingStatus.FallbackAuto:
        this.element.classList.add('status-auto');
        this.text.textContent = customMessage ?? 'Auto Demo Mode';
        break;
      case TrackingStatus.CameraOff:
        this.element.classList.add('status-warning');
        this.text.textContent = customMessage ?? 'Camera Off';
        break;
      case TrackingStatus.Initializing:
      default:
        this.element.classList.add('status-init');
        this.text.textContent = customMessage ?? 'Initializing...';
        break;
    }
  }
}

