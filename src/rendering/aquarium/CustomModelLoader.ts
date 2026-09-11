/**
 * CustomModelLoader.ts
 *
 * Handles loading, caching, scaling, and instantiating custom glTF/GLB models
 * for custom animated fish and aquarium decorations.
 */

import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

export interface CustomFishOptions {
  /** Target body length in meters (default: 0.045m = 4.5cm) */
  targetLength?: number;
  /** Forward axis of the model ('+X', '-X', '+Z', '-Z'). Default: '+X' */
  forwardAxis?: '+X' | '-X' | '+Z' | '-Z';
  /** Max swimming speed in m/s (default: 0.16) */
  maxSpeed?: number;
  /** Max steering force (default: 0.38) */
  maxForce?: number;
  /** Custom label / name */
  name?: string;
}

export interface CustomDecorationOptions {
  /** Target bounding box height/width scale in meters (default: 0.08m) */
  targetScale?: number;
  /** World position inside tank (default: seabed center) */
  position?: THREE.Vector3;
  /** Rotation in radians */
  rotation?: THREE.Euler;
}

export interface InstantiatedFishModel {
  root: THREE.Group;
  mixer: THREE.AnimationMixer | null;
  forwardVector: THREE.Vector3;
}

export class CustomModelLoader {
  private loader: GLTFLoader = new GLTFLoader();
  private cache: Map<string, GLTF> = new Map();

  /**
   * Loads a GLTF/GLB file from a URL or object URL.
   */
  public async loadGLTF(url: string): Promise<GLTF> {
    if (this.cache.has(url)) {
      return this.cache.get(url)!;
    }

    return new Promise((resolve, reject) => {
      this.loader.load(
        url,
        (gltf) => {
          this.cache.set(url, gltf);
          resolve(gltf);
        },
        undefined,
        (err) => {
          console.error(`[CustomModelLoader] Failed to load model from ${url}:`, err);
          reject(err);
        }
      );
    });
  }

  /**
   * Instantiates an independent fish model from a GLTF template with proper
   * skeleton cloning, bounding normalization, and animation binding.
   */
  public instantiateFish(template: GLTF, options: CustomFishOptions = {}): InstantiatedFishModel {
    const targetLength = options.targetLength ?? 0.045; // Default ~4.5cm
    const forwardAxis = options.forwardAxis ?? '+X';

    // 1. Clone scene with full skeletal rig support
    const clonedScene = SkeletonUtils.clone(template.scene) as THREE.Group;

    // 2. Compute bounding box to normalize scale
    const bbox = new THREE.Box3().setFromObject(clonedScene);
    const size = new THREE.Vector3();
    bbox.getSize(size);

    // Determine the primary axis length (largest dimension of the bounding box)
    const maxDim = Math.max(0.001, size.x, size.y, size.z);
    const scaleFactor = targetLength / maxDim;
    clonedScene.scale.setScalar(scaleFactor);

    // Center pivot point to center of bounding box
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    clonedScene.position.set(
      -center.x * scaleFactor,
      -center.y * scaleFactor,
      -center.z * scaleFactor
    );

    // Wrap in an outer orientation group so alignment rotations don't conflict
    const wrapperGroup = new THREE.Group();
    wrapperGroup.add(clonedScene);

    // Enable shadows and two-sided rendering on all child meshes
    clonedScene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => (m.side = THREE.DoubleSide));
          } else {
            mesh.material.side = THREE.DoubleSide;
          }
        }
      }
    });

    // 3. Animation Mixer (if model has rigged skeletal animations)
    let mixer: THREE.AnimationMixer | null = null;
    if (template.animations && template.animations.length > 0) {
      mixer = new THREE.AnimationMixer(clonedScene);
      // Look for a swim/swimming/idle clip, or fallback to first clip
      const swimClip =
        template.animations.find((a) => /swim/i.test(a.name)) ??
        template.animations.find((a) => /walk|move|run|fly/i.test(a.name)) ??
        template.animations[0];

      const action = mixer.clipAction(swimClip);
      action.play();
    }

    // Determine forward vector based on chosen forward axis
    let forwardVector = new THREE.Vector3(1, 0, 0); // +X default
    switch (forwardAxis) {
      case '+X':
        forwardVector = new THREE.Vector3(1, 0, 0);
        break;
      case '-X':
        forwardVector = new THREE.Vector3(-1, 0, 0);
        break;
      case '+Z':
        forwardVector = new THREE.Vector3(0, 0, 1);
        break;
      case '-Z':
        forwardVector = new THREE.Vector3(0, 0, -1);
        break;
    }

    return {
      root: wrapperGroup,
      mixer,
      forwardVector
    };
  }

  /**
   * Instantiates a static aquarium decoration (e.g. sunken ship, chest, castle).
   */
  public instantiateDecoration(template: GLTF, options: CustomDecorationOptions = {}): THREE.Group {
    const targetScale = options.targetScale ?? 0.08;
    const clonedScene = SkeletonUtils.clone(template.scene) as THREE.Group;

    // Compute bounding box to normalize scale
    const bbox = new THREE.Box3().setFromObject(clonedScene);
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const maxDim = Math.max(0.001, size.x, size.y, size.z);
    const scale = targetScale / maxDim;
    clonedScene.scale.setScalar(scale);

    // Re-center bottom of model onto floor (y = 0 in local space)
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    clonedScene.position.set(
      -center.x * scale,
      -bbox.min.y * scale,
      -center.z * scale
    );

    const wrapperGroup = new THREE.Group();
    wrapperGroup.add(clonedScene);

    if (options.position) {
      wrapperGroup.position.copy(options.position);
    }
    if (options.rotation) {
      wrapperGroup.rotation.copy(options.rotation);
    }

    clonedScene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => (m.side = THREE.DoubleSide));
          } else {
            mesh.material.side = THREE.DoubleSide;
          }
        }
      }
    });

    return wrapperGroup;
  }
}

