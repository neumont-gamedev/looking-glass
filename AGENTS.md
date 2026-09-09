# AGENTS.md — Looking Glass

## Project Overview

**Looking Glass** is a browser-based 3D display experiment that uses a standard webcam to track the viewer's head position and dynamically adjust a Three.js camera so the display behaves like a physical window into a 3D scene.

As the viewer moves left, right, up, down, closer, or farther from the screen, the virtual perspective should update in real time. The goal is to create a convincing **head-coupled perspective / fish-tank VR** effect without requiring a VR headset.

The application should prioritize:

- Low latency
- Stable tracking
- Smooth perspective changes
- Easy calibration
- Clear separation between tracking, math, rendering, and UI
- A polished visual demonstration of the effect
- Browser-based deployment with minimal setup

---

# Core Experience

The user opens the application in a modern desktop browser.

1. The app asks for webcam permission.
2. The webcam detects and tracks the user's face.
3. The application estimates the viewer's head/eye position relative to the screen.
4. Three.js updates the virtual camera using that position.
5. The rendered scene changes perspective as the viewer moves.
6. The screen should feel like a window or opening into a 3D space.

The effect should be especially obvious when the scene contains objects at different depths.

---

# Recommended Technology Stack

## Rendering

Use:

- **Three.js**
- WebGL renderer
- Perspective or custom off-axis projection camera
- requestAnimationFrame render loop

Three.js is responsible only for rendering and scene management.

Do not tightly couple tracking code to the rendering system.

---

## Face / Head Tracking

Use:

- **MediaPipe Face Landmarker**

The tracking system should obtain facial landmarks from the webcam and estimate:

- Head center
- Horizontal head position
- Vertical head position
- Approximate distance from camera
- Optional head rotation
- Approximate eye midpoint

Prefer browser-side processing.

Do not send webcam frames to a remote server.

The application should continue to render even if tracking temporarily fails.

---

## Smoothing

Raw landmark data will likely jitter.

Create a dedicated smoothing system.

Recommended initial approach:

- One Euro Filter

Acceptable alternatives:

- Exponential smoothing
- Kalman filter
- Moving-average filter

The filtering implementation should allow tuning.

Suggested tunable values:

- minimum cutoff
- beta
- derivative cutoff
- tracking confidence threshold

Filtering should prioritize low latency over perfectly smooth motion.

---

# Architecture

Use modular TypeScript.

Suggested structure:

```text
src/
│
├── main.ts
│
├── app/
│   └── LookingGlassApp.ts
│
├── rendering/
│   ├── Renderer.ts
│   ├── SceneManager.ts
│   ├── PerspectiveController.ts
│   └── DemoScene.ts
│
├── tracking/
│   ├── FaceTracker.ts
│   ├── HeadPoseEstimator.ts
│   ├── TrackingState.ts
│   └── TrackingDebugView.ts
│
├── calibration/
│   ├── CalibrationManager.ts
│   └── CalibrationData.ts
│
├── filtering/
│   ├── OneEuroFilter.ts
│   └── VectorFilter.ts
│
├── math/
│   ├── ProjectionMath.ts
│   ├── CoordinateMapper.ts
│   └── ScreenGeometry.ts
│
├── ui/
│   ├── Controls.ts
│   ├── StatusPanel.ts
│   └── CalibrationPanel.ts
│
└── utils/
    ├── Debug.ts
    └── Storage.ts
```

The exact structure may change as the project develops, but maintain clear subsystem boundaries.

---

# Major Systems

## FaceTracker

Responsibilities:

- Request webcam permission
- Initialize MediaPipe
- Process webcam frames
- Return raw landmark data
- Expose tracking confidence
- Detect when a face is lost
- Avoid rendering concerns

Suggested interface:

```ts
interface FaceTrackingResult {
    visible: boolean;
    confidence: number;
    timestamp: number;
    landmarks: NormalizedLandmark[];
}
```

---

## HeadPoseEstimator

Convert face landmarks into a normalized viewer position.

Output should resemble:

```ts
interface ViewerPose {
    x: number;
    y: number;
    z: number;

    yaw?: number;
    pitch?: number;
    roll?: number;

    confidence: number;
}
```

Coordinate convention:

```text
+x = viewer moves right
-x = viewer moves left

+y = viewer moves up
-y = viewer moves down

+z = viewer moves away from screen
-z = viewer moves toward screen
```

Clearly document any changes to this convention.

---

# Eye Position

Use the midpoint between the two eyes when practical.

Important landmarks may include:

- left eye center
- right eye center
- nose bridge
- nose tip
- outer eye corners

The initial implementation does not need exact gaze tracking.

The goal is **viewer position tracking**, not eye-gaze tracking.

---

# Perspective System

This is the most important part of the project.

