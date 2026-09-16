/**
 * LookingGlassApp.ts
 *
 * Central orchestrator connecting Tracking, Filtering, Calibration, Rendering, and UI.
 */

import { Renderer } from '../rendering/Renderer';
import { SceneManager } from '../rendering/SceneManager';
import { PerspectiveController } from '../rendering/PerspectiveController';
import { CalibrationManager } from '../calibration/CalibrationManager';
import { WebcamCalibration } from '../calibration/WebcamCalibration';
import { FaceTracker } from '../tracking/FaceTracker';
import { HeadPoseEstimator } from '../tracking/HeadPoseEstimator';
import { TrackingDebugView } from '../tracking/TrackingDebugView';
import { TrackingStatus, ViewerPose, FaceTrackingResult } from '../tracking/TrackingState';
import { StatusPanel } from '../ui/StatusPanel';
import { CalibrationPanel } from '../ui/CalibrationPanel';
import { Controls, InputMode } from '../ui/Controls';
import { SettingsManager } from '../settings/SettingsManager';
import { CoordinateMapper } from '../math/CoordinateMapper';
import { FpsCounter } from '../utils/Debug';
import { SceneType } from '../rendering/DemoScene';

export class LookingGlassApp {
  private webcamCalibration = new WebcamCalibration();
  private canvas: HTMLCanvasElement;
  private renderer: Renderer;
  private sceneManager: SceneManager;
  private perspectiveController: PerspectiveController;
  private calibrationManager: CalibrationManager;
  private settingsManager: SettingsManager;

  private faceTracker: FaceTracker;
  private poseEstimator: HeadPoseEstimator;
  private debugView: TrackingDebugView;

  private statusPanel: StatusPanel;
  private calibrationPanel: CalibrationPanel;
  private controls: Controls;

  private fpsCounter: FpsCounter = new FpsCounter();
  private isRunning: boolean = false;
  private animationFrameId: number | null = null;
  private lastFrameTime: number = performance.now();

  // Fixed timestep simulation state (guarantees constant 60 FPS physics & kinematics)
  private simAccumulator: number = 0;
  private simTimeSeconds: number = 0;
  private lastHudUpdateTime: number = 0;

  // Current states
  private currentRawPose: ViewerPose | null = null;
  private currentResult: FaceTrackingResult | null = null;
  private inputMode: InputMode = InputMode.Webcam;

  // Mouse fallback tracking
  private mouseNormX: number = 0;
  private mouseNormY: number = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    // 1. Initialize Calibration, Settings & Geometry
    this.calibrationManager = new CalibrationManager();
    this.settingsManager = new SettingsManager();
    const settings = this.settingsManager.getSettings();
    const screenGeometry = this.calibrationManager.getScreenGeometry();

    // 2. Initialize Rendering Subsystems
    this.renderer = new Renderer(this.canvas);
    this.sceneManager = new SceneManager(screenGeometry);
    this.perspectiveController = new PerspectiveController(screenGeometry);
    this.perspectiveController.setReferenceDistance(this.calibrationManager.getData().viewingDistance);

    // Apply persisted settings to PerspectiveController
    this.perspectiveController.setProjectionMode(settings.projectionMode);
    this.perspectiveController.setDepthMode(settings.depthMode);
    this.perspectiveController.setTrackingSmoothnessPercent(settings.trackingSmoothnessPercent ?? 50);

    // Apply persisted scene if not default Aquarium
    if (settings.sceneType !== SceneType.Aquarium) {
      this.sceneManager.setSceneType(settings.sceneType, screenGeometry);
    }
    this.sceneManager.demoScene.setAxesVisible(settings.debugHudVisible);

    // 3. Initialize Tracking Subsystems
    this.faceTracker = new FaceTracker();
    this.poseEstimator = new HeadPoseEstimator(this.calibrationManager.getData().cameraHFOV);
    this.debugView = new TrackingDebugView();
    this.debugView.attachVideo(this.faceTracker.getVideoElement());
    this.debugView.setVisible(settings.webcamPipVisible);
    this.debugView.setCameraActive(false);

    this.inputMode = settings.inputMode;

