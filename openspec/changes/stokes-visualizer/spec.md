# Spec: Stokes Theorem Visualizer — MVP

## 1. Overview

This spec defines the behavior of the Stokes Theorem Visualizer (change `stokes-visualizer`), a browser-based interactive tool for university students of vector calculus. It translates the proposal's ten capabilities into testable functional requirements (FRs) using RFC 2119 keywords and Given/When/Then scenarios, and adds concrete non-functional and acceptance criteria. The project is greenfield: no main specs exist in `openspec/specs/`, so this document is a **full spec** (not a delta) and will be split into one file per capability at archive time.

The 10 capabilities are: `2d-flow-lines`, `3d-flow-gradients`, `mesh-deformation`, `reversible-path`, `mouse-interaction`, `vector-field-engine`, `integral-computation`, `image-upload`, `spanish-ui`, `mode-system`. All UI strings, formulas, and field names are in Spanish; all spec prose is in English.

---

## 2. Capability Specifications

### 2.1 `2d-flow-lines` (Mode 1)

**Purpose**: Render a 2D vector field as particles tracing streamlines on the XY plane, integrated with RK4.

| # | Functional requirement |
|---|------------------------|
| FR-1 | The system SHALL render between 2,000 and 10,000 particles as `THREE.Points` on the z=0 plane. |
| FR-2 | The system SHALL integrate each particle's position with RK4 (4th-order Runge-Kutta) using the active vector field formula. |
| FR-3 | The system SHALL recycle any particle whose age exceeds its lifetime OR whose position leaves the domain bounds `[-2.5, 2.5] × [-2.5, 2.5]`. |
| FR-4 | The system SHALL color each particle by the local field magnitude using the viridis colormap. |
| FR-5 | The system SHALL provide a toggle to overlay pre-computed streamlines as static `LineSegments`. |
| FR-6 | The system SHALL expose a particle-density slider that maps `1 → 2,000` and `10 → 10,000` particles linearly. |

#### Scenarios

- **S1.1 Initial render**: GIVEN a fresh page load in Mode 1 with the default field `F = (-y, x)`, WHEN the render loop starts, THEN 2,000 particles SHALL be visible and moving along circular streamlines within 100ms.
- **S1.2 Domain recycling**: GIVEN a particle at `(2.4, 0.1)` with velocity `(−0.1, 2.4)`, WHEN its position exceeds `|x| > 2.5`, THEN it SHALL be respawned at a random in-bounds point with reset age within 1 frame.
- **S1.3 Field switch**: GIVEN the user changes the field picker from `vortex` to `radial`, WHEN the new field is applied, THEN all particle velocities SHALL reflect the new field on the next frame.
- **S1.4 Density slider**: GIVEN the user moves the particle-density slider from `1` to `10`, WHEN the change is applied, THEN the active particle count SHALL reach 10,000 within 500ms.
- **S1.5 Streamline overlay**: GIVEN streamline overlay is toggled on, WHEN rendered, THEN static line segments SHALL appear beneath the particles without affecting their motion.

#### Edge cases

- **E1.a Zero-magnitude field**: When the field evaluates to `(0, 0)` at a particle's position, the particle SHALL hold its position for that frame and resume when field becomes non-zero.
- **E1.b NaN propagation**: If RK4 produces a non-finite value, the particle SHALL be immediately recycled.
- **E1.c Domain resize**: On window resize, the simulation bounds SHALL be re-validated and out-of-bounds particles recycled.
- **E1.d Field outside catalog**: If the active field index is invalid, the system SHALL fall back to field index 0 and log a warning to the console.

---

### 2.2 `3d-flow-gradients` (Mode 2)

**Purpose**: Display a 3D vector field as a 50,000-particle grid, with color/size encoding field magnitude and direction.

| # | Functional requirement |
|---|------------------------|
| FR-1 | The system SHALL render 50,000 particles arranged in a `50 × 50 × 20` cubic grid spanning `[-2, 2]³`. |
| FR-2 | The system SHALL encode each particle's RGB color from field direction (HSV → RGB) and size from field magnitude. |
| FR-3 | The system SHALL attach `OrbitControls` to the camera, with plain-drag rotating the camera. |
| FR-4 | The system SHALL treat `Ctrl/Cmd + drag` as a vortex-creation gesture (see `mouse-interaction`). |
| FR-5 | The system SHALL provide a color-mapping toggle between `magnitude`, `direction`, and `curl-magnitude` modes. |
| FR-6 | The system SHALL animate particles by a small offset proportional to local field direction to convey flow (≤ 5% of cell size per frame). |

