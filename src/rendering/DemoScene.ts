/**
 * DemoScene.ts
 *
 * Provides two test environments:
 * 1. Diorama Shadow Box: A rich miniature diorama room extending behind the screen
 *    with multi-depth objects, realistic lighting, shadows, and floating particles.
 * 2. Debug Scene: Coordinate axes, depth markers, and calibration spheres.
 */

import * as THREE from 'three';
import { ScreenGeometry } from '../math/ScreenGeometry';

export enum SceneType {
  Aquarium = 'Aquarium',
  Diorama = 'Diorama',
  Debug = 'Debug'
}

export class DemoScene {
  public readonly group: THREE.Group = new THREE.Group();
  private animatedMeshes: Array<{ mesh: THREE.Object3D; update: (time: number) => void }> = [];
  private particles: THREE.Points | null = null;
  private axes: THREE.AxesHelper | null = null;
  private axesVisible: boolean = true;
  private currentSceneType: SceneType = SceneType.Diorama;

  constructor(screen: ScreenGeometry) {
    this.buildDiorama(screen);
  }

  public setAxesVisible(visible: boolean): void {
    this.axesVisible = visible;
    if (this.axes) {
      this.axes.visible = visible;
    }
  }

  public getAxesVisible(): boolean {
    return this.axesVisible;
  }

  public setSceneType(type: SceneType, screen: ScreenGeometry): void {
    if (this.currentSceneType === type) return;
    this.currentSceneType = type;

    // Clear current
    this.clear();

    if (type === SceneType.Diorama) {
      this.buildDiorama(screen);
    } else {
      this.buildDebug(screen);
    }
  }

  public rebuild(screen: ScreenGeometry): void {
    this.clear();
    if (this.currentSceneType === SceneType.Diorama) {
      this.buildDiorama(screen);
    } else {
      this.buildDebug(screen);
    }
  }

  private clear(): void {
    while (this.group.children.length > 0) {
      const child = this.group.children[0];
      this.group.remove(child);
      if ((child as THREE.Mesh).geometry) {
        (child as THREE.Mesh).geometry.dispose();
      }
      const mat = (child as any).material;
      if (mat) {
        if (Array.isArray(mat)) {
          mat.forEach((m) => {
            if (m.map) m.map.dispose();
            m.dispose();
          });
        } else {
          if (mat.map) mat.map.dispose();
          mat.dispose();
        }
      }
    }
    this.animatedMeshes = [];
    this.particles = null;
    this.axes = null;
  }