    // 4. Initialize UI Subsystems
    this.statusPanel = new StatusPanel(document.body, settings.debugHudVisible);
    this.calibrationPanel = new CalibrationPanel(
      this.calibrationManager,
      {
        getCurrentRawPose: () => this.currentRawPose,
        getBiometricDistance: () => {
          if (!this.currentResult?.landmarks || this.currentResult.landmarks.length < 264) {
            return null;
          }
          return this.poseEstimator.estimateBiometricDistance(this.currentResult.landmarks, this.getCameraAspectRatio());
        },
        onWireframeModeToggle: (active: boolean) => {
          this.sceneManager.wireframeCalibration.setVisible(active);
        }
      }
    );
    this.controls = new Controls(
      this.perspectiveController,
      this.debugView,
      this.calibrationPanel,
      this.calibrationManager,
      this.settingsManager,
      {
        onInputModeChange: (mode) => this.handleInputModeChange(mode),
        onCalibrateCamera: (distanceMeters) => {
          const degrees = this.webcamCalibration.estimate(distanceMeters, .063, performance.now() / 1000);
          this.calibrationManager.setCameraHFOV(degrees);
          this.calibrationManager.setViewingDistance(distanceMeters);
          return degrees;
        },
        onSceneChange: (sceneType) => this.handleSceneChange(sceneType),
        onFeedFish: () => this.handleFeedFish(),
        onToggleDebugHud: (visible) => {
          this.sceneManager.demoScene.setAxesVisible(visible);
          this.statusPanel.setVisible(visible);
        },
        getCurrentRawPose: () => this.currentRawPose,
        getBiometricDistance: () => {
          if (!this.currentResult?.landmarks || this.currentResult.landmarks.length < 264) {
            return null;
          }
          return this.poseEstimator.estimateBiometricDistance(this.currentResult.landmarks, this.getCameraAspectRatio());
        },
        onModelChange: (modelUrl: string) => {
          this.sceneManager.demoScene.setModel(modelUrl);
        },
        getModel: () => {
          return this.sceneManager.demoScene.getModel();
        },
        onTextureChange: (textureUrl: string) => {
          this.sceneManager.demoScene.setWallTexture(textureUrl);
        },
        getWallTexture: () => {
          return this.sceneManager.demoScene.getWallTexture();
        },
        onWallColorChange: (colorHex: string) => {
          this.sceneManager.demoScene.setWallColor(colorHex);
        },
        getWallColor: () => {
          return this.sceneManager.demoScene.getWallColor();
        },
        onAmbientLightColorChange: (colorHex: string) => {
          this.sceneManager.setAmbientLightColor(colorHex);
        },
        onDirLightColorChange: (colorHex: string) => {
          this.sceneManager.setDirLightColor(colorHex);
        },
        onDirLightRotationChange: (rotXDeg: number, rotZDeg: number) => {
          this.sceneManager.setDirLightRotation(rotXDeg, rotZDeg);
        },
        onModelZChange: (zMeters: number) => {
          this.sceneManager.demoScene.setModelZ(zMeters);
        },
        onModelScaleChange: (scaleMultiplier: number) => {
          this.sceneManager.demoScene.setModelScaleMultiplier(scaleMultiplier);
        },
        onModelRotationChange: (rotDeg: number) => {
          this.sceneManager.demoScene.setModelRotationY((rotDeg * Math.PI) / 180);
        },
        onModelAutoRotateChange: (autoRotate: boolean) => {
          this.sceneManager.demoScene.setModelAutoRotate(autoRotate);
        },
        getModelCurrentRotationDeg: () => {
          const rotRad = this.sceneManager.demoScene.getModelRotationY();
          return ((rotRad * 180) / Math.PI) % 360;
        }
      }
    );

