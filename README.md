# Looking Glass

> **A head-tracked window into 3D space.**  
> Turn your standard computer monitor into an interactive physical window with real-time head-coupled perspective / fish-tank VR.

Looking Glass tracks the viewer's head position via a standard webcam using **MediaPipe Face Landmarker** and dynamically recalculates an **asymmetric off-axis perspective projection matrix** in **Three.js**. As you move left, right, up, down, closer, or farther, the virtual perspective responds in real time—creating a convincing illusion of physical depth and motion parallax without requiring a VR headset.

---

## Key Features

- **Accurate Off-Axis Projection**: Calculates physical near-plane frustum boundaries treating the monitor as a fixed window pane ($Z = 0$). (See [`docs/projection.md`](docs/projection.md) for the full mathematical derivations).
- **Interactive Virtual Aquarium**:
  - Craig Reynolds **Boids flocking simulation** with multi-species schooling (Clownfish, Blue Tangs, Yellow Tangs, Neon Tetras).
  - Procedural 3D fish with speed-adaptive swimming spine articulation.
  - **Tap on the Glass**: Left-click to send shockwave ripples across the glass, startling nearby fish.
  - **Feed the Fish**: Right-click, press `F`, or click the HUD button to drop sinking food pellets that fish hunt and consume.
  - Sandy dunes, swaying seaweed, rising micro-bubbles, and underwater lighting with atmospheric fog.
- **Multiple Virtual Scenes**:
  - **Virtual Aquarium**: Interactive underwater reef ecosystem.
  - **Diorama Shadow Box**: Geometric shadow box with reflective materials, rotating crystals, and floating parallax particles.
  - **Debug Scene**: Calibrated XYZ axes, ground grids, and metric depth markers.
- **Low-Latency Smoothing**: Built-in **One Euro Filter** (Casiez et al., 2012) for adaptive jitter reduction when still and zero-lag tracking during rapid head motion.
- **Guided Display Calibration**:
  - 4-step wizard to calibrate neutral center position, viewer distance, monitor diagonal size, and motion sensitivity ($X, Y, Z$).
  - Settings persisted locally in `localStorage`.
- **Flexible Fallback Modes**:
  - **Webcam Tracking**: Native MediaPipe browser tracking with Picture-in-Picture debug view.
  - **Mouse Simulation**: Simulates viewer head position via mouse / pointer movement.
  - **Auto Demo Orbit**: Continuous Lissajous figure-8 camera wander path.
- **Privacy First**: All webcam frames are processed strictly client-side via WebAssembly and GPU shaders. No images are uploaded or recorded.

---

## Tech Stack

- **Rendering**: [Three.js](https://threejs.org/) (WebGL2, PCF Soft Shadows, ACESFilmic Tone Mapping)
- **Tracking**: [@mediapipe/tasks-vision](https://developers.google.com/mediapipe/solutions/vision/face_landmarker)
- **Bundler**: [Vite](https://vitejs.dev/)
- **Language**: TypeScript (strict mode)

---

## Getting Started

### Prerequisites
- Node.js 18+ and npm

### Installation
```bash
# Clone the repository
git clone https://github.com/neumont-gamedev/looking-glass.git
cd looking-glass

# Install dependencies
npm install

# Start local development server
npm run dev
```

Open `http://localhost:3000` in Google Chrome, Microsoft Edge, or any modern desktop browser supporting webcam access.

### Production Build
```bash
npm run build
```

---

## Mathematics & Documentation

For a comprehensive explanation of the physical window model, coordinate transformations, similar triangles, and asymmetric projection matrices, refer to:
📖 [**Mathematics of Off-Axis Projection (`docs/projection.md`)**](docs/projection.md)

---

## License

MIT License.

