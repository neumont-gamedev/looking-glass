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

  constructor(screen: ScreenGeometry) {
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
    this.demoScene = new DemoScene(screen);
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

      // Directional sunlight shines straight down from directly above the aquarium center
      const lightDistance = 0.95;
      this.dirLight.color.setHex(0xffffff);
      this.dirLight.intensity = 2.0;
      this.dirLight.position.set(0, lightDistance, -0.425);
      this.dirLight.target.position.set(0, 0, -0.425);

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
      // Diorama
      this.scene.background = new THREE.Color(0x0a0c10);
      this.scene.fog = null;

      this.ambientLight.color.setHex(0xffffff);
      this.ambientLight.intensity = 0.4;

      this.dirLight.color.setHex(0xfff5e6);
      this.dirLight.intensity = 1.4;
      this.dirLight.position.set(0.1, 0.7, 0.2);
      this.dirLight.target.position.set(0, 0, -0.4);

      this.accentLight1.color.setHex(0x00d4ff);
      this.accentLight1.intensity = 1.2;
      this.accentLight2.color.setHex(0xff0077);
      this.accentLight2.intensity = 0.9;

      this.demoScene.setSceneType(type, screen);
      this.scene.add(this.demoScene.group);
    }
  }

  public update(deltaTimeSeconds: number, timeSeconds: number): void {
    if (this.currentSceneType === SceneType.Aquarium) {
      this.aquariumScene.update(deltaTimeSeconds, timeSeconds);
    } else {
      this.demoScene.update(timeSeconds);
    }
  }
}
