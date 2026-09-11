/**
 * Fish.ts
 *
 * Procedural stylized tropical fish with species variations and dynamic swimming spine articulation.
 */

import * as THREE from 'three';

export enum FishSpecies {
  Clownfish = 'Clownfish',
  BlueTang = 'BlueTang',
  YellowTang = 'YellowTang',
  NeonTetra = 'NeonTetra',
  Custom = 'Custom'
}

export interface FishConfig {
  species: FishSpecies;
  scale: number;
  maxSpeed: number;
  maxForce: number;
  /** Optional custom 3D model root group */
  customModelRoot?: THREE.Group;
  /** Optional animation mixer for custom rigged/animated models */
  animationMixer?: THREE.AnimationMixer | null;
  /** Forward direction vector of the model (default: +X [1, 0, 0]) */
  forwardVector?: THREE.Vector3;
}

export class Fish {
  public readonly group: THREE.Group;
  public readonly species: FishSpecies;

  // Boids physics state
  public position: THREE.Vector3;
  public velocity: THREE.Vector3;
  public acceleration: THREE.Vector3;
  public maxSpeed: number;
  public maxForce: number;

  // Custom model components
  private customModelRoot: THREE.Group | null = null;
  private animationMixer: THREE.AnimationMixer | null = null;

  // Static reusable math objects for strictly upright orientation calculation
  private static readonly WORLD_UP: THREE.Vector3 = new THREE.Vector3(0, 1, 0);
  private static readonly MAX_PITCH_RAD: number = (25 * Math.PI) / 180; // +/- 25 degrees max pitch
  private static readonly basisMatrix: THREE.Matrix4 = new THREE.Matrix4();
  private static readonly targetQuat: THREE.Quaternion = new THREE.Quaternion();
  private static readonly tempVecX: THREE.Vector3 = new THREE.Vector3();
  private static readonly tempVecY: THREE.Vector3 = new THREE.Vector3();
  private static readonly tempVecZ: THREE.Vector3 = new THREE.Vector3();

  private lastHeading: THREE.Vector3 = new THREE.Vector3(1, 0, 0);

  // Animation components
  private tailPivot: THREE.Group;
  private pectoralLeft: THREE.Mesh | null = null;
  private pectoralRight: THREE.Mesh | null = null;
  private animPhase: number;
  private animFrequency: number = 8.0;

  constructor(config: FishConfig, initialPosition: THREE.Vector3) {
    this.species = config.species;
    this.maxSpeed = config.maxSpeed;
    this.maxForce = config.maxForce;

    this.position = initialPosition.clone();
    // Start with random wandering velocity
    this.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 0.2,
      (Math.random() - 0.5) * 0.05,
      (Math.random() - 0.5) * 0.2
    ).normalize().multiplyScalar(this.maxSpeed * 0.6);
    this.acceleration = new THREE.Vector3();

    this.group = new THREE.Group();
    this.tailPivot = new THREE.Group();
    this.animPhase = Math.random() * Math.PI * 2;

    if (config.customModelRoot) {
      this.customModelRoot = config.customModelRoot;
      this.animationMixer = config.animationMixer ?? null;
      this.group.add(this.customModelRoot);
    } else {
      this.buildMesh(config.scale);
    }

    this.group.position.copy(this.position);

