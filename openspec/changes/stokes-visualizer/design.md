# Design: Stokes Theorem Visualizer — MVP

## 1. Overview

This design formalizes the 10 capabilities of `stokes-visualizer` into a concrete, build-ready architecture. It pins file structure, 5-store topology, GLSL shader strategy (with the exact Catmull-Rom kernel), keyframe DataTexture layout, vortex lifecycle, mouse pipeline, mode switching, and performance budgets. It resolves the three spec-phase risks: **R1** picks the integration curve C (default unit circle, rendered as a visible overlay), **R2** pins integral throttling to every 6 frames with EMA-smoothed display and a final flush on mode switch, and **R3** confirms the keyframe buffer is mode-3-only and unaffected by Mode 2's WebGL2 fallback. Output is ready for `sdd-tasks`.

---

## 2. File Structure

| File | Role |
|------|------|
| `package.json` | npm manifest, Vite + Three.js + TypeScript. |
| `tsconfig.json` | TS strict mode, ES2022, `moduleResolution: bundler`. |
| `vite.config.ts` | Vite config with GLSL loader (`vite-plugin-glsl`). |
| `index.html` | Mount point, overlay skeleton, viridis CSS vars. |
| `public/` | Static assets (favicon, default checkerboard texture). |
| `src/main.ts` | Entry: bootstrap app, init stores, start render loop. |
| `src/app.ts` | App lifecycle, mode switching, error boundary. |
| `src/stores/Store.ts` | Base `Store<T>` observable class (50 LOC). |
| `src/stores/ModeStore.ts` | Active mode (1/2/3) + math mode toggle. |
| `src/stores/FieldStore.ts` | Active field, params, source/sink list, coefficients. |
| `src/stores/InteractionStore.ts` | Mouse world pos, speed EMA, clickHeld, radius, effectsEnabled. |
| `src/stores/DeformationStore.ts` | Vortices, keyframe buffer (Float32Array), head pointers, bufferDirty. |
| `src/stores/UISettingsStore.ts` | Particle density, color mode, streamline toggle, image URL. |
| `src/fields/Field.ts` | `Field` interface: `eval(x,y,z)`, `curl(x,y,z)`, `name`, `formulaLaTeX`. |
| `src/fields/fields2D.ts` | 6 predefined 2D fields (catalog from spec §2.6 FR-2). |
| `src/fields/fields3D.ts` | 6 predefined 3D fields (catalog from spec §2.6 FR-3). |
| `src/fields/fieldOps.ts` | `evalField`, `curlField`, `divField`, `compositeField` (sources + base). |
| `src/render/SceneManager.ts` | One `THREE.Scene`, three `Group`s, shared `WebGLRenderer`. |
| `src/render/CameraRig.ts` | PerspectiveCamera + per-mode `position/lookAt`; OrbitControls attach/detach. |
| `src/render/Mode1Renderer.ts` | Mode 1 group: `Points` + RK4 integrator + streamline `LineSegments`. |
| `src/render/Mode2Renderer.ts` | Mode 2 group: 50K GPU particles in 50×50×20 grid, color from field. |
| `src/render/Mode3Renderer.ts` | Mode 3 group: 256×256 plane, `ShaderMaterial`, integral overlay, math-mode arrows. |
| `src/render/particles/ParticleSystem2D.ts` | 2D point cloud, position buffer, RK4 step on CPU. |
| `src/render/particles/ParticleGrid3D.ts` | 3D grid point cloud, color attribute, mode-2 vortex uniform updater. |
| `src/render/shaders/mode1.vert.glsl` | Pass-through + viridis LUT sample from `aMagnitude`. |
| `src/render/shaders/mode1.frag.glsl` | Output `vColor` (additive blend, soft point sprite). |
| `src/render/shaders/mode2.vert.glsl` | Apply small offset from `uVortex` uniform; encode `aDir`→HSV. |
| `src/render/shaders/mode2.frag.glsl` | Output `vColor` (point sprite, no depth write). |
| `src/render/shaders/mode3.vert.glsl` | **Catmull-Rom displacement** from `uDeformBuffer` (see §4.3). |
| `src/render/shaders/mode3.frag.glsl` | Sample `uImageTexture`, optional math-mode arrow pass. |
| `src/render/shaders/curveOverlay.vert.glsl` | Render unit-circle C as a 3D polyline. |
| `src/render/shaders/curveOverlay.frag.glsl` | Solid stroke color, depth-test on. |
| `src/deformation/VortexSystem.ts` | Vortex FSM (ACTIVE → COOLING → EXPIRED), multi-vortex merge. |
| `src/deformation/KeyframeBuffer.ts` | Ring buffer (CPU Float32Array), per-vertex head index, write API. |
| `src/deformation/catmullRom.ts` | JS reference implementation for unit tests. |
| `src/deformation/integral.ts` | `lineIntegralCircle`, `surfaceIntegralMesh`, `stokesEquality`. |
| `src/interaction/MouseTracker.ts` | Throttled mousemove, raycast, EMA speed, clickHold. |
| `src/interaction/Raycaster.ts` | z=0 plane raycast, NDC conversion, NDC→world helper. |
| `src/ui/ui.ts` | HTML overlay manager (mode-aware controls). |
| `src/ui/es.ts` | All Spanish strings as a typed object. |
| `src/ui/ControlPanel.ts` | Sliders, dropdowns, buttons, keyboard handlers (`1`/`2`/`3`). |
| `src/ui/IntegralDisplay.ts` | `∮` / `∬` readouts with smoothed display. |
| `src/utils/perf.ts` | FPS counter (rolling 60-frame mean), `performance.now()` markers. |
| `src/utils/rng.ts` | Seeded RNG (mulberry32) for reproducible particle spawns. |
| `tests/` | Empty placeholder; ready for Vitest when `strict_tdd: true`. |
| `openspec/` | SDD artifacts. |

