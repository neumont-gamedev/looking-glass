/**
 * CausticEffect.ts
 *
 * Implements a dynamic underwater caustic water effect cast down from the top of the scene:
 * 1. Volumetric Caustic Sun Shafts: Angled, translucent light beams piercing down through the water
 *    from the surface ceiling, animated with swimming caustic shimmer and soft depth parallax.
 * 2. Seabed Caustic Projection: Dual-octave procedural wave interference caustics dancing across the
 *    sandy ocean floor, rocks, and driftwood with edge vignetting.
 * 3. Water Surface Ceiling Caustics: Animated refraction pattern at the water surface ceiling.
 */

import * as THREE from 'three';
import { ScreenGeometry } from '../../math/ScreenGeometry';

export class CausticEffect {
  public readonly group: THREE.Group = new THREE.Group();

  private screen: ScreenGeometry;
  private depth: number;

  // Visual components
  private floorCausticsMesh: THREE.Mesh | null = null;
  private ceilingCausticsMesh: THREE.Mesh | null = null;
  private shaftsGroup: THREE.Group = new THREE.Group();

  // Shaders & materials
  private floorMaterial: THREE.ShaderMaterial | null = null;
  private ceilingMaterial: THREE.ShaderMaterial | null = null;
  private shaftMaterial: THREE.ShaderMaterial | null = null;

  constructor(screen: ScreenGeometry, depth: number = 0.85) {
    this.screen = screen;
    this.depth = depth;

    this.group.add(this.shaftsGroup);
    this.build();
  }

  public rebuild(screen: ScreenGeometry, depth: number = 0.85): void {
    this.screen = screen;
    this.depth = depth;
    this.dispose();
    this.build();
  }

  public update(timeSeconds: number): void {
    if (this.floorMaterial) {
      this.floorMaterial.uniforms.uTime.value = timeSeconds;
    }
    if (this.ceilingMaterial) {
      this.ceilingMaterial.uniforms.uTime.value = timeSeconds;
    }
    if (this.shaftMaterial) {
      this.shaftMaterial.uniforms.uTime.value = timeSeconds;
    }
  }

