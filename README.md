# Looking Glass

**Turn your screen into a window.**

A browser-based Three.js experiment that uses MediaPipe webcam head tracking and asymmetric off-axis projection to create motion parallax on a normal monitor.

[Open the app](https://looking-glass.web.app/) · [Alternate hosting address](https://neumont-looking-glass.web.app/)

## Getting started

1. Allow webcam access and select webcam tracking in Settings.
2. Enter the full monitor dimensions. Use 100% browser zoom; the app adjusts the physical viewing aperture to the browser viewport.
3. For webcam FOV calibration, measure from the camera lens to your eyes and enter that distance. Face forward, hold still for about one second, then press **Calibrate FOV**.
4. Sit comfortably centered and use **Center & Distance → Calibrate** to save your neutral position and estimated viewing distance.
5. Move your head to explore the scene. Adjust tracking smoothing in Settings if needed.

FOV calibration assumes 63 mm pupil spacing and is approximate. It needs a measured distance; using a distance already estimated from FOV would be circular. Recalibrate FOV after changing cameras or capture modes. Visual alignment and measured viewing-distance controls remain under advanced adjustments.

## Scenes

### Aquarium

- A 50 cm deep tank with supplied fish, plants, driftwood, diver, and rock models.
- Separate fish schools with variable movement speeds and speed-driven vertex swimming animation.
- Textured, normal-mapped gravel with a gently uneven floor and two moving world-space caustic patterns.
- A yellow diver-mask light with smooth noise-driven intensity variation.
- Click the aquarium to drop small food pellets near the front glass at the selected horizontal position. Right-click and `F` also feed fish. UI clicks do not feed fish; glass tapping is disabled.
- **Light on** in the Aquarium scene controls uses normal directional intensity when checked. Unchecked uses 15% intensity. This choice survives scene switching during the session.

### Model Viewer

- Inspect supplied models, including the diver, rock, and animated fish.
- Adjust depth, scale, rotation, lighting, and automatic rotation.
- Choose Orange, Red, Blue, Gray, or Green wall grids.
- Sliders share the same styling as Settings.

### Calibration

- Inspect perspective using an antialiased grid and depth markers.
- Grid colors: Red (default), Green, Blue, Orange, Yellow, White, or None (solid black).
- Distance labels are hidden by default; enable **Show distance labels** to display them.

## Controls

| Control | Action |
| --- | --- |
| Cube button | Open Scenes |
| Gear button; `S` or `C` | Open Settings |
| Fullscreen button; `Tab` | Enter or leave fullscreen |
| `Esc` | Leave fullscreen or close an open panel |
| Aquarium click | Drop food at that horizontal position |
| Right-click in aquarium; `F` | Feed fish |
| `D`; backtick | Toggle performance HUD |

Fullscreen hides the top controls. Press Tab again or Escape to leave it. Plain Tab is assigned to fullscreen rather than forward keyboard focus navigation; Shift+Tab retains its browser behavior.

## Tracking and rendering

- Face Landmarker normally runs in a Web Worker, with a main-thread fallback when worker tracking is unavailable.
- Rendering targets 60 FPS independently of tracking updates; scene simulation uses a fixed 60 Hz timestep.
- One Euro filtering, stationary smoothing, and bounded prediction reduce jitter between tracking samples.
- Tracking loss briefly holds the last pose, then eases toward neutral; recovery is smoothed and camera movement is limited.
- Frame rate and inference latency depend on hardware and browser support. The main-thread fallback can still cause stutter.
- Mouse simulation and automatic demo modes work without webcam tracking.

Camera images are processed locally in your browser and are not uploaded or recorded. Calibration and settings are saved in localStorage; face images and landmarks are not persisted.

## Local development

Requires Node.js and npm compatible with the locked dependencies (Node 18+), and a modern desktop browser. Chrome and Edge are the primary targets. Webcam access requires localhost or HTTPS.

```bash
git clone https://github.com/neumont-gamedev/looking-glass.git
cd looking-glass
npm ci
npm run dev
```

Open the address printed by Vite, normally http://localhost:3000.

```bash
npm test
npm run build
npm run preview
```

The production build is written to `dist/`. Tests cover tracking, calibration, projection, and timing math; actual webcam behavior and visual quality need browser testing.

## Deployment

With Firebase CLI authentication and access to project `neumont-looking-glass`:

```bash
npm run deploy
```

This builds and deploys both sites configured in `firebase.json`: `looking-glass` and `neumont-looking-glass`. To deploy an already verified build:

```bash
npx firebase deploy --only hosting --project neumont-looking-glass
```

## Project documentation

- [Projection mathematics](docs/projection.md)
- [Tracking and calibration](docs/tracking-calibration.md)
- [Screenshot guidance](docs/images/README.md)
- [Contributor and agent guidance](AGENTS.md)

Built with TypeScript, Vite, Three.js, and MediaPipe Tasks Vision.
