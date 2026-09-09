/**
 * WireframeCalibrationView.ts
 *
 * 3D visual calibration helper for off-axis perspective alignment (Approach A).
 * Renders:
 *  1. Physical screen-plane corner brackets at Z=0 (invariant under perspective).
 *  2. A 3D receding wireframe box / depth tunnel at Z = -0.30m.
 *  3. Dynamic depth grid and distance indicators with alignment feedback.
 */

import * as THREE from 'three';
import { ScreenGeometry } from '../math/ScreenGeometry';

export class WireframeCalibrationView {
  public readonly group: THREE.Group;

  private screenGeometry: ScreenGeometry;
  private isVisible: boolean = false;

  private cornerBrackets: THREE.LineSegments;
  private tunnelLines: THREE.LineSegments;
  private backRectangle: THREE.LineLoop;
  private depthRings: THREE.Group;
  private centerCrosshair: THREE.LineSegments;

  private activeMaterial: THREE.LineBasicMaterial;
  private guideMaterial: THREE.LineBasicMaterial;
  private alignedMaterial: THREE.LineBasicMaterial;

  private referenceDepth: number = 0.30; // 30cm behind the screen glass

  constructor(screen: ScreenGeometry) {
    this.screenGeometry = screen;
    this.group = new THREE.Group();
    this.group.name = 'WireframeCalibration';
    this.group.visible = false;

    // Materials
    this.activeMaterial = new THREE.LineBasicMaterial({
      color: 0x00e5ff,
      linewidth: 2,
      transparent: true,
      opacity: 0.85
    });

    this.guideMaterial = new THREE.LineBasicMaterial({
      color: 0xffb703,
      linewidth: 2,
      transparent: true,
      opacity: 0.9
    });

    this.alignedMaterial = new THREE.LineBasicMaterial({
      color: 0x10b981, // Emerald green on alignment
      linewidth: 3,
      transparent: true,
      opacity: 1.0
    });

    // Create sub-components
    this.cornerBrackets = new THREE.LineSegments(new THREE.BufferGeometry(), this.guideMaterial);
    this.tunnelLines = new THREE.LineSegments(new THREE.BufferGeometry(), this.activeMaterial);
    this.backRectangle = new THREE.LineLoop(new THREE.BufferGeometry(), this.activeMaterial);
    this.centerCrosshair = new THREE.LineSegments(new THREE.BufferGeometry(), this.guideMaterial);
    this.depthRings = new THREE.Group();

    this.group.add(this.cornerBrackets);
    this.group.add(this.tunnelLines);
    this.group.add(this.backRectangle);
    this.group.add(this.centerCrosshair);
    this.group.add(this.depthRings);

    this.rebuild(screen);
  }

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    this.group.visible = visible;
  }

  public getVisible(): boolean {
    return this.isVisible;
  }

  public getScreenGeometry(): ScreenGeometry {
    return this.screenGeometry;
  }

  public rebuild(screen: ScreenGeometry): void {
    this.screenGeometry = screen;
    const halfW = screen.width / 2;
    const halfH = screen.height / 2;
    const bracketSize = Math.min(halfW, halfH) * 0.18; // Size of corner brackets

    // 1. Corner guide brackets at Z = 0 (Physical Screen Plane)
    // In off-axis projection, objects at Z = 0 do NOT shift with head movement!
    const bracketPositions: number[] = [];
    // Top-Left corner (-halfW, +halfH, 0)
    bracketPositions.push(
      -halfW, halfH, 0,  -halfW + bracketSize, halfH, 0,
      -halfW, halfH, 0,  -halfW, halfH - bracketSize, 0
    );
    // Top-Right corner (+halfW, +halfH, 0)
    bracketPositions.push(
      halfW, halfH, 0,   halfW - bracketSize, halfH, 0,
      halfW, halfH, 0,   halfW, halfH - bracketSize, 0
    );
    // Bottom-Left corner (-halfW, -halfH, 0)
    bracketPositions.push(
      -halfW, -halfH, 0, -halfW + bracketSize, -halfH, 0,
      -halfW, -halfH, 0, -halfW, -halfH + bracketSize, 0
    );
    // Bottom-Right corner (+halfW, -halfH, 0)
    bracketPositions.push(
      halfW, -halfH, 0,  halfW - bracketSize, -halfH, 0,
      halfW, -halfH, 0,  halfW, -halfH + bracketSize, 0
    );

    this.cornerBrackets.geometry.dispose();
    this.cornerBrackets.geometry = new THREE.BufferGeometry();
    this.cornerBrackets.geometry.setAttribute('position', new THREE.Float32BufferAttribute(bracketPositions, 3));

    // 2. Center crosshair at Z = 0
    const crossSize = Math.min(halfW, halfH) * 0.08;
    const crossPositions = [
      -crossSize, 0, 0, crossSize, 0, 0,
      0, -crossSize, 0, 0, crossSize, 0
    ];
    this.centerCrosshair.geometry.dispose();
    this.centerCrosshair.geometry = new THREE.BufferGeometry();
    this.centerCrosshair.geometry.setAttribute('position', new THREE.Float32BufferAttribute(crossPositions, 3));

    // 3. Receding 3D Wireframe Box / Depth Tunnel
    // Back face is at Z = -this.referenceDepth
    // Its dimensions are designed so that from standard viewing distance (~0.60m),
    // the tunnel edges align perfectly with the screen corners!
    const standardViewDist = 0.60;
    const scaleFactor = (standardViewDist + this.referenceDepth) / standardViewDist; // ~1.5
    const backHalfW = halfW * scaleFactor;
    const backHalfH = halfH * scaleFactor;
    const backZ = -this.referenceDepth;

    // Back rectangle vertices
    const backPositions = [
      -backHalfW, -backHalfH, backZ,
       backHalfW, -backHalfH, backZ,
       backHalfW,  backHalfH, backZ,
      -backHalfW,  backHalfH, backZ
    ];
    this.backRectangle.geometry.dispose();
    this.backRectangle.geometry = new THREE.BufferGeometry();
    this.backRectangle.geometry.setAttribute('position', new THREE.Float32BufferAttribute(backPositions, 3));

    // 4 Tunnel connecting lines: (screen corner at Z=0) -> (back corner at backZ)
    const tunnelPositions = [
      -halfW, -halfH, 0,  -backHalfW, -backHalfH, backZ,
       halfW, -halfH, 0,   backHalfW, -backHalfH, backZ,
       halfW,  halfH, 0,   backHalfW,  backHalfH, backZ,
      -halfW,  halfH, 0,  -backHalfW,  backHalfH, backZ
    ];
    this.tunnelLines.geometry.dispose();
    this.tunnelLines.geometry = new THREE.BufferGeometry();
    this.tunnelLines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(tunnelPositions, 3));

    // 5. Intermediate depth rings (at 10cm and 20cm behind screen)
    while (this.depthRings.children.length > 0) {
      const child = this.depthRings.children[0] as THREE.LineLoop;
      child.geometry.dispose();
      this.depthRings.remove(child);
    }

    const ringDepths = [0.10, 0.20];
    for (const d of ringDepths) {
      const ringScale = (standardViewDist + d) / standardViewDist;
      const rw = halfW * ringScale;
      const rh = halfH * ringScale;
      const rz = -d;
      const ringGeom = new THREE.BufferGeometry();
      ringGeom.setAttribute('position', new THREE.Float32BufferAttribute([
        -rw, -rh, rz,
         rw, -rh, rz,
         rw,  rh, rz,
        -rw,  rh, rz
      ], 3));
      const ringMaterial = new THREE.LineBasicMaterial({
        color: 0x00aaff,
        transparent: true,
        opacity: 0.35
      });
      const ringLine = new THREE.LineLoop(ringGeom, ringMaterial);
      this.depthRings.add(ringLine);
    }
  }

  /**
   * Updates visual feedback based on alignment error.
   * When current viewing distance is within tolerance of alignment, switches to emerald green glow.
   */
  public setAlignmentStatus(isAligned: boolean): void {
    const mat = isAligned ? this.alignedMaterial : this.activeMaterial;
    this.tunnelLines.material = mat;
    this.backRectangle.material = mat;
  }

  public dispose(): void {
    this.cornerBrackets.geometry.dispose();
    this.tunnelLines.geometry.dispose();
    this.backRectangle.geometry.dispose();
    this.centerCrosshair.geometry.dispose();
    this.activeMaterial.dispose();
    this.guideMaterial.dispose();
    this.alignedMaterial.dispose();
  }
}
