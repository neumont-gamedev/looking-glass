const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const THREE = require('three');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(
  fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, filename);
const { FishSwimShader } = require('../src/rendering/aquarium/FishSwimShader.ts');

function fish(material, geometry) {
  const root = new THREE.Group();
  const inner = new THREE.Group();
  inner.rotation.y = Math.PI;
  inner.scale.setScalar(.05);
  const mesh = new THREE.Mesh(geometry, material);
  inner.add(mesh);
  root.add(inner);
  return { root, mesh };
}

function compileSource(material, template) {
  const shader = { vertexShader: template.vertexShader, fragmentShader: template.fragmentShader, uniforms: {} };
  material.onBeforeCompile(shader, {});
  return shader;
}

test('fish have independent phases and materials while sharing matching shadow uniforms', () => {
  const material = new THREE.MeshStandardMaterial();
  const geometry = new THREE.BoxGeometry(1, .4, .2);
  const first = fish(material, geometry), second = fish(material, geometry);
  const swim = new FishSwimShader(first.root, .2);
  new FishSwimShader(second.root, 1.2);
  assert.notEqual(first.mesh.material, second.mesh.material);
  assert.notEqual(first.mesh.geometry, geometry);
  const surface = compileSource(first.mesh.material, THREE.ShaderLib.standard);
  const depth = compileSource(first.mesh.customDepthMaterial, THREE.ShaderLib.depth);
  const distance = compileSource(first.mesh.customDistanceMaterial, THREE.ShaderLib.distanceRGBA);
  const other = compileSource(second.mesh.material, THREE.ShaderLib.standard);
  for (const shader of [surface, depth, distance]) {
    assert.match(shader.vertexShader, /swimPosition.z \+= swim.x/);
    assert.equal(shader.uniforms.uSwimPhase, surface.uniforms.uSwimPhase);
    assert.equal(shader.uniforms.uSwimAmplitude, surface.uniforms.uSwimAmplitude);
  }
  assert.ok(surface.vertexShader.indexOf('objectNormal = normalize') < surface.vertexShader.indexOf('#include <normal_vertex>'));
  assert.ok(Math.abs(surface.uniforms.uFishLength.value - .05) < 1e-8);
  const localHead = new THREE.Vector3(-.5, 0, 0).applyMatrix4(surface.uniforms.uMeshToFish.value);
  assert.ok(Math.abs(localHead.x - surface.uniforms.uFishHead.value) < 1e-8);
  swim.update(1 / 60, 1);
  assert.ok(surface.uniforms.uSwimAmplitude.value > 0);
  assert.notEqual(surface.uniforms.uSwimPhase.value, .2);
  assert.equal(other.uniforms.uSwimPhase.value, 1.2);
  assert.ok(first.mesh.geometry.boundingSphere.radius > geometry.boundingSphere?.radius || !geometry.boundingSphere);
  let disposed = 0;
  first.mesh.customDepthMaterial.addEventListener('dispose', () => disposed++);
  first.mesh.customDistanceMaterial.addEventListener('dispose', () => disposed++);
  swim.dispose();
  assert.equal(disposed, 2);
});

test('speed changes preserve phase continuity and do not alter the model transform', () => {
  const { root } = fish(new THREE.MeshStandardMaterial(), new THREE.BoxGeometry(1, .4, .2));
  const swim = new FishSwimShader(root, .5);
  const rotation = root.quaternion.clone();
  swim.update(0, 0);
  const phase = swim.phase.value;
  swim.update(0, 1);
  assert.equal(swim.phase.value, phase);
  assert.ok(root.quaternion.equals(rotation));
});

