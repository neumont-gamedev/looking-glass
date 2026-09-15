# Tracking and physical calibration

## Head turns and distance

The eye-span distance estimate includes relative landmark Z, with Y converted
to image-width units. This compensates for yaw foreshortening under MediaPipe's
weak-perspective model. Z is approximate, not a measured depth sensor reading.
The iris estimate uses the major axis of the projected ellipse, computed from
both opposing rim pairs, instead of its foreshortened horizontal diameter.
The existing IPD/iris blend and temporal filters remain in use.

References: [MediaPipe coordinate model](https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/face_mesh.md)
and [iris depth estimation](https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/iris.md).
Large turns, occluded eyes, and noisy inferred landmark depth can still affect accuracy.

## Webcam field of view

Settings now accepts a horizontal FOV of 30–120 degrees. To estimate it, measure
the camera-lens-to-eye distance, face the camera, hold still for one second and
press **Estimate FOV from distance**. The median of recent frontal eye spans is
used with `FOV = 2 atan(IPD / (2 distance span))`. This is an approximate effective
FOV using a 63 mm IPD assumption. A known camera horizontal FOV can be entered
directly. Do not enter a diagonal FOV. Recalibrate after camera/capture changes.
Only the scalar FOV is saved; the recent measurement buffer is transient.
Set the neutral center afterward at your normal viewing position.

## Monitor versus viewport

Saved width and height describe the full monitor. The rendering aperture is
derived independently: `viewportWidth = monitorWidth * innerWidth / screen.width`
and likewise for height. Presets and manual measurements follow the same path.
Resize/fullscreen changes do not overwrite saved monitor dimensions. Browser
zoom should be 100%; per-monitor OS scaling is represented in screen CSS units.
An off-center browser window still requires centering the viewer on that window;
automatic physical window-offset calibration is not implemented.
Legacy v2 viewport dimensions migrate from the saved monitor diagonal, and the
neutral center is marked uncalibrated because the tracking model changed.

## Stationary smoothing

At Balanced smoothing, positions within 1 mm laterally and 2 mm in depth of a
stationary anchor are held when measured speed is below 6 mm/s. The anchor stays
fixed so deliberate slow movement eventually escapes. Faster movement bypasses
the hold. The existing smoothing slider adjusts the radii, and simulation modes
bypass this tracking-only hold.
