import * as THREE from 'three';

/** Shared world-space light modulation; distances are meters, time is seconds. */
export class PlanarCaustics {
  public readonly intensity = { value: 1.8 };
  public readonly patternSize = { value: 0.045 };
  public readonly speed = { value: 0.975 };
  private readonly time = { value: 0 };
  private readonly patched = new WeakSet<THREE.Material>();

  public update(root: THREE.Object3D, timeSeconds: number): void {
    this.time.value = timeSeconds;
    // Includes asynchronously loaded decorations and newly added fish.
    root.traverse(object => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (!(material as THREE.MeshStandardMaterial).isMeshStandardMaterial || this.patched.has(material)) continue;
        this.patched.add(material);
        const previousCompile = material.onBeforeCompile;
        const previousKey = material.customProgramCacheKey.bind(material);
        const key = previousKey();
        material.onBeforeCompile = (shader, renderer) => {
          // Preserve the fish deformation callback, including its corrected normals.
          previousCompile.call(material, shader, renderer);
          Object.assign(shader.uniforms, {
            uCausticTime: this.time, uCausticIntensity: this.intensity,
            uCausticSize: this.patternSize, uCausticSpeed: this.speed
          });
          shader.vertexShader = 'varying vec3 vCausticWorld;\n' + shader.vertexShader;
          shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
            #include <project_vertex>
            vec4 causticPosition = vec4(transformed, 1.0);
            #ifdef USE_BATCHING
              causticPosition = batchingMatrix * causticPosition;
            #endif
            #ifdef USE_INSTANCING
              causticPosition = instanceMatrix * causticPosition;
            #endif
            vCausticWorld = (modelMatrix * causticPosition).xyz;
          `);
          shader.fragmentShader = /* glsl */`
            varying vec3 vCausticWorld;
            uniform float uCausticTime, uCausticIntensity, uCausticSize, uCausticSpeed;
            vec2 causticHash(vec2 cell) {
              return fract(sin(vec2(dot(cell, vec2(127.1, 311.7)),
                dot(cell, vec2(269.5, 183.3)))) * 43758.5453);
            }
            float causticLayer(vec2 p, float t) {
              // Warp a cellular field into rounded, irregular pools. Moving seeds
              // deform the connected light web continuously without reseeding/popping.
              p += 0.28 * vec2(sin(p.y * 2.1 + t * 0.45),
                cos(p.x * 1.7 - t * 0.38));
              vec2 cell = floor(p);
              vec2 local = fract(p);
              float nearest = 10.0;
              float secondNearest = 10.0;
              for (int y = -1; y <= 1; y++) {
                for (int x = -1; x <= 1; x++) {
                  vec2 offset = vec2(float(x), float(y));
                  vec2 phase = causticHash(cell + offset) * 6.2831853;
                  vec2 seed = 0.5 + 0.25 * sin(phase + t * 0.55);
                  float distanceToSeed = length(offset + seed - local);
                  secondNearest = min(secondNearest, max(nearest, distanceToSeed));
                  nearest = min(nearest, distanceToSeed);
                }
              }
              // Equal-distance boundaries form broad white veins with a soft halo,
              // leaving darker cell interiors like the supplied reference.
              float edge = secondNearest - nearest;
              float aa = fwidth(edge);
              float core = 1.0 - smoothstep(0.025, 0.13 + aa, edge);
              float halo = 1.0 - smoothstep(0.04, 0.36 + aa, edge);
              return core * 0.8 + halo * 0.2;
            }
            float projectedCaustic(vec3 toLight) {
              // Parallel rays intersect the horizontal world plane y=0.
              // Projection stays fixed in the tank as objects and the viewer move.
              vec2 p = (vCausticWorld.xz - vCausticWorld.y * toLight.xz
                / max(toLight.y, 0.15)) / max(uCausticSize, 0.005);
              float t = uCausticTime * uCausticSpeed;
              float firstLayer = causticLayer(p + vec2(t * 0.07, -t * 0.04), t);
              // A rotated, offset second field drifts in a different direction
              // and evolves at a different rate, avoiding synchronized repetition.
              vec2 secondUV = mat2(0.8, 0.6, -0.6, 0.8) * p * 1.17;
              float secondLayer = causticLayer(secondUV + vec2(7.3 - t * 0.05,
                11.8 + t * 0.065), -t * 0.73 + 3.1);
              // Keep the combined brightness bounded as the two webs overlap.
              float pattern = firstLayer * 0.55 + secondLayer * 0.45;
              return pattern * smoothstep(0.0, 0.3, toLight.y);
            }
          ` + shader.fragmentShader;
          // Modulate incoming directional light before its existing shadow lookup
          // and BRDF: normal maps, diffuse/specular response and occlusion all apply.
          const lights = THREE.ShaderChunk.lights_fragment_begin.replace(
            'getDirectionalLightInfo( directionalLight, directLight );',
            `getDirectionalLightInfo( directionalLight, directLight );
             directLight.color *= 1.0 + uCausticIntensity * projectedCaustic(
               inverseTransformDirection(directLight.direction, viewMatrix));`
          );
          shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_begin>', lights);
        };
        material.customProgramCacheKey = () => key + '|planar-caustics-v1';
        material.needsUpdate = true;
      }
    });
  }
}
