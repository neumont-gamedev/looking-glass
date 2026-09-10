/**
 * WireframeCalibrationView.ts
 *
 * 3D visual calibration helper for off-axis perspective alignment (Approach A).
 * Renders:
 *  1. Physical screen-plane target frame & corner brackets at Z=0 (golden amber, fixed to screen glass).
 *  2. A vibrant 3D emerald green wireframe box & semi-transparent back panel at Z = -0.25m.
 *  3. Perspective tunnel lines connecting screen corners to the 3D box.
 *  4. Real-time alignment feedback (turns neon green when aligned).
 */

import * as THREE from 'three';
import { ScreenGeometry } from '../math/ScreenGeometry';

export interface AlignmentCheckResult {
  isAligned: boolean;
  message: string;
}

export class WireframeCalibrationView {
  public readonly group: THREE.Group;

  private screenGeometry: ScreenGeometry;
  private isVisible: boolean = false;
  private currentViewingDistance: number = 0.65;
  private readonly referenceDepth: number = 0.25; // 25cm behind the screen glass
  private readonly screenScale: number = 0.72; // Occupies 72% of screen to stay clearly visible inside borders

  // Geometry sub-components
  private screenTargetFrame: THREE.LineLoop;
  private cornerBrackets: THREE.LineSegments;
  private centerCrosshair: THREE.LineSegments;

  private boxWireframe: THREE.LineLoop;
  private boxBackPanel: THREE.Mesh;
  private tunnelLines: THREE.LineSegments;
  private depthRings: THREE.Group;

  // Materials
  private targetMaterial: THREE.LineBasicMaterial;
  private greenWireMaterial: THREE.LineBasicMaterial;
  private neonGreenMaterial: THREE.LineBasicMaterial;
  private panelMaterial: THREE.MeshBasicMaterial;

