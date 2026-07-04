# Tasks: Stokes Theorem Visualizer — MVP

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 1600–1900 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 → PR 4 → PR 5 → PR 6 |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Foundation: bootstrap, stores, fields, utilities | PR 1 (~680 lines) | Base branch: main. All subsequent PRs depend on this. Over budget — needs size exception or further splitting. |
| 2 | Mode 1 — 2D flow visualization (first visible result) | PR 2 (~300 lines) | Base: PR 1 branch or main after PR 1 merges. Standalone demo. |
| 3 | Mode 2 — 3D particle grid | PR 3 (~310 lines) | Base: PR 2 branch or main. Independent of Mode 1 internals. |
| 4 | Mode 3 — mesh, image upload, base shader | PR 4 (~260 lines) | Base: PR 3 branch or main. No deformation yet. |
| 5 | Deformation system — VortexSystem, KeyframeBuffer, Catmull-Rom | PR 5 (~380 lines) | Base: PR 4 branch. Depends on Mode 3 mesh existing. |
| 6 | Integrals, UI controls, viridis, polish, deploy | PR 6 (~310 lines) | Base: PR 5 branch. Final integration pass. |

---

## Phase 0: Project Bootstrap

- [x] 0.1 Create `package.json` with Vite, TypeScript, Three.js, vite-plugin-glsl dependencies (~20 lines)
  - Files: `package.json`
  - Depends on: none
  - Description: npm manifest with exact deps from design §2.
  - Verification: `npm install` completes without errors.

- [x] 0.2 Create `tsconfig.json` — strict mode, ES2022, moduleResolution bundler (~15 lines)
  - Files: `tsconfig.json`
  - Depends on: 0.1
  - Description: TypeScript config per design §2.
  - Verification: `npx tsc --noEmit` passes.

- [x] 0.3 Create `vite.config.ts` with vite-plugin-glsl for GLSL imports (~15 lines)
  - Files: `vite.config.ts`
  - Depends on: 0.1
  - Description: Vite build config with GLSL loader.
  - Verification: `npx vite build` completes.

- [x] 0.4 Create `index.html` — mount point, overlay skeleton, viridis CSS vars (~40 lines)
  - Files: `index.html`
  - Depends on: 0.3
  - Description: HTML shell with canvas mount, overlay divs, and CSS custom properties for viridis.
  - Verification: Opens in browser, shows blank canvas.

- [x] 0.5 Create `src/main.ts` — bootstrap app, init stores, start render loop (~30 lines)
  - Files: `src/main.ts`
  - Depends on: 0.4
  - Description: Entry point. Creates stores, initializes SceneManager, starts requestAnimationFrame loop.
  - Verification: Browser console shows no errors, blank canvas renders.

- [x] 0.6 Create `src/app.ts` — app lifecycle, mode switching, error boundary (~50 lines)
  - Files: `src/app.ts`
  - Depends on: 0.5
  - Description: App class with init(), switchMode(), dispose(). Subscribes to ModeStore.
  - Verification: App initializes, mode switch placeholder logs to console.

## Phase 1: Core Infrastructure

- [x] 1.1 Create `src/stores/Store.ts` — base observable class (~50 lines)
  - Files: `src/stores/Store.ts`
  - Depends on: 0.5
  - Description: Generic Store<T> with setState(), getState(), subscribe() → unsubscribe.
  - Verification: Unit test — subscribe fires on setState, unsubscribe stops it.

- [x] 1.2 Create `src/stores/ModeStore.ts` — active mode + math mode toggle (~30 lines)
  - Files: `src/stores/ModeStore.ts`
  - Depends on: 1.1
  - Description: ModeState interface, setMode(m), toggleMathMode().
  - Verification: setMode(2) → getState().activeMode === 2.

- [x] 1.3 Create `src/stores/FieldStore.ts` — active field, params, sources, coefficients (~40 lines)
  - Files: `src/stores/FieldStore.ts`
  - Depends on: 1.1
  - Description: FieldState with catalog, activeIndex, sources, coeffs. Methods: setField, addSource, setCoeff, reset.
  - Verification: setField(1) updates activeIndex; coefficients clamp to [-10, 10].

