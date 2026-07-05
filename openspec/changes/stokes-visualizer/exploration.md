# Exploration: Stokes Theorem Visualizer — MVP

> **Change**: `stokes-visualizer`
> **Project**: `stokes_simulator` (greenfield)
> **Stack**: Vite + TypeScript + Three.js + GLSL custom shaders
> **Status**: Exploration complete — ready for proposal

---

## 1. Stokes Theorem Pedagogy — Minimum Viable Representation

Stokes' theorem states: **∮_C F · dr = ∬_S (∇ × F) · dS**

The line integral of a vector field around a closed curve equals the flux of the curl through any surface bounded by that curve.

### How existing resources visualize it

| Resource | Strengths | Gaps for this project |
|----------|-----------|----------------------|
| **3Blue1Brown (YouTube)** | Animated small patches, visual proof of cancelation inside the surface. Local curl = circulation per unit area. | Pre-recorded; no interaction. |
| **MIT OCW / textbooks** | Clear static diagrams with arrows on the boundary and surface. | Static; no manipulation. |
| **Wolfram Demonstrations** | Interactive sliders for parameters. | Dated UI, desktop-only, heavy. |
| **GeoGebra 3D** | Good 2D surface visualization. | Limited 3D, no custom fields. |
| **Manim-based animations** | Beautiful rendered output. | Not interactive; rendered offline. |
| **Purdue / Colorado PhET** | Excellent for physics education. | No vector calculus focus. |

### Minimum representation that still teaches the theorem

1. **A 3D surface S with an explicit boundary curve C**, clearly labeled.
2. **A vector field F** visualized on/around the surface (arrows, streamlines, or color).
3. **Live numeric values** for both sides of the equation — the user manipulates the field or surface and sees the equality hold.
4. **Interactive manipulation**: move sources/sinks, change coefficients, observe how the integrals change.
5. **For Mode 3**: the deformation IS the visual metaphor. Toggling "modo matemático" shows the underlying vector field and integral values.

### Pedagogical insight driving the architecture