#### Scenarios

- **S2.1 Grid render**: GIVEN Mode 2 is activated with field `F = (-y, x, 0)`, WHEN rendered, THEN 50,000 particles SHALL appear in a cubic grid with viridis colors encoding magnitude.
- **S2.2 Orbit gesture**: GIVEN the user drags with the left mouse button (no Ctrl/Cmd), WHEN the drag ends, THEN the camera SHALL have rotated around the origin (orbit) and no vortex SHALL be created.
- **S2.3 Vortex gesture**: GIVEN the user holds Ctrl/Cmd and drags, WHEN the drag ends, THEN a vortex event SHALL be added to the deformation system and the camera SHALL NOT rotate.
- **S2.4 Color mode switch**: GIVEN the user switches color mapping from `magnitude` to `curl-magnitude`, WHEN applied, THEN all particle colors SHALL update within 1 frame to reflect `|∇ × F|` at each grid point.
- **S2.5 Empty field**: GIVEN the active field is conservative (e.g., gradient of 1/r), WHEN curl-magnitude coloring is selected, THEN all particles SHALL display the minimum value of the colormap.

#### Edge cases

- **E2.a Camera clipping**: If the camera moves inside the grid, the system SHALL clamp the minimum distance to the origin at 0.5 units to prevent disorientation.
- **E2.b WebGL2 unavailability**: If WebGL2 is unavailable, the system SHALL fall back to a 10,000-particle grid and log a warning.
- **E2.c Simultaneous orbit + vortex**: If both gestures are detected in the same frame, the system SHALL prefer the vortex gesture and ignore the orbit delta.

---

### 2.3 `mesh-deformation` (Mode 3)

**Purpose**: Display a 256×256 plane mesh that deforms under mouse-driven vortices, with optional "modo matemático" overlay.

| # | Functional requirement |
|---|------------------------|
| FR-1 | The system SHALL create a `THREE.PlaneGeometry(4, 4, 256, 256)` mesh (65,536 vertices) once at startup. |
| FR-2 | The system SHALL apply a `ShaderMaterial` whose vertex shader displaces positions via a `sampler2D uDeformBuffer` DataTexture. |
| FR-3 | The system SHALL oversize the mesh to 20% beyond the visible area to mask boundary artifacts, and apply a Gaussian falloff within the visible 4×4 region. |
| FR-4 | The system SHALL expose a "Modo matemático" toggle that overlays the underlying field arrows and the integral readouts. |
| FR-5 | The system SHALL accept a user-uploaded image as the mesh's texture (see `image-upload`). |
| FR-6 | The system SHALL disable `OrbitControls` in this mode (top-down fixed camera at `(0, 0, 3)` looking at origin). |

#### Scenarios

- **S3.1 Initial mesh**: GIVEN Mode 3 is activated with no active deformation, WHEN rendered, THEN the mesh SHALL display flat with the user's uploaded image (or a default test pattern) and 65,536 vertices.
- **S3.2 Single vortex**: GIVEN a single mouse-drag vortex event, WHEN the event is active, THEN vertices within the vortex radius SHALL be displaced by the field's displacement function and the mesh SHALL show visible deformation.
- **S3.3 Math mode toggle**: GIVEN "Modo matemático" is OFF, WHEN the user toggles it ON, THEN the system SHALL overlay arrow glyphs encoding `F` and two numeric readouts (∮ and ∬).
- **S3.4 Math mode toggle off**: GIVEN "Modo matemático" is ON, WHEN the user toggles it OFF, THEN the overlays SHALL disappear within 1 frame and the image-only render SHALL resume.
- **S3.5 Boundary falloff**: GIVEN a vertex is at the edge of the visible 4×4 area, WHEN a vortex is centered inside the area, THEN that edge vertex SHALL receive ≤ 5% of the displacement applied to the vortex center.

#### Edge cases

- **E3.a No image uploaded**: If no image is provided, the system SHALL use a default 4×4 procedural checkerboard texture.
- **E3.b Image smaller than expected**: If the uploaded image is < 256×256, the system SHALL upscale it to the geometry's UV grid without warning.
- **E3.c All vortices expired**: When the keyframe buffer is empty, the mesh SHALL return to its rest position within 1 frame.

---

### 2.4 `reversible-path`