  constructor(screen: ScreenGeometry, initialViewingDistance: number = 0.65) {
    this.screenGeometry = screen;
    this.currentViewingDistance = initialViewingDistance;

    this.group = new THREE.Group();
    this.group.name = 'WireframeCalibration';
    this.group.visible = false;
    this.group.renderOrder = 9999; // Always render on top of scene elements

    // Materials - All set to depthTest: false and fog: false so they are never hidden or washed out
    this.targetMaterial = new THREE.LineBasicMaterial({
      color: 0xffb703, // Amber / Gold target frame on screen glass (Z=0)
      linewidth: 2,
      depthTest: false,
      depthWrite: false,
      fog: false,
      transparent: true,
      opacity: 0.9
    });

    this.greenWireMaterial = new THREE.LineBasicMaterial({
      color: 0x10b981, // Vibrant emerald green for 3D box
      linewidth: 2,
      depthTest: false,
      depthWrite: false,
      fog: false,
      transparent: true,
      opacity: 0.95
    });

    this.neonGreenMaterial = new THREE.LineBasicMaterial({
      color: 0x00ff66, // Hyper-bright neon green when aligned
      linewidth: 3,
      depthTest: false,
      depthWrite: false,
      fog: false,
      transparent: true,
      opacity: 1.0
    });

    this.panelMaterial = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.14,
      depthTest: false,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide
    });

    // Sub-objects
    this.screenTargetFrame = new THREE.LineLoop(new THREE.BufferGeometry(), this.targetMaterial);
    this.screenTargetFrame.renderOrder = 9999;

    this.cornerBrackets = new THREE.LineSegments(new THREE.BufferGeometry(), this.targetMaterial);
    this.cornerBrackets.renderOrder = 9999;

    this.centerCrosshair = new THREE.LineSegments(new THREE.BufferGeometry(), this.targetMaterial);
    this.centerCrosshair.renderOrder = 9999;

    this.boxWireframe = new THREE.LineLoop(new THREE.BufferGeometry(), this.greenWireMaterial);
    this.boxWireframe.renderOrder = 9999;

    this.boxBackPanel = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.panelMaterial);
    this.boxBackPanel.renderOrder = 9998;

    this.tunnelLines = new THREE.LineSegments(new THREE.BufferGeometry(), this.greenWireMaterial);
    this.tunnelLines.renderOrder = 9999;

    this.depthRings = new THREE.Group();
    this.depthRings.renderOrder = 9999;

    this.group.add(this.screenTargetFrame);
    this.group.add(this.cornerBrackets);
    this.group.add(this.centerCrosshair);
    this.group.add(this.boxBackPanel);
    this.group.add(this.boxWireframe);
    this.group.add(this.tunnelLines);
    this.group.add(this.depthRings);

    this.buildGeometries();
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
    this.buildGeometries();
  }

  public updateViewingDistance(distanceMeters: number): void {
    this.currentViewingDistance = Math.max(0.25, Math.min(1.5, distanceMeters));
    this.buildGeometries();
  }

  private buildGeometries(): void {
    const W = this.screenGeometry.width;
    const H = this.screenGeometry.height;

    // Target frame dimensions on the screen glass (Z = 0)
    // Sized to 72% of the screen so it is comfortably visible on all monitors
    const targetHalfW = (W * this.screenScale) / 2;
    const targetHalfH = (H * this.screenScale) / 2;

    // 1. Screen Target Frame at Z = 0
    const targetPositions = [
      -targetHalfW, -targetHalfH, 0,
       targetHalfW, -targetHalfH, 0,
       targetHalfW,  targetHalfH, 0,
      -targetHalfW,  targetHalfH, 0
    ];
    this.screenTargetFrame.geometry.dispose();
    this.screenTargetFrame.geometry = new THREE.BufferGeometry();
    this.screenTargetFrame.geometry.setAttribute('position', new THREE.Float32BufferAttribute(targetPositions, 3));

    // 2. Target Corner Brackets & Crosshair at Z = 0
    const bracketLen = Math.min(targetHalfW, targetHalfH) * 0.22;
    const bracketPositions = [
      // Top-Left
      -targetHalfW, targetHalfH, 0,  -targetHalfW + bracketLen, targetHalfH, 0,
      -targetHalfW, targetHalfH, 0,  -targetHalfW, targetHalfH - bracketLen, 0,
      // Top-Right
      targetHalfW, targetHalfH, 0,   targetHalfW - bracketLen, targetHalfH, 0,
      targetHalfW, targetHalfH, 0,   targetHalfW, targetHalfH - bracketLen, 0,
      // Bottom-Left
      -targetHalfW, -targetHalfH, 0, -targetHalfW + bracketLen, -targetHalfH, 0,
      -targetHalfW, -targetHalfH, 0, -targetHalfW, -targetHalfH + bracketLen, 0,
      // Bottom-Right
      targetHalfW, -targetHalfH, 0,  targetHalfW - bracketLen, -targetHalfH, 0,
      targetHalfW, -targetHalfH, 0,  targetHalfW, -targetHalfH + bracketLen, 0
    ];
    this.cornerBrackets.geometry.dispose();
    this.cornerBrackets.geometry = new THREE.BufferGeometry();
    this.cornerBrackets.geometry.setAttribute('position', new THREE.Float32BufferAttribute(bracketPositions, 3));

    // Center Crosshair
    const crossSize = Math.min(targetHalfW, targetHalfH) * 0.10;
    const crossPositions = [
      -crossSize, 0, 0, crossSize, 0, 0,
      0, -crossSize, 0, 0, crossSize, 0
    ];
    this.centerCrosshair.geometry.dispose();
    this.centerCrosshair.geometry = new THREE.BufferGeometry();
    this.centerCrosshair.geometry.setAttribute('position', new THREE.Float32BufferAttribute(crossPositions, 3));

    // 3. 3D Green Wireframe Box at Depth Z = -this.referenceDepth
    // Geometrically calculated so that from the chosen viewing distance,
    // lines of sight through the target frame corners pass through the 3D box corners!
    const dist = this.currentViewingDistance;
    const scaleFactor = (dist + this.referenceDepth) / dist;
    const boxHalfW = targetHalfW * scaleFactor;
    const boxHalfH = targetHalfH * scaleFactor;
    const boxZ = -this.referenceDepth;

    // Green Box Wireframe
    const boxPositions = [
      -boxHalfW, -boxHalfH, boxZ,
       boxHalfW, -boxHalfH, boxZ,
       boxHalfW,  boxHalfH, boxZ,
      -boxHalfW,  boxHalfH, boxZ
    ];
    this.boxWireframe.geometry.dispose();
    this.boxWireframe.geometry = new THREE.BufferGeometry();
    this.boxWireframe.geometry.setAttribute('position', new THREE.Float32BufferAttribute(boxPositions, 3));

    // Glowing Semi-transparent Back Panel
    this.boxBackPanel.geometry.dispose();
    this.boxBackPanel.geometry = new THREE.PlaneGeometry(boxHalfW * 2, boxHalfH * 2);
    this.boxBackPanel.position.set(0, 0, boxZ);

    // 4. Perspective Tunnel Connecting Lines (Screen Frame Corner -> 3D Box Corner)
    const tunnelPositions = [
      -targetHalfW, -targetHalfH, 0,  -boxHalfW, -boxHalfH, boxZ,
       targetHalfW, -targetHalfH, 0,   boxHalfW, -boxHalfH, boxZ,
       targetHalfW,  targetHalfH, 0,   boxHalfW,  boxHalfH, boxZ,
      -targetHalfW,  targetHalfH, 0,  -boxHalfW,  boxHalfH, boxZ
    ];
    this.tunnelLines.geometry.dispose();
    this.tunnelLines.geometry = new THREE.BufferGeometry();
    this.tunnelLines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(tunnelPositions, 3));

    // 5. Intermediate Depth Rings (at 10cm and 18cm)
    while (this.depthRings.children.length > 0) {
      const child = this.depthRings.children[0] as THREE.LineLoop;
      child.geometry.dispose();
      this.depthRings.remove(child);
    }

    const ringDepths = [0.08, 0.16];
    for (const d of ringDepths) {
      const ringScale = (dist + d) / dist;
      const rw = targetHalfW * ringScale;
      const rh = targetHalfH * ringScale;
      const rz = -d;

      const ringPositions = [
        -rw, -rh, rz,
         rw, -rh, rz,
         rw,  rh, rz,
        -rw,  rh, rz
      ];
      const ringGeom = new THREE.BufferGeometry();
      ringGeom.setAttribute('position', new THREE.Float32BufferAttribute(ringPositions, 3));

      const ringMat = new THREE.LineBasicMaterial({
        color: 0x10b981,
        depthTest: false,
        depthWrite: false,
        fog: false,
        transparent: true,
        opacity: 0.35
      });
      const ringLine = new THREE.LineLoop(ringGeom, ringMat);
      ringLine.renderOrder = 9999;
      this.depthRings.add(ringLine);
    }
  }

  /**
   * Checks whether the current eye position aligns with the target frame.
   */
  public checkAlignment(eyeX: number, eyeY: number, eyeZ: number): AlignmentCheckResult {
    const deltaZ = eyeZ - this.currentViewingDistance;
    const lateralDist = Math.hypot(eyeX, eyeY);

    const isDistAligned = Math.abs(deltaZ) < 0.05; // Within 5cm
    const isCenterAligned = lateralDist < 0.045;   // Within 4.5cm of screen center

    if (isDistAligned && isCenterAligned) {
      this.setAlignmentStatus(true);
      return { isAligned: true, message: '✓ PERFECTLY ALIGNED! Press Space to Lock' };
    }

    this.setAlignmentStatus(false);

    if (!isCenterAligned) {
      if (eyeX < -0.04) return { isAligned: false, message: 'Move head slightly RIGHT to center' };
      if (eyeX > 0.04) return { isAligned: false, message: 'Move head slightly LEFT to center' };
      if (eyeY < -0.04) return { isAligned: false, message: 'Move head slightly UP' };
      if (eyeY > 0.04) return { isAligned: false, message: 'Move head slightly DOWN' };
    }

    if (deltaZ > 0.05) {
      return { isAligned: false, message: 'Lean slightly CLOSER (or increase distance slider)' };
    } else {
      return { isAligned: false, message: 'Lean slightly BACK (or decrease distance slider)' };
    }
  }

  /**
   * Switches colors when alignment is locked in.
   */
  public setAlignmentStatus(isAligned: boolean): void {
    const wireMat = isAligned ? this.neonGreenMaterial : this.greenWireMaterial;
    this.boxWireframe.material = wireMat;
    this.tunnelLines.material = wireMat;
    this.panelMaterial.color.setHex(isAligned ? 0x00ff66 : 0x10b981);
    this.panelMaterial.opacity = isAligned ? 0.25 : 0.14;
  }

  public dispose(): void {
    this.screenTargetFrame.geometry.dispose();
    this.cornerBrackets.geometry.dispose();
    this.centerCrosshair.geometry.dispose();
    this.boxWireframe.geometry.dispose();
    this.boxBackPanel.geometry.dispose();
    this.tunnelLines.geometry.dispose();

    this.targetMaterial.dispose();
    this.greenWireMaterial.dispose();
    this.neonGreenMaterial.dispose();
    this.panelMaterial.dispose();
  }
}