The key learning moment is "the curl inside ADDS UP to the circulation on the boundary." Mode 1 (2D/Green's theorem) is the most intuitive entry point. Mode 2 adds the third dimension. Mode 3 is the hook — students play with a fun visual effect, then discover the math behind it. This progression is intentional and must guide the UI layout and mode ordering.

---

## 2. Reference Vector Fields

### 2D fields (Mode 1 — 2D flow lines)

| # | Name | Formula | Curl | Divergence | Notes |
|---|------|---------|------|------------|-------|
| 1 | **Rotational / Central vortex** | F = (-y, x) | (0, 0, 2) | 0 | **Best for Green's theorem.** Constant, nonzero curl. |
| 2 | **Radial expansion** | F = (x, y) | (0, 0, 0) | 2 | Curl-free field; shows that some fields have zero circulation. |
| 3 | **Shear flow** | F = (y, 0) | (0, 0, -1) | 0 | Simple visualization of nonzero curl in a linear field. |
| 4 | **Hyperbolic saddle** | F = (x, -y) | (0, 0, 0) | 0 | Irrotational + incompressible. Surprising at first glance. |
| 5 | **Mixed vortex + source** | F = (x - y, x + y) | (0, 0, 2) | 2 | Combines rotation and expansion. |
| 6 | **Periodic lattice** | F = (sin(y), sin(x)) | (0, 0, cos(x) - cos(y)) | 0 | Spatially varying curl — shows local vs global. |

### 3D fields (Mode 2 — 3D flow gradients)

| # | Name | Formula | Curl | Notes |
|---|------|---------|------|-------|
| 1 | **2D rotation in 3D** | F = (-y, x, 0) | (0, 0, 2) | Simplest 3D field — connects Mode 1 → Mode 2. |
| 2 | **Helical / screw flow** | F = (-y, x, z) | (0, 0, 2) | Adds vertical component to the rotation. |
| 3 | **Saddle in 3D** | F = (x, -y, 0) | (0, 0, 0) | Curl-free in 3D — useful as counterexample. |
| 4 | **Poiseuille / pipe flow** | F = (0, 0, 1 - x² - y²) | (2y, -2x, 0) | Quadratic profile. Curl varies radially. |
| 5 | **Triple periodic** | F = (sin(y), sin(z), sin(x)) | (cos(z) - cos(y), cos(x) - cos(z), cos(y) - cos(x)) | Complex spatial structure. |
| 6 | **Conservative (gradient)** | F = ∇(1/√(x²+y²+z²)) | (0, 0, 0) | Gravitational potential gradient. Shows curl = 0 for conservative fields. |

### Best field for demonstrating the theorem

**F = (-y, x, 0)** with a hemispherical surface whose boundary is the unit circle:
- Constant curl (0, 0, 2) → flux is simply 2 × area of projection = 2π.
- Line integral is ∮ x dy - y dx = 2π.
- Both sides match trivially. The user can watch the equality hold as they manipulate the surface.

---

## 3. The Reversible Path Algorithm — Most Novel Part

### Requirement

User creates a deformation vortex via mouse interaction. The mesh deforms along a path P(t) for t ∈ [0, T]. When the effect ends, each vertex must return through the **exact same path in reverse**: P_reverse(t) = P(T - t) for t ∈ [T, 2T] (approximately 2-3 seconds total). Multiple vortices must be simultaneously active.

### Comparison of approaches

#### Option A — Per-vertex full path history
Store N position samples per vertex in a ring buffer.

| Aspect | Assessment |
|--------|-----------|
| **Accuracy** | Perfect. Exact reverse path. |
| **Memory (256² mesh)** | 65,536 vertices × N × 3 floats × 4 bytes = N × 786 KB. N=60 (1 sec at 60fps) → **47 MB**. N=180 (3 sec) → **141 MB**. Too high. |
| **GPU transfer** | Full buffer must be available to vertex shader every frame. Massive uniform or texture update. |
| **Simultaneous vortices** | Works — append independent displacement sequences. But memory scales linearly. |
| **Compression** | Half-float (16-bit): halve memory. Delta encoding: store differences instead of absolute positions. Run-length encoding for static regions. Could compress to ~5-10 MB for N=60. |
| **Verdict** | Too memory-heavy uncompressed. Compression adds complexity. Overkill for visual fidelity needs. |

#### Option B — Spring/damper system
Each vertex has rest position, mass, damping coefficient. User force displaces it; spring pulls it back.

| Aspect | Assessment |
|--------|-----------|
| **Accuracy** | **Fails the requirement.** The return trajectory is exponential decay, NOT the forward path reversed. The vertex snaps back through different positions than it traversed forward. |
| **Memory** | Minimal — 1 state vector per vertex (position + velocity). |
| **Implementation** | Trivial. Euler integration, 20 lines. |
| **Simultaneous vortices** | Works — forces sum linearly. |
| **Verdict** | Does NOT satisfy the "reverse through the same path" requirement. Disqualified. |

#### Option C — Potential field with gradient flow
Store a time-dependent scalar potential φ(x, t) whose gradient ∇φ encodes the deformation. The mesh follows gradient descent on φ. The return is implicit: as φ decays, vertices slide back along the same gradient lines.

| Aspect | Assessment |
|--------|-----------|
| **Accuracy** | Theoretically exact if φ(t) recovers the original path. Requires ∇φ to be a conservative field — which it can be, by construction. |
| **Memory** | Low — store φ as a 2D texture (scalar per grid cell). |
| **Math complexity** | **High.** Writing φ such that each vertex follows an exact forward-backward path under multiple concurrent vortices is nontrivial. Potential interference between overlapping potentials must be avoided. |
| **Implementation** | Requires solving φ at each timestep. Need FBO ping-pong for φ evolution. Heavy shader work. |
| **Simultaneous vortices** | Risky — potentials superimpose, creating paths that neither vortex intended. |
| **Verdict** | Elegant in theory but over-engineering for a visualizer. Risk of path interference kills it. |

#### Option D — Hybrid: keyframe history with interpolation
Store only M keyframes per vertex (position samples at non-uniform intervals). Interpolate smoothly between them during reverse playback.

| Aspect | Assessment |
|--------|-----------|
| **Accuracy** | **Excellent with M ≥ 8.** Cubic/Catmull-Rom interpolation between 8 keyframes over 2-3 seconds is visually indistinguishable from frame-by-frame for typical smooth deformation motion. |
| **Memory (256² mesh)** | 65,536 × M × 3 floats × 4 bytes = M × 786 KB. M=8 → **6.3 MB**. With half-float (16-bit): **3.15 MB**. Acceptable. |
| **GPU transfer** | Write keyframe buffer to a DataTexture once per frame. 256 × (M × 256) texture. Upload cost ~256 KB/frame. Negligible. |
| **Keyframe placement** | Record on significant directional/velocity change: mouse direction change > threshold, speed change > 20%, or fixed interval (every 300ms). Adaptive placement yields best quality with fewest keyframes. |
| **Interpolation** | Catmull-Rom spline in the vertex shader. 4 texture lookups per vertex per frame. ~50-80 additional shader instructions. Well within budget. |
| **Simultaneous vortices** | Works naturally. Each vortex event appends its own keyframe sequence. Keyframes from different events are temporally ordered in the ring buffer. |
| **Implementation complexity** | Moderate. Ring buffer (per vertex), keyframe picker (CPU side), Catmull-Rom sampling (vertex shader), DataTexture management. |
| **Verdict** | **Best fit.** Best quality/memory/complexity tradeoff. |

### Recommendation: Option D — Hybrid Keyframe History

**Why this fits the app:**
- **Visual fidelity**: 8 keyframes with Catmull-Rom spline interpolation is indistinguishable from full history for smooth deformations.
- **Memory budget**: ~6 MB (half-float: ~3 MB) for 65,536 vertices — well within browser limits.
- **60fps viability**: Vertex shader samples 4 texture lookups per vertex. 65K × 4 = 262K texture samples per frame on the GPU. Trivial for any GPU from the last 10 years.
- **Simultaneous vortices**: Each interaction event writes its own keyframe sequence to the buffer. The buffer is temporally ordered — playback is simply "read the sequence in order, interpolate."
- **Implementation fits TypeScript/Three.js/GLSL stack**: CPU side manages the ring buffer and writes to a DataTexture. Vertex shader reads and interpolates.

**Key design decisions:**
1. Ring buffer: fixed-size per vertex (16 entries, 8 for active + 8 for cooling down). Older entries are evicted when the buffer is full.
2. Keyframe recording: on mouse direction change > 15°, speed change > 20%, or every 500ms (adaptive).
3. Interpolation: Catmull-Rom in the vertex shader. Takes 4 keyframe samples (p0, p1, p2, p3) and interpolates.
4. DataTexture layout: 256 columns (x index) × (16 × 256) rows (16 keyframes × 256 y indices). Each pixel: RGB = (dx, dy, dz) as half-float.
5. Two parallel buffers: one for active forward deformation, one whose keyframes are being replayed in reverse.

---

## 4. Three.js Architecture for 3 Modes

### Single Scene vs Separate Scenes

| Aspect | Single Scene | Separate Scenes |
|--------|-------------|-----------------|
| **Setup/teardown cost** | Zero — all geometry loaded once | Need to rebuild/load per switch |
| **Mode switch latency** | Instant (toggle visibility) | 100-500ms (scene construction) |
| **Memory** | Higher baseline (all geometry loaded) | Lower per-mode, but cumulative same |
| **State isolation** | Must manage visibility & groups | Automatic isolation |
| **Lighting consistency** | Single setup | Per-scene setup |
| **OrbitControls** | Need to reattach | Each scene has its own |
| **Code complexity** | Lower | Higher (scene lifecycle) |

**Recommendation**: **Single Scene with visibility groups**. Create three `THREE.Group` instances, one per mode. Toggle visibility on switch. This gives instant switching, zero setup cost, and clean code organization. If memory becomes an issue (unlikely at this scale), refactor to lazy-loaded scenes.

### Camera Strategy

| Mode | Recommended Camera | Reasoning |
|------|-------------------|-----------|
| **Mode 1 (2D flow)** | Perspective (z = +5, looking at origin) | Orthographic is cleanest but switching cameras is ugly. Perspective with camera far away gives near-orthographic view. Disable orbit controls: fixed top-down view. |
| **Mode 2 (3D flow)** | Perspective with orbit controls | User needs to orbit, zoom, inspect the 3D field. |
| **Mode 3 (deformation)** | Perspective (z = +3, looking down at XY plane) | Same camera as Mode 1 but closer. Orbit controls disabled. |

**Recommendation**: **Single PerspectiveCamera** per mode (they can share the same Three.js camera object with different position/lookAt per mode). This avoids the complexity of camera system switching. Orthographic offers no meaningful advantage for this app.

### Mesh Strategy for Mode 3 (Image Deformation)

- **Geometry**: `THREE.PlaneGeometry(4, 4, 256, 256)`. Width/height of 4 units fits the interaction space. 256×256 segments = 65,536 vertices. This is the sweet spot: detailed enough for smooth deformation, performant enough for 60fps.
- **Material**: Custom `ShaderMaterial` with:
  - Vertex shader: reads displacement from a DataTexture, applies to position, passes UV to fragment.
  - Fragment shader: samples the user-uploaded texture.
- **Texture**: Uploaded image resized to max 2048×2048 on the CPU side (to cap GPU memory). Applied as a `THREE.Texture` uniform.
- **Displacement**: Written via CPU-side `Float32Array`, uploaded as `DataTexture` with `texture.needsUpdate = true` each frame deformation changes.

### Particles vs Streamlines (Mode 1)

| Aspect | Particles | Streamlines |
|--------|-----------|-------------|
| **Visual appeal** | High — animated dots trace flow | Medium — lines don't move without animation |
| **Implementation** | Simple — update positions in loop | Moderate — trace and render line segments |
| **Performance** | Excellent (PointsMaterial) | Good (LineSegments) |
| **Pedagogical value** | Shows direction, speed, path | Shows full integral curves at once |
| **Animation cost** | Update array, re-upload | Must animate either endpoints or opacity |

**Recommendation**: **Particles as primary, streamlines as toggle**. Use `THREE.Points` with a BufferGeometry. Each particle stores position, age, and field sample point. On birth, pick a random start point in the domain; integrate the field with RK4. On death (after T seconds or leaving the domain), recycle the particle. Render ~2,000-10,000 particles depending on performance. Optionally overlay streamlines (computed and cached) as a static layer.

### Particles vs Volume vs Surface (Mode 2)

| Aspect | Volume | Surface | GPU Particles (recommended) |
|--------|--------|---------|----------------------------|
| **Quality** | Highest — shows full 3D field | Good — shows field on a slice | Good — dynamic, colorful |
| **Performance** | Worst — voxel rendering is expensive | Good — single mesh | Excellent — PointsMaterial |
| **Implementation** | Very complex — WebGL volume rendering | Moderate — PlaneGeometry with displacement | Simple — buffer updates |
| **3D comprehension** | Excellent — inside the field | Moderate — limited to surface | Good — with size/color coding |

**Recommendation**: **GPU particles on a 3D grid**. Render ~50,000 particles as `THREE.Points` in a cube (50 × 50 × 20). Each particle position is fixed on the grid; color encodes the vector field value at that point (direction via RGB or magnitude via luminance). Particle size encodes magnitude. This gives an intuitive 3D scatter-plot-like visualization of the vector field. Optionally add stream surfaces (field lines traced from user-selected points).

---

## 5. GLSL Shader Strategy

### Vertex Displacement: GPU (recommended) vs CPU

**GPU displacement** (recommended):
- Vertex shader reads displacement from a `sampler2D` (DataTexture).
- No CPU-GPU round-trip for positions.
- Deformation is computed on GPU, displayed immediately.
- CPU only writes the displacement buffer (a small texture update).

**CPU displacement** (not recommended):
- Read positions back from GPU (`readPixels` → VERY slow).
- Modify on CPU, upload new vertex buffer.
- Or: maintain positions on CPU, upload every frame (65K vertices × 3 floats × 4 bytes = 786 KB upload per frame).
- Either way: **~2-5ms on CPU per frame** for 65K vertices. Not terrible, but eats into the JS frame budget.

**Verdict**: GPU displacement via DataTexture in vertex shader. The standard pattern for Three.js particle/mesh deformation.

### Passing Mouse State to Shader

| Method | Use Case | Recommendation |
|--------|----------|---------------|
| **Uniforms** | Current frame state (mouse position, speed, radius, click state) | ✅ **Primary method**. `uniform vec2 uMouse; uniform float uSpeed; uniform float uRadius; uniform bool uClickHeld;` Updated every `mousemove`/`mousedown`/`mouseup`. |
| **Data texture** | History buffer (keyframe sequences per vertex) | ✅ **Primary method**. `uniform sampler2D uDeformBuffer;` Written once per frame from CPU Float32Array. |
| **Vertex attributes** | Per-vertex data too large for uniforms | ❌ Overkill. DataTexture handles this better. |

### Storing Deformation History

**Approach**: CPU Float32Array → DataTexture → vertex shader.

```
CPU:
  deformBuffer: Float32Array(256 × 16 × 256 × 3)  // 3.15 MB
  // Layout: texture[y * 256 + x] = vec3(dx, dy, dz) for each keyframe layer
  
  Per frame:
    1. Update active vortexes (move keyframes forward)
    2. Start new keyframes for fresh deformations
    3. Advance "returning" keyframes toward completion
    4. Remove expired keyframes
    5. Write buffer to DataTexture
    6. Set texture.needsUpdate = true

GPU (vertex shader):
  1. Compute vertex grid index from UV: (x, y) = (uv.x * 256, uv.y * 256)
  2. Lookup current keyframe layer: texelFetch(uDeformBuffer, ivec2(x, layer*256 + y), 0)
  3. Compute interpolation factor t from elapsed time (uniform)
  4. Catmull-Rom sample between 4 consecutive keyframes
  5. Apply displacement to position: worldPosition += displacement
```

**Ping-pong FBO**: Not needed. We're not doing multi-pass image processing. The CPU manages the buffer.

**Per-frame CPU update**: This is the bottleneck to watch. Writing 3 MB to the GPU every frame via `texImage2D` (via `texture.needsUpdate`). On a mid-range laptop this takes ~0.5-1ms. Acceptable.

### Performance Budget for 256×256 Mesh at 60fps

| Component | Budget | Notes |
|-----------|--------|-------|
| **CPU: mouse handler** | < 0.5ms | Simple math per event; throttle to 120Hz |
| **CPU: buffer update** | < 1ms | Write keyframe displacements to Float32Array |
| **CPU: texture upload** | < 1ms | `texture.needsUpdate = true` → gl.texImage2D |
| **CPU: particle update (mode 1)** | < 2ms | 10K particles × RK4 integration |
| **CPU: UI updates** | < 0.5ms | DOM updates, throttle to 30Hz |
| **CPU: total frame budget** | **< 5ms** | Leaves 11ms for GPU work at 60fps (16ms total) |
| **GPU: vertex shader** | < 2ms | 65K vertices × shader work (displacement + Catmull-Rom) |
| **GPU: fragment shader** | < 4ms | Texture sampling + lighting (mode 3) or solid color (mode 1/2) |
| **GPU: total frame budget** | **< 8ms** | Comfortable margin |

**Verdict**: 60fps on a mid-range laptop (Intel UHD 620 or equivalent) is achievable with headroom. Target 256×256 mesh; drop to 128×128 if needed (65K → 16K vertices, ~75% reduction).

---

## 6. Mouse-to-3D Projection for Mode 2

The user's 2D mouse position must project to a 3D point in the scene for vortex placement and field interaction.

### Options

| Option | Accuracy | Complexity | Recommended for |
|--------|----------|------------|-----------------|
| **A: Raycaster to z=0 plane** | Good — precise planar hit | Low — `ray.intersectPlane()` | ✅ **Mode 1 & 2**. The vector field domain is the XY plane. |
| **B: Raycaster to depth buffer** | Best — hits actual geometry | High — need depth texture readback or `Intersection` from raycaster | ❌ Overkill. Only needed if interaction must follow arbitrary geometry. |
| **C: Fixed-depth plane** | Poor — only correct at one distance | Low but inaccurate | ❌ Not useful for 3D. |

### Recommendation: Raycaster to z=0 Plane

```typescript
const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0); // z=0
const raycaster = new THREE.Raycaster();
const intersection = new THREE.Vector3();

function onMouseMove(event: MouseEvent) {
  raycaster.setFromCamera(mouseNDC, camera);
  raycaster.ray.intersectPlane(plane, intersection);
  // intersection.x, intersection.y is the 3D mouse position
  // intersection.z is always 0
}
```

**Why**: The vector field in all three modes operates fundamentally on the XY plane (mode 3's mesh is a flat plane). Mode 2 displays 3D effects of a field defined on the plane. The z=0 projection is the natural domain. For Mode 3, the touch point on the deformed mesh is approximated by the z=0 projection of the mouse — good enough for the vortex effect.

**Extension for Mode 2**: The z=0 position is the "center" of the vortex. The vortex effect's vertical influence falls off with distance from the center. The user doesn't need to pick exact Z heights.

---

## 7. State Management

### Recommendation: Simple Observable Store Pattern

**No framework.** Vanilla TypeScript with a lightweight reactive store (~50 lines).

### Architecture

```typescript
// store.ts — ~50 lines total
type Listener<T> = (state: T) => void;

class Store<T extends Record<string, unknown>> {
  private state: T;
  private listeners = new Set<Listener<T>>();

  constructor(initial: T) { this.state = initial; }

  getState(): Readonly<T> { return this.state; }

  setState(partial: Partial<T>): void {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach(fn => fn(this.state));
  }

  subscribe(fn: Listener<T>): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
```

### Stores

| Store | State shape | Subscribers |
|-------|-------------|-------------|
| **ModeStore** | `{ activeMode: 1 \| 2 \| 3, mathematicalMode: boolean }` | UI controls, render manager, Three.js group visibility |
| **FieldStore** | `{ fields: FieldDef[], activeFieldIndex: number, params: FieldParams }` | Particle system (mode 1), 3D field display (mode 2) |
| **InteractionStore** | `{ mouseWorld: Vector3, mouseSpeed: number, clickHeld: boolean, effectRadius: number, effectsEnabled: boolean }` | Vertex shader uniforms, deformation system |
| **DeformationStore** | `{ vortices: VortexEvent[], keyframeBuffer: Float32Array, bufferDirty: boolean }` | DataTexture update, shader uniform sync |
| **UISettings** | `{ fieldPicker, showStreamlines, particleDensity, colorMap, speedMultiplier, ... }` | UI panel, render system |

### State flow

```
User input (mouse/keyboard)
    ↓
InteractionStore.setState(...)
    ↓
DeformationStore listens and creates vortex events
    ↓
DeformationStore writes keyframes to buffer
    ↓
Render loop reads buffer → DataTexture → vertex shader
    ↓
UIStore listens and updates HTML controls
```

### Why not a full reactive framework

- **No Vue/React/Svelte dependencies** — keeps the bundle under 200KB gzip.
- **Vanilla DOM for the overlay** — 6 sliders, 2 dropdowns, 3 buttons. Nothing complex enough to warrant a framework.
- **The render loop is imperative (Three.js)** — reactive state for the UI layer doesn't need to be reactive for the render loop. The render loop reads state on every frame via `getState()`.

---

## 8. UI / Control Panel

### Design constraints

- Overlaid on top of the Three.js canvas (position: absolute, z-index: 10).
- Semi-transparent dark background for readability.
- Spanish text throughout.
- Responsive enough to work at 1280×720 (minimum target).

### Layout

```
┌──────────────────────────────────────────────┐
│  [Mode selector: ① | ② | ③]  [⋮ menu]      │
├──────────────────────────────────────────────┤
│                                              │
│              Three.js canvas                  │
│       (interaction happens here)             │
│                                              │
│                                              │
├──────────────────────────────────────────────┤
│  Status bar: field name, mouse coords, fps   │
└──────────────────────────────────────────────┘
```

The control panel is collapsible on the left or right side:

```
┌──────┐
│ ⚙️   │  ← toggle button
│ ─── │
│ 2D   │  ← field picker (dropdown)
│ ┌──┐ │
│ │  │ │  ← source/sink editor (draggable dot)
│ └──┘ │
│ a:── │  ← coefficient sliders
│ b:── │
│ c:── │
│ ─── │
│ ⋮   │  ← mode-specific options
└──────┘
```

### Controls per mode

| Control | Mode 1 | Mode 2 | Mode 3 |
|---------|--------|--------|--------|
| **Field picker** (dropdown with names in Spanish) | ✅ | ✅ | — |
| **Source/Sink editor** (draggable control points on the canvas) | ✅ | ✅ | — |
| **Coefficient sliders** (a, b, c for linear combinations) | ✅ | ✅ | — |
| **Particle density / grid resolution** | ✅ | ✅ | — |
| **Reset view** | ✅ | ✅ | ✅ |
| **Animation play/pause** | ✅ | ✅ | — |
| **Streamline overlay toggle** | ✅ | — | — |
| **Color mapping** (magnitude, direction, curl magnitude) | — | ✅ | — |
| **Image upload** (file input, preview thumbnail) | — | — | ✅ |
| **"Modo matemático" toggle** | — | — | ✅ |
| **Integral values display** (∮ and ∬ with live values) | — | — | ✅ (in math mode) |
| **Effect toggle** (enable/disable mouse interaction) | ✅ | ✅ | ✅ |
| **Speed multiplier** | ✅ | ✅ | ✅ |
| **Field name / formula display** | ✅ | ✅ | ✅ (in math mode) |

### Implementation

- HTML: Static elements in `index.html` + a small `ui.ts` module.
- CSS: `ui.css` — grid/flex layout, semi-transparent panel, custom range sliders.
- i18n: All strings in a single `es.ts` module. Switch to English only if requested later.

```typescript
// es.ts
export const ES = {
  mode1: "Flujo 2D",
  mode2: "Gradientes 3D",
  mode3: "Deformación",
  fieldPicker: "Campo vectorial",
  fieldNames: {
    rotation: "Vórtice rotacional",
    radial: "Expansión radial",
    shear: "Flujo cortante",
    saddle: "Punto de silla",
    mixedVortex: "Vórtice con fuente",
    periodic: "Retícula periódica",
  },
  mathMode: "Modo matemático",
  uploadImage: "Subir imagen",
  integralLine: "∮ F · dr =",
  integralSurface: "∬ (∇×F) · dS =",
  // ... etc
};
```

---

## 9. Risks and Unknowns

### High Risk

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Reversible path algorithm correctness** with multiple simultaneous vortices sharing the same vertex | Vortex A displaces vertex V along path P_A. Before return completes, vortex B starts displacing V along path P_B. What is the return path? If we interpolate from P_A+P_B back to rest, we lose the "exact reverse" guarantee for A. | Design the keyframe buffer as a **merged trajectory** — each vertex's displacement is the SUM of all active vortex effects. The return path replays the summed displacement in reverse. This means individual vortex effects are NOT independently reversible, but the total observed deformation is. This is acceptable. |
| **Real-time integral computation** (∮ F·dr and ∬ (∇×F)·dS) at 60fps | Computing line and surface integrals on the GPU-deformed mesh is non-trivial. Numerical integration (midpoint rule) on 256×256 mesh would be expensive. | Option 1: Compute on CPU every N frames (N=5-10) and display cached value. Option 2: Use a compute shader (WebGL 2.0 compute → not widely available). Option 3: Compute analytically for predefined fields (F and curl F are known formulas — just integrate over the known surface). **Recommendation**: Option 3 for predefined fields (exact, fast), fall back to Option 1 for user-edited fields. |
| **OrbitControls vs mouse interaction conflict** (Mode 2) | Both want mouse drag. If plain drag = orbit, the user can't create vortices. If plain drag = vortex, the user can't orbit. | Ctrl/Cmd + drag = vortex effect. Plain drag = orbit. Show a hint overlay when entering Mode 2. |


### Medium Risk

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Image upload size** (Mode 3) | 4K image upload → GPU memory spike → crash on low-end GPUs. | Downscale on the CPU via Canvas2D before creating THREE.Texture. Cap at 2048×2048. |
| **Mesh boundary artifacts** | Deformation near mesh edges creates unnatural stretching/tugging. | Make the mesh 20% larger than the visible area. Clamp deformations near edges. Or: apply a Gaussian falloff to deformation strength near boundaries. |
| **Mode switch state cleanup** | Particles from Mode 1 still running in Mode 2. Deformation buffer from Mode 3 leaks into Mode 1. | Clear all running systems on mode switch. Call `dispose()` on geometries/materials that change. Reset deformation buffer to zero. |
| **Long session performance degradation** | Keyframe buffer grows unboundedly, memory leak. | Fixed-size ring buffer (16 entries per vertex). Old keyframes are evicted. Explicit cleanup on mode switch. |

### Low Risk / Unknown

| Risk | Notes |
|------|-------|
| **Browser WebGL 2.0 support for DataTexture** | All modern browsers (Chrome 70+, Firefox 60+, Safari 15+) support WebGL2. Fallback to vertex attributes if needed, but this is unlikely to be an issue. |
| **Mobile support** | Not in scope, but the architecture shouldn't preclude it. Touch events map to the same InteractionStore as mouse events. Deferred — not part of MVP. |
| **GLSL precision on integrated GPUs** | Half-float textures may not support filtering on older GPUs. Use `NEAREST` filtering instead of `LINEAR` for the displacement buffer (we're doing manual interpolation anyway). |

### Scope creep watchlist

These features were discussed but are NOT in the MVP:
- Image sequence export / GIF recording
- Audio-reactive deformation
- Multi-user collaboration
- Custom surface geometry upload
- VR/AR mode
- Full equation system (Gauss, Divergence theorem)

---

## Further Investigation Needed

| Topic | Why | When |
|-------|-----|------|
| **GLSL Catmull-Rom implementation** | Need to verify it works cleanly in vertex shader with 4 texture lookups. Write a prototype and test on target hardware. | Design phase |
| **DataTexture layout for keyframe buffer** | Need exact pixel layout, wrap modes, filtering. | Design phase |
| **Integral computation algorithm** | Prototype the numerical integration for line and surface integrals on a deformed mesh. | Design phase |
| **Mouse speed computation** | Need to test different smoothing approaches (EMA, median filter) for stable speed values. | Design phase |

---

## Ready for Proposal

**Yes.** This exploration has sufficient depth to proceed to `sdd-propose`. The key architectural decisions are:
1. Hybrid keyframe history (Option D) for the reversible path
2. Single Three.js scene with visibility groups
3. Perspective camera for all modes (orthographic not needed)
4. GPU vertex displacement via DataTexture + vertex shader
5. Observable store pattern (vanilla TS)
6. Spanish HTML/CSS overlay
7. z=0 plane raycaster for mouse projection
8. GPU particles for both Mode 1 and Mode 2

The proposal should formalize scope, delivery strategy, and decide on integration vs incremental delivery.