---

## 3. Store Topology

Five stores extend `Store<T>`. All implement `setState(partial)`, `getState()`, `subscribe(fn) → unsubscribe`.

### 3.1 `ModeStore`
```ts
interface ModeState {
  activeMode: 1 | 2 | 3;
  mathMode: boolean;       // only meaningful when activeMode === 3
}
```
Updates: `setMode(m)`, `toggleMathMode()`. Subscribers: `SceneManager` (toggles `group.visible`), `UISettingsStore` (re-renders controls), `DeformationStore` (clears vortices on switch).

### 3.2 `FieldStore`
```ts
interface FieldState {
  catalog: Field[];            // 6 entries (2D or 3D)
  activeIndex: number;          // 0..5
  sources: Array<{x:number; y:number; z:number; strength:number}>;
  coeffs: { a:number; b:number; c:number };  // clamped [-10, 10]
}
```
Updates: `setField(i)`, `addSource(s)`, `moveSource(id, p)`, `removeSource(id)`, `setCoeff(k, v)`, `reset()`. Subscribers: `Mode1Renderer`, `Mode2Renderer`, `Mode3Renderer` (recompute on next frame).

### 3.3 `InteractionStore`
```ts
interface InteractionState {
  mouseWorld: THREE.Vector3;
  mouseSpeed: number;          // EMA(α=0.3)
  clickHeld: boolean;
  effectRadius: number;        // base * (clickHeld ? 3.0 : 1.0)
  effectsEnabled: boolean;     // "Efectos activados" toggle
  modifier: { ctrl:boolean; shift:boolean };  // Mode 2 vortex gesture
}
```
Updates: `setMouse(p, dt)`, `setClick(b)`, `setEffects(b)`, `setModifier(m)`. Subscribers: `DeformationStore` (creates vortices), all renderers (write uniforms).

