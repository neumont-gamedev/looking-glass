/**
 * ProjectionMath.ts
 *
 * Implements asymmetric off-axis projection (fish-tank VR / head-coupled perspective).
 *
 * Physical Model:
 * The display screen acts as a fixed physical window at Z = 0 in the world.
 * The viewer's eyes are in front of the screen at (eyeX, eyeY, eyeZ) where eyeZ > 0.
 * The virtual 3D scene exists behind the screen window (Z <= 0).
 *
 * Equations:
 * Given screen bounds:
 *   leftEdge   = -width / 2
 *   rightEdge  = +width / 2
 *   bottomEdge = -height / 2
 *   topEdge    = +height / 2
 *
 * Distance from eye to screen plane is eyeZ.
 * For a virtual near clipping plane 'near' in front of the eye:
 *   scale = near / eyeZ
 *   frustumLeft   = (leftEdge - eyeX) * scale
 *   frustumRight  = (rightEdge - eyeX) * scale
 *   frustumBottom = (bottomEdge - eyeY) * scale
 *   frustumTop    = (topEdge - eyeY) * scale
 */

import * as THREE from 'three';
import { ScreenGeometry } from './ScreenGeometry';

export interface FrustumBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
  near: number;
  far: number;
}

export class ProjectionMath {
  /**
   * Computes asymmetric frustum boundaries for an off-axis camera.
   *
   * @param eyeX Viewer lateral position relative to screen center in meters (+X is right)
   * @param eyeY Viewer vertical position relative to screen center in meters (+Y is up)
   * @param eyeZ Viewer perpendicular distance from screen in meters (+Z is away from screen)
   * @param screen Physical screen geometry
   * @param near Near clipping distance (meters)
   * @param far Far clipping distance (meters)
   */
  public static calculateFrustumBounds(
    eyeX: number,
    eyeY: number,
    eyeZ: number,
    screen: ScreenGeometry,
    near: number = 0.05,
    far: number = 100.0
  ): FrustumBounds {
    // Sanitize eye distance to prevent division by zero or negative distance
    const safeZ = Math.max(0.1, Number.isFinite(eyeZ) ? eyeZ : 0.6);
    const safeX = Number.isFinite(eyeX) ? eyeX : 0;
    const safeY = Number.isFinite(eyeY) ? eyeY : 0;

    const halfW = screen.width / 2;
    const halfH = screen.height / 2;

    // Physical monitor bounds relative to screen center (0, 0, 0)
    const screenLeft = -halfW;
    const screenRight = halfW;
    const screenBottom = -halfH;
    const screenTop = halfH;

    // Scaling ratio from screen plane at distance safeZ to near clipping plane
    const scale = near / safeZ;

    const left = (screenLeft - safeX) * scale;
    const right = (screenRight - safeX) * scale;
    const bottom = (screenBottom - safeY) * scale;
    const top = (screenTop - safeY) * scale;

    return {
      left,
      right,
      top,
      bottom,
      near,
      far
    };
  }

  /**
   * Applies the asymmetric off-axis perspective projection to a Three.js Camera.
   *
   * @param camera Three.js PerspectiveCamera to update
   * @param eyeX Viewer lateral position relative to screen center (meters)
   * @param eyeY Viewer vertical position relative to screen center (meters)
   * @param eyeZ Viewer distance from screen (meters)
   * @param screen Physical screen geometry
   * @param near Near clipping distance
   * @param far Far clipping distance
   */
  public static applyOffAxisProjection(
    camera: THREE.PerspectiveCamera,
    eyeX: number,
    eyeY: number,
    eyeZ: number,
    screen: ScreenGeometry,
    near: number = 0.05,
    far: number = 100.0
  ): void {
    const bounds = this.calculateFrustumBounds(eyeX, eyeY, eyeZ, screen, near, far);

    // Position camera exactly at viewer eye position
    camera.position.set(eyeX, eyeY, eyeZ);

    // Camera points perpendicular to the screen plane along -Z, no rotation
    camera.rotation.set(0, 0, 0);
    camera.quaternion.set(0, 0, 0, 1);
    camera.updateMatrixWorld(true);

    // Three.js makePerspective takes: (left, right, top, bottom, near, far)
    camera.projectionMatrix.makePerspective(
      bounds.left,
      bounds.right,
      bounds.top,
      bounds.bottom,
      bounds.near,
      bounds.far
    );

    // Update inverse matrix for raycasting/frustum culling
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }

  /**
   * Applies standard centered perspective with camera translation and lookAt
   * (Used for Simple Mode / debugging).
   */
  public static applySimplePerspective(
    camera: THREE.PerspectiveCamera,
    eyeX: number,
    eyeY: number,
    eyeZ: number,
    screen: ScreenGeometry,
    near: number = 0.05,
    far: number = 100.0
  ): void {
    camera.position.set(eyeX, eyeY, eyeZ);
    camera.lookAt(0, 0, -1);
    camera.near = near;
    camera.far = far;
    camera.aspect = screen.aspectRatio;
    camera.updateProjectionMatrix();
  }
}