- [x] 1.4 Create `src/stores/InteractionStore.ts` — mouse world pos, speed EMA, click, radius (~35 lines)
  - Files: `src/stores/InteractionStore.ts`
  - Depends on: 1.1
  - Description: InteractionState with mouseWorld, mouseSpeed, clickHeld, effectRadius, effectsEnabled, modifier.
  - Verification: setClick(true) → effectRadius triples.

- [ ] 1.5 Create `src/stores/DeformationStore.ts` — vortices, keyframe buffer, head pointers (~40 lines)
  - Files: `src/stores/DeformationStore.ts`
  - Depends on: 1.1
  - Description: DeformationState with vortices array, keyframeBuffer Float32Array, headIndex, bufferDirty.
  - Verification: spawnVortex adds to vortices; reset() zeroes buffer.

- [x] 1.6 Create `src/stores/UISettingsStore.ts` — particle density, color mode, image URL (~25 lines)
  - Files: `src/stores/UISettingsStore.ts`
  - Depends on: 1.1
  - Description: UISettingsState with particleDensity, colorMode, showStreamlines, speedMultiplier, imageUrl.
  - Verification: set('particleDensity', 5) updates state.

- [x] 1.7 Create `src/ui/es.ts` — all Spanish strings as typed object (~60 lines)
  - Files: `src/ui/es.ts`
  - Depends on: none (standalone)
  - Description: ES constant with mode names, field names, button labels, ARIA strings, error messages.
  - Verification: All 10 capabilities' strings present; no English values.

- [ ] 1.8 Create `src/interaction/MouseTracker.ts` — throttled mousemove, raycast, EMA speed (~60 lines)
  - Files: `src/interaction/MouseTracker.ts`
  - Depends on: 1.4, 1.9
  - Description: 120Hz throttle, z=0 raycast, EMA(α=0.3) speed, clickHold tracking. Touch event mapping.
  - Verification: Move mouse → InteractionStore.mouseWorld updates; 300 events/sec → ~120 dispatched.

- [ ] 1.9 Create `src/interaction/Raycaster.ts` — z=0 plane raycast, NDC conversion (~30 lines)
  - Files: `src/interaction/Raycaster.ts`
  - Depends on: none (standalone)
  - Description: THREE.Raycaster + THREE.Plane wrapper. setFromCamera(), intersectPlane() helpers.
  - Verification: NDC (0,0) → world (0,0,0); NDC (1,1) → world (2,2,0).

## Phase 2: Fields and Math

- [x] 2.1 Create `src/fields/Field.ts` — Field interface (~15 lines)
  - Files: `src/fields/Field.ts`
  - Depends on: none
  - Description: Interface with eval(x,y,z), curl(x,y,z), name, formulaLaTeX.
  - Verification: TypeScript compiles; interface is assignable.

- [x] 2.2 Create `src/fields/fields2D.ts` — 6 predefined 2D fields (~80 lines)
  - Files: `src/fields/fields2D.ts`
  - Depends on: 2.1
  - Description: vortexRotacional, expansionRadial, flujoCortante, puntoSilla, vortexConFuente, reticulaPeriodica. Each with eval, curl, name, formulaLaTeX.
  - Verification: Each field eval returns [number, number]; curl returns [number, number, number].

- [ ] 2.3 Create `src/fields/fields3D.ts` — 6 predefined 3D fields (~80 lines)
  - Files: `src/fields/fields3D.ts`
  - Depends on: 2.1
  - Description: rotacion2DEn3D, flujoHelicoidal, silla3D, flujoPoiseuille, triplePeriodico, conservativo.
  - Verification: Each field eval returns [number, number, number]; curl returns [number, number, number].

