/**
 * DemoScene.ts
 *
 * Provides two test environments:
 * 1. Model Viewer (Diorama): 5 walls textured with grid pattern (default: orange_grid.png),
 *    featuring an interactive 3D model viewer for custom .glb models with shadow casting
 *    and skeletal animation support.
 * 2. Debug Scene: Coordinate axes, depth markers, and calibration spheres.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
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

  // Model Viewer subsystems
  private gltfLoader: GLTFLoader = new GLTFLoader();
  private textureLoader: THREE.TextureLoader = new THREE.TextureLoader();
  private modelGroup: THREE.Group = new THREE.Group();
  private modelWrapper: THREE.Group | null = null;
  private currentMixer: THREE.AnimationMixer | null = null;
  private wallMeshes: THREE.Mesh[] = [];
  private currentModelUrl: string = 'models/fish01.glb';
  private currentTextureUrl: string = 'textures/orange_grid.png';
  private currentScreen: ScreenGeometry | null = null;
  private modelZ: number = -0.25;
  private modelScaleMultiplier: number = 1.0;

  constructor(screen: ScreenGeometry) {
    this.currentScreen = screen;
    this.group.add(this.modelGroup);
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
    this.currentScreen = screen;

    this.clear();

    if (type === SceneType.Diorama) {
      this.buildDiorama(screen);
    } else {
      this.buildDebug(screen);
    }
  }

  public rebuild(screen: ScreenGeometry): void {
    this.currentScreen = screen;
    this.clear();
    if (this.currentSceneType === SceneType.Diorama) {
      this.buildDiorama(screen);
    } else {
      this.buildDebug(screen);
    }
  }

  private clear(): void {
    if (this.currentMixer) {
      this.currentMixer.stopAllAction();
      this.currentMixer = null;
    }

    // Clear model group
    while (this.modelGroup.children.length > 0) {
      const child = this.modelGroup.children[0];
      this.modelGroup.remove(child);
    }
    this.modelWrapper = null;
    this.wallMeshes = [];

    // Clear main group except modelGroup
    const toRemove: THREE.Object3D[] = [];
    this.group.children.forEach((child) => {
      if (child !== this.modelGroup) {
        toRemove.push(child);
      }
    });

    toRemove.forEach((child) => {
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
    });

    this.animatedMeshes = [];
    this.particles = null;
    this.axes = null;
  }

  /**
   * Sets the active 3D model in the Model Viewer room.
   */
  public async setModel(modelUrl: string): Promise<void> {
    this.currentModelUrl = modelUrl;
    if (this.currentSceneType !== SceneType.Diorama) return;

    while (this.modelGroup.children.length > 0) {
      const child = this.modelGroup.children[0];
      this.modelGroup.remove(child);
    }
    if (this.currentMixer) {
      this.currentMixer.stopAllAction();
      this.currentMixer = null;
    }
    this.modelWrapper = null;

    try {
      const gltf = await this.gltfLoader.loadAsync(modelUrl);
      const scene = gltf.scene;

      // Compute bounding box and normalize scale
      const bbox = new THREE.Box3().setFromObject(scene);
      const size = new THREE.Vector3();
      bbox.getSize(size);
      const maxDim = Math.max(0.001, size.x, size.y, size.z);

      // Target size ~ 18cm (0.18m)
      const targetSize = Math.min((this.currentScreen?.height ?? 0.3) * 0.55, 0.20);
      const scale = targetSize / maxDim;
      scene.scale.setScalar(scale);

      // Center pivot point
      const center = new THREE.Vector3();
      bbox.getCenter(center);
      scene.position.set(-center.x * scale, -center.y * scale, -center.z * scale);

      // Enable shadows on all meshes
      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });

      this.modelWrapper = new THREE.Group();
      this.modelWrapper.add(scene);
      this.modelWrapper.position.set(0, 0, this.modelZ);
      this.modelWrapper.scale.setScalar(this.modelScaleMultiplier);
      this.modelGroup.add(this.modelWrapper);

      // Bind skeletal animation if present
      if (gltf.animations && gltf.animations.length > 0) {
        this.currentMixer = new THREE.AnimationMixer(scene);
        const action = this.currentMixer.clipAction(gltf.animations[0]);
        action.play();
      }
    } catch (err) {
      console.error(`[DemoScene] Failed to load model ${modelUrl}:`, err);
    }
  }

  /**
   * Adjusts the Z depth position of the 3D model.
   */
  public setModelZ(zMeters: number): void {
    this.modelZ = zMeters;
    if (this.modelWrapper) {
      this.modelWrapper.position.z = zMeters;
    }
  }

  /**
   * Adjusts the user scale multiplier for the 3D model.
   */
  public setModelScaleMultiplier(multiplier: number): void {
    this.modelScaleMultiplier = multiplier;
    if (this.modelWrapper) {
      this.modelWrapper.scale.setScalar(multiplier);
    }
  }

  /**
   * Sets the active wall texture on the 5 walls in the Model Viewer room.
   */
  public setWallTexture(textureUrl: string): void {
    this.currentTextureUrl = textureUrl;
    if (this.currentSceneType !== SceneType.Diorama) return;

    this.wallMeshes.forEach((mesh) => {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (mat) {
        const { wMeters = 0.5, hMeters = 0.5 } = mesh.userData || {};
        const newTex = this.textureLoader.load(textureUrl);
        newTex.wrapS = THREE.RepeatWrapping;
        newTex.wrapT = THREE.RepeatWrapping;
        newTex.colorSpace = THREE.SRGBColorSpace;
        newTex.repeat.set(wMeters / 0.10, hMeters / 0.10);
        mat.map = newTex;
        mat.needsUpdate = true;
      }
    });
  }

  /**
   * Builds the clean 5-walled Model Viewer room extending behind the monitor.
   * Walls are mapped with the selected texture (default: orange_grid.png).
   * UVs repeat every 10cm (0.10m) in physical world space.
   */
  private buildDiorama(screen: ScreenGeometry): void {
    const W = screen.width;
    const H = screen.height;
    const depth = 0.50; // 50cm deep diorama box

    this.wallMeshes = [];

    // Helper to create a textured wall material with physical 10cm grid repeat
    const createWallMaterial = (wMeters: number, hMeters: number): THREE.MeshStandardMaterial => {
      const texture = this.textureLoader.load(this.currentTextureUrl);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.colorSpace = THREE.SRGBColorSpace;
      // Exact physical 10cm UV repeat (1 texture square per 0.10m in world space)
      texture.repeat.set(wMeters / 0.10, hMeters / 0.10);

      return new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.55,
        metalness: 0.15
      });
    };

    // 1. Floor (at y = -H/2)
    const floorGeo = new THREE.PlaneGeometry(W, depth);
    const floor = new THREE.Mesh(floorGeo, createWallMaterial(W, depth));
    floor.userData = { wMeters: W, hMeters: depth };
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -H / 2, -depth / 2);
    floor.receiveShadow = true;
    this.group.add(floor);
    this.wallMeshes.push(floor);

    // 2. Ceiling (at y = +H/2)
    const ceilingGeo = new THREE.PlaneGeometry(W, depth);
    const ceiling = new THREE.Mesh(ceilingGeo, createWallMaterial(W, depth));
    ceiling.userData = { wMeters: W, hMeters: depth };
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, H / 2, -depth / 2);
    ceiling.receiveShadow = true;
    this.group.add(ceiling);
    this.wallMeshes.push(ceiling);

    // 3. Left Wall (at x = -W/2)
    const leftWallGeo = new THREE.PlaneGeometry(depth, H);
    const leftWall = new THREE.Mesh(leftWallGeo, createWallMaterial(depth, H));
    leftWall.userData = { wMeters: depth, hMeters: H };
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-W / 2, 0, -depth / 2);
    leftWall.receiveShadow = true;
    this.group.add(leftWall);
    this.wallMeshes.push(leftWall);

    // 4. Right Wall (at x = +W/2)
    const rightWallGeo = new THREE.PlaneGeometry(depth, H);
    const rightWall = new THREE.Mesh(rightWallGeo, createWallMaterial(depth, H));
    rightWall.userData = { wMeters: depth, hMeters: H };
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(W / 2, 0, -depth / 2);
    rightWall.receiveShadow = true;
    this.group.add(rightWall);
    this.wallMeshes.push(rightWall);

    // 5. Back Wall (at z = -depth)
    const backWallGeo = new THREE.PlaneGeometry(W, H);
    const backWall = new THREE.Mesh(backWallGeo, createWallMaterial(W, H));
    backWall.userData = { wMeters: W, hMeters: H };
    backWall.position.set(0, 0, -depth);
    backWall.receiveShadow = true;
    this.group.add(backWall);
    this.wallMeshes.push(backWall);

    // Ensure modelGroup is added to scene
    if (!this.group.children.includes(this.modelGroup)) {
      this.group.add(this.modelGroup);
    }

    // Load active model
    this.setModel(this.currentModelUrl);
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
      color: 0x141519,
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
    // 2. Amber/Orange Perspective Grid
    // ------------------------------------------------------------------
    const Nx = 10;
    const Ny = 6;
    const Nz = 9; // ~5cm spacing along Z
    const dx = W / Nx;
    const dy = H / Ny;
    const dz = maxDepth / Nz;

    const gridPoints: number[] = [];

    // Longitudinal lines along Ceiling & Floor running from Z = 0 to Z = -maxDepth
    for (let i = 0; i <= Nx; i++) {
      const x = -W / 2 + i * dx;
      gridPoints.push(x, H / 2, 0, x, H / 2, -maxDepth);
      gridPoints.push(x, -H / 2, 0, x, -H / 2, -maxDepth);
    }

    // Longitudinal lines along Left & Right walls running from Z = 0 to Z = -maxDepth
    for (let j = 0; j <= Ny; j++) {
      const y = -H / 2 + j * dy;
      gridPoints.push(-W / 2, y, 0, -W / 2, y, -maxDepth);
      gridPoints.push(W / 2, y, 0, W / 2, y, -maxDepth);
    }

    // Transverse rectangular depth rings at every interval along Z
    for (let k = 0; k <= Nz; k++) {
      const z = -k * dz;
      gridPoints.push(-W / 2, -H / 2, z, W / 2, -H / 2, z);
      gridPoints.push(W / 2, -H / 2, z, W / 2, H / 2, z);
      gridPoints.push(W / 2, H / 2, z, -W / 2, H / 2, z);
      gridPoints.push(-W / 2, H / 2, z, -W / 2, -H / 2, z);
    }

    // Back wall inner grid lines
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
      color: 0xff9900,
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
        z:  0.08, // +8 cm in front of screen
        color: 0x00f0ff,
        radius: 0.020
      },
      {
        x:  W * 0.15,
        y: -H * 0.10,
        z:  0.03, // +3 cm in front of screen
        color: 0x00ff88,
        radius: 0.020
      },
      {
        x: -W * 0.24,
        y: -H * 0.18,
        z: -0.14, // -14 cm recessed
        color: 0xffbe0b,
        radius: 0.020
      },
      {
        x:  W * 0.24,
        y:  H * 0.20,
        z: -0.27, // -27 cm midground
        color: 0xff00aa,
        radius: 0.020
      },
      {
        x: -W * 0.06,
        y: -H * 0.02,
        z: -0.35, // -35 cm deep
        color: 0x9d4edd,
        radius: 0.020
      }
    ];

    sphereConfigs.forEach((config) => {
      // Depth Sphere
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

      // Line straight back through Z axis to back of scene
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

      // Target projection ring on back wall where guideline lands
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

      // Floating depth label hovering above sphere
      const cmSign = config.z > 0 ? '+' : '';
      const cmVal = `${cmSign}${(config.z * 100).toFixed(0)} cm`;
      const inVal = `${cmSign}${(config.z * 39.3701).toFixed(1)} in`;
      const labelText = `Z: ${cmVal} (${inVal})`;

      const labelSprite = this.createLabelSprite(labelText, config.color);
      labelSprite.position.set(config.x, config.y + config.radius + 0.012, config.z);
      this.group.add(labelSprite);
    });
  }

  private createLabelSprite(text: string, _colorHex: number): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.Sprite();

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.shadowBlur = 0;
    let fontSize = 44;
    ctx.font = `bold ${fontSize}px "SF Mono", "Consolas", "Courier New", monospace`;
    while (ctx.measureText(text).width > canvas.width - 32 && fontSize > 16) {
      fontSize -= 2;
      ctx.font = `bold ${fontSize}px "SF Mono", "Consolas", "Courier New", monospace`;
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
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
    sprite.scale.set(0.04875, 0.0121875, 1.0);
    return sprite;
  }

  public update(timeSeconds: number, deltaTimeSeconds: number = 0.016): void {
    if (this.currentSceneType === SceneType.Diorama) {
      if (this.currentMixer) {
        this.currentMixer.update(deltaTimeSeconds);
      }
      if (this.modelWrapper) {
        this.modelWrapper.rotation.y = timeSeconds * 0.35;
      }
    } else {
      for (const item of this.animatedMeshes) {
        item.update(timeSeconds);
      }
      if (this.particles) {
        this.particles.rotation.z = timeSeconds * 0.02;
      }
    }
  }
}
