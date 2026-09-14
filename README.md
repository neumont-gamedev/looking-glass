# Looking Glass

> **A head-tracked window into 3D space.**  
> Turn your standard computer monitor into an interactive physical window with real-time head-coupled perspective / fish-tank VR.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-looking--glass.web.app-brightgreen?style=for-the-badge&logo=google-chrome)](https://looking-glass.web.app/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Three.js](https://img.shields.io/badge/Three.js-black?style=for-the-badge&logo=three.js&logoColor=white)](https://threejs.org/)
[![MediaPipe](https://img.shields.io/badge/MediaPipe-00A98F?style=for-the-badge&logo=google&logoColor=white)](https://developers.google.com/mediapipe)

🌐 **Live Application:** [**https://looking-glass.web.app/**](https://looking-glass.web.app/)  
*(Alternative mirror: [https://neumont-looking-glass.web.app/](https://neumont-looking-glass.web.app/))*

---

## Overview

**Looking Glass** is a browser-based 3D display experiment that uses a standard webcam to track the viewer's head position and dynamically adjust a Three.js virtual camera so the monitor behaves like a physical window into a 3D scene.

As you move left, right, up, down, closer, or farther from the screen, the virtual perspective updates in real time using **asymmetric off-axis projection**. This creates a convincing **head-coupled perspective / fish-tank VR** effect with true motion parallax—without requiring a VR headset or specialized hardware.

---

## Screenshots

<!-- 
Paste your screenshots into docs/images/ and uncomment or update the paths below.
-->

| 🐠 Virtual Aquarium | 📐 Model Viewer & Metric Grids |
|:---:|:---:|
| ![Aquarium Scene](docs/images/screenshot_aquarium.png) <br> *3D aquatic ecosystem with schooling boids and plant current sway* | ![Model Viewer](docs/images/screenshot_model_viewer.png) <br> *Metric 1cm/10cm grid inspection mode for 3D assets* |

| 🎯 3D Perspective Calibration | 👁️ Head-Tracking & PiP Overlay |
|:---:|:---:|
| ![Calibration](docs/images/screenshot_calibration.png) <br> *Interactive wireframe box alignment & biometric distance estimation* | ![Webcam Overlay](docs/images/screenshot_tracking.png) <br> *Zero-latency Web Worker face tracking with landmark mesh* |

> *Tip: Enter **Fullscreen Mode** (`F11` or HUD button) to hide all UI elements and turn your screen into a seamless, edge-to-edge physical window.*

---

## Key Features

### 📐 Mathematically Accurate Off-Axis Projection
Unlike traditional orbit cameras that rotate around a focal point, Looking Glass treats the physical monitor surface as a fixed glass plane at $Z = 0$. Using the viewer's measured eye coordinates relative to the screen, it dynamically calculates an asymmetric frustum. Moving to the left reveals the right side of virtual objects behind the monitor, exactly as looking through a physical window.
- Detailed derivations and diagrams: 📖 [**Mathematics of Off-Axis Projection (`docs/projection.md`)**](docs/projection.md)

### ⚡ Multi-Threaded Web Worker Tracking Architecture
- MediaPipe FaceLandmarker runs in an independent **Web Worker** (`FaceTrackerWorker.ts`).
- Frame transfers via `ImageBitmap` offload vision inference entirely from the main thread.
- Guarantees **zero dropped frames or UI stutter** even under heavy tracking loads or slower hardware.
- Automatic fallback to main-thread tracking if web workers or OffscreenCanvas are unavailable.

### ⏱️ 60 FPS Fixed Timestep Simulation Loop
- Physics simulations, creature artificial intelligence, and camera perspective interpolation operate on a decoupled **60 Hz fixed timestep accumulator**.
- High-refresh rate displays (120Hz / 144Hz+) render buttery-smooth visual animations without altering simulation speed or physics behavior.

### 🐠 Interactive 3D Scenes
1. **Virtual Aquarium**:
   - High-fidelity 3D fish (`fish01`, `fish02`, `fish03`), aquatic flora (`plant01`, `plant02`), and sunken driftwood (`log`).
   - Craig Reynolds **Boids flocking simulation** with multi-species schooling and dynamic collision avoidance.
   - Natural current swaying for plants and spine-flexing swimming physics for fish.
   - **Interactive Glass**: Tap/click to send radial shockwave ripples that startle nearby fish.
   - **Feed the Fish**: Right-click, tap `F`, or press the HUD button to drop sinking food pellets that fish detect and pursue.
2. **Model Viewer**:
   - Focused inspection mode for individual 3D assets.
   - Calibrated metric grid textures displaying **1cm unit squares**, **5×5 subdivision blocks**, and **10cm high-contrast major lines**.
   - Multiple selectable grid themes (Orange, Red, Blue, Gray, Green).
3. **Calibration & Debug**:
   - 3D XYZ metric axes, ground coordinate plane, and depth markers.
   - Real-time performance HUD showing render FPS, tracking FPS, worker inference latency, and viewer coordinates ($X, Y, Z$).

### 🎯 Guided Display Calibration
- **Neutral Center**: One-click origin calibration setting your comfortable sitting position as $(0, 0, D)$.
- **Viewing Distance Options**:
  - **Biometric Auto-Detect**: Estimates distance using facial landmark geometry and interpupillary distance.
  - **3D Wireframe Alignment**: Visual alignment against a virtual wireframe box matching the screen border.
  - **Manual Slider**: Precise millimeter/inch distance adjustment.
- **Physical Monitor Sizing**: Input monitor diagonal (inches/cm) and aspect ratio to compute exact metric dimensions.
- Settings are saved automatically to `localStorage`.

### 🛡️ Low-Latency Adaptive Smoothing
- Integrated **One Euro Filter** (Casiez et al., 2012).
- Eliminates camera jitter when resting stationary while preserving zero-lag responsiveness during fast head movements.
- Configurable minimum cutoff frequency ($\text{minCutoff}$) and speed coefficient ($\beta$).

### 🖥️ Edge-to-Edge Portal Mode & Clean UI
- Clean, responsive UI with vector SVG icons.
- When entering **Fullscreen**, menu buttons, title bars, and HUD elements automatically vanish, leaving only the immersive 3D world behind the bezel.
- Move the cursor or press `Esc` to restore controls at any time.

### 🔒 Privacy First
- **100% Client-Side Processing**: Camera frames are processed locally inside the browser using WebAssembly and WebGL/WebGPU.
- No video feeds, images, or facial landmark data are ever transmitted to any server or recorded to disk.

### 🕹️ Fallback Simulation Modes
- **Webcam Tracking**: Full real-time head tracking.
- **Mouse Simulation**: Control viewer position via mouse/trackpad pointer coordinates.
- **Auto Demo Mode**: Autonomous Lissajous figure-8 camera motion for hands-free demonstrations.

---

## Tech Stack

| Component | Technology | Description |
|---|---|---|
| **Rendering** | [Three.js](https://threejs.org/) (r169) | WebGL2, PCF soft shadows, ACESFilmic tone mapping, custom projection matrices |
| **Vision Tracking** | [@mediapipe/tasks-vision](https://developers.google.com/mediapipe) | Face Landmarker ML inference (478 3D facial landmarks) |
| **Threading** | Web Workers | Dedicated background thread for MediaPipe model execution and frame processing |
| **Language** | [TypeScript](https://www.typescriptlang.org/) (5.5) | Fully typed with strict mode |
| **Bundler & Tooling**| [Vite](https://vitejs.dev/) | Ultra-fast hot module reloading and optimized production bundles |
| **Hosting** | [Firebase Hosting](https://firebase.google.com/) | Global multi-site SSL CDN (`looking-glass.web.app`) |

---

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- npm (v9 or higher)
- A webcam (for head tracking)

### Installation
```bash
# 1. Clone the repository
git clone https://github.com/neumont-gamedev/looking-glass.git
cd looking-glass

# 2. Install dependencies
npm install

# 3. Start local development server
npm run dev
```

Open `http://localhost:3000` in Google Chrome, Microsoft Edge, or another modern desktop browser supporting webcam access.

### Production Build
```bash
npm run build
```

The output files will be built to the `dist/` directory.

### Deploying to Firebase
```bash
npm run deploy
```

---

## Mathematics & Documentation

For a complete breakdown of the off-axis projection math, coordinate transforms, and virtual camera matrix calculations, see:  
📖 [**Mathematics of Off-Axis Projection (`docs/projection.md`)**](docs/projection.md)

---

## License

MIT License. See [LICENSE](LICENSE) for details.
