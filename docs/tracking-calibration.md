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
press **Calibrate FOV**. The median of recent frontal eye spans is
used with `FOV = 2 atan(IPD / (2 distance span))`. This is an approximate effective
FOV using a 63 mm IPD assumption. A known camera horizontal FOV can be entered
directly. Do not enter a diagonal FOV. Recalibrate after camera/capture changes.
The FOV and entered viewing distance are saved; the recent measurement buffer is transient.
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

## Calibration controls

The camera-to-eye distance slider accepts 30–150 cm and displays centimeters and inches. Enter a physical measurement, not the biometric estimate. The manual horizontal FOV slider is under Advanced adjustment.

Calibrate FOV uses samples collected before the click. Success displays: “FOV saved. Use Center & Distance to recenter.” A hold-still error means calibration was not saved; face forward at the measured distance and try again.

Center & Distance saves the neutral pose and estimated distance together and enables continuous depth tracking. It requires a fresh webcam pose. FOV and centering are separate because distance inferred using an assumed FOV cannot independently calibrate that FOV.

## Timing and tracking loss

Rendering targets 60 FPS independently of tracking, with fixed 60 Hz scene simulation. Tracking timestamps use the same monotonic clock as prediction. Prediction fades velocity after a short horizon without retracting previously predicted movement. Tracking loss briefly holds the last valid pose, then eases toward neutral; recovery and final camera limits keep invalid samples from causing abrupt jumps.

Worker inference avoids blocking the main thread where supported. Low tracking rates, GPU load, and the main-thread fallback can still affect perceived smoothness. Test live tracking in the target browser, including head turns, glasses, lighting changes, and leaving/reentering the camera view.