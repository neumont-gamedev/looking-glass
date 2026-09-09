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
import { CoordinateMapper } from '../math/CoordinateMapper';
import { FpsCounter } from '../utils/Debug';
import { SceneType } from '../rendering/DemoScene';

export class LookingGlassApp {
  private canvas: HTMLCanvasElement;
  private renderer: Renderer;
  private sceneManager: SceneManager;
  private perspectiveController: PerspectiveController;
  private calibrationManager: CalibrationManager;

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

    // 1. Initialize Calibration & Geometry
    this.calibrationManager = new CalibrationManager();
    const screenGeometry = this.calibrationManager.getScreenGeometry();

    // 2. Initialize Rendering Subsystems
    this.renderer = new Renderer(this.canvas);
    this.sceneManager = new SceneManager(screenGeometry);
    this.perspectiveController = new PerspectiveController(screenGeometry);

    // 3. Initialize Tracking Subsystems
    this.faceTracker = new FaceTracker();
    this.poseEstimator = new HeadPoseEstimator(60.0);
    this.debugView = new TrackingDebugView();
    this.debugView.attachVideo(this.faceTracker.getVideoElement());

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
      {
        onInputModeChange: (mode) => this.handleInputModeChange(mode),
        onSceneChange: (sceneType) => this.handleSceneChange(sceneType),
        onFeedFish: () => this.handleFeedFish()
      }
    );

    // 5. Connect Callbacks & Listeners
    this.setupListeners();
  }

  private setupListeners(): void {
    // Calibration updates
    this.calibrationManager.subscribe(() => {
      const geom = this.calibrationManager.getScreenGeometry();
      this.perspectiveController.setScreenGeometry(geom);
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
    this.inputMode = mode;

    if (mode === InputMode.Webcam) {
      this.faceTracker.initialize().catch((err) => {
        console.warn('[LookingGlassApp] Camera init failed on switch:', err);
      });
      this.statusPanel.setStatus(TrackingStatus.Initializing, 'Starting Webcam Tracking...');
    } else if (mode === InputMode.Mouse) {
      this.statusPanel.setStatus(TrackingStatus.FallbackMouse);
    } else if (mode === InputMode.Auto) {
      this.statusPanel.setStatus(TrackingStatus.FallbackAuto);
    }
  }

  private handleSceneChange(sceneType: SceneType): void {
    const screen = this.calibrationManager.getScreenGeometry();
    this.sceneManager.setSceneType(sceneType, screen);
  }

  /**
   * Start the application and render loop.
   */
  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastFrameTime = performance.now();

    // Start Webcam tracking by default
    this.faceTracker.initialize().catch((err) => {
      console.warn('[LookingGlassApp] Default camera init error, falling back to mouse:', err);
      this.controls.setInputMode(InputMode.Mouse);
    });

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

    // 2. Update active scene animations (aquarium boids, kelp, bubbles, or diorama)
    this.sceneManager.update(deltaTimeSeconds, timeSec);

    // Update wireframe visual feedback if calibration mode is active
    if (this.sceneManager.wireframeCalibration.getVisible()) {
      const currentPose = this.perspectiveController.getCurrentPose();
      const calibDist = this.calibrationManager.getData().viewingDistance;
      const isAligned = Math.abs(currentPose.z - calibDist) < 0.06 && Math.abs(currentPose.x) < 0.06;
      this.sceneManager.wireframeCalibration.setAlignmentStatus(isAligned);
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
