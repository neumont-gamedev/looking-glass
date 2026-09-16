/**
 * AquariumScene.ts
 *
 * Implements the 3D Virtual Aquarium environment:
 * - Gravel floor and supplied log/plant models
 * - Rising micro-bubble particle system for depth parallax
 * - Dynamic school of fish driven by BoidsSimulation
 * - Glass tap shockwave ripples and sinking food interaction
 */

import * as THREE from 'three';
import { ScreenGeometry } from '../../math/ScreenGeometry';
import { BoidsSimulation } from './BoidsSimulation';
import { Fish, FishSpecies } from './Fish';
import { AquariumInteractions } from './AquariumInteractions';
import { CustomModelLoader, CustomFishOptions, CustomDecorationOptions } from './CustomModelLoader';
import { CausticEffect } from './CausticEffect';

interface PlantDecoration {
  group: THREE.Group;
  initialRotationZ: number;
  initialRotationX: number;
  phase: number;
  speed: number;
}

export class AquariumScene {
  public readonly group: THREE.Group = new THREE.Group();
  public readonly boids: BoidsSimulation;
  public readonly interactions: AquariumInteractions;
  public readonly causticEffect: CausticEffect;
  public readonly customModelLoader: CustomModelLoader = new CustomModelLoader();

  private screen: ScreenGeometry;
  private readonly depth: number = 0.50; // Match the Model Viewer and Debug rooms.
  // Reuse the floor texture across viewport/calibration rebuilds.
  private readonly gravelTexture = new THREE.TextureLoader().load(
    '/textures/gravel-texture.jpg',
    undefined,
    undefined,
    (error) => console.warn('[AquariumScene] Gravel texture failed to load:', error)
  );
  private readonly gravelNormalTexture = new THREE.TextureLoader().load(
    '/textures/gravel-texture-normal02.png',
    undefined,
    undefined,
    (error) => console.warn('[AquariumScene] Gravel normal map failed to load:', error)
  );

  // Environment elements
  private bubbles: THREE.Points | null = null;
  private bubbleVelocities: Float32Array | null = null;
  private bubbleCount: number = 180;
  private plantDecorations: PlantDecoration[] = [];
  private customDecorations: THREE.Group[] = [];
  private nextCustomSchoolId = 1;
  private environmentGeneration = 0;

  constructor(screen: ScreenGeometry) {
    this.screen = screen;
    this.boids = new BoidsSimulation(screen, this.depth);
    this.interactions = new AquariumInteractions(this.boids, screen);
    this.causticEffect = new CausticEffect(screen, this.depth);

    this.group.add(this.interactions.group);
    this.group.add(this.causticEffect.group);

    this.buildEnvironment();
    this.populateFish();
  }

  public rebuild(screen: ScreenGeometry): void {
    this.screen = screen;
    this.boids.screen = screen;
    this.interactions.setScreenGeometry(screen);
    this.causticEffect.rebuild(screen, this.depth);

    this.clearEnvironment();
    this.buildEnvironment();

    if (this.boids.fishes.length === 0) {
      this.populateFish();
    } else {
      // Gently keep existing swimming fish inside updated tank bounds
      const halfW = screen.width / 2 - 0.04;
      const halfH = screen.height / 2 - 0.04;
      for (const fish of this.boids.fishes) {
        fish.position.x = Math.max(-halfW, Math.min(halfW, fish.position.x));
        fish.position.y = Math.max(-halfH, Math.min(halfH, fish.position.y));
      }
    }
  }