    // Initialize orientation strictly upright along initial heading
    const sxz = Math.hypot(this.velocity.x, this.velocity.z);
    if (sxz > 0.0001) {
      this.lastHeading.set(this.velocity.x / sxz, 0, this.velocity.z / sxz);
      Fish.tempVecX.copy(this.lastHeading);
      Fish.tempVecZ.crossVectors(Fish.tempVecX, Fish.WORLD_UP).normalize();
      Fish.tempVecY.crossVectors(Fish.tempVecZ, Fish.tempVecX).normalize();
      Fish.basisMatrix.makeBasis(Fish.tempVecX, Fish.tempVecY, Fish.tempVecZ);
      this.group.quaternion.setFromRotationMatrix(Fish.basisMatrix);
    }
  }

  private buildMesh(scale: number): void {
    switch (this.species) {
      case FishSpecies.Clownfish:
        this.buildClownfish(scale);
        break;
      case FishSpecies.BlueTang:
        this.buildBlueTang(scale);
        break;
      case FishSpecies.YellowTang:
        this.buildYellowTang(scale);
        break;
      case FishSpecies.NeonTetra:
      default:
        this.buildNeonTetra(scale);
        break;
    }
  }

  private buildClownfish(scale: number): void {
    const s = scale * 0.010; // Miniature scale (~3.6cm length)

    // Body: rounded ellipsoid, vibrant orange
    const bodyGeo = new THREE.SphereGeometry(1, 16, 12);
    bodyGeo.scale(1.8 * s, 1.0 * s, 0.45 * s);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xff5500,
      emissive: 0x331500,
      roughness: 0.35,
      metalness: 0.1
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    this.group.add(body);

    // White stripes
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    const stripeGeo = new THREE.CylinderGeometry(0.98 * s, 0.98 * s, 0.25 * s, 16);
    stripeGeo.scale(1.0, 1.0, 0.46);

    const stripe1 = new THREE.Mesh(stripeGeo, stripeMat);
    stripe1.position.x = 0.4 * s;
    stripe1.rotation.z = Math.PI / 2;
    this.group.add(stripe1);

    const stripe2 = new THREE.Mesh(stripeGeo, stripeMat);
    stripe2.position.x = -0.4 * s;
    stripe2.rotation.z = Math.PI / 2;
    this.group.add(stripe2);

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.12 * s, 8, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(1.2 * s, 0.2 * s, 0.35 * s);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(1.2 * s, 0.2 * s, -0.35 * s);
    this.group.add(eyeL, eyeR);

    // Articulated Tail Fin
    this.tailPivot.position.set(-1.4 * s, 0, 0);
    const tailGeo = new THREE.BufferGeometry();
    const tailVertices = new Float32Array([
      0, 0, 0,
      -1.1 * s, 0.7 * s, 0,
      -1.1 * s, -0.7 * s, 0,
    ]);
    tailGeo.setAttribute('position', new THREE.BufferAttribute(tailVertices, 3));
    tailGeo.computeVertexNormals();
    const tailMesh = new THREE.Mesh(tailGeo, new THREE.MeshStandardMaterial({
      color: 0xff7711,
      side: THREE.DoubleSide
    }));
    this.tailPivot.add(tailMesh);
    this.group.add(this.tailPivot);

    // Pectoral Fins
    const finGeo = new THREE.PlaneGeometry(0.5 * s, 0.35 * s);
    const finMat = new THREE.MeshStandardMaterial({ color: 0xffaa44, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    this.pectoralLeft = new THREE.Mesh(finGeo, finMat);
    this.pectoralLeft.position.set(0.3 * s, -0.2 * s, 0.4 * s);
    this.pectoralLeft.rotation.y = 0.4;
    this.pectoralRight = new THREE.Mesh(finGeo, finMat);
    this.pectoralRight.position.set(0.3 * s, -0.2 * s, -0.4 * s);
    this.pectoralRight.rotation.y = -0.4;
    this.group.add(this.pectoralLeft, this.pectoralRight);
  }

  private buildBlueTang(scale: number): void {
    const s = scale * 0.011;

    // Body: Oval electric blue
    const bodyGeo = new THREE.SphereGeometry(1, 16, 12);
    bodyGeo.scale(1.7 * s, 1.2 * s, 0.38 * s);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x0055ff,
      emissive: 0x001144,
      roughness: 0.3,
      metalness: 0.2
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    this.group.add(body);

    // Yellow Tail
    this.tailPivot.position.set(-1.4 * s, 0, 0);
    const tailGeo = new THREE.BufferGeometry();
    const tailVerts = new Float32Array([
      0, 0, 0,
      -1.0 * s, 0.8 * s, 0,
      -1.0 * s, -0.8 * s, 0
    ]);
    tailGeo.setAttribute('position', new THREE.BufferAttribute(tailVerts, 3));
    tailGeo.computeVertexNormals();
    const tailMesh = new THREE.Mesh(tailGeo, new THREE.MeshStandardMaterial({
      color: 0xffdd00,
      emissive: 0x332b00,
      side: THREE.DoubleSide
    }));
    this.tailPivot.add(tailMesh);
    this.group.add(this.tailPivot);

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.12 * s, 8, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(1.1 * s, 0.25 * s, 0.32 * s);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(1.1 * s, 0.25 * s, -0.32 * s);
    this.group.add(eyeL, eyeR);
  }

  private buildYellowTang(scale: number): void {
    const s = scale * 0.010;

    // Disc shaped body, brilliant yellow
    const bodyGeo = new THREE.CylinderGeometry(1 * s, 1 * s, 0.2 * s, 16);
    bodyGeo.scale(1.2, 1.0, 1.4);
    bodyGeo.rotateZ(Math.PI / 2);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xffea00,
      emissive: 0x332a00,
      roughness: 0.25,
      metalness: 0.1
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    this.group.add(body);

    // Tail
    this.tailPivot.position.set(-1.2 * s, 0, 0);
    const tailGeo = new THREE.PlaneGeometry(0.7 * s, 0.8 * s);
    const tailMesh = new THREE.Mesh(tailGeo, new THREE.MeshStandardMaterial({
      color: 0xffcc00,
      emissive: 0x332a00,
      side: THREE.DoubleSide
    }));
    this.tailPivot.add(tailMesh);
    this.group.add(this.tailPivot);

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.1 * s, 8, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(0.85 * s, 0.15 * s, 0.18 * s);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.85 * s, 0.15 * s, -0.18 * s);
    this.group.add(eyeL, eyeR);
  }

  private buildNeonTetra(scale: number): void {
    const s = scale * 0.007;

    // Slender torpedo body
    const bodyGeo = new THREE.SphereGeometry(1, 12, 10);
    bodyGeo.scale(2.2 * s, 0.6 * s, 0.3 * s);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      emissive: 0x004455,
      roughness: 0.2
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    this.group.add(body);

    // Red belly / lower half
    const redGeo = new THREE.SphereGeometry(0.7, 10, 8);
    redGeo.scale(1.4 * s, 0.4 * s, 0.28 * s);
    const redMat = new THREE.MeshStandardMaterial({
      color: 0xff0044,
      emissive: 0x440011,
      roughness: 0.3
    });
    const redMesh = new THREE.Mesh(redGeo, redMat);
    redMesh.position.set(-0.5 * s, -0.2 * s, 0);
    this.group.add(redMesh);

    // Tail
    this.tailPivot.position.set(-1.8 * s, 0, 0);
    const tailGeo = new THREE.PlaneGeometry(0.6 * s, 0.45 * s);
    const tailMesh = new THREE.Mesh(tailGeo, new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide
    }));
    this.tailPivot.add(tailMesh);
    this.group.add(this.tailPivot);
  }

  public applyForce(force: THREE.Vector3): void {
    this.acceleration.add(force);
  }

  public update(deltaTime: number, timeSeconds: number): void {
    // Limit vertical component of physical velocity so fish swim predominantly horizontally
    const maxVerticalSpeed = this.maxSpeed * Math.sin(Fish.MAX_PITCH_RAD);
    this.velocity.y = THREE.MathUtils.clamp(this.velocity.y, -maxVerticalSpeed, maxVerticalSpeed);

    // Integrate physics
    this.velocity.addScaledVector(this.acceleration, deltaTime);
    this.velocity.clampLength(0.02, this.maxSpeed);
    this.position.addScaledVector(this.velocity, deltaTime);
    this.acceleration.set(0, 0, 0);

    // Position mesh group
    this.group.position.copy(this.position);

    // Orient mesh: strictly upright (roll = 0) with pitch limited to +/- 25 degrees
    const speedSq = this.velocity.lengthSq();
    if (speedSq > 0.0001) {
      const sxz = Math.hypot(this.velocity.x, this.velocity.z);
      if (sxz > 0.0001) {
        this.lastHeading.set(this.velocity.x / sxz, 0, this.velocity.z / sxz);
      }

      const pitch = Math.atan2(this.velocity.y, Math.max(0.0001, sxz));
      const clampedPitch = THREE.MathUtils.clamp(pitch, -Fish.MAX_PITCH_RAD, Fish.MAX_PITCH_RAD);

      const cosP = Math.cos(clampedPitch);
      const sinP = Math.sin(clampedPitch);

      // Forward vector (+X of fish model)
      Fish.tempVecX
        .copy(this.lastHeading)
        .multiplyScalar(cosP)
        .addScaledVector(Fish.WORLD_UP, sinP)
        .normalize();

      // Left vector (+Z of fish model, strictly horizontal so roll = 0)
      Fish.tempVecZ.crossVectors(Fish.tempVecX, Fish.WORLD_UP).normalize();

      // Up vector (+Y of fish model, points upward)
      Fish.tempVecY.crossVectors(Fish.tempVecZ, Fish.tempVecX).normalize();

      Fish.basisMatrix.makeBasis(Fish.tempVecX, Fish.tempVecY, Fish.tempVecZ);
      Fish.targetQuat.setFromRotationMatrix(Fish.basisMatrix);

      // Smooth orientation slerp
      this.group.quaternion.slerp(Fish.targetQuat, Math.min(1.0, deltaTime * 6.0));
    }

    const currentSpeed = this.velocity.length();
    const speedRatio = currentSpeed / this.maxSpeed;

    // Dynamic swimming animation for procedural fish (tail wags, pectoral fins flutter)
    // Custom imported models do NOT have body wiggle applied to prevent jitter
    if (!this.customModelRoot) {
      const wagFreq = this.animFrequency * (0.8 + speedRatio * 1.5);
      const wagAngle = Math.sin(timeSeconds * wagFreq + this.animPhase) * (0.35 + speedRatio * 0.3);
      this.tailPivot.rotation.y = wagAngle;

      // Flutter pectoral fins
      if (this.pectoralLeft && this.pectoralRight) {
        const flutter = Math.sin(timeSeconds * wagFreq * 1.5 + this.animPhase) * 0.25;
        this.pectoralLeft.rotation.z = flutter;
        this.pectoralRight.rotation.z = -flutter;
      }
    }
  }

  public dispose(): void {
    if (this.animationMixer) {
      this.animationMixer.stopAllAction();
      this.animationMixer = null;
    }

    this.group.traverse((child) => {
      if ((child as THREE.Mesh).geometry) {
        (child as THREE.Mesh).geometry.dispose();
      }
      if ((child as THREE.Mesh).material) {
        const mat = (child as THREE.Mesh).material;
        if (Array.isArray(mat)) mat.forEach(m => m.dispose());
        else mat.dispose();
      }
    });
  }
}

