/**
 * LookingGlassApp.ts
 *
 * Central orchestrator connecting Tracking, Filtering, Calibration, Rendering, and UI.
 */

import { Renderer } from '../rendering/Renderer';
import { SceneManager } from '../rendering/SceneManager';
import { PerspectiveController } from '../rendering/PerspectiveController';
import { CalibrationManager } from '../calibration/CalibrationManager';
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
    this.perspectiveController.setLookaheadMs(settings.lookaheadMs);
    this.perspectiveController.setSmoothTimeMs(settings.smoothTimeMs);
    this.perspectiveController.setDeadbandEnabled(settings.deadbandEnabled);
    this.perspectiveController.filter.updateConfig({ minCutoff: settings.minCutoff, beta: settings.beta });

    // Apply persisted scene if not default Aquarium
    if (settings.sceneType !== SceneType.Aquarium) {
      this.sceneManager.setSceneType(settings.sceneType, screenGeometry);
    }
    this.sceneManager.demoScene.setAxesVisible(settings.debugHudVisible);

    // 3. Initialize Tracking Subsystems
    this.faceTracker = new FaceTracker();
    this.poseEstimator = new HeadPoseEstimator(60.0);
    this.debugView = new TrackingDebugView();
    this.debugView.attachVideo(this.faceTracker.getVideoElement());
    this.debugView.setVisible(settings.webcamPipVisible);

    this.inputMode = settings.inputMode;

    // 4. Initialize UI Subsystems
    this.statusPanel = new StatusPanel();
    this.calibrationPanel = new CalibrationPanel(
      this.calibrationManager,
      {
        getCurrentRawPose: () => this.currentRawPose,
        getBiometricDistance: () => {
          if (!this.currentResult?.landmarks || this.currentResult.landmarks.length < 264) {
            return null;
          }
          const screen = this.calibrationManager.getScreenGeometry();
          return this.poseEstimator.estimateBiometricDistance(this.currentResult.landmarks, screen);
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
        onSceneChange: (sceneType) => this.handleSceneChange(sceneType),
        onFeedFish: () => this.handleFeedFish(),
        onToggleCamera: (enable) => this.handleToggleCamera(enable),
        onLoadCustomFish: async (source, count, options) => {
          if (this.sceneManager.getCurrentSceneType() !== SceneType.Aquarium) {
            const screen = this.calibrationManager.getScreenGeometry();
            this.sceneManager.setSceneType(SceneType.Aquarium, screen);
            this.controls.setScene(SceneType.Aquarium);
            this.settingsManager.updateSettings({ sceneType: SceneType.Aquarium });
          }
          return await this.sceneManager.aquariumScene.addCustomFish(source, count, options);
        },
        onToggleDebugHud: (visible) => {
          this.sceneManager.demoScene.setAxesVisible(visible);
        }
      }
    );

    // 5. Connect Callbacks & Listeners
    this.setupListeners();
  }

  private setupListeners(): void {
    // Calibration updates
    this.calibrationManager.subscribe(() => {
      const geom = this.calibrationManager.getScreenGeometry();
      const calib = this.calibrationManager.getData();
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
        const screen = this.calibrationManager.getScreenGeometry();
        const pose = this.poseEstimator.estimatePose(
          result.landmarks,
          screen,
          calib,
          result.timestamp
        );

        this.currentRawPose = pose;
        this.perspectiveController.updatePose(pose, true, result.timestamp);
        this.statusPanel.setStatus(TrackingStatus.Active);
      } else {
        this.currentRawPose = null;
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
        if (status === TrackingStatus.CameraDenied || status === TrackingStatus.Error) {
          // Automatic graceful fallback to Mouse Mode on camera block
          console.warn('[LookingGlassApp] Falling back to mouse input mode due to camera issue.');
          this.controls.setInputMode(InputMode.Mouse);
        }
      }
    });

    // Mouse and Pointer simulation events
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('pointermove', this.onMouseMove);

    // Aquarium interactive events (tap glass & feed fish)
    this.canvas.addEventListener('click', this.onCanvasClick);
    this.canvas.addEventListener('contextmenu', this.onCanvasContextMenu);
    window.addEventListener('keydown', this.onKeyDown);
  }

  private onCanvasClick = (e: MouseEvent): void => {
    // Only primary left button
    if (e.button !== 0) return;
    if (this.sceneManager.getCurrentSceneType() === SceneType.Aquarium) {
      this.sceneManager.aquariumScene.interactions.tapGlass(this.mouseNormX, this.mouseNormY);
    }
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

    // 2. Escape key closes Calibrate or Settings window
    if (e.key === 'Escape' || e.code === 'Escape') {
      if (this.calibrationPanel.getIsOpen()) {
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

  private async handleToggleCamera(enable: boolean): Promise<boolean> {
    if (enable) {
      if (this.inputMode !== InputMode.Webcam) {
        this.inputMode = InputMode.Webcam;
        this.controls.setInputMode(InputMode.Webcam);
      }
      try {
        this.statusPanel.setStatus(TrackingStatus.Initializing, 'Starting Webcam Tracking...');
        await this.faceTracker.startCamera();
        this.controls.setCameraActiveState(true);
        return true;
      } catch (e) {
        console.warn('[LookingGlassApp] Failed to start camera:', e);
        this.controls.setCameraActiveState(false);
        return false;
      }
    } else {
      // Power down camera stream & release webcam hardware
      this.faceTracker.stopCamera();
      this.currentResult = null;
      this.currentRawPose = null;
      this.perspectiveController.updatePose(
        { x: 0, y: 0, z: 0.65, confidence: 0, timestamp: performance.now() / 1000 },
        false,
        performance.now() / 1000
      );
      this.statusPanel.setStatus(TrackingStatus.CameraOff, 'Camera Off');
      this.controls.setCameraActiveState(false);
      return false;
    }
  }

  private handleInputModeChange(mode: InputMode): void {
    this.inputMode = mode;
    this.settingsManager.updateSettings({ inputMode: mode });

    if (mode === InputMode.Webcam) {
      this.faceTracker.startCamera().then(() => {
        this.controls.setCameraActiveState(true);
      }).catch((err) => {
        console.warn('[LookingGlassApp] Camera start failed on switch:', err);
        this.controls.setCameraActiveState(false);
      });
      this.statusPanel.setStatus(TrackingStatus.Initializing, 'Starting Webcam Tracking...');
    } else {
      // Power down webcam hardware when switching to Mouse or Auto mode
      this.faceTracker.stopCamera();
      this.controls.setCameraActiveState(false);
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

    const settings = this.settingsManager.getSettings();
    if (settings.inputMode === InputMode.Webcam) {
      if (settings.isCameraActive) {
        this.statusPanel.setStatus(TrackingStatus.Initializing, 'Starting Webcam Tracking...');
        this.faceTracker.initialize().then(() => {
          this.controls.setCameraActiveState(true);
        }).catch((err) => {
          console.warn('[LookingGlassApp] Default camera init error, falling back to mouse:', err);
          this.controls.setInputMode(InputMode.Mouse);
          this.controls.setCameraActiveState(false);
        });
      } else {
        this.statusPanel.setStatus(TrackingStatus.CameraOff, 'Camera Off');
        this.controls.setCameraActiveState(false);
      }
    } else if (settings.inputMode === InputMode.Mouse) {
      this.statusPanel.setStatus(TrackingStatus.FallbackMouse);
      this.controls.setCameraActiveState(false);
    } else if (settings.inputMode === InputMode.Auto) {
      this.statusPanel.setStatus(TrackingStatus.FallbackAuto);
      this.controls.setCameraActiveState(false);
    }

    this.renderLoop();
  }

  private renderLoop = (): void => {
    if (!this.isRunning) return;

    const now = performance.now();
    const deltaTimeSeconds = Math.min(0.1, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;
    const timeSec = now / 1000;

    const fps = this.fpsCounter.update();

    // Handle Auto Demo simulation if active
    if (this.inputMode === InputMode.Auto) {
      const calib = this.calibrationManager.getData();
      // Gentle figure-8 Lissajous path
      const autoX = Math.sin(timeSec * 0.9) * 0.22 * calib.sensitivity.x;
      const autoY = Math.cos(timeSec * 0.6) * 0.12 * calib.sensitivity.y;
      const autoZ = calib.viewingDistance + Math.sin(timeSec * 0.4) * 0.12 * calib.sensitivity.z;

      this.currentRawPose = {
        x: autoX,
        y: autoY,
        z: autoZ,
        confidence: 1.0,
        timestamp: timeSec
      };
      this.perspectiveController.setSimulatedTarget(autoX, autoY, autoZ);
    }

    // 1. Update perspective camera interpolation
    this.perspectiveController.update(deltaTimeSeconds, timeSec);
    const currentPose = this.perspectiveController.getCurrentPose();

    // Update Top-Left Debug Information HUD
    this.controls.updateDebugHud({
      fps,
      trackFps: this.faceTracker.trackFps,
      latencyMs: this.faceTracker.inferenceLatencyMs,
      poseX: currentPose.x,
      poseY: currentPose.y,
      poseZ: currentPose.z,
      isTrackingActive: this.currentResult?.visible ?? false
    });

    // 2. Update active scene animations (aquarium boids, kelp, bubbles, or diorama)
    this.sceneManager.update(deltaTimeSeconds, timeSec);

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
    const eyeMid = this.currentResult?.landmarks
      ? this.poseEstimator.getEyeMidpoint(this.currentResult.landmarks)
      : null;
    this.debugView.render(
      this.currentResult?.landmarks ?? null,
      eyeMid,
      this.perspectiveController.getCurrentPose() as any,
      fps
    );

    this.animationFrameId = requestAnimationFrame(this.renderLoop);
  };

  public dispose(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('pointermove', this.onMouseMove);
    this.canvas.removeEventListener('click', this.onCanvasClick);
    this.canvas.removeEventListener('contextmenu', this.onCanvasContextMenu);
    window.removeEventListener('keydown', this.onKeyDown);

    this.faceTracker.stop();
    this.renderer.dispose();
    this.debugView.destroy();
  }
}
