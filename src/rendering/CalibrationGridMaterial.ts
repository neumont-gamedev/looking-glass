import * as THREE from 'three';

/** Draw the grid on the wall itself: no overlapping line geometry or depth fighting. */
export function calibrationGridMaterial(columns: number, rows: number, color: THREE.Color): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial();
  material.onBeforeCompile = shader => {
    shader.uniforms.uGridColor = { value: color };
    shader.uniforms.uGridCount = { value: new THREE.Vector2(columns, rows) };
    shader.vertexShader = 'varying vec2 vGridUV;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvGridUV = uv;');
    shader.fragmentShader = `varying vec2 vGridUV;
      uniform vec3 uGridColor;
      uniform vec2 uGridCount;
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      vec2 grid = vGridUV * uGridCount;
      vec2 footprint = max(fwidth(grid), vec2(0.00001));
      vec2 distanceToLine = abs(fract(grid + 0.5) - 0.5) / footprint;
      // Approximately 1.5-pixel strokes with a smooth one-pixel coverage edge.
      vec2 coverage = 1.0 - smoothstep(vec2(0.25), vec2(1.25), distanceToLine);
      // Fade unresolved lines at grazing angles instead of letting them sparkle.
      coverage *= 1.0 - smoothstep(vec2(0.25), vec2(0.75), footprint);
      float line = max(coverage.x, coverage.y);
      float gridEnabled = step(0.001, dot(uGridColor, vec3(1.0)));
      diffuseColor.rgb = mix(vec3(0.008), uGridColor, line) * gridEnabled;
    `);
  };
  material.customProgramCacheKey = () => 'calibration-grid-v1';
  return material;
}
