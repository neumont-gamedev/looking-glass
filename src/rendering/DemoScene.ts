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
import { FishSwimShader } from './aquarium/FishSwimShader';
import { calibrationGridMaterial } from './CalibrationGridMaterial';

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
  private distanceLabelsVisible = false;
  private readonly calibrationGridColor = new THREE.Color(0xff4444);

  public setCalibrationGridColor(color: string): void {
    this.calibrationGridColor.set(color);
  }
  private distanceLabels: THREE.Sprite[] = [];

  public setDistanceLabelsVisible(visible: boolean): void {
    this.distanceLabelsVisible = visible;
    this.distanceLabels.forEach(label => { label.visible = visible; });
  }
  private currentSceneType: SceneType = SceneType.Diorama;

  // Model Viewer subsystems
  private gltfLoader: GLTFLoader = new GLTFLoader();
  private textureLoader: THREE.TextureLoader = new THREE.TextureLoader();
  private modelGroup: THREE.Group = new THREE.Group();
  private modelWrapper: THREE.Group | null = null;
  private currentMixer: THREE.AnimationMixer | null = null;
  private fishSwim: FishSwimShader | null = null;
  private modelLoadGeneration = 0;
  private wallMeshes: THREE.Mesh[] = [];
  private currentModelUrl: string = 'models/fish01.glb';
  private currentTextureUrl: string = 'textures/orange_grid.png';
  private currentWallColor: string = '#ffffff';
  private currentScreen: ScreenGeometry | null = null;
  private modelZ: number = -0.25;
  private modelScaleMultiplier: number = 1.0;
  private modelRotationY: number = 0;
  private modelAutoRotate: boolean = true;

  private readonly wallTextureAnisotropy: number;

  constructor(screen: ScreenGeometry, maxTextureAnisotropy: number = 1) {
    // Preserve grid detail on walls viewed at grazing angles without exceeding GPU support.
    this.wallTextureAnisotropy = Math.max(1, Math.min(8, maxTextureAnisotropy));
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
    this.distanceLabels = [];
    this.modelLoadGeneration++;
    this.fishSwim?.dispose();
    this.fishSwim = null;
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
    const generation = ++this.modelLoadGeneration;
    this.fishSwim?.dispose();
    this.fishSwim = null;

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
      if (generation !== this.modelLoadGeneration) return;
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
      const isFish = /(?:^|\/)fish0[123]\.glb(?:[?#]|$)/.test(modelUrl);
      if (isFish) {
        // Supplied fish face -X. Normalize to +X for the shared tail shader,
        // then restore their original display orientation outside its local frame.
        const facing = new THREE.Group();
        facing.rotation.y = Math.PI;
        facing.add(scene);
        const swimRoot = new THREE.Group();
        swimRoot.add(facing);
        this.fishSwim = new FishSwimShader(swimRoot, 0);
        swimRoot.rotation.y = Math.PI;
        this.modelWrapper.add(swimRoot);
      } else {
        this.modelWrapper.add(scene);
      }
      this.modelWrapper.position.set(0, 0, this.modelZ);
      this.modelWrapper.scale.setScalar(this.modelScaleMultiplier);
      this.modelWrapper.rotation.y = this.modelRotationY;
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
   * Returns the current active 3D model URL.
   */
  public getModel(): string {
    return this.currentModelUrl;
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
   * Adjusts the manual Y rotation (in radians) of the 3D model.
   */
  public setModelRotationY(rotRad: number): void {
    this.modelRotationY = rotRad;
    if (this.modelWrapper) {
      this.modelWrapper.rotation.y = rotRad;
    }
  }

  /**
   * Gets the current Y rotation (in radians) of the 3D model.
   */
  public getModelRotationY(): number {
    return this.modelRotationY;
  }

  /**
   * Toggles auto-rotation for the 3D model.
   */
  public setModelAutoRotate(autoRotate: boolean): void {
    this.modelAutoRotate = autoRotate;
  }

  /**
   * Gets whether auto-rotation is enabled for the 3D model.
   */
  public getModelAutoRotate(): boolean {
    return this.modelAutoRotate;
  }

  private getCacheBustedUrl(url: string): string {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}t=${Date.now()}`;
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
        const newTex = this.textureLoader.load(this.getCacheBustedUrl(textureUrl));
        newTex.wrapS = THREE.RepeatWrapping;
        newTex.wrapT = THREE.RepeatWrapping;
        newTex.colorSpace = THREE.SRGBColorSpace;
        newTex.anisotropy = this.wallTextureAnisotropy;
        newTex.repeat.set(wMeters / 0.10, hMeters / 0.10);
        mat.color.set(0xffffff);
        mat.map = newTex;
        mat.needsUpdate = true;
      }
    });
  }

  /**
   * Gets the active wall texture URL.
   */
  public getWallTexture(): string {
    return this.currentTextureUrl;
  }

  /**
   * Sets the active wall tint color on the 5 walls in the Model Viewer room.
   */
  public setWallColor(colorHex: string): void {
    this.currentWallColor = colorHex;
    if (this.currentSceneType !== SceneType.Diorama) return;

    this.wallMeshes.forEach((mesh) => {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (mat) {
        mat.color.set(colorHex);
        mat.needsUpdate = true;
      }
    });
  }

  /**
   * Gets the active wall tint color.
   */
  public getWallColor(): string {
    return this.currentWallColor;
  }

  /**
   * Builds the clean 5-walled Model Viewer room extending behind the monitor.
   * Walls are mapped with the selected texture (default: metric_grid.png) and tinted with currentWallColor.
   * UVs repeat every 10cm (0.10m) in physical world space.
   */
  private buildDiorama(screen: ScreenGeometry): void {
    const W = screen.width;
    const H = screen.height;
    const depth = 0.50; // 50cm deep diorama box

    this.wallMeshes = [];

    // Helper to create a textured wall material with physical 10cm grid repeat
    const createWallMaterial = (wMeters: number, hMeters: number): THREE.MeshStandardMaterial => {
      const texture = this.textureLoader.load(this.getCacheBustedUrl(this.currentTextureUrl));
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = this.wallTextureAnisotropy;
      // Exact physical 10cm UV repeat (1 texture square per 0.10m in world space)
      texture.repeat.set(wMeters / 0.10, hMeters / 0.10);

      return new THREE.MeshStandardMaterial({
        color: new THREE.Color(this.currentWallColor),
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
    const maxDepth = 0.50; // 50 cm deep behind the monitor (matching Model Viewer)

    // Coordinate axes at origin (0, 0, 0) - half length: 0.0375m (3.75cm)
    this.axes = new THREE.AxesHelper(0.0375);
    this.axes.visible = this.axesVisible;
    this.group.add(this.axes);

    // ------------------------------------------------------------------
    // 1. Dark Room Interior Walls (Floor, Ceiling, Left, Right, Back)
    // ------------------------------------------------------------------
    // Floor (at y = -H/2)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, maxDepth), calibrationGridMaterial(10, 10, this.calibrationGridColor));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -H / 2, -maxDepth / 2);
    floor.receiveShadow = true;
    this.group.add(floor);

    // Ceiling (at y = +H/2)
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W, maxDepth), calibrationGridMaterial(10, 10, this.calibrationGridColor));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, H / 2, -maxDepth / 2);
    ceiling.receiveShadow = true;
    this.group.add(ceiling);

    // Left Wall (at x = -W/2)
    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(maxDepth, H), calibrationGridMaterial(10, 6, this.calibrationGridColor));
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-W / 2, 0, -maxDepth / 2);
    leftWall.receiveShadow = true;
    this.group.add(leftWall);

    // Right Wall (at x = +W/2)
    const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(maxDepth, H), calibrationGridMaterial(10, 6, this.calibrationGridColor));
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(W / 2, 0, -maxDepth / 2);
    rightWall.receiveShadow = true;
    this.group.add(rightWall);

    // Back Wall (at z = -maxDepth)
    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(W, H), calibrationGridMaterial(10, 6, this.calibrationGridColor));
    backWall.position.set(0, 0, -maxDepth);
    backWall.receiveShadow = true;
    this.group.add(backWall);

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
    sprite.visible = this.distanceLabelsVisible;
    this.distanceLabels.push(sprite);
    sprite.scale.set(0.04875, 0.0121875, 1.0);
    return sprite;
  }

  public update(timeSeconds: number, deltaTimeSeconds: number = 0.016): void {
    // A steady cruise previews swimming independently of the model rotation control.
    this.fishSwim?.update(deltaTimeSeconds, 0.65);
    if (this.currentSceneType === SceneType.Diorama) {
      if (this.currentMixer) {
        this.currentMixer.update(deltaTimeSeconds);
      }
      if (this.modelWrapper) {
        if (this.modelAutoRotate) {
          const dt = Math.min(deltaTimeSeconds, 0.1);
          this.modelRotationY = (this.modelRotationY + dt * 0.35) % (Math.PI * 2);
          this.modelWrapper.rotation.y = this.modelRotationY;
        } else {
          this.modelWrapper.rotation.y = this.modelRotationY;
        }
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
