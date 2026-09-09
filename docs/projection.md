# Mathematics of Off-Axis Projection in Head-Coupled Displays

## Overview

In traditional 3D graphics, a virtual camera mimics a real-world handheld camera or human eye looking through a lens: the camera has a symmetric field of view (FOV) centered around its forward viewing vector ($\vec{z}$). When the camera moves or rotates, the center of projection remains in the middle of the screen.

In **fish-tank VR** and **head-coupled perspective displays** like **Looking Glass**, the paradigm shifts:

> **The monitor is not a lens; the monitor is a physical glass window into a virtual space.**

The viewer's eye is in front of the screen. As the viewer moves, the boundaries of the physical display do not move in real-world space. Instead, the viewer's position relative to the fixed display changes, creating an **asymmetric (off-axis) viewing frustum**.

---

## Coordinate System Conventions

Looking Glass uses a right-handed Cartesian coordinate system in metric units (meters):

- **Origin $(0, 0, 0)$**: The exact center of the physical monitor surface.
- **$+X$**: To the physical right of the monitor.
- **$-X$**: To the physical left of the monitor.
- **$+Y$**: Physically up from the monitor.
- **$-Y$**: Physically down from the monitor.
- **$+Z$**: Perpendicular to the monitor, extending out into the real world toward the viewer.
- **$-Z$**: Behind the monitor surface, extending deep into the virtual 3D world.

```
                  +Y (Up)
                     |
                     |     Viewer Eye: (eyeX, eyeY, eyeZ)
                     |       *  (eyeZ > 0)
                     |      /
                     |     /
                     |    /
 -X (Left) ----------+---------- +X (Right)  [Screen plane at Z = 0]
                    /|
                   / |
                  /  |
          +Z (Real)  | -Z (Virtual World Diorama)
```

---

## Physical Model & Geometry

Let the physical monitor have:
- Width: $W$ (in meters)
- Height: $H$ (in meters)

Since the monitor is centered at the origin on the $Z = 0$ plane:
- Left edge: $x_{\text{left}} = -\frac{W}{2}$
- Right edge: $x_{\text{right}} = +\frac{W}{2}$
- Bottom edge: $y_{\text{bottom}} = -\frac{H}{2}$
- Top edge: $y_{\text{top}} = +\frac{H}{2}$

The viewer's eye is tracked at position:
$$\vec{E} = (X_e, Y_e, Z_e), \quad Z_e > 0$$

The distance from the eye to the screen plane is:
$$d_z = Z_e$$

---

## Projection Frustum Boundaries

To render the scene using standard graphics hardware, we define a near clipping plane at a virtual distance $n = \text{near}$ directly in front of the camera (where $0 < n < Z_e$).

Using similar triangles, any point on the monitor plane at distance $Z_e$ scales down to the near clipping plane at distance $n$ by the ratio:
$$\text{scale} = \frac{n}{Z_e}$$

The horizontal and vertical offsets of the physical screen edges relative to the eye position $(X_e, Y_e)$ are:
- Relative left: $x_{\text{left}} - X_e = -\frac{W}{2} - X_e$
- Relative right: $x_{\text{right}} - X_e = \frac{W}{2} - X_e$
- Relative bottom: $y_{\text{bottom}} - Y_e = -\frac{H}{2} - Y_e$
- Relative top: $y_{\text{top}} - Y_e = \frac{H}{2} - Y_e$

Projecting these offsets onto the near clipping plane yields the frustum boundaries:

$$left = \frac{n}{Z_e} \left( -\frac{W}{2} - X_e \right)$$

$$right = \frac{n}{Z_e} \left( \frac{W}{2} - X_e \right)$$

$$bottom = \frac{n}{Z_e} \left( -\frac{H}{2} - Y_e \right)$$

$$top = \frac{n}{Z_e} \left( \frac{H}{2} - Y_e \right)$$

---

## Behavior & Parallax Analysis

Let us analyze how the projection responds to viewer movement:

### 1. Moving to the Right ($X_e > 0$)
- Both $left$ and $right$ shift in the negative direction.
- On the viewer's screen, this expands the field of view into the virtual box toward the left side of internal objects.
- In real life, when you look through a window while standing on the right, you can see around the left side of objects inside the room. The mathematics faithfully reproduces this motion parallax!

### 2. Moving Closer to the Monitor ($Z_e$ decreases)
- The scale factor $\frac{n}{Z_e}$ increases.
- The angular field of view subtended by the screen expands.
- Objects appear larger and closer, exactly as when pressing your face closer to a window.

### 3. Moving Upwards ($Y_e > 0$)
- $top$ and $bottom$ shift downwards, allowing the viewer to look down upon the top surface of objects in the diorama.

---

## Three.js Camera Construction

In Three.js, a camera using this projection must:
1. Have its position set to the viewer's physical eye position:
   ```typescript
   camera.position.set(eyeX, eyeY, eyeZ);
   ```
2. Have zero rotation (pointing directly down $-Z$, parallel to monitor normal):
   ```typescript
   camera.rotation.set(0, 0, 0);
   camera.quaternion.set(0, 0, 0, 1);
   ```
3. Use `Matrix4.makePerspective(left, right, top, bottom, near, far)`:
   ```typescript
   camera.projectionMatrix.makePerspective(left, right, top, bottom, near, far);
   camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
   ```
   *(Note: Do not call `camera.updateProjectionMatrix()`, as it would recalculate a symmetric frustum from `camera.fov`.)*

---

## Conclusion

By calculating the projection matrix directly from the viewer's measured physical eye coordinates relative to the screen plane, Looking Glass turns any standard desktop monitor into an interactive holographic portal.