  /**
   * Builds the Diorama Shadow Box room extending behind the monitor (Z <= 0).
   */
  private buildDiorama(screen: ScreenGeometry): void {
    const W = screen.width;
    const H = screen.height;
    const depth = 0.8; // Room is 80cm deep behind the screen

    // Materials
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0x181c24,
      roughness: 0.7,
      metalness: 0.1
    });

    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x222733,
      roughness: 0.3,
      metalness: 0.2
    });

    const backMaterial = new THREE.MeshStandardMaterial({
      color: 0x12151c,
      roughness: 0.8,
      metalness: 0.05
    });

    // 1. Floor (at y = -H/2)
    const floorGeo = new THREE.PlaneGeometry(W, depth);
    const floor = new THREE.Mesh(floorGeo, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -H / 2, -depth / 2);
    floor.receiveShadow = true;
    this.group.add(floor);

    // Floor grid lines
    const grid = new THREE.GridHelper(W, 10, 0x00ffff, 0x334455);
    grid.position.set(0, -H / 2 + 0.001, -depth / 2);
    this.group.add(grid);

    // 2. Ceiling (at y = +H/2)
    const ceilingGeo = new THREE.PlaneGeometry(W, depth);
    const ceiling = new THREE.Mesh(ceilingGeo, wallMaterial);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, H / 2, -depth / 2);
    ceiling.receiveShadow = true;
    this.group.add(ceiling);

    // 3. Left Wall (at x = -W/2)
    const leftWallGeo = new THREE.PlaneGeometry(depth, H);
    const leftWall = new THREE.Mesh(leftWallGeo, wallMaterial);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-W / 2, 0, -depth / 2);
    leftWall.receiveShadow = true;
    this.group.add(leftWall);

    // 4. Right Wall (at x = +W/2)
    const rightWallGeo = new THREE.PlaneGeometry(depth, H);
    const rightWall = new THREE.Mesh(rightWallGeo, wallMaterial);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(W / 2, 0, -depth / 2);
    rightWall.receiveShadow = true;
    this.group.add(rightWall);

    // 5. Back Wall (at z = -depth)
    const backWallGeo = new THREE.PlaneGeometry(W, H);
    const backWall = new THREE.Mesh(backWallGeo, backMaterial);
    backWall.position.set(0, 0, -depth);
    backWall.receiveShadow = true;
    this.group.add(backWall);

    // Subtle portal frame at Z = 0 (around screen opening)
    const frameGeo = new THREE.RingGeometry(W * 0.49, W * 0.505, 4);
    const frameMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, wireframe: true });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.set(0, 0, -0.005);
    frame.rotation.z = Math.PI / 4;
    this.group.add(frame);

    // Multi-depth objects:
    // A. FOREGROUND: Floating metallic toruses near the window (z = -0.12m)
    const torusGeo = new THREE.TorusGeometry(0.045, 0.008, 16, 48);
    const torusMat = new THREE.MeshStandardMaterial({
      color: 0x00ffaa,
      roughness: 0.2,
      metalness: 0.9,
      emissive: 0x003322
    });
    const torusLeft = new THREE.Mesh(torusGeo, torusMat);
    torusLeft.position.set(-W * 0.32, H * 0.2, -0.15);
    torusLeft.castShadow = true;
    this.group.add(torusLeft);

    this.animatedMeshes.push({
      mesh: torusLeft,
      update: (t) => {
        torusLeft.rotation.x = t * 0.8;
        torusLeft.rotation.y = t * 0.6;
      }
    });

    // B. MIDGROUND CENTERPIECE: Floating faceted Icosahedron / Crystal (z = -0.38m)
    const crystalGeo = new THREE.IcosahedronGeometry(0.065, 0);
    const crystalMat = new THREE.MeshStandardMaterial({
      color: 0x00d4ff,
      roughness: 0.1,
      metalness: 0.8,
      wireframe: false
    });
    const crystal = new THREE.Mesh(crystalGeo, crystalMat);
    crystal.position.set(0, 0, -0.38);
    crystal.castShadow = true;
    crystal.receiveShadow = true;
    this.group.add(crystal);

    // Glowing core inside crystal
    const coreGeo = new THREE.SphereGeometry(0.025, 16, 16);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xff33aa });
    const core = new THREE.Mesh(coreGeo, coreMat);
    crystal.add(core);

    this.animatedMeshes.push({
      mesh: crystal,
      update: (t) => {
        crystal.rotation.x = t * 0.5;
        crystal.rotation.y = t * 0.7;
        crystal.position.y = Math.sin(t * 1.5) * 0.02;
      }
    });

    // C. MIDGROUND PEDESTALS & GEOMETRY
    // Left pillar with gold sphere (z = -0.30m)
    const pillarGeo = new THREE.CylinderGeometry(0.035, 0.04, 0.12, 24);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x2a3040, roughness: 0.5 });
    const pillarLeft = new THREE.Mesh(pillarGeo, pillarMat);
    pillarLeft.position.set(-W * 0.25, -H / 2 + 0.06, -0.3);
    pillarLeft.receiveShadow = true;
    this.group.add(pillarLeft);

    const sphereGeo = new THREE.SphereGeometry(0.035, 32, 32);
    const sphereMat = new THREE.MeshStandardMaterial({
      color: 0xffaa00,
      roughness: 0.15,
      metalness: 0.95
    });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    sphere.position.set(-W * 0.25, -H / 2 + 0.155, -0.3);
    sphere.castShadow = true;
    this.group.add(sphere);

    // Right pillar with metallic cube (z = -0.45m)
    const pillarRight = new THREE.Mesh(pillarGeo, pillarMat);
    pillarRight.position.set(W * 0.25, -H / 2 + 0.06, -0.45);
    pillarRight.receiveShadow = true;
    this.group.add(pillarRight);

    const boxGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
    const boxMat = new THREE.MeshStandardMaterial({
      color: 0xff3366,
      roughness: 0.3,
      metalness: 0.7
    });
    const box = new THREE.Mesh(boxGeo, boxMat);
    box.position.set(W * 0.25, -H / 2 + 0.15, -0.45);
    box.castShadow = true;
    this.group.add(box);

    this.animatedMeshes.push({
      mesh: box,
      update: (t) => {
        box.rotation.y = t * 0.4;
      }
    });

    // D. BACKGROUND: Depth rings and back sculptures (z = -0.65m to -0.75m)
    const backPillarGeo = new THREE.CylinderGeometry(0.025, 0.025, H * 0.7, 16);
    const backPillar1 = new THREE.Mesh(backPillarGeo, pillarMat);
    backPillar1.position.set(-W * 0.35, 0, -0.7);
    this.group.add(backPillar1);

    const backPillar2 = new THREE.Mesh(backPillarGeo, pillarMat);
    backPillar2.position.set(W * 0.35, 0, -0.7);
    this.group.add(backPillar2);

    // Glowing depth marker rings on back wall
    const depthRingGeo = new THREE.RingGeometry(0.08, 0.085, 32);
    const depthRingMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, side: THREE.DoubleSide });
    const depthRing = new THREE.Mesh(depthRingGeo, depthRingMat);
    depthRing.position.set(0, 0, -0.79);
    this.group.add(depthRing);

    // E. Floating dust particles highlighting continuous parallax depth
    const particleCount = 150;
    const particlePositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      particlePositions[i * 3 + 0] = (Math.random() - 0.5) * (W * 0.9);
      particlePositions[i * 3 + 1] = (Math.random() - 0.5) * (H * 0.85);
      particlePositions[i * 3 + 2] = -Math.random() * (depth * 0.95);
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0x88ddff,
      size: 0.005,
      transparent: true,
      opacity: 0.7
    });
    this.particles = new THREE.Points(particleGeo, particleMat);
    this.group.add(this.particles);
  }

  /**
   * Builds the Debug test environment with calibrated coordinate axes and metric depth spheres.
   */
  private buildDebug(screen: ScreenGeometry): void {
    const W = screen.width;
    const H = screen.height;

    // Coordinate axes at origin (0, 0, 0) - half length: 0.075m (7.5cm)
    this.axes = new THREE.AxesHelper(0.075);
    this.axes.visible = this.axesVisible;
    this.group.add(this.axes);

    // 1. 3D Wireframe Bounding Box around the scene (from Z = 0 to Z = -0.45m)
    const maxDepth = 0.45;
    const boxGeo = new THREE.BoxGeometry(W, H, maxDepth);
    const edgesGeo = new THREE.EdgesGeometry(boxGeo);
    const boxMat = new THREE.LineBasicMaterial({
      color: 0x00e5ff, // Bright cyan wireframe box
      transparent: true,
      opacity: 0.85
    });
    const wireBox = new THREE.LineSegments(edgesGeo, boxMat);
    wireBox.position.set(0, 0, -maxDepth / 2);
    this.group.add(wireBox);

    // Bounded floor grid lines (spanning from Z = 0 to Z = -maxDepth at y = -H/2)
    const floorLinePositions: number[] = [];
    const xDivisions = 10;
    for (let i = 0; i <= xDivisions; i++) {
      const x = -W / 2 + (i / xDivisions) * W;
      floorLinePositions.push(x, -H / 2, 0);
      floorLinePositions.push(x, -H / 2, -maxDepth);
    }
    // Sub-grid lateral lines every 5 cm along Z
    const zStep = 0.05;
    for (let z = 0; z >= -maxDepth - 0.001; z -= zStep) {
      floorLinePositions.push(-W / 2, -H / 2, z);
      floorLinePositions.push(W / 2, -H / 2, z);
    }
    const floorGeo = new THREE.BufferGeometry();
    floorGeo.setAttribute('position', new THREE.Float32BufferAttribute(floorLinePositions, 3));
    const floorMat = new THREE.LineBasicMaterial({
      color: 0x223344,
      transparent: true,
      opacity: 0.6
    });
    const floorLines = new THREE.LineSegments(floorGeo, floorMat);
    this.group.add(floorLines);

    // 2. Metric depth spheres and wireframe ribs along the tunnel (at z = -0.1m, -0.2m, -0.3m, -0.4m)
    const depths = [0.1, 0.2, 0.3, 0.4];
    const colors = [0x00ff88, 0x00e5ff, 0xffb703, 0xff00aa];

    // Front baseline label at 0 cm along bottom center line
    const frontLabel = this.createLabelSprite('Z: 0 cm (0.0 in)', 0xffffff);
    frontLabel.position.set(0, -H / 2 + 0.012, 0);
    this.group.add(frontLabel);

    depths.forEach((d, idx) => {
      // Metric depth sphere along center line
      const sGeo = new THREE.SphereGeometry(0.02, 16, 16);
      const sMat = new THREE.MeshStandardMaterial({ color: colors[idx], roughness: 0.3 });
      const s = new THREE.Mesh(sGeo, sMat);
      s.position.set(0, 0, -d);
      this.group.add(s);

      // Wireframe cross-section rib around the box at this depth
      const ribPositions = [
        -W / 2, -H / 2, -d,
         W / 2, -H / 2, -d,
         W / 2,  H / 2, -d,
        -W / 2,  H / 2, -d
      ];
      const ribGeo = new THREE.BufferGeometry();
      ribGeo.setAttribute('position', new THREE.Float32BufferAttribute(ribPositions, 3));
      const ribMat = new THREE.LineBasicMaterial({
        color: colors[idx],
        transparent: true,
        opacity: 0.5
      });
      const ribLine = new THREE.LineLoop(ribGeo, ribMat);
      this.group.add(ribLine);

      // Single crisp label showing Z value in cm and inches along the bottom center line
      const cm = Math.round(d * 100);
      const inches = (d * 39.3701).toFixed(1);
      const labelText = `Z: -${cm} cm (${inches} in)`;

      const label = this.createLabelSprite(labelText, colors[idx]);
      label.position.set(0, -H / 2 + 0.012, -d);
      this.group.add(label);
    });
  }

  /**
   * Creates a crisp billboard text sprite with white characters on a black background.
   */
  private createLabelSprite(text: string, colorHex: number): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.Sprite();

    const hexStr = '#' + colorHex.toString(16).padStart(6, '0');

    // Background rounded rectangle (crisp solid black with thin colored border)
    const x = 6;
    const y = 6;
    const w = canvas.width - 12;
    const h = canvas.height - 12;
    const r = 16;

    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();

    ctx.fillStyle = '#000000';
    ctx.fill();
    ctx.strokeStyle = hexStr;
    ctx.lineWidth = 4;
    ctx.stroke();

    // Render Text (crisp pure white characters, zero blur or glow)
    ctx.shadowBlur = 0;
    let fontSize = 38;
    ctx.font = `bold ${fontSize}px "SF Mono", "Consolas", "Courier New", monospace`;
    while (ctx.measureText(text).width > w - 32 && fontSize > 16) {
      fontSize -= 2;
      ctx.font = `bold ${fontSize}px "SF Mono", "Consolas", "Courier New", monospace`;
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;

    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: true
    });
    const sprite = new THREE.Sprite(spriteMat);
    // Compact, unobtrusive scale: ~6.5cm wide by 1.6cm tall
    sprite.scale.set(0.065, 0.01625, 1.0);
    return sprite;
  }

  public update(timeSeconds: number): void {
    for (const item of this.animatedMeshes) {
      item.update(timeSeconds);
    }
    if (this.particles) {
      this.particles.rotation.z = timeSeconds * 0.02;
    }
  }
}