- [ ] 2.4 Create `src/fields/fieldOps.ts` — evalField, curlField, divField, compositeField (~100 lines)
  - Files: `src/fields/fieldOps.ts`
  - Depends on: 2.1, 2.2, 2.3
  - Description: evalField(field, p), curlField(field, p), divField(field, p), compositeField(base, sources, coeffs). Helper: dot(), sub().
  - Verification: compositeField with no sources === base field; div of (x,y) = 2.

## Phase 3: Mode 1 — 2D Flow Visualization

- [ ] 3.1 Create `src/render/SceneManager.ts` — one Scene, three Groups, shared WebGLRenderer (~40 lines)
  - Files: `src/render/SceneManager.ts`
  - Depends on: 0.6
  - Description: Creates THREE.Scene, three THREE.Group (mode1Group, mode2Group, mode3Group), ONE WebGLRenderer. setGroupVisible(m, visible).
  - Verification: Three groups exist; setGroupVisible(1, true) toggles group1.visible.

- [ ] 3.2 Create `src/render/CameraRig.ts` — PerspectiveCamera + per-mode position/lookAt (~50 lines)
  - Files: `src/render/CameraRig.ts`
  - Depends on: 3.1
  - Description: Single PerspectiveCamera. setMode(m) repositions: Mode1 z=5, Mode2 z=5+orbit, Mode3 z=3. OrbitControls attach/detach.
  - Verification: setMode(3) → camera.position.z === 3; OrbitControls detached.

- [ ] 3.3 Create `src/render/particles/ParticleSystem2D.ts` — 2D point cloud, RK4, domain recycling (~80 lines)
  - Files: `src/render/particles/ParticleSystem2D.ts`
  - Depends on: 2.4, 1.6
  - Description: Creates THREE.Points with BufferGeometry. tick(dt) runs RK4 integration per particle. Recycle on age>lifetime or |x|>2.5. Magnitude attribute for viridis.
  - Verification: 2000 particles visible; particles recycle on domain exit; RK4 produces smooth paths.

- [ ] 3.4 Create `src/render/shaders/mode1.vert.glsl` — viridis LUT, point size from seed (~25 lines)
  - Files: `src/render/shaders/mode1.vert.glsl`
  - Depends on: none
  - Description: Pass-through vertex with viridis LUT sample from aMagnitude, gl_PointSize from uPointSize * (0.6 + 0.4 * aSeed).
  - Verification: Compiles; particles render with varying sizes.

- [ ] 3.5 Create `src/render/shaders/mode1.frag.glsl` — soft circular sprite, additive blend (~15 lines)
  - Files: `src/render/shaders/mode1.frag.glsl`
  - Depends on: 3.4
  - Description: Fragment outputs vColor; soft circle via gl_PointCoord distance; additive blending.
  - Verification: Particles appear as soft glowing dots.

- [ ] 3.6 Create `src/render/Mode1Renderer.ts` — Mode 1 group: Points + streamlines (~60 lines)
  - Files: `src/render/Mode1Renderer.ts`
  - Depends on: 3.1, 3.3, 3.4, 3.5
  - Description: Creates mode1Group, adds ParticleSystem2D. Optional streamline LineSegments toggle. Subscribes to FieldStore and UISettingsStore.
  - Verification: Mode 1 shows 2000+ moving particles; field switch updates velocities next frame.

## Phase 4: Mode 2 — 3D Particle Grid

- [ ] 4.1 Create `src/render/particles/ParticleGrid3D.ts` — 50K GPU particles, 50×50×20 grid (~60 lines)
  - Files: `src/render/particles/ParticleGrid3D.ts`
  - Depends on: 2.4, 1.6
  - Description: Creates THREE.Points with 50,000 positions in [-2,2]³. Pre-computes aDir, aMag, aCurl attributes per field. WebGL2 fallback to 10K.
  - Verification: 50K particles visible in cubic grid; color encodes field direction.

- [ ] 4.2 Create `src/render/shaders/mode2.vert.glsl` — vortex offset, HSV color, viridis (~30 lines)
  - Files: `src/render/shaders/mode2.vert.glsl`
  - Depends on: none
  - Description: Reads uVortex uniform (xy=pos, z=strength, w=radius). Computes falloff, offsets position. Color from uColorMode (0=mag/viridis, 1=dir/HSV, 2=curl/viridis).
  - Verification: Ctrl+drag creates visible vortex displacement; color mode toggle changes particle colors.

