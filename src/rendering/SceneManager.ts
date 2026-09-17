/**
 * SceneManager.ts
 *
 * Manages the Three.js Scene graph, ambient/directional lighting with shadows,
 * underwater atmospheric fog, and active scene switching between
 * Virtual Aquarium, Diorama, and Debug environments.
 */

import * as THREE from 'three';
import { ScreenGeometry } from '../math/ScreenGeometry';
import { DemoScene, SceneType } from './DemoScene';
import { AquariumScene } from './aquarium/AquariumScene';
import { WireframeCalibrationView } from './WireframeCalibrationView';

export class SceneManager {
  public readonly scene: THREE.Scene;
  public readonly demoScene: DemoScene;
  public readonly aquariumScene: AquariumScene;
  public readonly wireframeCalibration: WireframeCalibrationView;

  private currentSceneType: SceneType = SceneType.Aquarium;
  private dirLight: THREE.DirectionalLight;
  private ambientLight: THREE.AmbientLight;
  private accentLight1: THREE.PointLight;
  private accentLight2: THREE.PointLight;

  private modelViewerAmbientColor: string = '#c8c8c8';
  private modelViewerDirColor: string = '#ffffff';
  private modelViewerLightRotX: number = 10;
  private modelViewerLightRotZ: number = -35;

  constructor(screen: ScreenGeometry, maxTextureAnisotropy: number = 1) {
    this.scene = new THREE.Scene();

    // Setup Lighting
    this.ambientLight = new THREE.AmbientLight(0x1a4060, 0.8);
    this.scene.add(this.ambientLight);

    // Directional sunlight shaft from above, casting soft shadows into the water/diorama
    this.dirLight = new THREE.DirectionalLight(0x88e0ff, 1.6);
    this.dirLight.position.set(0.1, 0.7, 0.2);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 1024;
    this.dirLight.shadow.mapSize.height = 1024;
    this.dirLight.shadow.camera.near = 0.1;
    this.dirLight.shadow.camera.far = 2.0;
    this.dirLight.shadow.bias = -0.0005;
    this.scene.add(this.dirLight);
    this.scene.add(this.dirLight.target);

    // Subtle colored interior rim lights
    this.accentLight1 = new THREE.PointLight(0x00d4ff, 1.2, 1.5);
    this.accentLight1.position.set(-screen.width * 0.35, screen.height * 0.2, -0.4);
    this.scene.add(this.accentLight1);

    this.accentLight2 = new THREE.PointLight(0x00ffaa, 0.9, 1.5);
    this.accentLight2.position.set(screen.width * 0.35, -screen.height * 0.2, -0.5);
    this.scene.add(this.accentLight2);

    // Instantiate scene contents
    this.demoScene = new DemoScene(screen, maxTextureAnisotropy);
    this.aquariumScene = new AquariumScene(screen);
    this.wireframeCalibration = new WireframeCalibrationView(screen);
    this.scene.add(this.wireframeCalibration.group);

    // Set default to Virtual Aquarium
    this.setSceneType(SceneType.Aquarium, screen);
  }

  public getCurrentSceneType(): SceneType {
    return this.currentSceneType;
  }

  public rebuild(screen: ScreenGeometry): void {
    this.demoScene.rebuild(screen);
    this.aquariumScene.rebuild(screen);
    this.wireframeCalibration.rebuild(screen);
  }