Do not simply rotate the Three.js camera toward the viewer.

The desired effect requires the virtual camera position and projection to represent the physical viewer's location relative to the screen.

Use **off-axis projection** where practical.

Conceptually, the physical monitor acts as the near-plane window into the virtual scene.

The projection should be calculated using:

- viewer position
- physical screen width
- physical screen height
- viewer distance from screen
- virtual near plane
- virtual far plane

The system should support two operating modes.

## Simple Mode

Move the Three.js camera based on normalized head position.

Use this first to validate tracking.

This implementation may use:

```text
camera.position.x
camera.position.y
camera.position.z
camera.lookAt(...)
```

This mode is primarily for debugging and rapid prototyping.

---

## Accurate Mode

Use an asymmetric / off-axis projection matrix.

Concept:

```text
             viewer
                *
               /|\
              / | \
             /  |  \
        +---------------+
        |    monitor    |
        +---------------+
              virtual
               world
```

When the viewer moves left, the virtual camera should reveal more of the right side of objects.

When the viewer moves right, it should reveal more of the left side.

The effect should resemble looking around objects through a window.

---

# Screen Calibration

Provide a calibration process.

At minimum gather:

- approximate monitor width
- approximate monitor height
- approximate viewer distance from screen
- neutral head position

Optional future calibration:

- webcam position relative to screen
- camera field of view
- camera height
- webcam offset from screen center
- screen DPI
- physical screen dimensions calculated from monitor size

Save calibration in localStorage.

---

# Calibration Workflow

Create a simple guided calibration screen.

Suggested flow:

### Step 1 — Neutral Position

Ask the user to sit comfortably centered in front of the display.

Button:

**Set Center Position**

Store the current pose as the neutral origin.

---

### Step 2 — Viewing Distance

Provide either:

- manual distance input

or

- estimated distance using face scale

Suggested units:

- centimeters
- inches

Internally use meters.

---

### Step 3 — Screen Dimensions

Allow manual entry of:

- width
- height

Optional convenience:

- diagonal size
- aspect ratio

Then calculate width and height.

---

### Step 4 — Sensitivity

Allow small adjustments to:

- horizontal sensitivity
- vertical sensitivity
- depth sensitivity

---

# Demo Scene

Create a visually strong test environment.

The default scene should make parallax obvious.

Suggested scene:

```text
Foreground:
    floating frame or window border

Midground:
    cubes
    spheres
    character or model

Background:
    grid
    wall
    distant geometry
```

Include objects positioned at multiple depths.

A good initial scene could resemble a miniature diorama or shadow box.

---

# Diorama Mode

The primary demonstration should resemble a box extending behind the monitor.

Possible visual design:

- dark room / display box
- floor plane
- side walls
- back wall
- several colorful geometric objects
- floating particles
- one recognizable 3D model

Use lighting and shadows to emphasize depth.

---

# Debug Scene

Provide a debug mode containing:

- XYZ grid
- coordinate axes
- cubes at known positions
- depth markers
- camera frustum visualization if practical

The debug scene is more important than visual polish during early development.

---

# User Interface

Keep the main screen visually clean.

Suggested layout:

```text
+------------------------------------------------+
| Looking Glass                         Settings |
|                                                |
|                                                |
|                 3D VIEW                       |
|                                                |
|                                                |
|                                                |
| Tracking: ● Active                            |
+------------------------------------------------+
```

Avoid placing large UI elements over the main scene.

---

# Settings Panel

Include controls for:

## Tracking

- enable tracking
- tracking confidence
- smoothing
- smoothing strength

## Perspective

- horizontal sensitivity
- vertical sensitivity
- depth sensitivity
- maximum head offset
- near plane
- far plane

## Calibration

- recalibrate center
- screen width
- screen height
- viewing distance

## Debug

- show webcam
- show face landmarks
- show eye points
- show raw tracking
- show filtered tracking
- show FPS
- show camera coordinates

---

# Webcam Debug View

Provide an optional webcam preview.

Overlay:

- facial landmarks
- eye midpoint
- face center
- bounding box
- tracking confidence

This view should be hidden by default after calibration.

---

# Tracking States

Create explicit tracking states:

```ts
enum TrackingStatus {
    Initializing,
    Active,
    LowConfidence,
    FaceLost,
    CameraDenied,
    Error
}
```

UI behavior should respond appropriately.

Examples:

```text
Active
Tracking viewer

Low Confidence
Move into better lighting

Face Lost
Move back into view

Camera Denied
Camera access is required for head tracking
```

---

# Face Lost Behavior

Do not abruptly snap the camera back to center.

When tracking is lost:

1. Hold the last valid pose briefly.
2. Slowly interpolate toward neutral.
3. Restore tracking smoothly when the face returns.

---

# Motion Limits

Clamp tracking input.