- [ ] 4.3 Create `src/render/shaders/mode2.frag.glsl` — point sprite, no depth write (~15 lines)
  - Files: `src/render/shaders/mode2.frag.glsl`
  - Depends on: 4.2
  - Description: Output vColor; depthWrite:false; AdditiveBlending.
  - Verification: Particles render without z-fighting.

- [ ] 4.4 Create `src/render/Mode2Renderer.ts` — Mode 2 group, OrbitControls, vortex uniform (~70 lines)
  - Files: `src/render/Mode2Renderer.ts`
  - Depends on: 3.1, 4.1, 4.2, 4.3, 1.4
  - Description: Creates mode2Group with ParticleGrid3D. OrbitControls attached. Ctrl+drag overrides orbit → vortex creation. Writes uVortex uniform per frame.
  - Verification: Plain drag orbits; Ctrl+drag creates vortex; color mode switch updates all particles.

## Phase 5: Mode 3 — Mesh and Image

- [ ] 5.1 Create `src/render/Mode3Renderer.ts` — 256×256 plane, ShaderMaterial, math-mode overlay (~80 lines)
  - Files: `src/render/Mode3Renderer.ts`
  - Depends on: 3.1, 3.2, 5.3, 5.4, 1.5
  - Description: Creates mode3Group with PlaneGeometry(4,4,256,256). ShaderMaterial with uDeformBuffer, uImageTexture, uDeformEnabled uniforms. Math-mode arrow LineSegments group. Integral curve rendering.
  - Verification: Mode 3 shows flat mesh with checkerboard; math-mode toggle shows/hides arrows.

- [ ] 5.2 Create `src/ui/ControlPanel.ts` — sliders, dropdowns, buttons, keyboard handlers (~100 lines)
  - Files: `src/ui/ControlPanel.ts`
  - Depends on: 1.2, 1.3, 1.6, 1.7
  - Description: Builds HTML overlay controls per mode. Field picker dropdown, coefficient sliders, particle density, color mode, image upload button, math-mode toggle. Keyboard 1/2/3 shortcuts.
  - Verification: Controls render; changing slider updates store; keyboard 1/2/3 switches mode.

- [ ] 5.3 Create `src/render/shaders/mode3.vert.glsl` — Catmull-Rom displacement from uDeformBuffer (~40 lines)
  - Files: `src/render/shaders/mode3.vert.glsl`
  - Depends on: none
  - Description: Reads uDeformBuffer (sampler2D), computes vertex grid index from UV, samples 4 keyframes via texelFetch, applies Catmull-Rom interpolation, displaces position.
  - Verification: Compiles; mesh deforms when uDeformBuffer has data.

- [ ] 5.4 Create `src/render/shaders/mode3.frag.glsl` — image sampling, math-mode arrow pass (~20 lines)
  - Files: `src/render/shaders/mode3.frag.glsl`
  - Depends on: 5.3
  - Description: Samples uImageTexture at vUv. Optional math-mode arrow overlay via procedural pass.
  - Verification: Mesh shows uploaded image; math-mode shows arrow overlay.

## Phase 6: Deformation System

- [ ] 6.1 Create `src/deformation/VortexSystem.ts` — FSM (ACTIVE→COOLING→EXPIRED), multi-vortex merge (~80 lines)
  - Files: `src/deformation/VortexSystem.ts`
  - Depends on: 1.4, 1.5
  - Description: VortexEvent with state machine. spawnVortex(p), tick(now): ACTIVE tracks mouse with EMA, records keyframes on triggers; COOLING replays reverse over 2.5s; EXPIRED frees. Multi-vortex sum per vertex.
  - Verification: Spawn vortex → ACTIVE; no mouse 100ms → COOLING; 2.5s → EXPIRED; mesh returns to rest.

