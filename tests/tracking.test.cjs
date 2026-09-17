const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

// Run the pure TypeScript subsystems without a browser or emitted build files.
require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, filename);
};
const { HeadPoseEstimator } = require('../src/tracking/HeadPoseEstimator.ts');
const { CoordinateMapper } = require('../src/math/CoordinateMapper.ts');
const { CalibrationManager } = require('../src/calibration/CalibrationManager.ts');
const { OneEuroFilter } = require('../src/filtering/OneEuroFilter.ts');
const { KinematicPredictor } = require('../src/filtering/KinematicPredictor.ts');

function loadWithStubs(relativePath, stubs) {
  const filename = require.resolve(relativePath);
  const { createRequire } = require('node:module');
  const localRequire = createRequire(filename);
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8').replaceAll('import.meta.url', "'file:///test.ts'"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)(
    name => name in stubs ? stubs[name] : localRequire(name), module, module.exports);
  return module.exports;
}
const { PerspectiveController } = loadWithStubs('../src/rendering/PerspectiveController.ts', {
  '../settings/SettingsManager': { computeSmoothingParameters() { throw new Error('unused in these tests'); } }
});
const { ScreenGeometry } = require('../src/math/ScreenGeometry.ts');

function close(actual, expected, tolerance = 1e-8) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
}

// Project a known IPD and iris diameter into a synthetic camera image.
function landmarks(distance, aspect = 4 / 3, roll = 0) {
  const result = Array.from({ length: 478 }, () => ({ x: .5, y: .5, z: 0 }));
  const imageWidth = 2 * distance * Math.tan(Math.PI / 6);
  function offset(center, meters) {
    return { x: center.x + meters * Math.cos(roll) / imageWidth,
      y: center.y + meters * Math.sin(roll) * aspect / imageWidth, z: 0 };
  }
  result[468] = offset({ x: .5, y: .4 }, -.063 / 2);
  result[473] = offset({ x: .5, y: .4 }, .063 / 2);
  for (const [a, b, center] of [[469, 471, 468], [474, 476, 473]]) {
    result[a] = offset(result[center], -.0117 / 2);
    result[b] = offset(result[center], .0117 / 2);
  }
  return result;
}

test('camera aspect produces correct metric Y and roll-independent distance', () => {
  const estimator = new HeadPoseEstimator();
  for (const aspect of [4 / 3, 16 / 9, 1]) {
    for (const roll of [0, Math.PI / 4]) {
      close(estimator.estimateDistanceMeters(landmarks(.65, aspect, roll), aspect), .65);
    }
    const mapped = CoordinateMapper.landmarkToViewerPosition(.5, .4, .65, aspect);
    close(mapped.y, .1 * 2 * .65 * Math.tan(Math.PI / 6) / aspect);
  }
});

test('manual distance preserves biometric baseline and changes calibrated depth', () => {
  const storage = new Map();
  global.localStorage = { getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value) };
  const manager = new CalibrationManager();
  const estimator = new HeadPoseEstimator();
  const raw = estimator.estimateRawPose(landmarks(.65), 4 / 3, 0);
  manager.setNeutralOrigin(raw.x, raw.y, raw.z);
  for (const distance of [.4, .8, 1.2]) {
    manager.setViewingDistance(distance);
    const calibration = manager.getData();
    close(calibration.neutralOrigin.z, .65);
    close(estimator.estimatePose(landmarks(.65), 4 / 3, calibration, 1).z, distance);
    close(estimator.estimatePose(landmarks(.75), 4 / 3, calibration, 2).z, distance + .1);
  }
  manager.setContinuousDepthTracking(true);
  manager.setSensitivity(1, 1, 2);
  close(estimator.estimatePose(landmarks(.65), 4 / 3, manager.getData(), 3).z, 1.2);
  close(new CalibrationManager().getData().neutralOrigin.z, .65);
  manager.setViewingDistance(.75, .75);
  close(estimator.estimatePose(landmarks(.75), 4 / 3, manager.getData(), 4).z, .75);
  delete global.localStorage;
});

test('prediction velocity matches constant motion at different sample rates', () => {
  for (const hz of [15, 30, 60]) {
    const filter = new OneEuroFilter();
    for (let i = 0; i <= hz * 5; i++) filter.filter(i / hz * .1, i / hz);
    close(filter.getVelocity(), .1, 1e-6);
    for (let i = 1; i <= hz * 5; i++) filter.filter(.5, 5 + i / hz);
    close(filter.getVelocity(), 0, 1e-6);
    filter.reset();
    close(filter.filterWithVelocity(10, 20).velocity, 0);
  }
});

test('duplicate timestamps do not inject velocity spikes', () => {
  const filter = new OneEuroFilter();
  filter.filter(0, 0);
  filter.filter(.01, .1);
  const velocity = filter.getVelocity();
  filter.filter(100, .1);
  close(filter.getVelocity(), velocity);
});