Example conceptual ranges:

```text
horizontal: -1 to 1
vertical:   -1 to 1
depth:      -1 to 1
```

Do not allow bad tracking data to send the virtual camera far outside the scene.

---

# Coordinate Mapping

The system will involve several coordinate spaces.

Keep them separate.

Expected spaces:

```text
MediaPipe normalized coordinates
        ↓
Webcam image coordinates
        ↓
Viewer-relative coordinates
        ↓
Physical screen coordinates
        ↓
Three.js world coordinates
```

Create explicit conversion functions.

Avoid scattered magic numbers.

---

# Performance Goals

Target:

- 60 FPS rendering
- tracking at 30 FPS or better
- low visual latency
- smooth head movement

Tracking does not need to run every render frame.

For example:

```text
Three.js render: 60 FPS
MediaPipe tracking: 30 FPS
```

Interpolate between tracking updates.

---

# Browser Requirements

Primary target:

- Chrome
- Edge

Secondary target:

- Firefox
- Safari

Camera APIs generally require:

- localhost during development

or

- HTTPS in production

---

# Development Tooling

Recommended:

- TypeScript
- Vite
- Three.js
- MediaPipe Tasks Vision
- ESLint
- Prettier

Package manager:

- npm

Use ES modules.

---

# Suggested Initial Setup

```bash
npm create vite@latest looking-glass -- --template vanilla-ts

cd looking-glass

npm install
npm install three
npm install @mediapipe/tasks-vision
```

Add Three.js TypeScript types if required by the current package configuration.

---

# Development Phases

## Phase 1 — Three.js Prototype

Create:

- Three.js renderer
- perspective camera
- basic lighting
- grid
- several cubes at multiple depths

Implement mouse controls that simulate viewer movement.

The mouse should control virtual viewer X/Y.

Do this before webcam tracking.

Success criteria:

Moving the mouse produces convincing perspective parallax.

---

## Phase 2 — Webcam Tracking

Integrate MediaPipe.

Display:

- webcam feed
- face landmarks
- eye midpoint
- head center

Do not connect tracking to the Three.js camera yet.

Success criteria:

Stable tracking values are visible.

---

## Phase 3 — Tracking + Camera

Map head movement to virtual camera position.

Start with simple camera translation.

Success criteria:

Moving the viewer's head changes the scene perspective.

---

## Phase 4 — Filtering

Implement One Euro filtering.

Compare:

- raw pose
- filtered pose

Success criteria:

Reduced jitter without noticeable sluggishness.

---

## Phase 5 — Off-Axis Projection

Implement proper asymmetric projection.

Success criteria:

Perspective feels like looking through a physical window rather than orbiting a virtual camera.

---

## Phase 6 — Calibration

Add:

- center calibration
- viewing distance
- monitor dimensions
- sensitivity controls
- saved settings

---

## Phase 7 — Presentation

Create the polished diorama scene.

Add:

- shadows
- lighting
- depth cues
- UI polish
- fullscreen mode

---

# Testing Requirements

Test tracking under:

- bright lighting
- dim lighting
- glasses
- facial hair
- partial face rotation
- moving closer
- moving farther away

Test perspective at:

- center
- far left
- far right
- high
- low
- close
- far

Ensure no NaN or Infinity values enter camera matrices.

---

# Fallback Modes

The application should remain usable when webcam tracking is unavailable.

Provide:

## Mouse Mode

Mouse position simulates viewer movement.

## Touch Mode

Touch drag simulates viewer movement.

## Auto Demo Mode

Camera moves slowly through a predefined path.

These modes are useful for:

- development
- demonstrations
- troubleshooting
- devices without cameras

---

# Privacy

The webcam feed should remain local to the browser.

Do not:

- upload webcam images
- record video
- store face images
- store facial landmarks permanently

Only store calibration/settings data.

Include a short privacy message:

> Camera images are processed locally in your browser and are not uploaded or recorded.

---

# Code Quality Rules

Agents working on this project should:

- Prefer TypeScript
- Keep files focused
- Avoid giant classes
- Avoid unnecessary frameworks
- Avoid premature abstraction
- Add comments for projection math
- Use descriptive names
- Eliminate unexplained magic numbers
- Keep tracking and rendering independent
- Ensure cleanup of camera streams and MediaPipe resources
- Handle permission failures gracefully
- Never silently swallow errors

---

# Math Documentation

Projection mathematics must be documented carefully.

Whenever implementing custom matrices, include comments describing:

- coordinate system
- units
- assumptions
- equations
- screen geometry
- frustum boundaries

Add a `docs/projection.md` file once off-axis projection is implemented.

This document should explain the math in a way that can also be used as educational material.

---

# Physical Model

The long-term goal is to model:

```text
viewer eye position
        ↓
physical monitor plane
        ↓
virtual viewing frustum
        ↓
3D scene
```

Eventually support a model similar to:

```text
eye = viewer world position

screenLeft
screenRight
screenTop
screenBottom

near = distance from eye to screen plane
```

From this information calculate the asymmetric projection frustum.

---

# Optional Advanced Features

Do not implement these before the core experience works.

Potential future features include:

### Stereo Mode

Track the approximate location of both eyes and render separate eye views.

Possible outputs:

- red/cyan anaglyph
- side-by-side stereo
- experimental lenticular display support

This could integrate naturally with the user's existing anaglyph calibration work.

---

### WebXR Mode

Allow the same demo scenes to run in:

- VR
- AR
- mixed reality

---

### Multiple Scenes

Examples:

- miniature room
- aquarium
- spaceship window
- museum display
- sci-fi portal
- terrain landscape
- arcade cabinet
- anatomical visualization

---

### Object Interaction

Use head position to reveal hidden objects or information.

Examples:

- peek around a wall
- inspect behind an object
- reveal depth-dependent labels

---

### Screen Frame

Render a virtual frame around the viewport to strengthen the illusion that the monitor is a physical opening.

---

### Head Rotation

Head rotation may eventually affect perspective, but positional tracking is the priority.

Do not let rotation introduce unnecessary camera movement during the initial implementation.

---

### Face Distance Estimation

Investigate more accurate depth estimation using:

- interpupillary distance
- known average facial dimensions
- MediaPipe facial transformation data
- webcam field-of-view calibration

Treat estimates as approximate unless calibrated.

---

# UX Principle

The user should not need to understand the underlying mathematics.

Ideal flow:

```text
Open Looking Glass
      ↓
Allow Camera
      ↓
Sit Centered
      ↓
Press Calibrate
      ↓
Move Your Head
      ↓
See the 3D World Respond
```

The first convincing effect should appear within seconds.

---

# Visual Identity

Project name:

# Looking Glass

Possible subtitle:

**Turn your screen into a window.**

Alternative:

**A head-tracked window into 3D space.**

Visual direction:

- dark interface
- subtle futuristic styling
- minimal controls
- strong emphasis on the rendered scene
- glass / portal / window motif

Avoid overly complex sci-fi UI.

---

# Definition of MVP

The MVP is complete when:

1. Three.js renders a diorama scene.
2. MediaPipe detects one viewer.
3. Viewer X/Y/Z position is estimated.
4. Tracking data is filtered.
5. Camera perspective responds to head movement.
6. A user can calibrate their neutral position.
7. Perspective produces convincing motion parallax.
8. The app handles tracking loss gracefully.
9. Mouse simulation mode is available.
10. The project runs locally with a simple `npm run dev`.

A polished UI is not required for the MVP.

The perspective illusion is the product.

---

# Agent Priorities

When deciding what to work on, prioritize in this order:

1. Correct perspective behavior
2. Reliable tracking
3. Low latency
4. Stable filtering
5. Calibration
6. Debugging tools
7. Scene quality
8. UI polish
9. Advanced features

Do not spend significant time polishing the interface until the head-coupled perspective effect is convincing.

---

# Important Agent Guidance

When modifying the project:

- Inspect existing code before creating new systems.
- Reuse existing abstractions when appropriate.
- Do not replace working systems merely to change style.
- Make small, testable changes.
- Maintain a working build after each major step.
- Explain complex projection changes in comments.
- Keep experimental features behind settings or feature flags.
- Prefer measurable improvements over speculative architecture.

When a bug affects perspective, first verify:

1. Tracking coordinates
2. Coordinate-system direction
3. Calibration origin
4. Scale conversion
5. Screen geometry
6. Camera position
7. Projection matrix

Do not compensate for incorrect math using arbitrary sensitivity values.

---

# Initial Agent Task

If starting from an empty repository, implement the project in this order:

1. Create Vite + TypeScript project.
2. Install Three.js.
3. Build basic diorama scene.
4. Add mouse-driven simulated viewer position.
5. Implement perspective controller.
6. Verify parallax behavior.
7. Install MediaPipe Tasks Vision.
8. Implement webcam manager.
9. Implement FaceTracker.
10. Show landmark debug visualization.
11. Implement ViewerPose estimation.
12. Connect viewer pose to PerspectiveController.
13. Add smoothing.
14. Add calibration.
15. Implement off-axis projection.
16. Polish the demo only after the projection system works.

After each stage, ensure:

```bash
npm run build
```

completes without errors.

---

# Success Criterion

The project succeeds when a viewer can stand or sit in front of a normal computer monitor, move their head naturally, and immediately perceive that the 3D world behind the screen has physical depth.

The strongest reaction should be:

> "It feels like I can look around the objects inside the monitor."