- [ ] 6.2 Create `src/deformation/KeyframeBuffer.ts` — ring buffer, half-float, DataTexture upload (~100 lines)
  - Files: `src/deformation/KeyframeBuffer.ts`
  - Depends on: 1.5
  - Description: Float32Array(256×4096×4), Uint8Array heads(65536), Uint16Array ages. writeKeyframe(vi, dx, dy, dz, age). flush() → half-float conversion → THREE.DataTexture upload. 16-entry ring per vertex.
  - Verification: writeKeyframe advances head; flush creates valid DataTexture; buffer wraps at 16.

- [ ] 6.3 Create `src/deformation/catmullRom.ts` — JS reference implementation for unit tests (~30 lines)
  - Files: `src/deformation/catmullRom.ts`
  - Depends on: none
  - Description: catmullRom4(p0, p1, p2, p3, t) → vec3. Standard tension 0.5. Matches GLSL kernel.
  - Verification: catmullRom4(0, [1,0,0], [0,1,0], [0,0,1], [1,0,0], 0) ≈ [0,1,0]; t=1 ≈ [0,0,1].

- [ ] 6.4 Create `src/render/shaders/mode3.vert.glsl` — Catmull-Rom GLSL kernel (finalize with buffer layout) (~40 lines)
  - Files: `src/render/shaders/mode3.vert.glsl`
  - Depends on: 6.2
  - Description: Finalize vertex shader with exact DataTexture indexing: ix = uv.x×255, baseY = iy×16, 4 texelFetches, catmullRom4(), displaced += d. uDeformEnabled gate.
  - Verification: Deformation visible when buffer has data; rest position when buffer empty.

- [ ] 6.5 Create `src/render/shaders/curveOverlay.vert.glsl` — unit-circle C as 3D polyline (~15 lines)
  - Files: `src/render/shaders/curveOverlay.vert.glsl`
  - Depends on: none
  - Description: Pass-through vertex for THREE.LineLoop of 128 segments at z=0.
  - Verification: Unit circle visible in Mode 3.

- [ ] 6.6 Create `src/render/shaders/curveOverlay.frag.glsl` — solid stroke color (~10 lines)
  - Files: `src/render/shaders/curveOverlay.frag.glsl`
  - Depends on: 6.5
  - Description: Output constant viridis(0.95) color; depth test on.
  - Verification: Circle renders with correct color.

## Phase 7: Integral Computation

- [ ] 7.1 Create `src/deformation/integral.ts` — lineIntegralCircle, surfaceIntegralMesh, stokesEquality (~120 lines)
  - Files: `src/deformation/integral.ts`
  - Depends on: 2.4, 6.2
  - Description: lineIntegralCircle(field, N=128) trapezoidal on unit circle. surfaceIntegralMesh(field, mesh) sums curl·n̂×ΔA over deformed quads. stokesEquality(line, surf) → boolean. Analytical formulas for 12 predefined fields.
  - Verification: F=(-y,x,0) → lineIntegral≈2π; surfaceIntegral≈2π; equality holds.

- [ ] 7.2 Wire R1 curve rendering — visible unit-circle overlay in Mode 3 (~15 lines)
  - Files: `src/render/Mode3Renderer.ts` (extend)
  - Depends on: 5.1, 6.5, 6.6
  - Description: Add THREE.LineLoop (128 segments) to mode3Group at z=0. Color viridis(0.95), 2px. "C" label glyph.
  - Verification: Unit circle visible; overlays deformed mesh.

- [ ] 7.3 Wire R2 throttling — recompute every 6 frames, EMA smoothing, flush on switch (~20 lines)
  - Files: `src/deformation/integral.ts` (extend), `src/app.ts` (extend)
  - Depends on: 7.1, 1.2
  - Description: Frame counter; recompute every 6 frames. EMA α=0.3 on display value. On mode switch, run final flush before DeformationStore.reset().
  - Verification: Integral readout updates smoothly; console shows recomputation every 6 frames.

