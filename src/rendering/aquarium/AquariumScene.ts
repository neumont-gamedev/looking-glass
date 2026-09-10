/**
 * AquariumScene.ts
 *
 * Implements the 3D Virtual Aquarium environment:
 * - Sandy ocean floor, coral rocks, and swaying kelp/seaweed
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

interface SeaweedStem {
  mesh: THREE.Mesh;
  initialPositions: Float32Array;
  phase: number;
  speed: number;
}

export class AquariumScene {
  public readonly group: THREE.Group = new THREE.Group();
  public readonly boids: BoidsSimulation;
  public readonly interactions: AquariumInteractions;
  public readonly customModelLoader: CustomModelLoader = new CustomModelLoader();

  private screen: ScreenGeometry;
  private readonly depth: number = 0.85;

  // Environment elements
  private bubbles: THREE.Points | null = null;
  private bubbleVelocities: Float32Array | null = null;
  private bubbleCount: number = 180;
  private seaweedStems: SeaweedStem[] = [];
  private causticLight: THREE.SpotLight | null = null;
  private customDecorations: THREE.Group[] = [];

  constructor(screen: ScreenGeometry) {
    this.screen = screen;
    this.boids = new BoidsSimulation(screen, this.depth);
    this.interactions = new AquariumInteractions(this.boids, screen);

    this.group.add(this.interactions.group);

    this.buildEnvironment();
    this.populateFish();
  }

  public rebuild(screen: ScreenGeometry): void {
    this.screen = screen;
    this.boids.screen = screen;
    this.interactions.setScreenGeometry(screen);

    this.clear();
    this.buildEnvironment();
    this.populateFish();
  }

  private clear(): void {
    // Clean up fish
    for (const fish of this.boids.fishes) {
      this.group.remove(fish.group);
      fish.dispose();
    }
    this.boids.fishes.length = 0;

    // Clean up bubbles and seaweed
    if (this.bubbles) {
      this.group.remove(this.bubbles);
      this.bubbles.geometry.dispose();
      (this.bubbles.material as THREE.Material).dispose();
      this.bubbles = null;
    }

    this.seaweedStems.forEach((s) => {
      this.group.remove(s.mesh);
      s.mesh.geometry.dispose();
      (s.mesh.material as THREE.Material).dispose();
    });
    this.seaweedStems = [];

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

    while (this.group.children.length > 0) {
      const child = this.group.children[0];
      this.group.remove(child);
      if ((child as THREE.Mesh).geometry) {
        (child as THREE.Mesh).geometry.dispose();
      }
    }

    this.group.add(this.interactions.group);
  }

  private buildEnvironment(): void {
    const W = this.screen.width;
    const H = this.screen.height;
    const D = this.depth;

    // 1. Sandy Sea Floor (at y = -H/2)
    const floorGeo = new THREE.PlaneGeometry(W, D, 32, 32);
    // Add subtle fine sand ripples to the seabed
    const posAttr = floorGeo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const zOffset = Math.sin(x * 12) * 0.003 + Math.cos(y * 8) * 0.002;
      posAttr.setZ(i, zOffset);
    }
    floorGeo.computeVertexNormals();

    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xd2b48c, // Sand color
      roughness: 0.85,
      metalness: 0.05
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
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, H / 2, -D / 2);
    this.group.add(ceiling);

    // 4. Underwater Coral & Rock Formations (Multi-depth)
    this.buildRocks(W, H, D);

    // 5. Swaying Kelp / Seaweed Stems
    this.buildSeaweed(W, H, D);

    // 6. Micro-bubbles Particle System
    this.buildBubbles(W, H, D);

    // 7. Sunlight Shaft & Caustic Accent Light
    this.causticLight = new THREE.SpotLight(0x00ffff, 2.5, D * 1.5, Math.PI / 3, 0.4, 1.2);
    this.causticLight.position.set(0, H / 2 + 0.1, -D / 2);
    this.causticLight.target.position.set(0, -H / 2, -D / 2);
    this.group.add(this.causticLight);
    this.group.add(this.causticLight.target);
  }

  private buildRocks(W: number, H: number, _D: number): void {
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x424e56,
      roughness: 0.85,
      metalness: 0.1
    });

    const coralMat = new THREE.MeshStandardMaterial({
      color: 0xd9536f,
      emissive: 0x331018,
      roughness: 0.6,
      metalness: 0.1
    });

    // Rock cluster 1: Left midground (delicate ~6cm rock)
    const rock1Geo = new THREE.DodecahedronGeometry(0.028, 1);
    rock1Geo.scale(1.3, 0.7, 0.9);
    const rock1 = new THREE.Mesh(rock1Geo, rockMat);
    rock1.position.set(-W * 0.22, -H / 2 + 0.015, -0.38);
    rock1.castShadow = true;
    rock1.receiveShadow = true;
    this.group.add(rock1);

    // Miniature coral branch on rock 1
    const coral1Geo = new THREE.CylinderGeometry(0.004, 0.008, 0.035, 8);
    const coral1 = new THREE.Mesh(coral1Geo, coralMat);
    coral1.position.set(-W * 0.21, -H / 2 + 0.045, -0.37);
    coral1.castShadow = true;
    this.group.add(coral1);

    // Rock cluster 2: Right deep midground (~7.5cm rock)
    const rock2Geo = new THREE.DodecahedronGeometry(0.036, 1);
    rock2Geo.scale(1.3, 0.8, 1.0);
    const rock2 = new THREE.Mesh(rock2Geo, rockMat);
    rock2.position.set(W * 0.24, -H / 2 + 0.022, -0.55);
    rock2.castShadow = true;
    rock2.receiveShadow = true;
    this.group.add(rock2);

    // Miniature scattered river stones
    const pebble1 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.015, 0), rockMat);
    pebble1.scale.set(1.4, 0.6, 1.0);
    pebble1.position.set(-W * 0.10, -H / 2 + 0.008, -0.32);
    this.group.add(pebble1);

    const pebble2 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.018, 0), rockMat);
    pebble2.scale.set(1.2, 0.7, 0.9);
    pebble2.position.set(W * 0.08, -H / 2 + 0.01, -0.42);
    this.group.add(pebble2);

    const pebble3 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.012, 0), rockMat);
    pebble3.scale.set(1.1, 0.5, 1.0);
    pebble3.position.set(W * 0.16, -H / 2 + 0.006, -0.28);
    this.group.add(pebble3);

    // Rock cluster 3: Delicate background reef arch (z = -0.70m)
    const archGeo = new THREE.TorusGeometry(0.045, 0.012, 8, 24, Math.PI);
    const arch = new THREE.Mesh(archGeo, rockMat);
    arch.position.set(0, -H / 2 + 0.012, -0.70);
    arch.rotation.z = Math.PI;
    arch.receiveShadow = true;
    this.group.add(arch);
  }

  private buildSeaweed(W: number, H: number, D: number): void {
    const seaweedMat = new THREE.MeshStandardMaterial({
      color: 0x1f7a3a,
      emissive: 0x072810,
      roughness: 0.5,
      side: THREE.DoubleSide
    });

    const spawnKelp = (x: number, z: number, height: number, phase: number) => {
      const segments = 8;
      // Slender natural 3.5mm blade width
      const geo = new THREE.PlaneGeometry(0.0035, height, 1, segments);
      geo.translate(0, height / 2, 0);

      const posAttr = geo.attributes.position;
      const initialPos = new Float32Array(posAttr.array);

      const mesh = new THREE.Mesh(geo, seaweedMat);
      mesh.position.set(x, -H / 2, z);
      mesh.castShadow = true;
      this.group.add(mesh);

      this.seaweedStems.push({
        mesh,
        initialPositions: initialPos,
        phase,
        speed: 1.4 + Math.random() * 0.4
      });
    };

    // Plant slender kelp stems along background corners
    for (let i = 0; i < 9; i++) {
      const x = -W * 0.38 + (Math.random() - 0.5) * 0.06;
      const z = -0.35 - Math.random() * (D * 0.5);
      spawnKelp(x, z, H * (0.22 + Math.random() * 0.22), i * 0.7);
    }

    for (let i = 0; i < 8; i++) {
      const x = W * 0.35 + (Math.random() - 0.5) * 0.06;
      const z = -0.40 - Math.random() * (D * 0.45);
      spawnKelp(x, z, H * (0.24 + Math.random() * 0.20), i * 0.8);
    }
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

    // Helper to spawn a fish inside tank bounds
    const spawn = (species: FishSpecies, scale: number, maxSpeed: number, maxForce: number) => {
      const pos = new THREE.Vector3(
        (Math.random() - 0.5) * (W * 0.75),
        (Math.random() - 0.5) * (H * 0.65),
        -0.18 - Math.random() * (D * 0.65)
      );
      const fish = new Fish({ species, scale, maxSpeed, maxForce }, pos);
      this.boids.addFish(fish);
      this.group.add(fish.group);
    };

    // 1. School of Clownfish (6 fish)
    for (let i = 0; i < 6; i++) {
      spawn(FishSpecies.Clownfish, 1.0, 0.14, 0.35);
    }

    // 2. Pair of Blue Tangs (4 fish)
    for (let i = 0; i < 4; i++) {
      spawn(FishSpecies.BlueTang, 1.15, 0.16, 0.4);
    }

    // 3. Yellow Tangs (4 fish)
    for (let i = 0; i < 4; i++) {
      spawn(FishSpecies.YellowTang, 1.1, 0.15, 0.38);
    }

    // 4. Large School of Neon Tetras (14 fish)
    for (let i = 0; i < 14; i++) {
      spawn(FishSpecies.NeonTetra, 0.9, 0.20, 0.5);
    }
  }

  public update(deltaTimeSeconds: number, timeSeconds: number): void {
    // 1. Update seaweed sway with sine wave displacement
    for (const stem of this.seaweedStems) {
      const posAttr = stem.mesh.geometry.attributes.position;
      const initial = stem.initialPositions;
      const count = posAttr.count;

      for (let i = 0; i < count; i++) {
        const origY = initial[i * 3 + 1];
        const heightRatio = origY / (this.screen.height * 0.7);
        // Greater sway at top of stem
        const sway = Math.sin(timeSeconds * stem.speed + stem.phase + origY * 5) * (0.025 * heightRatio);
        posAttr.setX(i, initial[i * 3 + 0] + sway);
      }
      posAttr.needsUpdate = true;
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

    // 3. Update Caustic spotlight motion
    if (this.causticLight) {
      this.causticLight.position.x = Math.sin(timeSeconds * 0.8) * (this.screen.width * 0.25);
      this.causticLight.position.z = -this.depth / 2 + Math.cos(timeSeconds * 0.6) * 0.15;
    }

    // 4. Update interactions (shockwaves & sinking food pellets)
    this.interactions.update(deltaTimeSeconds, timeSeconds);

    // 5. Update Boids Flocking Simulation
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
    const W = this.screen.width;
    const H = this.screen.height;
    const D = this.depth;

    for (let i = 0; i < count; i++) {
      const instantiated = this.customModelLoader.instantiateFish(template, options);
      const pos = new THREE.Vector3(
        (Math.random() - 0.5) * (W * 0.7),
        (Math.random() - 0.5) * (H * 0.6),
        -0.20 - Math.random() * (D * 0.6)
      );
      const fish = new Fish(
        {
          species: FishSpecies.Custom,
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