  private clearEnvironment(): void {
    // Clean up bubbles
    if (this.bubbles) {
      this.group.remove(this.bubbles);
      this.bubbles.geometry.dispose();
      (this.bubbles.material as THREE.Material).dispose();
      this.bubbles = null;
    }

    this.plantDecorations = [];

    // Clean up custom decorations
    for (const deco of this.customDecorations) {
      this.group.remove(deco);
      deco.traverse((child) => {
        if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose();
        if ((child as THREE.Mesh).material) {
          const mat = (child as THREE.Mesh).material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat.dispose();
        }
      });
    }
    this.customDecorations = [];

    // Remove environment meshes (floor, walls, ceiling) but keep fish groups, interactions, and caustic effect
    const toRemove: THREE.Object3D[] = [];
    for (const child of this.group.children) {
      if (
        child === this.interactions.group ||
        child === this.causticEffect.group ||
        this.boids.fishes.some((f) => f.group === child)
      ) {
        continue;
      }
      toRemove.push(child);
    }

    for (const child of toRemove) {
      this.group.remove(child);
      child.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) {
          (c as THREE.Mesh).geometry?.dispose();
          const mat = (c as THREE.Mesh).material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else if (mat) mat.dispose();
        }
      });
    }
  }

  private buildEnvironment(): void {
    const generation = ++this.environmentGeneration;
    const W = this.screen.width;
    const H = this.screen.height;
    const D = this.depth;

    // 1. Gravel floor (at y = -H/2)
    const floorGeo = new THREE.PlaneGeometry(W, D, 32, 32);
    // Add subtle unevenness to the seabed
    const posAttr = floorGeo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const zOffset = Math.sin(x * 12) * 0.003 + Math.cos(y * 8) * 0.002;
      posAttr.setZ(i, zOffset);
    }
    floorGeo.computeVertexNormals();

    this.gravelTexture.colorSpace = THREE.SRGBColorSpace;
    this.gravelTexture.wrapS = THREE.RepeatWrapping;
    this.gravelTexture.wrapT = THREE.RepeatWrapping;
    // One square tile covers 12.5 cm, preserving stone scale on rectangular floors.
    this.gravelTexture.repeat.set(W / 0.125, D / 0.125);
    // Normal maps contain vector data, not sRGB color. Match the base-map UVs.
    this.gravelNormalTexture.colorSpace = THREE.NoColorSpace;
    this.gravelNormalTexture.wrapS = THREE.RepeatWrapping;
    this.gravelNormalTexture.wrapT = THREE.RepeatWrapping;
    this.gravelNormalTexture.repeat.copy(this.gravelTexture.repeat);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.gravelTexture,
      normalMap: this.gravelNormalTexture,
      normalScale: new THREE.Vector2(2, 2),
      // Wet gravel catches highlights without behaving like metal.
      roughness: 0.45,
      metalness: 0
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -H / 2, -D / 2);
    floor.receiveShadow = true;
    this.group.add(floor);

    // 2. Back Wall — Deep ocean gradient plane
    const backGeo = new THREE.PlaneGeometry(W, H);
    const backMat = new THREE.MeshStandardMaterial({
      color: 0x021324,
      roughness: 0.9,
      metalness: 0.1
    });
    const backWall = new THREE.Mesh(backGeo, backMat);
    backWall.position.set(0, 0, -D);
    backWall.receiveShadow = true;
    this.group.add(backWall);

    // 3. Side & Top Boundaries
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x052035,
      roughness: 0.8,
      metalness: 0.1
    });

    // Left wall
    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(D, H), wallMat);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-W / 2, 0, -D / 2);
    leftWall.receiveShadow = true;
    this.group.add(leftWall);

    // Right wall
    const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(D, H), wallMat);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(W / 2, 0, -D / 2);
    rightWall.receiveShadow = true;
    this.group.add(rightWall);

    // Water Surface Ceiling (with water ripple specular highlight)
    const ceilingGeo = new THREE.PlaneGeometry(W, D);
    const ceilingMat = new THREE.MeshStandardMaterial({
      color: 0x0088cc,
      roughness: 0.1,
      metalness: 0.4,
      transparent: true,
      opacity: 0.7
    });
    const ceiling = new THREE.Mesh(ceilingGeo, ceilingMat);
    ceiling.visible = false;
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, H / 2, -D / 2);
    this.group.add(ceiling);

    // 5. Sunken Driftwood Log (models/log.glb)
    this.buildLog(W, H, D);

    // Supplied decorations frame the foreground swimming area.
    for (const decoration of [
      { file: 'diver.glb', size: 0.06, x: -W * 0.18, z: -D * 0.34, yaw: 0.25 },
      { file: 'rock01.glb', size: 0.11, x: W * 0.27, z: -D * 0.30, yaw: -0.4 }
    ]) {
      this.customModelLoader.loadGLTF(`/models/${decoration.file}`)
        .then((template) => {
          // A viewport rebuild may finish before this asynchronous load does.
          if (generation !== this.environmentGeneration) return;
          const model = this.customModelLoader.instantiateDecoration(template, {
            targetScale: decoration.size,
            position: new THREE.Vector3(decoration.x, -H / 2, decoration.z),
            rotation: new THREE.Euler(0, decoration.yaw, 0)
          });
          this.customDecorations.push(model);
          this.group.add(model);
        })
        .catch((error) => console.warn(`[AquariumScene] ${decoration.file} load error:`, error));
    }

    // 6. Lush Aquatic 3D Plants (models/plant01.glb & models/plant02.glb)
    this.buildPlants(W, H, D);

    // 7. Micro-bubbles Particle System
    this.buildBubbles(W, H, D);
  }

  private buildLog(W: number, H: number, D: number): void {
    this.customModelLoader
      .loadGLTF('/models/log.glb')
      .then((template) => {
        const logGroup = this.customModelLoader.instantiateDecoration(template, {
          targetScale: 0.22, // ~22cm long sunken driftwood log
          position: new THREE.Vector3(W * 0.04, -H / 2, -D * 0.56),
          rotation: new THREE.Euler(0, 0.45, 0)
        });
        this.customDecorations.push(logGroup);
        this.group.add(logGroup);
      })
      .catch((err) => {
        console.warn('[AquariumScene] log.glb load error:', err);
      });
  }

  private buildPlants(W: number, H: number, D: number): void {
    Promise.all([
      this.customModelLoader.loadGLTF('/models/plant01.glb'),
      this.customModelLoader.loadGLTF('/models/plant02.glb')
    ])
      .then(([templatePlant01, templatePlant02]) => {
        // Natural distributed placement of custom 3D plants across seabed
        const plantConfigs = [
          // Left plant cluster
          { template: templatePlant01, x: -W * 0.30, z: -D * 0.49, scale: 0.17, rotY: 0.5 },
          { template: templatePlant02, x: -W * 0.28, z: -D * 0.73, scale: 0.20, rotY: 3.7 },

          // Right plant cluster beside the log
          { template: templatePlant02, x: W * 0.28, z: -D * 0.51, scale: 0.18, rotY: 4.2 },
          { template: templatePlant02, x: W * 0.32, z: -D * 0.75, scale: 0.16, rotY: 5.1 },

          // Back plants frame the open swimming area
          { template: templatePlant02, x: W * 0.09, z: -D * 0.81, scale: 0.14, rotY: 3.4 }
        ];

        for (const cfg of plantConfigs) {
          const plantGroup = this.customModelLoader.instantiateDecoration(cfg.template, {
            targetScale: cfg.scale,
            position: new THREE.Vector3(cfg.x, -H / 2, cfg.z),
            rotation: new THREE.Euler(0, cfg.rotY, 0)
          });
          this.customDecorations.push(plantGroup);
          this.group.add(plantGroup);

          this.plantDecorations.push({
            group: plantGroup,
            initialRotationZ: 0,
            initialRotationX: 0,
            phase: Math.random() * Math.PI * 2,
            speed: 1.0 + Math.random() * 0.5
          });
        }
      })
      .catch((err) => {
        console.warn('[AquariumScene] plant models load error:', err);
      });
  }

  private buildBubbles(W: number, H: number, D: number): void {
    const positions = new Float32Array(this.bubbleCount * 3);
    this.bubbleVelocities = new Float32Array(this.bubbleCount);

    for (let i = 0; i < this.bubbleCount; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * (W * 0.9);
      positions[i * 3 + 1] = -H / 2 + Math.random() * H;
      positions[i * 3 + 2] = -0.05 - Math.random() * (D - 0.1);

      // Upward drift speed
      this.bubbleVelocities[i] = 0.04 + Math.random() * 0.05;
    }

    const bubbleGeo = new THREE.BufferGeometry();
    bubbleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const bubbleMat = new THREE.PointsMaterial({
      color: 0xaae8ff,
      size: 0.006,
      transparent: true,
      opacity: 0.65
    });

    this.bubbles = new THREE.Points(bubbleGeo, bubbleMat);
    this.group.add(this.bubbles);
  }

  private populateFish(): void {
    const W = this.screen.width;
    const H = this.screen.height;
    const D = this.depth;

    // Helper to spawn custom 3D fish from loaded template
    const spawnCustomFishGroup = (
      template: any,
      schoolId: string,
      count: number,
      targetLength: number,
      forwardAxis: '+X' | '-X' | '+Z' | '-Z',
      maxSpeed: number,
      maxForce: number
    ) => {
      for (let i = 0; i < count; i++) {
        const instantiated = this.customModelLoader.instantiateFish(template, {
          targetLength,
          forwardAxis
        });
        const pos = new THREE.Vector3(
          (Math.random() - 0.5) * (W * 0.75),
          (Math.random() - 0.5) * (H * 0.65),
          -0.10 - Math.random() * (D - 0.20)
        );
        const fish = new Fish(
          {
            species: FishSpecies.Custom,
            schoolId,
            scale: 1.0,
            maxSpeed,
            maxForce,
            customModelRoot: instantiated.root,
            animationMixer: instantiated.mixer,
            forwardVector: instantiated.forwardVector
          },
          pos
        );
        this.boids.addFish(fish);
        this.group.add(fish.group);
      }
    };

    // 1. Fish 1 school (models/fish01.glb - 4 fish)
    this.customModelLoader
      .loadGLTF('/models/fish01.glb')
      .then((template) => {
        spawnCustomFishGroup(template, 'fish01', 4, 0.055, '-X', 0.15, 0.38);
      })
      .catch((err) => {
        console.warn('[AquariumScene] fish01.glb could not load; no procedural substitute will be spawned:', err);
      });

    // 2. Fish 2 school (models/fish02.glb - 4 fish)
    this.customModelLoader
      .loadGLTF('/models/fish02.glb')
      .then((template) => {
        spawnCustomFishGroup(template, 'fish02', 4, 0.058, '-X', 0.16, 0.40);
      })
      .catch((err) => {
        console.warn('[AquariumScene] fish02.glb could not load; no procedural substitute will be spawned:', err);
      });

    // 3. Fish 3 school (models/fish03.glb - 5 fish)
    this.customModelLoader
      .loadGLTF('/models/fish03.glb')
      .then((template) => {
        spawnCustomFishGroup(template, 'fish03', 5, 0.056, '-X', 0.16, 0.39);
      })
      .catch((err) => {
        console.warn('[AquariumScene] fish03.glb could not load; no procedural substitute will be spawned:', err);
      });
  }

  public update(deltaTimeSeconds: number, timeSeconds: number): void {
    // 1. Update aquatic plant sway with gentle current
    for (const plant of this.plantDecorations) {
      plant.group.rotation.z = plant.initialRotationZ + Math.sin(timeSeconds * plant.speed + plant.phase) * 0.035;
      plant.group.rotation.x = plant.initialRotationX + Math.cos(timeSeconds * (plant.speed * 0.8) + plant.phase) * 0.02;
    }

    // 2. Update rising micro-bubbles
    if (this.bubbles && this.bubbleVelocities) {
      const posAttr = this.bubbles.geometry.attributes.position;
      const H = this.screen.height;

      for (let i = 0; i < this.bubbleCount; i++) {
        let y = posAttr.getY(i);
        y += this.bubbleVelocities[i] * deltaTimeSeconds;

        // Reset to bottom when reaching surface
        if (y > H / 2) {
          y = -H / 2;
          posAttr.setX(i, (Math.random() - 0.5) * (this.screen.width * 0.9));
          posAttr.setZ(i, -0.05 - Math.random() * (this.depth - 0.1));
        }

        posAttr.setY(i, y);
      }
      posAttr.needsUpdate = true;
    }

    // 4. Update interactions (shockwaves & sinking food pellets)
    this.interactions.update(deltaTimeSeconds, timeSeconds);

    // 5. Update dynamic caustic water effect (sun shafts, seabed caustics, ceiling)
    this.causticEffect.update(timeSeconds);

    // 6. Update Boids Flocking Simulation
    this.boids.update(deltaTimeSeconds, timeSeconds, this.interactions.foodPellets);
  }

  /**
   * Loads and spawns custom 3D fish from a GLB/GLTF model.
   *
   * @param urlOrBlob URL or object URL of the .glb/.gltf file
   * @param count Number of fish to spawn (default: 5)
   * @param options Target length, forward axis, and swimming dynamics
   */
  public async addCustomFish(
    urlOrBlob: string,
    count: number = 5,
    options: CustomFishOptions = {}
  ): Promise<number> {
    const template = await this.customModelLoader.loadGLTF(urlOrBlob);
    const schoolId = `custom-school-${this.nextCustomSchoolId++}`;
    const W = this.screen.width;
    const H = this.screen.height;
    const D = this.depth;

    for (let i = 0; i < count; i++) {
      const instantiated = this.customModelLoader.instantiateFish(template, options);
      const pos = new THREE.Vector3(
        (Math.random() - 0.5) * (W * 0.7),
        (Math.random() - 0.5) * (H * 0.6),
        -0.10 - Math.random() * (D - 0.20)
      );
      const fish = new Fish(
        {
          species: FishSpecies.Custom,
          schoolId,
          scale: 1.0,
          maxSpeed: options.maxSpeed ?? 0.16,
          maxForce: options.maxForce ?? 0.38,
          customModelRoot: instantiated.root,
          animationMixer: instantiated.mixer,
          forwardVector: instantiated.forwardVector
        },
        pos
      );
      this.boids.addFish(fish);
      this.group.add(fish.group);
    }
    return count;
  }

  /**
   * Loads and places a custom 3D decoration (e.g. ship, castle, chest) onto the seabed.
   */
  public async addCustomDecoration(
    urlOrBlob: string,
    options: CustomDecorationOptions = {}
  ): Promise<THREE.Group> {
    const template = await this.customModelLoader.loadGLTF(urlOrBlob);
    const deco = this.customModelLoader.instantiateDecoration(template, options);

    if (!options.position) {
      // Default to seabed center
      deco.position.set(0, -this.screen.height / 2, -this.depth * 0.5);
    }

    this.customDecorations.push(deco);
    this.group.add(deco);
    return deco;
  }
}
