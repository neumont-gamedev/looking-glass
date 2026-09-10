# Looking Glass — 3D Models Directory

Place your custom 3D model files (`.glb` or `.gltf`) in this directory.

---

## Supported Format: glTF 2.0 Binary (`.glb`)

* **Recommended Extension**: `.glb` (single self-contained binary file containing geometry, textures, materials, and animations).
* **Software Export**:
  * **Blender**: `File -> Export -> glTF 2.0 (.glb)`
  * **Units**: Meters (fish models should be roughly `0.03m` to `0.06m` in length, or you can scale them in the Settings drawer).
  * **Forward Axis**: By default, Looking Glass supports models facing along `+Z`, `-Z`, `+X`, or `-X`.

---

## How to Load Models in Looking Glass

1. **Option A — Drop in this folder**:
   * Save your model as `public/models/my_fish.glb` (or `public/models/decoration.glb`).
   * In the app's Settings drawer under **Custom 3D Models**, type `my_fish.glb` and click **Spawn Custom Fish**!

2. **Option B — Instant In-Browser File Picker**:
   * In the app's Settings drawer under **Custom 3D Models**, click **"Import .glb File"** and choose any `.glb` file directly from your computer without restarting Vite!