    // 5. Connect Callbacks & Listeners
    this.setupListeners();
  }

  private getCameraAspectRatio(): number {
    const video = this.faceTracker.getVideoElement();
    // Use the negotiated capture size, not the requested size or viewport.
    return video.videoWidth > 0 && video.videoHeight > 0
      ? video.videoWidth / video.videoHeight
      : 4 / 3;
  }

  private setupListeners(): void {
    // Calibration updates
    this.calibrationManager.subscribe(() => {
      const geom = this.calibrationManager.getScreenGeometry();
      const calib = this.calibrationManager.getData();
      this.poseEstimator.setCameraHFOV(calib.cameraHFOV);
      this.perspectiveController.setScreenGeometry(geom);
      this.perspectiveController.setReferenceDistance(calib.viewingDistance);
      this.sceneManager.rebuild(geom);
    });

    // FaceTracker results
    this.faceTracker.onResult((result) => {
      this.currentResult = result;
      if (this.inputMode !== InputMode.Webcam) return;

      if (result.visible && result.landmarks.length > 0) {
        const calib = this.calibrationManager.getData();
        const cameraAspectRatio = this.getCameraAspectRatio();
        this.webcamCalibration.add(result.landmarks, cameraAspectRatio, result.timestamp);
        const pose = this.poseEstimator.estimatePose(
          result.landmarks,
          cameraAspectRatio,
          calib,
          result.timestamp
        );
        this.currentRawPose = this.poseEstimator.estimateRawPose(
          result.landmarks,
          cameraAspectRatio,
          result.timestamp
        );
        const validPose = [pose.x, pose.y, pose.z, result.timestamp].every(Number.isFinite);
        if (!validPose) this.currentRawPose = null;
        this.perspectiveController.updatePose(pose, validPose, result.timestamp);
        this.statusPanel.setStatus(validPose ? TrackingStatus.Active : TrackingStatus.FaceLost);
      } else {
        this.currentRawPose = null;
        this.webcamCalibration.reset();
        this.perspectiveController.updatePose(
          { x: 0, y: 0, z: 0.65, confidence: 0, timestamp: result.timestamp },
          false,
          result.timestamp
        );
        this.statusPanel.setStatus(TrackingStatus.FaceLost);
      }
    });

    // FaceTracker status updates
    this.faceTracker.onStatusChange((status, message) => {
      if (this.inputMode === InputMode.Webcam) {
        this.statusPanel.setStatus(status, message);
        this.debugView.setCameraActive(this.faceTracker.isCameraRunning());
        if (status === TrackingStatus.CameraDenied || status === TrackingStatus.Error) {
          // Automatic graceful fallback to Mouse Mode on camera block
          console.warn('[LookingGlassApp] Falling back to mouse input mode due to camera issue.');
          this.controls.setInputMode(InputMode.Mouse);
          this.handleInputModeChange(InputMode.Mouse);
        }
      } else {
        this.debugView.setCameraActive(false);
      }
    });

    // Mouse and Pointer simulation events
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('pointermove', this.onMouseMove);

    // Viewport resizing and fullscreen transitions
    window.addEventListener('resize', this.onWindowResize);
    document.addEventListener('fullscreenchange', this.onFullscreenChange);

    // Aquarium feeding events; tap-on-glass interaction is disabled.
    this.canvas.addEventListener('contextmenu', this.onCanvasContextMenu);
    window.addEventListener('keydown', this.onKeyDown);
  }

  private onWindowResize = (): void => {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.calibrationManager.updateViewport(window.innerWidth, window.innerHeight);
  };

  private onFullscreenChange = (): void => {
    const isFullscreen = !!document.fullscreenElement;
    document.body.classList.toggle('is-fullscreen', isFullscreen);
    // Ensure browser layout has completed before reading inner dimensions
    requestAnimationFrame(() => {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.calibrationManager.updateViewport(window.innerWidth, window.innerHeight);
    });
  };

  private onCanvasContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
    this.handleFeedFish();
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    // 1. Toggle debug HUD window with ~ or `
    if (e.key === '`' || e.key === '~' || e.code === 'Backquote') {
      e.preventDefault();
      this.controls.toggleDebugHud();
      return;
    }

    // 2. Escape key closes Scene Selector, Calibrate, or Settings window
    if (e.key === 'Escape' || e.code === 'Escape') {
      if (this.controls.isScenePopoverOpen()) {
        this.controls.closeScenePopover();
        return;
      } else if (this.calibrationPanel.getIsOpen()) {
        this.calibrationPanel.close();
        return;
      } else if (this.controls.isSettingsOpen()) {
        this.controls.closeDrawer();
        return;
      }
    }

    // 3. 'F' key feeds fish when in Aquarium scene
    if (e.key === 'f' || e.key === 'F') {
      this.handleFeedFish();
    }
  };

  public handleFeedFish(): void {
    if (this.sceneManager.getCurrentSceneType() === SceneType.Aquarium) {
      this.sceneManager.aquariumScene.interactions.dropFood(this.mouseNormX);
    }
  }

  private onMouseMove = (e: MouseEvent): void => {
    // Normalized to [-1, 1] from center of window
    this.mouseNormX = (e.clientX / window.innerWidth) * 2 - 1;
    this.mouseNormY = -( (e.clientY / window.innerHeight) * 2 - 1 ); // Up is positive

    if (this.inputMode === InputMode.Mouse) {
      const screen = this.calibrationManager.getScreenGeometry();
      const calib = this.calibrationManager.getData();
      const pos = CoordinateMapper.mouseToViewerPosition(
        this.mouseNormX,
        this.mouseNormY,
        calib.viewingDistance,
        screen
      );

      this.currentRawPose = {
        x: pos.x * calib.sensitivity.x,
        y: pos.y * calib.sensitivity.y,
        z: pos.z,
        confidence: 1.0,
        timestamp: performance.now() / 1000
      };

      this.perspectiveController.setSimulatedTarget(
        pos.x * calib.sensitivity.x,
        pos.y * calib.sensitivity.y,
        pos.z
      );
    }
  };

  private handleInputModeChange(mode: InputMode): void {
    this.webcamCalibration.reset();
    this.inputMode = mode;
    this.settingsManager.updateSettings({
      inputMode: mode,
      isCameraActive: mode === InputMode.Webcam
    });

    if (mode === InputMode.Webcam) {
      this.statusPanel.setStatus(TrackingStatus.Initializing, 'Starting Webcam Tracking...');
      this.faceTracker.startCamera().then(() => {
        this.debugView.setCameraActive(this.faceTracker.isCameraRunning());
      }).catch((err) => {
        console.warn('[LookingGlassApp] Camera start failed on switch:', err);
        this.debugView.setCameraActive(false);
      });
    } else {
      // Power down webcam hardware when switching to Mouse or Auto mode
      this.faceTracker.stopCamera();
      this.debugView.setCameraActive(false);
      this.currentResult = null;
      this.currentRawPose = null;
      this.perspectiveController.updatePose(
        { x: 0, y: 0, z: 0.65, confidence: 0, timestamp: performance.now() / 1000 },
        false,
        performance.now() / 1000
      );
      if (mode === InputMode.Mouse) {
        this.statusPanel.setStatus(TrackingStatus.FallbackMouse);
      } else if (mode === InputMode.Auto) {
        this.statusPanel.setStatus(TrackingStatus.FallbackAuto);
      }
    }
  }

  private handleSceneChange(sceneType: SceneType): void {
    const screen = this.calibrationManager.getScreenGeometry();
    this.sceneManager.setSceneType(sceneType, screen);
    this.sceneManager.demoScene.setAxesVisible(this.controls.getIsDebugHudVisible());
    this.statusPanel.setVisible(this.controls.getIsDebugHudVisible());
    this.controls.setScene(sceneType);
    this.settingsManager.updateSettings({ sceneType });
  }

  /**
   * Start the application and render loop.
   */
  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastFrameTime = performance.now();
    this.simAccumulator = 0;
    this.simTimeSeconds = performance.now() / 1000;
    this.lastHudUpdateTime = 0;

    const settings = this.settingsManager.getSettings();
    if (settings.inputMode === InputMode.Webcam) {
      this.statusPanel.setStatus(TrackingStatus.Initializing, 'Starting Webcam Tracking...');
      this.faceTracker.initialize().then(() => {
        this.debugView.setCameraActive(this.faceTracker.isCameraRunning());
      }).catch((err) => {
        console.warn('[LookingGlassApp] Default camera init error, falling back to mouse:', err);
        this.controls.setInputMode(InputMode.Mouse);
        this.handleInputModeChange(InputMode.Mouse);
      });
    } else {
      this.faceTracker.stopCamera();
      this.debugView.setCameraActive(false);
      if (settings.inputMode === InputMode.Mouse) {
        this.statusPanel.setStatus(TrackingStatus.FallbackMouse);
      } else if (settings.inputMode === InputMode.Auto) {
        this.statusPanel.setStatus(TrackingStatus.FallbackAuto);
      }
    }

    this.renderLoop();
  }

  private renderLoop = (): void => {
    if (!this.isRunning) return;

    const now = performance.now();
    // Clamp maximum frame interval to prevent physics explosion after tab switch or lag
    const rawDeltaSeconds = Math.min(0.1, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;
    const realTimeSec = now / 1000;
    this.faceTracker.checkHealth(now);

    const fps = this.fpsCounter.update();

    // 1. Handle Auto Demo simulation if active
    if (this.inputMode === InputMode.Auto) {
      const calib = this.calibrationManager.getData();
      const autoX = Math.sin(realTimeSec * 0.9) * 0.22 * calib.sensitivity.x;
      const autoY = Math.cos(realTimeSec * 0.6) * 0.12 * calib.sensitivity.y;
      const autoZ = calib.viewingDistance + Math.sin(realTimeSec * 0.4) * 0.12 * calib.sensitivity.z;

      this.currentRawPose = {
        x: autoX,
        y: autoY,
        z: autoZ,
        confidence: 1.0,
        timestamp: realTimeSec
      };
      this.perspectiveController.setSimulatedTarget(autoX, autoY, autoZ);
    }

    // Tracking timestamps use performance.now(). Update the camera once per
    // render with that same clock, even when scene simulation discards backlog.
    this.perspectiveController.update(rawDeltaSeconds, realTimeSec);

    // 2. Fixed timestep for scene physics only.
    this.simAccumulator += rawDeltaSeconds;
    const FIXED_SIM_STEP = 1 / 60; // 60 Hz = 16.667ms
    const MAX_SUBSTEPS = 3; // Prevent spiral of death
    let substeps = 0;

    while (this.simAccumulator >= FIXED_SIM_STEP && substeps < MAX_SUBSTEPS) {
      this.simTimeSeconds += FIXED_SIM_STEP;

      // Update 3D scene simulation (aquarium boids, fish swimming, bubbles, plants sway, diorama)
      this.sceneManager.update(FIXED_SIM_STEP, this.simTimeSeconds);

      this.simAccumulator -= FIXED_SIM_STEP;
      substeps++;
    }

    if (substeps >= MAX_SUBSTEPS) {
      // Discard backlog if system fell behind
      this.simAccumulator = 0;
    }

    // 3. Update Top-Left Debug Information HUD (throttled to 10 Hz to prevent DOM reflows)
    if (now - this.lastHudUpdateTime >= 100) {
      this.lastHudUpdateTime = now;
      const currentPose = this.perspectiveController.getCurrentPose();
      this.controls.updateDebugHud({
        fps,
        trackFps: this.faceTracker.trackFps,
        latencyMs: this.faceTracker.inferenceLatencyMs,
        poseX: currentPose.x,
        poseY: currentPose.y,
        poseZ: currentPose.z,
        isTrackingActive: this.currentResult?.visible ?? false
      });
    }

    // Update wireframe visual feedback if calibration mode is active
    if (this.sceneManager.wireframeCalibration.getVisible()) {
      const currentPose = this.perspectiveController.getCurrentPose();
      const calibDist = this.calibrationManager.getData().viewingDistance;
      this.sceneManager.wireframeCalibration.updateViewingDistance(calibDist);
      const alignResult = this.sceneManager.wireframeCalibration.checkAlignment(
        currentPose.x,
        currentPose.y,
        currentPose.z
      );
      this.calibrationPanel.updateWireframeFeedback(alignResult.message, alignResult.isAligned);
    }

    // 3. Render 3D Scene
    this.renderer.render(this.sceneManager.scene, this.perspectiveController.camera);

    // 4. Update PIP Debug Overlay
    const isCameraOn = this.inputMode === InputMode.Webcam && this.faceTracker.isCameraRunning();
    this.debugView.setCameraActive(isCameraOn);

    if (isCameraOn && this.debugView.getIsVisible()) {
      const eyeMid = this.currentResult?.landmarks
        ? this.poseEstimator.getEyeMidpoint(this.currentResult.landmarks)
        : null;
      this.debugView.render(
        this.currentResult?.landmarks ?? null,
        eyeMid,
        this.perspectiveController.getCurrentPose() as any,
        fps
      );
    }

    this.animationFrameId = requestAnimationFrame(this.renderLoop);
  };

  public dispose(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('pointermove', this.onMouseMove);
    window.removeEventListener('resize', this.onWindowResize);
    document.removeEventListener('fullscreenchange', this.onFullscreenChange);
    this.canvas.removeEventListener('contextmenu', this.onCanvasContextMenu);
    window.removeEventListener('keydown', this.onKeyDown);

    this.faceTracker.stop();
    this.renderer.dispose();
    this.debugView.destroy();
  }
}
