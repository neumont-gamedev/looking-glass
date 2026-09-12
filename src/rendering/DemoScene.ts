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
   * Builds the Debug test environment with calibrated coordinate axes, amber perspective grid room,
   * and multi-position depth spheres with lines drawn straight back through the Z axis.
   */
  private buildDebug(screen: ScreenGeometry): void {
    const W = screen.width;
    const H = screen.height;
    const maxDepth = 0.45; // 45 cm deep behind the monitor

    // Coordinate axes at origin (0, 0, 0) - half length: 0.0375m (3.75cm)
    this.axes = new THREE.AxesHelper(0.0375);
    this.axes.visible = this.axesVisible;
    this.group.add(this.axes);

    // ------------------------------------------------------------------
    // 1. Dark Room Interior Walls (Floor, Ceiling, Left, Right, Back)
    // ------------------------------------------------------------------
    const roomMat = new THREE.MeshStandardMaterial({
      color: 0x141519, // Dark matte charcoal matching reference screenshot
      roughness: 0.85,
      metalness: 0.05,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1
    });

    // Floor (at y = -H/2)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, maxDepth), roomMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -H / 2, -maxDepth / 2);
    floor.receiveShadow = true;
    this.group.add(floor);

    // Ceiling (at y = +H/2)
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W, maxDepth), roomMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, H / 2, -maxDepth / 2);
    ceiling.receiveShadow = true;
    this.group.add(ceiling);

    // Left Wall (at x = -W/2)
    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(maxDepth, H), roomMat);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-W / 2, 0, -maxDepth / 2);
    leftWall.receiveShadow = true;
    this.group.add(leftWall);

    // Right Wall (at x = +W/2)
    const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(maxDepth, H), roomMat);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(W / 2, 0, -maxDepth / 2);
    rightWall.receiveShadow = true;
    this.group.add(rightWall);

    // Back Wall (at z = -maxDepth)
    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(W, H), roomMat);
    backWall.position.set(0, 0, -maxDepth);
    backWall.receiveShadow = true;
    this.group.add(backWall);

    // ------------------------------------------------------------------
    // 2. Amber/Orange Perspective Grid (matching user reference image)
    // ------------------------------------------------------------------
    const Nx = 10;
    const Ny = 6;
    const Nz = 9; // ~5cm spacing along Z (45cm / 9 = 5cm)
    const dx = W / Nx;
    const dy = H / Ny;
    const dz = maxDepth / Nz;

    const gridPoints: number[] = [];

    // A. Longitudinal lines along Ceiling & Floor running from Z = 0 to Z = -maxDepth
    for (let i = 0; i <= Nx; i++) {
      const x = -W / 2 + i * dx;
      // Ceiling line
      gridPoints.push(x, H / 2, 0, x, H / 2, -maxDepth);
      // Floor line
      gridPoints.push(x, -H / 2, 0, x, -H / 2, -maxDepth);
    }

    // B. Longitudinal lines along Left & Right walls running from Z = 0 to Z = -maxDepth
    for (let j = 0; j <= Ny; j++) {
      const y = -H / 2 + j * dy;
      // Left wall line
      gridPoints.push(-W / 2, y, 0, -W / 2, y, -maxDepth);
      // Right wall line
      gridPoints.push(W / 2, y, 0, W / 2, y, -maxDepth);
    }

    // C. Transverse rectangular depth rings at every interval along Z
    for (let k = 0; k <= Nz; k++) {
      const z = -k * dz;
      // Bottom segment (Floor)
      gridPoints.push(-W / 2, -H / 2, z, W / 2, -H / 2, z);
      // Right segment (Right wall)
      gridPoints.push(W / 2, -H / 2, z, W / 2, H / 2, z);
      // Top segment (Ceiling)
      gridPoints.push(W / 2, H / 2, z, -W / 2, H / 2, z);
      // Left segment (Left wall)
      gridPoints.push(-W / 2, H / 2, z, -W / 2, -H / 2, z);
    }

    // D. Back wall inner grid lines
    for (let i = 1; i < Nx; i++) {
      const x = -W / 2 + i * dx;
      gridPoints.push(x, -H / 2, -maxDepth, x, H / 2, -maxDepth);
    }
    for (let j = 1; j < Ny; j++) {
      const y = -H / 2 + j * dy;
      gridPoints.push(-W / 2, y, -maxDepth, W / 2, y, -maxDepth);
    }

    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridPoints, 3));
    const gridMat = new THREE.LineBasicMaterial({
      color: 0xff9900, // Warm vibrant amber/orange matching the reference image
      transparent: true,
      opacity: 0.95
    });
    const orangeGrid = new THREE.LineSegments(gridGeo, gridMat);
    this.group.add(orangeGrid);

    // Front baseline label at bottom center Z = 0
    const frontLabel = this.createLabelSprite('Z: 0 cm (0.0 in)', 0xffffff);
    frontLabel.position.set(0, -H / 2 + 0.012, 0);
    this.group.add(frontLabel);

    // ------------------------------------------------------------------
    // 3. Depth Spheres at Varying X, Y, Z + Guidelines to Back of Scene
    // ------------------------------------------------------------------
    const sphereConfigs = [
      {
        x: -W * 0.14,
        y:  H * 0.14,
        z:  0.08, // +8 cm in front of screen (pops out towards viewer)
        color: 0x00f0ff, // Electric Cyan
        radius: 0.020
      },
      {
        x:  W * 0.15,
        y: -H * 0.10,
        z:  0.03, // +3 cm just in front of screen
        color: 0x00ff88, // Neon Green
        radius: 0.020
      },
      {
        x: -W * 0.24,
        y: -H * 0.18,
        z: -0.14, // -14 cm recessed into the room
        color: 0xffbe0b, // Amber Gold
        radius: 0.020
      },
      {
        x:  W * 0.24,
        y:  H * 0.20,
        z: -0.27, // -27 cm midground depth
        color: 0xff00aa, // Vivid Magenta
        radius: 0.020
      },
      {
        x: -W * 0.06,
        y: -H * 0.02,
        z: -0.40, // -40 cm deep near back wall
        color: 0x9d4edd, // Deep Violet
        radius: 0.020
      }
    ];

    sphereConfigs.forEach((config) => {
      // 1. Depth Sphere
      const sGeo = new THREE.SphereGeometry(config.radius, 24, 24);
      const sMat = new THREE.MeshStandardMaterial({
        color: config.color,
        roughness: 0.25,
        metalness: 0.4
      });
      const sphere = new THREE.Mesh(sGeo, sMat);
      sphere.position.set(config.x, config.y, config.z);
      sphere.castShadow = true;
      this.group.add(sphere);

      // 2. Line drawn from center of sphere going straight back through Z axis to back of scene
      // For spheres at Z > 0, this guideline pierces directly through the physical screen at Z = 0!
      const linePoints = [
        new THREE.Vector3(config.x, config.y, config.z),
        new THREE.Vector3(config.x, config.y, -maxDepth)
      ];
      const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
      const lineMat = new THREE.LineBasicMaterial({
        color: config.color,
        transparent: true,
        opacity: 0.9,
        linewidth: 2
      });
      const zGuideline = new THREE.Line(lineGeo, lineMat);
      this.group.add(zGuideline);

      // 3. For positive-Z spheres popping out of the screen, add a screen plane piercing indicator ring at Z = 0
      if (config.z > 0) {
        const pierceGeo = new THREE.RingGeometry(0.003, 0.006, 24);
        const pierceMat = new THREE.MeshBasicMaterial({
          color: config.color,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.75
        });
        const pierceRing = new THREE.Mesh(pierceGeo, pierceMat);
        pierceRing.position.set(config.x, config.y, 0);
        this.group.add(pierceRing);
      }

      // 4. Target projection ring on back wall where guideline lands
      const ringGeo = new THREE.RingGeometry(0.005, 0.009, 24);
      const ringMat = new THREE.MeshBasicMaterial({
        color: config.color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.set(config.x, config.y, -maxDepth + 0.001);
      this.group.add(ring);

      // 5. Floating depth label hovering cleanly above sphere
      const sign = config.z >= 0 ? '+' : '-';
      const absCm = Math.round(Math.abs(config.z) * 100);
      const absInches = (Math.abs(config.z) * 39.3701).toFixed(1);
      const labelText = `Z: ${sign}${absCm} cm (${sign}${absInches} in)`;

      const label = this.createLabelSprite(labelText, config.color);
      label.position.set(config.x, config.y + config.radius + 0.016, config.z);
      this.group.add(label);
    });
  }

  /**
   * Creates a crisp billboard text sprite hovering in the air without surrounding boxes.
   */
  private createLabelSprite(text: string, _colorHex: number): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.Sprite();

    // Clear canvas to ensure completely transparent background (no surrounding box)
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Render Text (crisp pure white characters hovering directly in the air)
    ctx.shadowBlur = 0;
    let fontSize = 44;
    ctx.font = `bold ${fontSize}px "SF Mono", "Consolas", "Courier New", monospace`;
    while (ctx.measureText(text).width > canvas.width - 32 && fontSize > 16) {
      fontSize -= 2;
      ctx.font = `bold ${fontSize}px "SF Mono", "Consolas", "Courier New", monospace`;
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Thin dark outline for crisp contrast against any scene lighting/floor lines
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.lineWidth = 6;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, canvas.width / 2, canvas.height / 2);

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
    // Scaled +50%: ~4.88cm wide by 1.22cm tall
    sprite.scale.set(0.04875, 0.0121875, 1.0);
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

