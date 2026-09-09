/**
 * CoordinateMapper.ts
 *
 * Explicit coordinate transformations between coordinate spaces:
 * 1. MediaPipe Normalized Coordinates ([0, 1], [0, 1])
 * 2. Viewer Relative Coordinates (in meters, centered on physical monitor center)
 *    +X = Viewer moves right
 *    -X = Viewer moves left
 *    +Y = Viewer moves up
 *    -Y = Viewer moves down
 *    +Z = Viewer moves away from screen
 *    -Z = Viewer moves toward screen
 * 3. Three.js World Coordinates
 */

import { ScreenGeometry } from './ScreenGeometry';

export interface ViewerPosition {
  x: number; // meters
  y: number; // meters
  z: number; // meters
}

export class CoordinateMapper {
  /**
   * Converts raw landmark coordinates (x, y in [0, 1]) and estimated distance
   * into viewer position in meters relative to screen center.
   *
   * @param landmarkX Normalized landmark X (0 = left, 1 = right of camera feed)
   * @param landmarkY Normalized landmark Y (0 = top, 1 = bottom of camera feed)
   * @param distanceMeters Estimated distance from camera/screen in meters
   * @param screen Screen geometry to reference physical dimensions
   * @param cameraHFOV Horizontal field of view of the webcam in degrees (default ~60 deg)
   * @param invertHorizontal Invert horizontal tracking direction if needed (default false)
   */
  public static landmarkToViewerPosition(
    landmarkX: number,
    landmarkY: number,
    distanceMeters: number,
    screen: ScreenGeometry,
    cameraHFOV: number = 60,
    invertHorizontal: boolean = false
  ): ViewerPosition {
    // MediaPipe landmark origin is top-left of the unmirrored camera image.
    // When the viewer physically moves to their RIGHT (+X), their face moves toward the camera frame's LEFT (landmarkX decreases toward 0).
    // Therefore, the standard viewer-relative lateral offset is (0.5 - landmarkX).
    const normX = invertHorizontal ? (landmarkX - 0.5) : (0.5 - landmarkX);
    const normY = 0.5 - landmarkY; // Up is positive

    // Calculate camera frustum dimensions at viewer distance
    const hFovRad = (cameraHFOV * Math.PI) / 180;
    const vFovRad = 2 * Math.atan(Math.tan(hFovRad / 2) / screen.aspectRatio);

    const visibleWidthAtDistance = 2 * distanceMeters * Math.tan(hFovRad / 2);
    const visibleHeightAtDistance = 2 * distanceMeters * Math.tan(vFovRad / 2);

    const xMeters = normX * visibleWidthAtDistance;
    const yMeters = normY * visibleHeightAtDistance;
    const zMeters = distanceMeters;

    return {
      x: xMeters,
      y: yMeters,
      z: zMeters
    };
  }

  /**
   * Maps normalized mouse / pointer coordinates [-1, 1] to viewer metric position.
   * Useful for mouse simulation / fallback mode.
   *
   * @param mouseX Normalized mouse X [-1 (left) to 1 (right)]
   * @param mouseY Normalized mouse Y [-1 (bottom) to 1 (top)]
   * @param defaultDistance Standard viewer distance in meters (e.g. 0.65m)
   * @param screen Screen geometry
   * @param travelRangeX Maximum metric lateral displacement to simulate (e.g. 0.35m)
   * @param travelRangeY Maximum metric vertical displacement to simulate (e.g. 0.25m)
   */
  public static mouseToViewerPosition(
    mouseX: number,
    mouseY: number,
    defaultDistance: number = 0.65,
    screen: ScreenGeometry,
    travelRangeX: number = 0.35,
    travelRangeY: number = 0.25
  ): ViewerPosition {
    // Clamp inputs to [-1, 1]
    const clampedX = Math.max(-1, Math.min(1, mouseX));
    const clampedY = Math.max(-1, Math.min(1, mouseY));

    return {
      x: clampedX * (travelRangeX ?? screen.width * 0.7),
      y: clampedY * (travelRangeY ?? screen.height * 0.7),
      z: defaultDistance
    };
  }
}