### 3.4 `DeformationStore`
```ts
interface DeformationState {
  vortices: VortexEvent[];              // ACTIVE | COOLING
  keyframeBuffer: Float32Array;         // size 256*4096*4 = 4,194,304
  headIndex: Uint8Array;                // size 65536, per-vertex head
  bufferDirty: boolean;
  coolingStart: Map<vortexId, number>;  // ms timestamp
}
```
Updates: `spawnVortex(p)`, `tick(now)`, `evictVortex(id)`, `reset()`. Subscribers: `Mode3Renderer` (uploads `DataTexture` when `bufferDirty`).

### 3.5 `UISettingsStore`
```ts
interface UISettingsState {
  particleDensity: number;       // 1..10
  colorMode: 'magnitude' | 'direction' | 'curl-magnitude';
  showStreamlines: boolean;
  speedMultiplier: number;       // 0.1..3.0
  imageUrl: string | null;       // object URL after upload
  imageThumbnail: string | null; // 64×64 data URL
}
```
Updates: `set(k, v)`. Subscribers: renderers read on each frame, `ControlPanel` re-renders.

### 3.6 Data Flow

```
mousedown/move/up (DOM, 120Hz throttle)
    └─→ MouseTracker
            └─→ InteractionStore.setMouse(p, dt)
                    ├─→ DeformationStore listener: creates vortex
                    │      └─→ KeyframeBuffer.write(...)
                    │             └─→ bufferDirty = true
                    │                    └─→ Mode3Renderer.render frame
                    │                           └─→ DataTexture upload
                    │                                  └─→ GPU vertex shader
                    └─→ All renderers: write uniforms uMouse, uSpeed, uRadius
```

Mode switch: `ModeStore.setMode(m)` → `SceneManager` toggles `group.visible`; `DeformationStore.reset()` zeroes the keyframe buffer; `CameraRig.setMode(m)` repositions camera; `UISettingsStore` re-renders controls. Target: < 50ms (Spec AC-1).

---

## 4. Shaders and GLSL

### 4.1 Mode 1 — 2D flow lines

Particles live on `z=0`; positions updated on CPU via RK4; magnitudes pre-computed each frame and written to a per-vertex attribute.

**Vertex (`mode1.vert.glsl`)**
```glsl
attribute vec3 position;          // updated by JS each frame
attribute float aMagnitude;       // updated by JS each frame
attribute float aSeed;            // static, for size variation
uniform   float uPointSize;
varying   vec3  vColor;

vec3 viridis(float t) {           // 6-stop LUT, baked in shader
  // t in [0,1] -> 256-step lookup table
  return VIRIDIS_LUT[int(t * 255.0)];
}

void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uPointSize * (0.6 + 0.4 * aSeed);
  vColor = viridis(clamp(aMagnitude / 5.0, 0.0, 1.0));
}
```

**Fragment (`mode1.frag.glsl`)** — soft circular sprite using `gl_PointCoord`; output `vColor` with `additive` blend.

### 4.2 Mode 2 — 3D particle grid

50,000 particles in a static `50 × 50 × 20` grid spanning `[-2, 2]³`. Each particle's position is fixed; field values are pre-computed once per field switch and stored in `aDir` (vec3) and `aMag` (float) attributes.

**Vertex (`mode2.vert.glsl`)**
```glsl
attribute vec3 position;        // static grid position
attribute vec3 aDir;            // field direction at this grid point
attribute float aMag;           // field magnitude
attribute float aCurl;          // |∇×F| at this point
uniform   vec4  uVortex;        // xy = world pos, z = strength, w = radius
uniform   float uTime;
uniform   int   uColorMode;     // 0=mag, 1=dir, 2=curl
varying   vec3  vColor;

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  vec3 p = position;
  // Mode-2 vortex: small offset along aDir, falloff with distance to uVortex
  float d = length(p.xy - uVortex.xy);
  float falloff = exp(-(d * d) / (uVortex.w * uVortex.w));
  p += aDir * uVortex.z * falloff * 0.05;  // ≤5% cell size
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = 2.0 + 4.0 * aMag;

  if (uColorMode == 0)      vColor = viridis(clamp(aMag / 4.0, 0.0, 1.0));
  else if (uColorMode == 1) vColor = hsv2rgb(vec3(atan(aDir.y, aDir.x) / 6.283 + 0.5, 0.8, 0.9));
  else                      vColor = viridis(clamp(aCurl / 4.0, 0.0, 1.0));
}
```