**Purpose**: Replay the forward deformation path of a mesh vertex in reverse using keyframe history and Catmull-Rom spline interpolation.

| # | Functional requirement |
|---|------------------------|
| FR-1 | The system SHALL allocate a fixed-size ring buffer of 16 keyframes per vertex, holding (dx, dy, dz) as half-float (16-bit) values. |
| FR-2 | The system SHALL record a new keyframe on ANY of these triggers: mouse direction change > 15°, speed change > 20%, or fixed interval of 500ms. |
| FR-3 | The system SHALL upload the keyframe buffer to the GPU as a `DataTexture` of dimensions `256 × (16 × 256)` with `NEAREST` filtering, and set `texture.needsUpdate = true` per frame when dirty. |
| FR-4 | The system SHALL interpolate between 4 consecutive keyframes in the vertex shader using a Catmull-Rom spline. |
| FR-5 | The system SHALL support multiple concurrent vortices by summing their contributions into a merged keyframe sequence per vertex. |
| FR-6 | The system SHALL evict the oldest keyframe (FIFO) when the per-vertex buffer is full. |
| FR-7 | The system SHALL return a vertex through the SAME trajectory it traveled forward, within ±2% of path length. |

#### Scenarios

- **S4.1 Single keyframe recording**: GIVEN the user is dragging at constant speed in one direction, WHEN 500ms elapses, THEN a keyframe SHALL be appended to each affected vertex's buffer.
- **S4.2 Direction change trigger**: GIVEN the user changes drag direction by 20°, WHEN the new direction is detected, THEN a keyframe SHALL be recorded within 1 frame.
- **S4.3 Reverse playback**: GIVEN a vertex has 8 keyframes in its forward sequence, WHEN the vortex effect ends, THEN the vertex SHALL traverse the keyframes in reverse order, interpolated with Catmull-Rom, reaching rest position at the final keyframe.
- **S4.4 Two concurrent vortices**: GIVEN vortices A and B both affect vertex V, WHEN both are active, THEN V's buffer SHALL contain the temporally-merged sequence of A's and B's contributions summed.
- **S4.5 Buffer overflow**: GIVEN a vertex's buffer is at 16 entries and a 17th keyframe is triggered, WHEN the append occurs, THEN entry 0 SHALL be evicted and the new entry SHALL be appended at position 15.
- **S4.6 Upload cost**: GIVEN a full 16-keyframe buffer per vertex, WHEN uploaded to the GPU, THEN the `texImage2D` call SHALL complete in < 1ms on the target hardware.

#### Edge cases

- **E4.a Vertex with 0–1 keyframes**: If fewer than 2 keyframes exist, the vertex SHALL receive zero displacement (rest position).
- **E4.b Concurrent eviction race**: If two events try to evict the same slot, the second SHALL be a no-op (idempotent append).
- **E4.c Texture upload failure**: If `texImage2D` throws, the system SHALL log the error and skip the frame; the previous texture content SHALL persist.
- **E4.d Rest arrival tolerance**: The system SHALL declare a vertex "at rest" when its displacement magnitude falls below 1e-3 world units.

---

### 2.5 `mouse-interaction`

**Purpose**: Translate 2D mouse input into 3D world-space state (position, speed, click-held) usable by all three modes.

| # | Functional requirement |
|---|------------------------|
| FR-1 | The system SHALL project mouse NDC coordinates onto the z=0 plane using a `THREE.Raycaster` and a `THREE.Plane(0,0,1,0)`. |
| FR-2 | The system SHALL compute `mouseSpeed` as the magnitude of `(currentWorldPos - previousWorldPos) / dt`, smoothed with an exponential moving average (α = 0.3). |
| FR-3 | The system SHALL publish the intersection point to `InteractionStore` as `mouseWorld: Vector3` and `mouseSpeed: number`. |
| FR-4 | The system SHALL track `clickHeld: boolean` and `effectRadius: number`, multiplying the radius by 3.0 while `clickHeld` is true. |
| FR-5 | The system SHALL throttle `mousemove` events to 120Hz on the CPU side. |
| FR-6 | The system SHALL update the shader uniforms `uMouse`, `uSpeed`, `uRadius`, `uClickHeld` on every frame in which they change. |
| FR-7 | The system SHALL provide an "Efectos activados" toggle to disable mouse-driven effects globally. |

#### Scenarios