  public setSceneType(type: SceneType, screen: ScreenGeometry): void {
    this.currentSceneType = type;

    // Remove current contents
    if (this.scene.children.includes(this.demoScene.group)) {
      this.scene.remove(this.demoScene.group);
    }
    if (this.scene.children.includes(this.aquariumScene.group)) {
      this.scene.remove(this.aquariumScene.group);
    }

    if (type === SceneType.Aquarium) {
      // Atmospheric underwater deep-sea blue
      this.scene.background = new THREE.Color(0x021226);
      this.scene.fog = new THREE.FogExp2(0x03182a, 0.75);

      // Replicated lighting from debug scene: small amount of ambient and angled directional light
      this.ambientLight.color.setHex(0xffffff);
      this.ambientLight.intensity = 0.25;

      this.accentLight1.intensity = 0;
      this.accentLight2.intensity = 0;

      // Overhead light aimed straight down at the tank center.
      const lightDistance = 0.95;
      const lightTilt = 0;
      this.dirLight.color.setHex(0xffffff);
      this.dirLight.intensity = 2.0;
      this.dirLight.position.set(
        0,
        lightDistance * Math.cos(lightTilt),
        -0.25 - lightDistance * Math.sin(lightTilt)
      );
      this.dirLight.target.position.set(0, 0, -0.25);

      // Expand shadow frustum so soft shadows cover the entire box
      this.dirLight.shadow.camera.left = -screen.width * 0.6;
      this.dirLight.shadow.camera.right = screen.width * 0.6;
      this.dirLight.shadow.camera.top = 0.55;
      this.dirLight.shadow.camera.bottom = -0.55;
      this.dirLight.shadow.camera.updateProjectionMatrix();

      this.scene.add(this.aquariumScene.group);
    } else if (type === SceneType.Debug) {
      // Clear underwater fog for debug calibration
      this.scene.background = new THREE.Color(0x0a0c10);
      this.scene.fog = null;

      // Soft ambient fill light turned up a little
      this.ambientLight.color.setHex(0xffffff);
      this.ambientLight.intensity = 0.25;

      this.accentLight1.intensity = 0;
      this.accentLight2.intensity = 0;

      // Directional light rotated along Z axis an additional 20 degrees (~39 deg from vertical)
      const lightDistance = 0.95;
      const angleRad = (39 * Math.PI) / 180;
      const lightX = -Math.sin(angleRad) * lightDistance;
      const lightY = Math.cos(angleRad) * lightDistance;

      this.dirLight.color.setHex(0xffffff);
      this.dirLight.intensity = 2.0;
      this.dirLight.position.set(lightX, lightY, -0.425);
      this.dirLight.target.position.set(0, 0, -0.425);

      this.demoScene.setSceneType(type, screen);
      this.scene.add(this.demoScene.group);
    } else {
      // Diorama (Model Viewer): only ambient and directional light
      this.scene.background = new THREE.Color(0x0a0c10);
      this.scene.fog = null;

      // Dark gray ambient light
      this.ambientLight.color.set(this.modelViewerAmbientColor);
      this.ambientLight.intensity = 1.0;

      // Bright white directional light pointing straight down with X/Z rotation
      this.dirLight.color.set(this.modelViewerDirColor);
      this.dirLight.intensity = 2.0;
      this.updateModelViewerDirLight();

      // Disable accent lights
      this.accentLight1.intensity = 0;
      this.accentLight2.intensity = 0;

      this.demoScene.setSceneType(type, screen);
      this.scene.add(this.demoScene.group);
    }
  }

  public setAmbientLightColor(colorHex: string): void {
    this.modelViewerAmbientColor = colorHex;
    if (this.currentSceneType === SceneType.Diorama) {
      this.ambientLight.color.set(colorHex);
    }
  }

  public setDirLightColor(colorHex: string): void {
    this.modelViewerDirColor = colorHex;
    if (this.currentSceneType === SceneType.Diorama) {
      this.dirLight.color.set(colorHex);
    }
  }

  public setDirLightRotation(rotXDeg: number, rotZDeg: number): void {
    this.modelViewerLightRotX = rotXDeg;
    this.modelViewerLightRotZ = rotZDeg;
    if (this.currentSceneType === SceneType.Diorama) {
      this.updateModelViewerDirLight();
    }
  }

  private updateModelViewerDirLight(): void {
    const lightDistance = 0.95;
    const targetPos = new THREE.Vector3(0, 0, -0.25);
    const rotXRad = (this.modelViewerLightRotX * Math.PI) / 180;
    const rotZRad = (this.modelViewerLightRotZ * Math.PI) / 180;

    // Point straight down from above (0, lightDistance, 0), rotated around X and Z axes
    const offset = new THREE.Vector3(0, lightDistance, 0).applyEuler(new THREE.Euler(rotXRad, 0, rotZRad, 'ZXY'));
    this.dirLight.position.copy(targetPos).add(offset);
    this.dirLight.target.position.copy(targetPos);
    this.dirLight.target.updateMatrixWorld();
  }

  public update(deltaTimeSeconds: number, timeSeconds: number): void {
    if (this.currentSceneType === SceneType.Aquarium) {
      this.aquariumScene.update(deltaTimeSeconds, timeSeconds);
    } else {
      this.demoScene.update(timeSeconds, deltaTimeSeconds);
    }
  }
}