**Fragment** — output `vColor`, no depth write (`blending: AdditiveBlending`, `depthWrite: false`).

### 4.3 Mode 3 — Mesh with displacement (CRITICAL)

**Mesh**: `THREE.PlaneGeometry(4, 4, 256, 256)` — 65,537 vertices (Three.js includes the corner/edge shared vertices; we use 256×256 = 65,536 unique texel slots in the keyframe buffer).

**DataTexture layout (CPU side, uploaded as `THREE.DataTexture`)**:

| Property | Value |
|----------|-------|
| `image.width` | 256 |
| `image.height` | 4096 (= 16 keyframes × 256 y-indices) |
| Format | `THREE.RGBAFormat` |
| Type | `THREE.HalfFloatType` |
| Filtering | `THREE.NearestFilter` |
| Wrap | `THREE.ClampToEdgeWrapping` |
| Bytes | 256 × 4096 × 4 × 2 = **8.4 MB** |
| Per pixel | `(dx, dy, dz, age)` as half-float; `age = 0` ⇒ unused slot |

**Indexing**: vertex at grid `(i, j)` reads its 16 keyframes at column `x = i`, rows `y = j + k*256` for `k ∈ [0, 15]`. The CPU ring buffer (per-vertex head pointer) writes new keyframes into the next slot; `age` channel carries monotonic ms timestamp so the shader can sort keyframes temporally.

**Vertex shader (`mode3.vert.glsl`)**:
```glsl
attribute vec3 position;        // rest position
attribute vec2 uv;
uniform   sampler2D uDeformBuffer;
uniform   vec2  uMeshSize;      // 256, 256
uniform   float uTime;
uniform   float uDeformEnabled;
varying   vec2  vUv;
varying   float vDeformMag;

// Standard Catmull-Rom (tension 0.5) between 4 keyframes
vec3 catmullRom4(sampler2D tex, int x, int baseY, float t) {
  vec3 p0 = texelFetch(tex, ivec2(x, baseY +  0), 0).rgb;
  vec3 p1 = texelFetch(tex, ivec2(x, baseY +  1), 0).rgb;
  vec3 p2 = texelFetch(tex, ivec2(x, baseY +  2), 0).rgb;
  vec3 p3 = texelFetch(tex, ivec2(x, baseY +  3), 0).rgb;
  float t2 = t * t;
  float t3 = t2 * t;
  return 0.5 * (
    (2.0 * p1) +
    (-p0 + p2) * t +
    (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2 +
    (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3
  );
}

void main() {
  vUv = uv;
  vec3 displaced = position;

  if (uDeformEnabled > 0.5) {
    int ix = int(uv.x * (uMeshSize.x - 1.0));
    int iy = int(uv.y * (uMeshSize.y - 1.0));
    int baseY = iy * 16;       // 16 consecutive rows for this vertex
    // 4 keyframes per playback window; t derived from uTime and per-vertex age
    float t = fract(uTime * 0.5);  // smooth blend; cooling uses reverse sweep
    vec3 d = catmullRom4(uDeformBuffer, ix, baseY, t);
    displaced += d;
    vDeformMag = length(d);
  }
  gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
}
```