- **S5.1 Move over canvas**: GIVEN the cursor moves to NDC `(0.3, -0.2)`, WHEN the raycaster runs, THEN `mouseWorld` SHALL be approximately `(0.6, -0.4, 0)` and `mouseSpeed` SHALL be non-zero.
- **S5.2 Click hold**: GIVEN the user presses and holds the left mouse button on the canvas, WHEN the click is registered, THEN `clickHeld = true` and `effectRadius` SHALL be 3.0× its base value.
- **S5.3 Click release**: GIVEN `clickHeld = true`, WHEN the user releases the button, THEN `clickHeld = false` and `effectRadius` SHALL return to its base value within 1 frame.
- **S5.4 Throttling**: GIVEN 300 mousemove events per second arrive, WHEN throttled, THEN at most 120 events SHALL be processed and dispatched to the store.
- **S5.5 Effects disabled**: GIVEN the "Efectos activados" toggle is OFF, WHEN the user drags the mouse, THEN `mouseWorld` updates but no vortex event SHALL be created.
- **S5.6 Off-canvas mouse**: GIVEN the cursor leaves the canvas, WHEN the last position was inside, THEN `mouseWorld` SHALL hold its last value and `mouseSpeed` SHALL decay toward 0 over 200ms.

#### Edge cases

- **E5.a No intersection**: If the ray is parallel to the plane (camera looking edge-on), the system SHALL hold the last valid `mouseWorld`.
- **E5.b Touch events**: Touch events SHALL be mapped to the same handlers via `touchmove` / `touchstart` / `touchend` (mobile is out of scope but the mapping must not break the architecture).
- **E5.c Stale speed after long pause**: After 200ms without movement, the EMA SHALL clamp `mouseSpeed` to 0 to avoid noise.

---

### 2.6 `vector-field-engine`

**Purpose**: Provide a catalog of predefined vector fields for Modes 1 and 2, with live editing of sources, sinks, and coefficients.

| # | Functional requirement |
|---|------------------------|
| FR-1 | The system SHALL provide exactly 6 predefined 2D fields and 6 predefined 3D fields, each with a Spanish display name, formula, and analytical curl. |
| FR-2 | The 2D field catalog SHALL include: `vortexRotacional` (`F = (-y, x)`), `expansionRadial` (`F = (x, y)`), `flujoCortante` (`F = (y, 0)`), `puntoSilla` (`F = (x, -y)`), `vortexConFuente` (`F = (x - y, x + y)`), `reticulaPeriodica` (`F = (sin y, sin x)`). |
| FR-3 | The 3D field catalog SHALL include: `rotacion2DEn3D` (`F = (-y, x, 0)`), `flujoHelicoidal` (`F = (-y, x, z)`), `silla3D` (`F = (x, -y, 0)`), `flujoPoiseuille` (`F = (0, 0, 1 - x² - y²)`), `triplePeriodico` (`F = (sin y, sin z, sin x)`), `conservativo` (`F = ∇(1/√(x²+y²+z²))`). |
| FR-4 | The system SHALL allow adding, moving, and removing source/sink points (charges) in the 2D/3D field plane, with live updates to the active field. |
| FR-5 | The system SHALL expose coefficient sliders (`a`, `b`, `c`) that linearly combine the active field with user-defined perturbations. |
| FR-6 | The system SHALL persist field edits only in memory (no localStorage in v1.0). |
| FR-7 | The system SHALL provide a "Restablecer campo" button to revert to the catalog default for the active field. |

#### Scenarios

- **S6.1 Default catalog**: GIVEN the user opens Mode 1, WHEN the field picker renders, THEN it SHALL list 6 fields by Spanish name.
- **S6.2 Select field**: GIVEN the field picker shows the catalog, WHEN the user selects `vortexConFuente`, THEN the active field index SHALL update and the render SHALL reflect the new field within 1 frame.
- **S6.3 Move source**: GIVEN a source point exists at `(1, 0)`, WHEN the user drags it to `(1.5, 0)`, THEN the field's source contribution SHALL update and the next frame SHALL show particles/grid reflecting the new field.
- **S6.4 Coefficient edit**: GIVEN coefficient `a = 1.0`, WHEN the user moves the slider to `a = 2.0`, THEN the next frame SHALL render the field scaled by 2.0.
- **S6.5 Reset field**: GIVEN a custom edited field, WHEN "Restablecer campo" is clicked, THEN all sources/sinks/coefficients SHALL revert to the catalog default and the render SHALL reflect the default within 1 frame.
- **S6.6 Field name display**: GIVEN any field is active, WHEN the UI renders, THEN the Spanish field name and its formula SHALL be displayed in the status bar.