test('prediction remains continuous across the maximum sample gap', () => {
  function stepAt(time) {
    const predictor = new KinematicPredictor({ enableDeadband: false });
    predictor.updateSample({ x: 0, y: 0, z: .65 }, { x: 1, y: 0, z: 0 }, 0);
    return predictor.step(1 / 60, time).x;
  }
  close(stepAt(.07 - 1e-7), stepAt(.07 + 1e-7), 1e-6);
  assert.ok(stepAt(.12) > stepAt(.07), 'prediction continues forward as velocity decays');
  close(stepAt(10), stepAt(.17), 1e-8);
});

test('render loop passes wall-clock time to camera after stalls and suspension', () => {
  // Execute the actual render-loop body with rendering/UI collaborators stubbed.
  const source = ts.createSourceFile('app.ts', fs.readFileSync(
    require.resolve('../src/app/LookingGlassApp.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
  const app = source.statements.find(node => ts.isClassDeclaration(node));
  const loop = app.members.find(node => node.name?.getText(source) === 'renderLoop');
  const body = ts.transpileModule(`function frame() ${loop.initializer.body.getText(source)}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 }
  }).outputText;
  let now = 0;
  const frame = new Function('performance', 'InputMode', 'requestAnimationFrame',
    `${body}; return frame;`)({ now: () => now }, { Auto: 'auto', Webcam: 'webcam' }, () => 0);
  const calls = [];
  const appState = { isRunning: true, lastFrameTime: 0, inputMode: 'mouse',
    simAccumulator: 0, simTimeSeconds: 0, lastHudUpdateTime: 0,
    fpsCounter: { update: () => 60 },
    perspectiveController: { update: (dt, time) => calls.push({ dt, time }), getCurrentPose: () => ({}) },
    sceneManager: { update() {}, wireframeCalibration: { getVisible: () => false } },
    controls: { updateDebugHud() {} }, faceTracker: { checkHealth() {} },
    renderer: { render() {} }, debugView: { setCameraActive() {} } };
  for (now of [8, 25, 200, 60200, 60217]) {
    frame.call(appState);
    close(calls.at(-1).time, now / 1000);
    assert.ok(calls.at(-1).dt <= .1);
  }
  assert.equal(calls.length, 5, 'camera advances on every rendered frame with wall-clock time');
  calls.length = 0;
  appState.nextRenderTime = 0;
  appState.lastFrameTime = 0;
  for (let tick = 0; tick < 240; tick++) {
    now = tick * 1000 / 240;
    frame.call(appState);
  }
  assert.equal(calls.length, 60, '240 Hz callbacks produce 60 camera updates/renders');
});

test('11 Hz tracking advances smoothly between delayed samples without retreating', () => {
  const predictor = new KinematicPredictor({ enableDeadband: false });
  let previous = 0;
  let sample = 0;
  const delay = .038;
  let movingFrames = 0;
  for (let frame = 0; frame < 180; frame++) {
    const now = frame / 60;
    if (now >= sample / 11 + delay) {
      const timestamp = sample / 11;
      predictor.updateSample({ x: timestamp * .1, y: 0, z: .65 },
        { x: .1, y: 0, z: 0 }, timestamp);
      sample++;
    }
    const x = predictor.step(1 / 60, now).x;
    assert.ok(x >= previous - 1e-8, 'no backward pull between samples');
    if (x > previous + 1e-6) movingFrames++;
    previous = x;
  }
  assert.ok(movingFrames > 160, 'camera advances at rendering cadence, not tracking cadence');
});

test('final camera bounds contain extreme predicted movement and keep matrices finite', () => {
  const controller = new PerspectiveController(new ScreenGeometry());
  for (const sign of [-1, 1]) {
    controller.predictor.updateSample({ x: 0, y: 0, z: .65 },
      { x: sign * 1e6, y: sign * 1e6, z: sign * 1e6 }, 0);
    controller.update(1 / 60, .03);
    const pose = controller.getCurrentPose();
    assert.ok(Math.abs(pose.x) <= .75 && Math.abs(pose.y) <= .5);
    assert.ok(pose.z >= .2 && pose.z <= 1.8);
    assert.ok(controller.camera.projectionMatrix.elements.every(Number.isFinite));
    assert.ok(controller.camera.matrixWorldInverse.elements.every(Number.isFinite));
  }
  const last = controller.getCurrentPose();
  controller.predictor.updateSample({ x: NaN, y: Infinity, z: -Infinity }, { x: 0, y: 0, z: 0 }, 1);
  controller.update(1 / 60, 1);
  assert.deepEqual(controller.getCurrentPose(), last);
  controller.updatePose({ x: NaN, y: 0, z: .65 }, true, 1.1);
  controller.update(1 / 60, 1.2);
  assert.deepEqual(controller.getCurrentPose(), last);
});

test('loss holds still, returns to calibrated depth, and reacquires without a snap', () => {
  const controller = new PerspectiveController(new ScreenGeometry());
  controller.setReferenceDistance(1.1);
  controller.setSimulatedTarget(.3, -.2, .5);
  for (let i = 0; i < 120; i++) controller.update(1 / 60, i / 60);
  const held = controller.getCurrentPose();
  controller.updatePose({ x: 0, y: 0, z: 0 }, false, 2);
  for (let i = 121; i < 144; i++) controller.update(1 / 60, i / 60);
  assert.deepEqual(controller.getCurrentPose(), held);
  for (let i = 144; i < 900; i++) {
    // Repeated missing frames must not restart the hold timer.
    controller.updatePose({ x: 0, y: 0, z: 0 }, false, i / 60);
    controller.update(1 / 60, i / 60);
  }
  close(controller.getCurrentPose().z, 1.1, .002);
  close(controller.getCurrentPose().x, 0, .002);
  const before = controller.getCurrentPose();
  controller.updatePose({ x: -.3, y: .2, z: .8 }, true, 15);
  assert.deepEqual(controller.getCurrentPose(), before);
  controller.update(1 / 60, 15);
  assert.ok(controller.getCurrentPose().x > -.1, 'first recovered frame should ease toward the face');
  for (let i = 901; i < 1020; i++) controller.update(1 / 60, i / 60);
  close(controller.getCurrentPose().x, -.3, .001);
});

test('tracker errors and stalled results report loss once and allow recovery', () => {
  const { FaceTracker } = loadWithStubs('../src/tracking/FaceTracker.ts', { '@mediapipe/tasks-vision': {} });
  global.document = { createElement: () => ({ style: {} }), body: { appendChild() {} } };
  const tracker = new FaceTracker();
  delete global.document;
  const results = [];
  tracker.onResult(result => results.push(result));
  tracker.isRunning = true;
  tracker.lastResultTime = 0;
  tracker.checkHealth(499);
  assert.equal(results.length, 0);
  tracker.checkHealth(500);
  tracker.checkHealth(1000);
  assert.equal(results.length, 1);
  assert.equal(results[0].visible, false);
  tracker.handleWorkerResult(true, landmarks(.65), 1001, 10);
  assert.equal(results.at(-1).visible, true);
  tracker.worker = {};
  tracker.setupWorkerListeners();
  const warn = console.warn;
  console.warn = () => {};
  try {
    tracker.worker.onmessage({ data: { type: 'detect_error', error: 'test failure' } });
    assert.equal(results.at(-1).visible, false);
    tracker.handleWorkerResult(true, landmarks(.65), 1100, 10);
    tracker.video.readyState = 2;
    tracker.faceLandmarker = { detectForVideo() { throw new Error('test failure'); } };
    tracker.processCurrentFrame(1200);
    assert.equal(results.at(-1).visible, false);
  } finally { console.warn = warn; }
  tracker.isRunning = false;
  const count = results.length;
  tracker.handleWorkerResult(true, landmarks(.65), 1300, 10);
  tracker.checkHealth(10000);
  assert.equal(results.length, count);
});

// Weak-perspective camera with iris rim points, including yaw and roll.
function turnedLandmarks(distance, yaw, roll = 0, fov = 60) {
  const aspect = 4 / 3;
  const points = landmarks(distance);
  const width = 2 * distance * Math.tan(fov * Math.PI / 360);
  function project(x, y) {
    const horizontal = x * Math.cos(yaw);
    return { x: .5 + (horizontal * Math.cos(roll) - y * Math.sin(roll)) / width,
      y: .5 + (horizontal * Math.sin(roll) + y * Math.cos(roll)) * aspect / width,
      z: x * Math.sin(yaw) / width };
  }
  for (const [center, x] of [[468, -.063 / 2], [473, .063 / 2]]) {
    points[center] = project(x, 0);
    points[center + 1] = project(x - .0117 / 2, 0);
    points[center + 2] = project(x, -.0117 / 2);
    points[center + 3] = project(x + .0117 / 2, 0);
    points[center + 4] = project(x, .0117 / 2);
  }
  return points;
}

test('head turns preserve depth while forward/backward motion still changes depth', () => {
  const estimator = new HeadPoseEstimator();
  for (const distance of [.4, .65, 1.1]) {
    for (const yaw of [-.8, -.4, 0, .4, .8]) {
      for (const roll of [0, .6]) {
        close(estimator.estimateDistanceMeters(turnedLandmarks(distance, yaw, roll), 4 / 3), distance, 1e-6);
      }
    }
  }
});

test('FOV calibration recovers known camera FOV and rejects stale/turned samples', () => {
  const { WebcamCalibration } = require('../src/calibration/WebcamCalibration.ts');
  for (const fov of [45, 60, 90]) {
    const calibration = new WebcamCalibration();
    for (let i = 0; i < 30; i++) calibration.add(turnedLandmarks(.7, 0, 0, fov), 4 / 3, i / 30);
    close(calibration.estimate(.7, .063, 1), fov);
    assert.throws(() => calibration.estimate(.7, .063, 3));
    calibration.add(turnedLandmarks(.7, .5), 4 / 3, 1);
    assert.throws(() => calibration.estimate(.7, .063, 1));
    assert.throws(() => calibration.estimate(NaN, .063, 1));
  }
});

test('monitor presets, manual size, resize and reload keep monitor dimensions separate', () => {
  const storage = new Map();
  global.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  global.window = { innerWidth: 960, innerHeight: 540, screen: { width: 1920, height: 1080 } };
  try {
    const manager = new CalibrationManager();
    manager.setMonitorPreset(24);
    const monitor = manager.getData();
    close(manager.getScreenGeometry().width, monitor.screenWidth / 2);
    manager.updateViewport(1920, 1080);
    close(manager.getScreenGeometry().width, monitor.screenWidth);
    assert.deepEqual(manager.getData(), monitor);
    manager.setScreenDimensions(.6, .3375);
    close(manager.getScreenGeometry().width, .3);
    close(manager.getData().screenWidth, .6);
    const reloaded = new CalibrationManager();
    close(reloaded.getScreenGeometry().width, .3);
    close(reloaded.getData().screenWidth, .6);
    reloaded.updateViewport(100, 100);
    close(reloaded.getScreenGeometry().width, .6 * 100 / 1920);
    reloaded.setCameraHFOV(80);
    close(new CalibrationManager().getData().cameraHFOV, 80);
    let notified = false;
    reloaded.subscribe(() => { notified = true; });
    reloaded.resetToDefaults();
    assert.ok(notified);
    close(new CalibrationManager().getData().cameraHFOV, 60);
  } finally { delete global.window; delete global.localStorage; }
});

test('legacy viewport dimensions migrate from monitor diagonal instead of shrinking twice', () => {
  const storage = new Map([['looking_glass_calibration_v2', JSON.stringify({
    screenWidth: .2655, screenHeight: .1495, screenDiagonalInches: 24
  })]]);
  global.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  global.window = { innerWidth: 960, innerHeight: 540, screen: { width: 1920, height: 1080 } };
  try {
    const manager = new CalibrationManager();
    const expected = ScreenGeometry.fromDiagonal(24);
    close(manager.getData().screenWidth, expected.width);
    close(manager.getScreenGeometry().width, expected.width / 2);
  } finally { delete global.window; delete global.localStorage; }
});

test('stationary smoothing holds tremor but releases for deliberate slow and fast movement', () => {
  const predictor = new KinematicPredictor();
  predictor.updateSample({ x: 0, y: 0, z: .65 }, { x: 0, y: 0, z: 0 }, 0);
  for (let i = 1; i <= 60; i++) {
    predictor.updateSample({ x: Math.sin(i) * .0003, y: 0, z: .65 + Math.cos(i) * .0005 },
      { x: .001, y: 0, z: 0 }, i / 30);
    close(predictor.step(1 / 30, i / 30).x, 0);
  }
  for (let i = 1; i <= 60; i++) {
    predictor.updateSample({ x: i / 30 * .003, y: 0, z: .65 }, { x: .003, y: 0, z: 0 }, 2 + i / 30);
    predictor.step(1 / 30, 2 + i / 30);
  }
  assert.ok(predictor.getCurrentPosition().x > .004, 'slow motion must escape the stationary radius');
  predictor.updateSample({ x: .02, y: 0, z: .65 }, { x: .2, y: 0, z: 0 }, 4.1);
  assert.ok(predictor.step(1 / 30, 4.1).x > .01);
});

test('combined calibration saves center and distance atomically and rejects invalid input', () => {
  const manager = new CalibrationManager();
  let notifications = 0;
  manager.subscribe(() => notifications++);
  manager.calibrateViewer(.03, -.02, .72, .68);
  const data = manager.getData();
  assert.deepEqual(data.neutralOrigin, { x: .03, y: -.02, z: .72 });
  assert.equal(data.viewingDistance, .68);
  assert.equal(data.continuousDepthTracking, true);
  assert.equal(data.isCalibrated, true);
  assert.equal(notifications, 1);
  manager.calibrateViewer(NaN, 0, .7, .7);
  manager.calibrateViewer(0, 0, .7, .1);
  assert.equal(notifications, 1);
  assert.equal(manager.getData().viewingDistance, .68);
});