**Fragment (`mode3.frag.glsl`)** — samples `uImageTexture`; in math mode, multiplies a procedural arrow overlay for the field F. Boundary falloff is applied in the JS-side write step (Gaussian σ = 1.0 at the mesh's outer 20% ring), not in the shader, so the shader stays minimal.

**Math-mode overlay**: separate `Group` with a `LineSegments` for arrow glyphs sampled on a 16×16 grid; visibility toggled by `uMathMode` uniform.

### 4.4 Keyframe buffer (CPU side)

`KeyframeBuffer` is a wrapper around:
- `data: Float32Array(256 * 4096 * 4) = 4,194,304 floats = 16 MB` (CPU side, half-float to GPU).
- `heads: Uint8Array(65536)` — per-vertex ring-buffer write head, 0..15.
- `ages: Uint16Array(65536 * 16)` — per-vertex per-keyframe age in ms (modulo 60000).

**Write API**:
```ts
writeKeyframe(vertexIndex: number, dx: number, dy: number, dz: number, ageMs: number): void
```

Steps:
1. `const k = heads[vertexIndex];`
2. `const base = (vertexIndex * 16 + k) * 4;`
3. `data[base+0] = dx; data[base+1] = dy; data[base+2] = dz; data[base+3] = ageMs;`
4. `ages[vertexIndex * 16 + k] = ageMs;`
5. `heads[vertexIndex] = (k + 1) % 16;`
6. `bufferDirty = true;`

**Recording triggers** (`VortexSystem` decides per active vortex each frame):
- Mouse direction change > 15° (compared to last frame's delta vector).
- Mouse speed change > 20% (|Δv| / v_prev > 0.2).
- Time since last keyframe > 500ms.
- Vortex ACTIVE→COOLING transition (snap a "rest" keyframe at the vortex's last position).

**Texture upload**: once per frame, after the render loop's CPU phase:
```ts
deformTexture.image.data = halfFloatView;  // reinterpret Float32 → HalfFloat
deformTexture.needsUpdate = true;
```

The CPU half-float conversion uses `Float16Array` if available, else a lookup-table conversion (one-time 4 KB table). Upload cost: ~0.5–1ms on Intel UHD 620.

---

## 5. Vortex Lifecycle

```
       spawn at mouse position
              │
              ▼
        ┌──────────┐  no mouse for 100ms   ┌──────────┐  2.5s elapsed   ┌──────────┐
        │  ACTIVE  │ ─────────────────────► │ COOLING  │ ─────────────► │ EXPIRED  │
        │ forward  │                        │  reverse │                │  freed   │
        └──────────┘                        └──────────┘                └──────────┘
```

- **ACTIVE**: vortex position tracks the mouse with EMA (α=0.3) on world coords. Each frame, `VortexSystem` records a keyframe per affected vertex if a trigger fires (see §4.4). The vertex shader's `t` advances from 0→1 across the 4 most recent keyframes (effectively zero-displacement from the latest sample, but interpolates smoothly during the 500ms between forced snapshots).
- **COOLING**: mouse input is no longer recorded. `coolingStart[id] = now`. The shader's `t` walks backward through the keyframes (head-1 → head-2 → head-3 → head-4) over 2.5s, reaching `d ≈ 0` at the last keyframe.
- **EXPIRED**: vertex slot freed; `headIndex` retained; keyframe data zeroed (`data[…] = 0`).

**Multi-vortex**: each active vortex's contribution is **summed** into a single merged displacement per vertex per frame. The merged displacement is written as one keyframe. The ring buffer thus contains the temporally-merged trajectory, satisfying Spec S4.4.

**Click-hold interaction with state machine**: while `clickHeld === true`, `effectRadius = base * 3.0`. This expands the affected vertex set each frame but does not change the FSM transitions. On `mouseup`, the vortex enters COOLING (if it was ACTIVE) regardless of the radius.

---

## 6. Integral Computation

### 6.1 R1 RESOLUTION — Integration curve C

**Decision**: **Option (a) — fixed unit circle in the XY plane, rendered as a visible 3D polyline overlay.**

| Option | Tradeoff | Decision |
|--------|----------|----------|
| (a) Fixed unit circle, visible overlay | Cleanest math (analytical for F = (-y,x,0) → 2π); visually connects to mesh since circle is rendered on the deformed plane; zero UI | **Chosen** |
| (b) Deformed mesh boundary | Visually faithful but non-planar; 3D path integral adds complexity; not in v1.0 scope | Rejected |
| (c) User-defined curve | Most flexible; adds curve-editor UI; not in v1.0 scope | Deferred to v1.1 |

**Mathematical justification**: For the default field `F = (-y, x, 0)`, `∮_C F·dr = 2π` (analytical, exact) for the unit circle — a classical Green's/Stokes identity. Pedagogically the unit circle is THE canonical curve: students learn Stokes' theorem with this curve in textbooks. We render it as a `THREE.LineLoop` of 128 segments at z=0 in the Mode 3 group, color = viridis(0.95), 2px line, with a small "C" label glyph.

**Surface S**: the actual deformed mesh (per spec S7.3). `∬_S (∇×F)·dS` is computed by summing `(∇×F)(x_i, y_i) · n̂_i × ΔA_i` over the deformed triangles.

### 6.2 R2 RESOLUTION — Integral throttling

**Decision**: **Recompute every 6 frames (≈100ms at 60fps). Display the last computed value with EMA smoothing (α = 0.3) so the readout does not jump between updates. Final flush: on mode switch, run one synchronous computation and write the result before disposing.**

| Aspect | Pin |
|--------|-----|
| Frame interval | **6** (between Spec FR-7 lower bound of 5 and Spec E7.d cost cap) |
| Display between updates | EMA-smoothed; `displayValue += 0.3 * (newValue - displayValue)` |
| Stale value behavior | Display holds the EMA-smoothed value indefinitely; never "frozen" while a computation is in flight |
| Final flush on mode switch | `integral.flush()` runs a final numerical pass and emits the value before `DeformationStore.reset()` |

### 6.3 R3 RESOLUTION — WebGL2 fallback

**Decision**: **The keyframe buffer is mode-3-only. Mode 2's vortex does not write keyframes; it adjusts a single `uVortex` uniform. The two systems share no GPU resources.**

| Question | Answer |
|----------|--------|
| (a) Is the keyframe buffer shared? | **No.** Mode 2 = static grid + uniform; Mode 3 = keyframe DataTexture. |
| (b) Exact buffer dimensions | `256 × 4096` RGBA `HalfFloatType` = **8.4 MB** GPU |
| (c) WebGL2 fallback | Mode 2 drops to 10K particles (Spec E2.b) — **does not touch the keyframe buffer**. Mode 3 drops to 128×128 mesh → keyframe buffer becomes `128 × 2048 × 4 × 2 = 2.1 MB` automatically (same code path, different `uMeshSize`). |

This means the WebGL2 fallback in Mode 2 is a one-line change in `ParticleGrid3D` (constant); Mode 3 is unaffected.

### 6.4 Integral algorithms

**Line integral `∮_C F·dr`** (N=128 trapezoidal samples along unit circle):
```ts
function lineIntegralCircle(field, N = 128): number {
  let sum = 0;
  for (let i = 0; i < N; i++) {
    const t0 = (i + 0.0) / N * 2 * Math.PI;
    const t1 = (i + 1.0) / N * 2 * Math.PI;
    const p0 = [Math.cos(t0), Math.sin(t0), 0];
    const p1 = [Math.cos(t1), Math.sin(t1), 0];
    const f0 = field.eval(...p0);
    const f1 = field.eval(...p1);
    sum += 0.5 * (dot(f0, sub(p1, p0)) + dot(f1, sub(p1, p0)));
  }
  return sum;
}
```

**Surface integral `∬_S (∇×F)·dS`** over the deformed mesh:
- Iterate the 256×256 mesh quad grid (M = 256×256 cells).
- For each quad, compute the displaced normal `n̂ = normalize(cross(diag, dbi))` where `diag, dbi` are the displaced edge vectors after keyframe interpolation.
- Evaluate `(∇×F)(quadCenter)` via the field's `curl()` method.
- Sum `curl·n̂ × ΔA` over all quads.
- Deformed ΔA = `|diag × dbi| / 2`.

**Analytical path** (predefined fields): for each of the 6×2 = 12 catalog fields, ship a closed-form expression for both integrals in `fieldOps.ts` (e.g., for `F = (-y, x, 0)`, `∮ = 2π`, `∬ = 2π`). Numerical is the fallback for user-edited fields (sources/sinks added or coefficients ≠ 1). Cost: analytical < 0.01ms, numerical < 5ms (Spec E7.d).

**Equality check**: `|∮ - ∬| / max(|∮|, |∬|, 1e-9) < 0.01` per Spec AC-4. Logged to console for debugging; UI shows the difference as a third line in math mode.

---

## 7. Mode Switching

On `ModeStore.setMode(m)`:

| Step | Operation | Cost target |
|------|-----------|-------------|
| 1 | `SceneManager.setGroupVisible(m, true)`; previous `group.visible = false` | < 1ms |
| 2 | `DeformationStore.reset()` — zero the Float32Array, clear vortices | < 2ms |
| 3 | `CameraRig.setMode(m)` — reposition camera, attach/detach `OrbitControls` | < 5ms |
| 4 | `UISettingsStore.refreshControls(m)` — show/hide mode-specific controls | < 5ms |
| 5 | If `m === 3` and no image: ensure `defaultCheckerboard` texture is bound | < 1ms |
| **Total** | | **< 14ms** (well under 50ms AC-1) |

`OrbitControls` is attached to the camera in Mode 2 only. In Modes 1 and 3, the camera is fixed and `OrbitControls` is detached (its event listeners are removed but the object is retained for re-attach).

Field store and UI store are **not** reset on mode switch (Spec S10.6 — previously selected field persists).

---

## 8. Mouse Interaction Pipeline

```
mousemove (raw, browser rate ~120-240Hz)
  └─→ MouseTracker.onMove(e)
        └─→ if (now - lastDispatch) < 8ms: skip  // 120Hz throttle
              else:
                raycaster.setFromCamera(NDC, camera)
                raycaster.ray.intersectPlane(z=0, hit)
                mouseSpeed = 0.3 * |hit - prev| / dt + 0.7 * mouseSpeed  // EMA
                InteractionStore.setMouse(hit, mouseSpeed)
        └─→ if !effectsEnabled: return  // Spec S5.5

mousedown / mouseup
  └─→ InteractionStore.setClick(true|false); effectRadius = base * (b ? 3 : 1)

keydown '1'|'2'|'3'  →  ModeStore.setMode(...)
keydown Ctrl/Cmd     →  InteractionStore.setModifier({ctrl:true})
  (Mode 2 only: Ctrl+drag = vortex; plain drag = orbit)
```

- **Throttle**: 8ms window ≈ 120Hz (Spec FR-5).
- **EMA**: α=0.3 on `mouseSpeed`; clamp to 0 after 200ms of no movement (Spec E5.c).
- **Click-hold**: 3× radius scaling (Spec FR-4).
- **Ctrl/Cmd**: Mode 2 only; handled in `Mode2Renderer` by overriding `OrbitControls.mouseButtons` and consuming the event before `OrbitControls` sees it (Spec FR-4, E2.c: vortex wins over orbit).
- **Touch events**: mapped to the same handlers via `touchmove`/`touchstart`/`touchend` → `MouseTracker` (Spec E5.b); not UX-validated in v1.0.

---

## 9. Performance Plan

| Component | Budget | Owner |
|-----------|--------|-------|
| CPU: mousemove + raycast | < 0.5ms | `MouseTracker` |
| CPU: vortex FSM + keyframe write (10K affected vertices) | < 1.5ms | `VortexSystem` + `KeyframeBuffer` |
| CPU: half-float conversion + texture upload | < 1.0ms | `KeyframeBuffer.flush()` |
| CPU: Mode 1 RK4 (10K particles) | < 1.5ms | `ParticleSystem2D.tick()` |
| CPU: Mode 3 integral (numerical, 256×256) | < 4.0ms (every 6 frames) | `integral.surfaceIntegralMesh` |
| CPU: UI/DOM updates (30Hz throttled) | < 0.3ms | `ControlPanel` |
| **CPU total** | **< 5ms** | per NFR-2 |
| GPU: vertex shader (65K verts, 4 texelFetches) | < 2.0ms | `mode3.vert.glsl` |
| GPU: fragment shader (image sampling) | < 4.0ms | `mode3.frag.glsl` |
| GPU: Mode 2 particles (50K) | < 2.0ms | `mode2.vert/frag` |
| **GPU total** | **< 8ms** | per NFR-2 |
| JS heap | < 200 MB sustained | NFR-3 |
| GPU memory | < 100 MB | NFR-3 (keyframe 8.4 + textures ~16 + geometries ~12 ≈ 36 MB) |

**Measurement**: `performance.now()` markers at frame start/end; rolling 60-frame mean FPS logged to console (F12). Optional in-app FPS counter (gated by `?debug=1`).

**Fallback ladder** (if budget exceeded):
1. Drop to 128×128 mesh (65K → 16K vertices; ~75% GPU reduction in Mode 3).
2. Disable streamline overlay in Mode 1.
3. Cap Mode 2 at 10K particles.
4. Reduce Mode 1 particle density slider to default 5K.

All fallbacks are **automatic** (detected by sustained > 16.6ms/frame over 60 frames) and emit a console warning. No user-facing fallback UI in v1.0.

---

## 10. Testing Plan (deferred — `strict_tdd: false`)

When `strict_tdd: true` is set in `openspec/config.yaml`:

| Layer | Scope | Tool |
|-------|-------|------|
| Unit | `fieldOps` (eval, curl, div), `KeyframeBuffer.writeKeyframe`, `catmullRom.ts`, `integral.ts` analytical formulas, `rng` | Vitest |
| Component | `ModeStore` transitions, `VortexSystem` FSM, `es.ts` key coverage | Vitest + JSDOM |
| Integration | `Stokes equality` (numerical vs analytical), `KeyframeBuffer → DataTexture → vertex shader` smoke test | Vitest + headless WebGL (Playwright) |
| E2E | Mode switch, mouse-drag vortex, math-mode equality display, image upload | Playwright |
| Visual | Default-state screenshots per mode, viridis pixel sampling | Playwright + pixelmatch |
| Performance | AC-1 (mode switch), AC-2 (60fps), AC-5 (1-frame field update), AC-6 (4K image < 2s) | Playwright + `performance.now()` |

Tests live in `tests/` mirroring `src/`. Test command: `npm test`; build: `npm run build`; coverage target: 80% on `src/fields/`, `src/deformation/`, `src/stores/`.

---

## 11. Out of Scope (v1.0)

Per proposal §"Non-goals": auth, persistence (localStorage), backend, SSR, mobile-first UX, i18n beyond Spanish, audio/video/GIF/VR export, other theorems (Green's shown as a Mode 1 special case, Divergence/Gauss deferred). Plus: custom curve editing for ∮ (R1 deferred to v1.1), session analytics, telemetry, custom mesh geometry upload, field-algebra UI, multi-user collab.

---

**Design complete.** Resolves R1, R2, R3 with concrete pin values. File structure, store topology, GLSL Catmull-Rom kernel, DataTexture layout, vortex FSM, integral algorithms, mouse pipeline, mode-switch sequence, and performance budgets are all build-ready. Next phase: `sdd-tasks`.