#### Edge cases

- **E6.a All sources removed**: If all sources/sinks are removed, the field SHALL evaluate to zero everywhere; particles shall freeze and the system SHALL display a hint.
- **E6.b Coefficient overflow**: Coefficient values SHALL be clamped to `[-10, 10]` to prevent NaN/extreme values.
- **E6.c Source at origin**: A source at the origin is allowed; the system SHALL compute the limit for singular fields analytically.
- **E6.d Mode 3 field visibility**: In Mode 3, the field is invisible by default; it appears only when "Modo matemático" is ON.

---

### 2.7 `integral-computation`

**Purpose**: Compute and display live values of `∮_C F · dr` and `∬_S (∇ × F) · dS` in Mode 3's math mode.

| # | Functional requirement |
|---|------------------------|
| FR-1 | The system SHALL compute the line integral `∮_C F · dr` along the user-defined closed path C (default: unit circle). |
| FR-2 | The system SHALL compute the surface integral `∬_S (∇ × F) · dS` over the deformed mesh surface. |
| FR-3 | For predefined fields, the system SHALL use **analytical** formulas for both integrals (exact, fast). |
| FR-4 | For user-edited fields, the system SHALL fall back to **numerical** integration (midpoint rule) computed every 5–10 frames. |
| FR-5 | The system SHALL display both values in the UI as `∮ F · dr = <value>` and `∬ (∇ × F) · dS = <value>`, rounded to 4 decimal places. |
| FR-6 | The system SHALL verify that `|∮ - ∬| / max(|∮|, |∬|, 1e-9) < 0.01` (1% tolerance) when the deformation settles. |
| FR-7 | The system SHALL NOT allow both integrals to be computed in the same frame more often than once per 5 frames when using numerical mode. |

#### Scenarios

- **S7.1 Default field equality**: GIVEN Mode 3 with field `F = (-y, x, 0)` and a hemispherical surface, WHEN math mode is ON, THEN `∮ ≈ 2π` and `∬ ≈ 2π` (Stokes equality holds analytically).
- **S7.2 Numerical fallback**: GIVEN the user has added custom sources/sinks, WHEN math mode is ON, THEN the system SHALL compute integrals numerically and update the readouts every 5–10 frames.
- **S7.3 Surface deformation effect**: GIVEN a vertex displacement that deforms the surface, WHEN the deformation settles, THEN the surface integral SHALL update and the equality SHALL hold within 1% tolerance.
- **S7.4 Live update on field change**: GIVEN math mode is ON, WHEN the user changes the field picker, THEN both integral readouts SHALL refresh on the next computation tick.
- **S7.5 Conservation check**: GIVEN a conservative field (e.g., `∇(1/r)`), WHEN computed, THEN both integrals SHALL evaluate to 0 within 1e-6.

#### Edge cases

- **E7.a Degenerate surface**: If the deformed surface is self-intersecting or has zero area, the surface integral SHALL return 0 and the system SHALL display a warning badge.
- **E7.b Empty path**: If no closed path is defined, the line integral SHALL default to the unit circle.
- **E7.c Large magnitude overflow**: If either integral exceeds 1e6, the system SHALL display in scientific notation and clamp the displayed precision to 4 significant figures.
- **E7.d CPU computation cost**: Numerical integration on 256×256 mesh SHALL complete in < 5ms per call (throttled to every 5 frames).

---

### 2.8 `image-upload`

**Purpose**: Accept a user-uploaded image, downscale it for GPU memory safety, and apply it as the Mode 3 mesh texture.

| # | Functional requirement |
|---|------------------------|
| FR-1 | The system SHALL accept images via drag-and-drop onto the canvas AND via a file picker button. |
| FR-2 | The system SHALL support PNG, JPEG, and WebP file formats. |
| FR-3 | The system SHALL downscale any uploaded image so that neither dimension exceeds 2048 pixels, preserving aspect ratio. |
| FR-4 | The system SHALL complete the downscale + texture upload in < 2s for a 4K input image. |
| FR-5 | The system SHALL display a preview thumbnail (64×64) of the uploaded image in the control panel. |
| FR-6 | The system SHALL free the previous texture's GPU memory via `.dispose()` before uploading a new one. |
| FR-7 | The system SHALL reject files larger than 20MB with a visible error message in Spanish. |