- [ ] 7.4 Wire R3 decoupling — mode-2 vortex uses uVortex uniform only, no keyframe buffer (~10 lines)
  - Files: `src/render/Mode2Renderer.ts` (verify)
  - Depends on: 4.4, 6.2
  - Description: Verify Mode2Renderer never writes to KeyframeBuffer. Mode 2 vortex = single uniform. Confirm no shared GPU resources with Mode 3.
  - Verification: Mode 2 vortex works; KeyframeBuffer stays all-zero during Mode 2.

## Phase 8: UI Integration

- [ ] 8.1 Create `src/ui/IntegralDisplay.ts` — ∮/∬ readouts with smoothed display (~40 lines)
  - Files: `src/ui/IntegralDisplay.ts`
  - Depends on: 7.1, 1.7
  - Description: Shows "∮ F·dr = <value>" and "∬ (∇×F)·dS = <value>". EMA-smoothed. Stokes equality badge. Visible only in math mode.
  - Verification: Values display; update smoothly; badge shows when |∮-∬|/max < 0.01.

- [ ] 8.2 Create `src/ui/ui.ts` — HTML overlay manager, mode-aware visibility (~50 lines)
  - Files: `src/ui/ui.ts`
  - Depends on: 5.2, 8.1, 1.2
  - Description: Manages overlay div visibility per mode. Subscribes to ModeStore. Toggles control panel sections. "Restablecer vista" button.
  - Verification: Mode 1 shows field controls; Mode 3 shows image upload + math toggle.

- [ ] 8.3 Create viridis LUT — 256-entry lookup, used in all shaders and JS (~20 lines)
  - Files: `src/utils/viridis.ts` (new)
  - Depends on: none
  - Description: 256-entry Float32Array LUT. export viridis(t: number): [r,g,b]. Used in shaders via baked constant and in JS for preview colors.
  - Verification: viridis(0) ≈ [0.267, 0.004, 0.329]; viridis(1) ≈ [0.993, 0.906, 0.144].

- [ ] 8.4 Create `src/utils/perf.ts` — FPS counter, performance.now() markers (~25 lines)
  - Files: `src/utils/perf.ts`
  - Depends on: none
  - Description: Rolling 60-frame mean FPS. Frame start/end markers. Debug mode (?debug=1).
  - Verification: FPS counter shows ~60 on decent hardware; markers log to console.

- [x] 8.5 Create `src/utils/rng.ts` — seeded RNG (mulberry32) (~15 lines)
  - Files: `src/utils/rng.ts`
  - Depends on: none
  - Description: mulberry32 PRNG for reproducible particle spawns.
  - Verification: Same seed → same sequence.

## Phase 9: Polish and Deploy

- [ ] 9.1 Performance validation — verify 60fps, <5ms CPU, <8ms GPU budgets (~0 lines, manual)
  - Files: none (manual verification)
  - Depends on: 8.4
  - Description: Run 10-second scripted interaction. Verify AC-1 (mode switch <50ms), AC-2 (≥58fps), AC-5 (1-frame field update).
  - Verification: Chrome DevTools Performance panel shows budget compliance.

- [ ] 9.2 Create `vercel.json` — SPA routing, static deploy config (~10 lines)
  - Files: `vercel.json`
  - Depends on: 0.3
  - Description: SPA rewrite rule, static build output.
  - Verification: `vercel dev` serves the app identically to `vite dev`.

- [ ] 9.3 Verify bundle size < 200KB gzipped excluding Three.js (~0 lines, manual)
  - Files: none (manual verification)
  - Depends on: 0.3
  - Description: `vite build` → check dist/assets/*.js gzipped sum. AC-8.
  - Verification: Total < 200KB gzipped.

---

## Review Workload Forecast

- Total estimated changed lines: 1600–1900
- 400-line budget risk: High
- Chained PRs recommended: Yes
- Number of PR slices: 6
- Decision needed before apply: Yes
- Reason: Greenfield project with ~69 source files across 10 phases. Total implementation exceeds the 400-line review budget by 4–5×. PR 1 (foundation) alone is ~680 lines and may need further splitting or a size exception.