test('school steering ignores other schools but still avoids collisions with them', () => {
  const { BoidsSimulation } = require('../src/rendering/aquarium/BoidsSimulation.ts');
  const { ScreenGeometry } = require('../src/math/ScreenGeometry.ts');
  function forceWithNeighbor(schoolId, spacing, separationWeight = 0) {
    const simulation = new BoidsSimulation(new ScreenGeometry(.6, .4), .5);
    simulation.boundaryWeight = 0;
    simulation.separationWeight = separationWeight;
    const makeFish = (id, x) => ({
      species: 'Custom', schoolId: id, position: new THREE.Vector3(x, 0, -.25),
      velocity: new THREE.Vector3(0, 0, .1), maxSpeed: .16, maxForce: .4,
      force: new THREE.Vector3(),
      applyForce(value) { this.force.add(value); }, update() {}
    });
    const fish = makeFish('fish01', 0);
    simulation.addFish(fish);
    if (schoolId) simulation.addFish(makeFish(schoolId, spacing));
    simulation.update(1 / 60, 0, []);
    return fish.force;
  }
  const alone = forceWithNeighbor(null, .06);
  assert.ok(forceWithNeighbor('fish02', .06).distanceTo(alone) < 1e-10);
  assert.ok(forceWithNeighbor('fish01', .06).distanceTo(alone) > .01);
  assert.ok(forceWithNeighbor('fish02', .02, 1.6).x < alone.x);
});

test('isolated fish accelerate and slow smoothly across randomized swim intervals', () => {
  const { Fish, FishSpecies } = require('../src/rendering/aquarium/Fish.ts');
  const originalRandom = Math.random;
  Math.random = () => .5;
  let swimmer;
  try {
    swimmer = new Fish({ species: FishSpecies.Custom, scale: 1, maxSpeed: .16,
      maxForce: .4, customModelRoot: fish(new THREE.MeshStandardMaterial(),
        new THREE.BoxGeometry(1, .4, .2)).root }, new THREE.Vector3());
    swimmer.velocity.set(.064, 0, 0);
    const speeds = [];
    for (let step = 0; step < 360; step++) {
      swimmer.update(1 / 60, step / 60);
      speeds.push(swimmer.velocity.length());
    }
    assert.ok(speeds[60] < .045, 'initial slower cruise');
    assert.ok(speeds[200] > .13, 'accelerates without neighboring fish');
    assert.ok(speeds[330] < .045, 'returns to slower cruise');
    for (let i = 1; i < speeds.length; i++) {
      assert.ok(Math.abs(speeds[i] - speeds[i - 1]) < .004, 'no abrupt speed jump');
      assert.ok(Number.isFinite(speeds[i]) && speeds[i] <= .16);
    }
  } finally {
    Math.random = originalRandom;
    swimmer?.dispose();
  }
});

test('planar caustics preserve swimming deformation and the directional shadow path', () => {
  const { PlanarCaustics } = require('../src/rendering/aquarium/PlanarCaustics.ts');
  const { root, mesh } = fish(new THREE.MeshStandardMaterial(), new THREE.BoxGeometry(1, .4, .2));
  const swim = new FishSwimShader(root, .5);
  const caustics = new PlanarCaustics();
  caustics.update(root, 2);
  const shader = compileSource(mesh.material, THREE.ShaderLib.standard);
  assert.ok(shader.vertexShader.indexOf('swimPosition.z += swim.x') < shader.vertexShader.indexOf('vCausticWorld ='));
  assert.match(shader.fragmentShader, /directLight.color \*= 1.0 \+ uCausticIntensity/);
  const directional = shader.fragmentShader.slice(shader.fragmentShader.indexOf('getDirectionalLightInfo( directionalLight'));
  assert.ok(directional.indexOf('projectedCaustic(') < directional.indexOf('getShadow('));
  assert.ok(directional.indexOf('getShadow(') < directional.indexOf('RE_Direct('));
  assert.match(mesh.material.customProgramCacheKey(), /fish-swim-v1\|planar-caustics-v1/);
  const callback = mesh.material.onBeforeCompile;
  caustics.update(root, 3);
  assert.equal(mesh.material.onBeforeCompile, callback);
  assert.equal(shader.uniforms.uCausticTime.value, 3);
  const later = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  root.add(later);
  caustics.update(root, 4);
  const laterShader = compileSource(later.material, THREE.ShaderLib.standard);
  assert.equal(laterShader.uniforms.uCausticTime, shader.uniforms.uCausticTime);
  assert.equal(compileSource(mesh.customDepthMaterial, THREE.ShaderLib.depth).uniforms.uCausticTime, undefined);
  swim.dispose();
});