#### Scenarios

- **S8.1 Drag-and-drop**: GIVEN the user drags a PNG file from their OS onto the canvas, WHEN the drop event fires, THEN the file SHALL be read, downscaled, and applied as the mesh texture within 2s.
- **S8.2 File picker**: GIVEN the user clicks the "Subir imagen" button, WHEN the picker opens and the user selects a file, THEN the same flow as S8.1 SHALL execute.
- **S8.3 4K downscale**: GIVEN a 4096×2160 image, WHEN uploaded, THEN it SHALL be downscaled to fit within 2048×2048 (specifically 2048×1080) before texture creation.
- **S8.4 Small image passthrough**: GIVEN a 512×512 image, WHEN uploaded, THEN it SHALL be applied without downscaling.
- **S8.5 Oversized rejection**: GIVEN a 25MB JPEG, WHEN the user attempts to upload it, THEN the system SHALL reject the file and display "Archivo demasiado grande (máx. 20 MB)".
- **S8.6 Replace texture**: GIVEN a texture is already loaded, WHEN a new image is uploaded, THEN the old texture SHALL be disposed and the new one SHALL be applied within 2s.

#### Edge cases

- **E8.a Non-image file**: If the dropped file is not a recognized image format, the system SHALL display "Formato no soportado" and make no changes.
- **E8.b Corrupt image**: If `Image` decoding fails, the system SHALL display "No se pudo cargar la imagen" and revert to the previous texture.
- **E8.c Transparent PNG**: Alpha channels SHALL be preserved; transparent regions render as the mesh's default background color.

---

### 2.9 `spanish-ui`

**Purpose**: Provide a complete Spanish-language HTML overlay with viridis colormap and accessible controls.

| # | Functional requirement |
|---|------------------------|
| FR-1 | The system SHALL expose every user-facing string through a single `es.ts` module — no inline English text in the DOM. |
| FR-2 | The system SHALL use the **viridis** colormap for all magnitude/curl visualizations. |
| FR-3 | The system SHALL provide `aria-label` attributes in Spanish for all interactive controls. |
| FR-4 | The system SHALL support keyboard navigation for the mode switcher (Tab/Arrow keys) per WAI-ARIA practices. |
| FR-5 | The system SHALL use a semi-transparent dark background (`rgba(20, 20, 30, 0.85)`) for the control panel to ensure readability over the canvas. |
| FR-6 | The system SHALL render correctly at minimum viewport size 1280×720. |
| FR-7 | The system SHALL expose a "Restablecer vista" (reset view) button available in all modes. |

#### Scenarios

- **S9.1 Language consistency**: GIVEN the page is loaded, WHEN the DOM is inspected, THEN all visible text nodes SHALL match strings from `es.ts` exactly.
- **S9.2 Viridis colormap**: GIVEN any field magnitude is rendered, WHEN the color is computed, THEN it SHALL be sampled from the viridis lookup table.
- **S9.3 Keyboard navigation**: GIVEN the user presses Tab repeatedly from the page load, WHEN focus moves through the mode switcher, THEN the active mode SHALL change with Arrow keys per ARIA `radiogroup` pattern.
- **S9.4 Aria labels**: GIVEN a control button exists, WHEN inspected, THEN it SHALL have a non-empty `aria-label` attribute in Spanish.
- **S9.5 Reset view**: GIVEN the camera has been orbited, WHEN "Restablecer vista" is clicked, THEN the camera SHALL return to the default position for the active mode within 500ms.
- **S9.6 Minimum viewport**: GIVEN a 1280×720 viewport, WHEN rendered, THEN no UI element SHALL overflow the viewport bounds.

#### Edge cases

- **E9.a Missing translation key**: If a key is missing from `es.ts`, the system SHALL log a console warning and render the key name as a fallback.
- **E9.b High contrast mode**: If the OS is in high-contrast mode, the panel background SHALL be replaced with `Window` system color via `@media (forced-colors: active)`.
- **E9.c Right-to-left languages**: Out of scope for v1.0.

---

### 2.10 `mode-system`

**Purpose**: Provide a 3-mode switcher with instant transitions and per-mode visibility groups.

