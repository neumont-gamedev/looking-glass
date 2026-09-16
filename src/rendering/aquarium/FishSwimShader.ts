import * as THREE from 'three';

const declarations = /* glsl */`
uniform float uSwimPhase;
uniform float uSwimAmplitude;
uniform float uFishHead;
uniform float uFishLength;
uniform mat4 uMeshToFish;
uniform mat4 uFishToMesh;
uniform mat3 uNormalToFish;
uniform mat3 uNormalFromFish;

// Fish space is meters, +X toward the nose and +Z sideways. The squared
// envelope keeps the head steady and increases the bend toward the tail.
vec2 swimWave(float x) {
  float t = clamp((uFishHead - x) / uFishLength, 0.0, 1.0);
  float angle = 6.2831853 * t - uSwimPhase;
  float offset = uSwimAmplitude * t * t * sin(angle);
  float slope = -uSwimAmplitude / uFishLength *
    (2.0 * t * sin(angle) + 6.2831853 * t * t * cos(angle));
  return vec2(offset, slope);
}
`;

/** Per-fish uniforms with matching surface and shadow deformation. */
export class FishSwimShader {
  private phase: { value: number };
  private amplitude = { value: 0 };
  private length: number;
  private shadowMaterials: THREE.Material[] = [];

  constructor(root: THREE.Group, initialPhase: number) {
    this.phase = { value: initialPhase };
    root.updateWorldMatrix(true, true);
    const rootInverse = root.matrixWorld.clone().invert();
    const bounds = new THREE.Box3();
    const meshes: THREE.Mesh[] = [];
    root.traverse(child => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      mesh.geometry.computeBoundingBox();
      const toFish = rootInverse.clone().multiply(mesh.matrixWorld);
      bounds.union(mesh.geometry.boundingBox!.clone().applyMatrix4(toFish));
      meshes.push(mesh);
    });
    this.length = Math.max(.001, bounds.max.x - bounds.min.x);
    for (const mesh of meshes) {
      const toFish = rootInverse.clone().multiply(mesh.matrixWorld);
      const toMesh = toFish.clone().invert();
      const uniforms = {
        uSwimPhase: this.phase,
        uSwimAmplitude: this.amplitude,
        uFishHead: { value: bounds.max.x },
        uFishLength: { value: this.length },
        uMeshToFish: { value: toFish },
        uFishToMesh: { value: toMesh },
        uNormalToFish: { value: new THREE.Matrix3().getNormalMatrix(toFish) },
        uNormalFromFish: { value: new THREE.Matrix3().setFromMatrix4(toFish).transpose() }
      };
      const patch = (material: THREE.Material): void => {
        material.onBeforeCompile = shader => {
          Object.assign(shader.uniforms, uniforms);
          const hasNormals = shader.vertexShader.includes('#include <defaultnormal_vertex>');
          shader.vertexShader = declarations + shader.vertexShader;
          if (hasNormals) {
            // Evaluate lighting normals after morphing/skinning and deformation.
            shader.vertexShader = shader.vertexShader
              .replace('#include <defaultnormal_vertex>', '')
              .replace('#include <normal_vertex>', '');
          }
          shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', /* glsl */`
            vec3 swimPosition = (uMeshToFish * vec4(transformed, 1.0)).xyz;
            vec2 swim = swimWave(swimPosition.x);
            swimPosition.z += swim.x;
            transformed = (uFishToMesh * vec4(swimPosition, 1.0)).xyz;
            ${hasNormals ? /* glsl */`
              // Inverse transpose of the bend Jacobian: nx -= dz/dx * nz.
              vec3 swimNormal = uNormalToFish * objectNormal;
              swimNormal.x -= swim.y * swimNormal.z;
              objectNormal = normalize(uNormalFromFish * swimNormal);
              #ifdef USE_TANGENT
                vec3 swimTangent = mat3(uMeshToFish) * objectTangent;
                swimTangent.z += swim.y * swimTangent.x;
                objectTangent = normalize(mat3(uFishToMesh) * swimTangent);
              #endif
              #include <defaultnormal_vertex>
              #include <normal_vertex>
            ` : ''}
            #include <project_vertex>
          `);
        };
        material.customProgramCacheKey = () => 'fish-swim-v1';
      };
      const originals = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const materials = originals.map(material => {
        const clone = material.clone();
        patch(clone);
        return clone;
      });
      mesh.material = Array.isArray(mesh.material) ? materials : materials[0];
      const surface = materials[0] as THREE.MeshStandardMaterial;
      const shadowOptions = { map: surface.map, alphaMap: surface.alphaMap, alphaTest: surface.alphaTest, side: surface.side };
      mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ ...shadowOptions, depthPacking: THREE.RGBADepthPacking });
      mesh.customDistanceMaterial = new THREE.MeshDistanceMaterial(shadowOptions);
      for (const shadow of [mesh.customDepthMaterial, mesh.customDistanceMaterial]) {
        patch(shadow);
        this.shadowMaterials.push(shadow);
      }
      // Own the geometry so expanding bounds/disposal cannot affect sibling fish.
      mesh.geometry = mesh.geometry.clone();
      mesh.geometry.computeBoundingSphere();
      const maxLocalOffset = new THREE.Vector3(0, 0, this.length * .08)
        .applyMatrix3(new THREE.Matrix3().setFromMatrix4(toMesh)).length();
      mesh.geometry.boundingSphere!.radius += maxLocalOffset;
    }
  }

  public update(dt: number, speedRatio: number): void {
    const speed = THREE.MathUtils.clamp(speedRatio, 0, 1);
    // Integrate phase, rather than multiplying time by speed (which would jump).
    this.phase.value = (this.phase.value + Math.max(0, dt) * (7 + 11 * speed)) % (2 * Math.PI);
    this.amplitude.value = this.length * (.025 + .045 * speed);
  }

  public dispose(): void {
    this.shadowMaterials.forEach(material => material.dispose());
  }
}