  private build(): void {
    const W = this.screen.width;
    const H = this.screen.height;
    const D = this.depth;

    // -------------------------------------------------------------
    // 1. Seabed Caustic Layer (hovering 1.2mm above the sand floor)
    // -------------------------------------------------------------
    const floorGeo = new THREE.PlaneGeometry(W, D, 1, 1);
    this.floorMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0x94f6ff) }, // Crisp tropical sunlit cyan-white
        uBrightness: { value: 1.15 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uBrightness;
        varying vec2 vUv;

        // Wave interference caustic generator (simulates dual refracted wavefronts)
        float getCausticWave(vec2 uv, float time, float scale, float speed, float power) {
          vec2 p = uv * scale;
          float c = 0.0;
          for (int i = 0; i < 3; i++) {
            float a = float(i) * 2.094395; // 120 degrees
            vec2 dir = vec2(cos(a), sin(a));
            float phase = time * speed * (0.85 + float(i) * 0.18);
            float wave = sin(dot(p, dir) + phase + sin(dot(p, vec2(-dir.y, dir.x)) + phase * 0.65));
            c += wave;
          }
          c /= 3.0;
          return pow(clamp(c * 0.5 + 0.5, 0.0, 1.0), power);
        }

        void main() {
          // Two distinct frequency octaves drifting across the seabed
          float c1 = getCausticWave(vUv, uTime, 28.0, 0.85, 3.8);
          float c2 = getCausticWave(vUv + vec2(0.25, 0.65), uTime, 44.0, 1.15, 3.0);

          float caustic = c1 * 0.72 + c2 * 0.42;

          // Edge feathering to extend all the way across the entire floor box
          vec2 edge = smoothstep(vec2(0.0), vec2(0.015), vUv) * smoothstep(vec2(1.0), vec2(0.985), vUv);
          float vignette = edge.x * edge.y;

          vec3 finalColor = uColor * caustic * uBrightness;
          gl_FragColor = vec4(finalColor, caustic * vignette * 0.95);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true
    });

    this.floorCausticsMesh = new THREE.Mesh(floorGeo, this.floorMaterial);
    this.floorCausticsMesh.rotation.x = -Math.PI / 2;
    this.floorCausticsMesh.position.set(0, -H / 2 + 0.0012, -D / 2);
    this.group.add(this.floorCausticsMesh);

    // -------------------------------------------------------------
    // 2. Volumetric Caustic Sun Shafts (streaming straight down, full box coverage)
    // -------------------------------------------------------------
    this.shaftMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0xa6f8ff) },
        uOpacity: { value: 0.28 }
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorldPos;
        void main() {
          vUv = uv;
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uOpacity;
        varying vec2 vUv;
        varying vec3 vWorldPos;

        void main() {
          // Vertical gradient: intense at ceiling (vUv.y = 1.0), illuminating straight down to floor (vUv.y = 0.0)
          float vertFade = mix(0.22, 1.0, pow(vUv.y, 1.15));

          // Soft lateral edge feathering
          float horizFade = smoothstep(0.0, 0.025, vUv.x) * smoothstep(1.0, 0.975, vUv.x);

          // Crisp vertical light shafts streaming straight down
          float ray1 = sin(vUv.x * 45.0 + uTime * 0.9);
          float ray2 = cos(vUv.x * 72.0 - uTime * 0.7);
          float ray3 = sin(vUv.x * 28.0 + uTime * 1.2);
          float rays = pow(clamp((ray1 + ray2 * 0.65 + ray3 * 0.45) * 0.46 + 0.54, 0.0, 1.0), 2.2);

          // Downward traveling caustic shimmer wave
          float downWave = sin(vUv.x * 32.0 - vUv.y * 3.5 - uTime * 1.6);
          float shimmer = 0.85 + 0.15 * downWave;

          // Ethereal organic pulsation
          float pulse = 0.88 + 0.12 * sin(uTime * 1.0 + vWorldPos.x * 3.5 + vWorldPos.z * 3.0);

          float alpha = vertFade * horizFade * rays * shimmer * pulse * uOpacity;
          vec3 col = uColor * (0.85 + rays * 0.35);

          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide
    });

    // Light shafts go straight down vertically from ceiling (H/2) to floor (-H/2)
    // Spanning the entire scene box across width W and depth D
    const shaftHeight = H;

    // 8 primary width sheets distributed from front to back across depth D
    const numDepthSheets = 8;
    for (let i = 0; i < numDepthSheets; i++) {
      const z = -0.05 - i * ((D - 0.10) / (numDepthSheets - 1));
      const geo = new THREE.PlaneGeometry(W * 0.98, shaftHeight);
      geo.translate(0, -shaftHeight / 2, 0); // Origin at top edge (ceiling)

      const shaft = new THREE.Mesh(geo, this.shaftMaterial);
      shaft.position.set(0, H / 2, z);
      // Straight down: rotation.z = 0. Subtle yaw alternation for rich 3D volumetric thickness
      shaft.rotation.y = ((i % 2 === 0 ? 1 : -1) * 0.07);
      this.shaftsGroup.add(shaft);
    }

    // 4 cross sheets distributed across width W spanning depth D
    const numWidthSheets = 4;
    for (let j = 0; j < numWidthSheets; j++) {
      const x = -W * 0.36 + j * ((W * 0.72) / (numWidthSheets - 1));
      const geo = new THREE.PlaneGeometry(D * 0.94, shaftHeight);
      geo.translate(0, -shaftHeight / 2, 0); // Origin at top edge (ceiling)

      const shaft = new THREE.Mesh(geo, this.shaftMaterial);
      shaft.position.set(x, H / 2, -D / 2);
      // Straight down: rotation.z = 0. Rotated ~90 deg around Y to cross the box
      shaft.rotation.y = Math.PI / 2 + ((j % 2 === 0 ? 1 : -1) * 0.06);
      this.shaftsGroup.add(shaft);
    }

    // -------------------------------------------------------------
    // 3. Water Surface Ceiling Caustics (at y = H / 2, full box coverage)
    // -------------------------------------------------------------
    const ceilingGeo = new THREE.PlaneGeometry(W, D, 1, 1);
    this.ceilingMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0xb2f8ff) },
        uBrightness: { value: 0.85 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uBrightness;
        varying vec2 vUv;

        float getSurfaceWave(vec2 uv, float time) {
          vec2 p = uv * 32.0;
          float c = 0.0;
          for (int i = 0; i < 3; i++) {
            float a = float(i) * 2.094395 + 0.3;
            vec2 dir = vec2(cos(a), sin(a));
            float phase = time * 1.1 * (0.9 + float(i) * 0.2);
            float wave = sin(dot(p, dir) + phase + cos(dot(p, vec2(-dir.y, dir.x)) + phase * 0.7));
            c += wave;
          }
          c /= 3.0;
          return pow(clamp(c * 0.5 + 0.5, 0.0, 1.0), 3.2);
        }

        void main() {
          float caustic = getSurfaceWave(vUv, uTime);
          vec2 edge = smoothstep(vec2(0.0), vec2(0.015), vUv) * smoothstep(vec2(1.0), vec2(0.985), vUv);
          float alpha = caustic * edge.x * edge.y * 0.75;
          gl_FragColor = vec4(uColor * uBrightness, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true
    });

    this.ceilingCausticsMesh = new THREE.Mesh(ceilingGeo, this.ceilingMaterial);
    this.ceilingCausticsMesh.rotation.x = Math.PI / 2;
    this.ceilingCausticsMesh.position.set(0, H / 2 - 0.001, -D / 2);
    this.group.add(this.ceilingCausticsMesh);
  }

  public dispose(): void {
    if (this.floorCausticsMesh) {
      this.group.remove(this.floorCausticsMesh);
      this.floorCausticsMesh.geometry.dispose();
      this.floorCausticsMesh = null;
    }

    if (this.floorMaterial) {
      this.floorMaterial.dispose();
      this.floorMaterial = null;
    }

    if (this.ceilingCausticsMesh) {
      this.group.remove(this.ceilingCausticsMesh);
      this.ceilingCausticsMesh.geometry.dispose();
      this.ceilingCausticsMesh = null;
    }

    if (this.ceilingMaterial) {
      this.ceilingMaterial.dispose();
      this.ceilingMaterial = null;
    }

    while (this.shaftsGroup.children.length > 0) {
      const child = this.shaftsGroup.children[0] as THREE.Mesh;
      this.shaftsGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
    }

    if (this.shaftMaterial) {
      this.shaftMaterial.dispose();
      this.shaftMaterial = null;
    }
  }
}