| # | Functional requirement |
|---|------------------------|
| FR-1 | The system SHALL create exactly 3 `THREE.Group` instances, one per mode, all added to a single `THREE.Scene`. |
| FR-2 | The system SHALL switch active mode by toggling `group.visible` (no scene rebuild). |
| FR-3 | The system SHALL complete a mode switch in < 50ms (measured by `performance.now()` from click to next paint). |
| FR-4 | The system SHALL persist the active mode in `ModeStore` and re-render the appropriate UI controls. |
| FR-5 | The system SHALL dispose of mode-specific buffers and reset deformation state on mode switch. |
| FR-6 | The system SHALL expose a mode selector UI element (radio buttons labeled ① Flujo 2D, ② Gradientes 3D, ③ Deformación). |
| FR-7 | The system SHALL allow keyboard shortcut `1`/`2`/`3` to switch modes. |

#### Scenarios

- **S10.1 Initial mode**: GIVEN the page is loaded, WHEN the first frame renders, THEN Mode 1 (`Flujo 2D`) SHALL be active and visible, and groups 2 and 3 SHALL be `visible = false`.
- **S10.2 Mode switch via UI**: GIVEN Mode 1 is active, WHEN the user clicks the "③ Deformación" button, THEN within 50ms the mesh group SHALL become visible and the particles group SHALL become invisible.
- **S10.3 Mode switch via keyboard**: GIVEN any mode is active, WHEN the user presses `2`, THEN the system SHALL switch to Mode 2 within 50ms.
- **S10.4 State cleanup on switch**: GIVEN Mode 3 has active deformation, WHEN the user switches to Mode 1, THEN the deformation buffer SHALL be reset to zero and no leftover displacement SHALL appear in Mode 1.
- **S10.5 UI control swap**: GIVEN the user switches from Mode 1 to Mode 3, WHEN the UI re-renders, THEN the Mode 1 controls (field picker) SHALL be hidden and the Mode 3 controls (image upload, math mode toggle) SHALL be visible.
- **S10.6 Persistence across switches**: GIVEN the user switches Mode 1 → Mode 3 → Mode 1, WHEN returning to Mode 1, THEN the previously selected field SHALL still be active.

#### Edge cases

- **E10.a Switching during animation**: Switching mid-animation SHALL cancel ongoing tweens and particle aging without leaking timers.
- **E10.b Same-mode click**: Clicking the active mode button SHALL be a no-op (no state churn).
- **E10.c Mode change with no mesh in Mode 3**: If no image is uploaded, Mode 3 SHALL show the default checkerboard and remain fully interactive.

---

## 3. Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-1 | **Performance** | The system SHALL sustain 60fps (≥ 58fps measured) on Intel UHD 620 with a 256×256 mesh and 10,000 particles, over a 10-second continuous interaction. |
| NFR-2 | **Performance** | The CPU frame budget SHALL be < 5ms; the GPU frame budget SHALL be < 8ms; total < 16ms. |
| NFR-3 | **Memory** | Total GPU memory SHALL be < 100 MB. JS heap SHALL remain < 200 MB sustained. |
| NFR-4 | **Memory** | The keyframe buffer SHALL use half-float (16-bit) storage, capping it at ~3.15 MB for 65,536 vertices × 16 keyframes. |
| NFR-5 | **Bundle size** | Total application bundle SHALL be < 200 KB gzipped, excluding Three.js. |
| NFR-6 | **Bundle size** | The viridis colormap LUT SHALL be ≤ 4 KB. |
| NFR-7 | **Browser support** | The system SHALL run on Chrome 90+, Firefox 88+, and Safari 15+. WebGL2 is REQUIRED. |
| NFR-8 | **Accessibility** | All interactive controls SHALL be reachable via keyboard. All controls SHALL have Spanish `aria-label` attributes. |
| NFR-9 | **i18n** | v1.0 SHALL ship Spanish only. All strings in a single `es.ts` module. No fallback English file. |
| NFR-10 | **Deploy** | The system SHALL build to static files deployable on Vercel. The output SHALL be a `dist/` folder with `index.html`, hashed JS chunks, and a `vercel.json` for SPA routing. |
| NFR-11 | **Code quality** | TypeScript SHALL be in strict mode. No `any` types in production code. |
| NFR-12 | **Security** | The system SHALL NOT make network requests at runtime. No telemetry, no analytics, no CDN calls after initial bundle load. |

---

## 4. Acceptance Criteria

These are pass/fail conditions for v1.0 release. Each is derived from the proposal's success criteria and made testable.

| ID | Criterion | Measurement |
|----|-----------|-------------|
| AC-1 | Mode switch latency < 50ms | Measure `performance.now()` delta from click to next `requestAnimationFrame` paint, averaged over 10 switches. |
| AC-2 | Sustained 60fps on Intel UHD 620, 256×256 mesh | Run a 10-second scripted interaction (drag + click-hold + field change) and assert mean fps ≥ 58. |
| AC-3 | Vortex return path matches forward within ±2% | For a single vortex event on a reference vertex, compute path length forward and reverse, assert `|L_fwd - L_rev| / L_fwd < 0.02`. |
| AC-4 | Stokes equality in math mode within 1% | For the default field `F = (-y, x, 0)`, compute both integrals and assert `|∮ - ∬| / max(|∮|, 1e-9) < 0.01`. |
| AC-5 | Coefficient edit propagates within 1 frame | Trigger a coefficient change, assert the next rendered frame reflects the new coefficient (verified by sampling one particle's velocity). |
| AC-6 | Image upload from 4K completes in < 2s | Upload a 4096×2160 image, measure time from drop event to texture ready, assert < 2000ms. |
| AC-7 | All UI strings are in Spanish | Lint pass: scan all DOM-rendered text nodes, assert every visible string is in `es.ts`. No English substrings except in code comments. |
| AC-8 | Bundle size < 200 KB gzipped (excl. Three.js) | Run `vite build` and check `dist/assets/*.js` sizes; sum gzipped. |
| AC-9 | GPU memory < 100 MB | Use `WEBGL_lose_context` extension's `MEMORY_INFO` or Chrome DevTools' Performance Memory panel to assert < 100 MB. |
| AC-10 | Mode state cleanup on switch | After Mode 3 → Mode 1, assert deformation buffer is all-zero and no Mode 3 particles exist in Mode 1's Points object. |
| AC-11 | Keyboard navigation works | Programmatically Tab to mode switcher, press ArrowRight, assert active mode advances; same for keyboard shortcuts `1`/`2`/`3`. |
| AC-12 | Static deploy works | `vite build` produces a `dist/` that, when served by `vercel dev`, loads and functions identically to `vite dev`. |

---

## 5. Test Strategy (when strict_tdd is enabled)

> **Note**: `strict_tdd: false` in the current `openspec/config.yaml`. The following are recommended if/when that flag flips.

| Layer | Tooling | Coverage target |
|-------|---------|-----------------|
| **Unit** | Vitest | Field evaluators, ring buffer logic, coefficient clamping, EMA smoothing, integral analytical formulas, downscale math. Target: 90% line coverage on `src/engine/`. |
| **Component** | Vitest + Three.js stub | Mode switcher state transitions, UI string resolution from `es.ts`, image upload validation. |
| **Integration** | Playwright | Full user flows: mode switch, mouse-drag vortex, math-mode equality display, image upload. |
| **Visual / golden** | Playwright + pixelmatch | Screenshots of default state per mode, viridis color verification (sample 10 known pixels). |
| **Performance** | Playwright + `performance.now()` | AC-1, AC-2, AC-5, AC-6 automation. |
| **Memory** | Chrome DevTools Protocol | AC-9 via `Performance.getMetrics`. |

Tests SHALL live in `tests/` at the project root, mirroring `src/` structure. The `test_command` in `config.yaml` SHALL be updated to `npm test` when this is enabled.

---

## 6. Out of Scope (v1.0)

Explicitly excluded from v1.0 (per proposal §"Non-goals"):

- **Authentication / user accounts** — no login, no saved profiles.
- **Backend / server-side rendering** — pure static SPA.
- **Persistence beyond the session** — field edits, images, and modes reset on page reload.
- **Mobile-first layout / touch optimization** — desktop (1280×720+) is the target. Touch events map to mouse handlers but are not UX-validated.
- **Internationalization beyond Spanish** — `es.ts` only; no `en.ts`, no runtime language switcher.
- **Audio, GIF/video export, VR/AR** — no media output, no immersive modes.
- **Other theorems** (Green's, Divergence, Gauss) — only Stokes' theorem (with Green's as a 2D special case in Mode 1).
- **Field algebra** — no symbolic composition, no formula parser UI. The 6 predefined fields per mode are fixed.
- **Custom surface geometry** — Mode 3 uses the fixed 4×4 plane; no user-uploaded `.obj`/`.gltf`.
- **Network features** — no analytics, no telemetry, no remote config, no CDN runtime dependencies.

---

**Spec complete.** 10 capabilities specified with FRs, scenarios, and edge cases. Ready for `sdd-design`.
