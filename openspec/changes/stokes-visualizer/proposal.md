# Proposal: Stokes Theorem Visualizer — MVP

## Intent

Static diagrams and pre-recorded animations can't show ∮F·dr = ∬(∇×F)·dS responding to live manipulation. This demo fills that gap: interactive 3D visualization with mouse-driven vortex effects.

## Target Users

- Primary: university students, vector calculus
- Secondary: professors for demos
- Top uses: (a) curl/circulation grasp, (b) live integral equality, (c) cross-modal learning

## Scope (v1.0 IN)

- 3 modes: 2D flow lines, 3D flow gradients, mesh deformation
- ≥4 predefined fields per mode (6 each), Spanish names
- Field editing: move sources/sinks, tweak coefficients
- Mouse in ALL modes: position+speed→vortex, click-hold→3× radius
- Reversible deformation: 8-keyframe/vertex, Catmull-Rom, DataTexture→GLSL
- Multi-vortex: merged keyframe sequences
- 2D: 2K–10K particles RK4. 3D: 50K GPU particle grid
- Image upload → downscale 2048×2048
- "Modo matemático" toggle with live ∮/∬ readouts
- Spanish UI overlay, static deploy

## Non-goals (v1.0 OUT)

Auth, persistence, backend, SSR, mobile-first, i18n beyond Spanish, audio/GIF/VR, other theorems.

## Capabilities

### New
- `2d-flow-lines`: particles tracing 2D streamlines
- `3d-flow-gradients`: GPU particle grid encoding field
- `mesh-deformation`: vortex-driven vertex displacement
- `reversible-path`: keyframe history + reverse Catmull-Rom
- `mouse-interaction`: raycaster-to-plane projection
- `vector-field-engine`: predefined fields + live editing
- `integral-computation`: live ∮/∬ values
- `image-upload`: picker → downscale → texture
- `spanish-ui`: full Spanish overlay
- `mode-system`: 3-mode switcher, visibility groups

### Modified: None (greenfield)

## Success Criteria

- [ ] Mode switch <50ms
- [ ] 60fps on Intel UHD 620, 256×256 mesh
- [ ] Vortex return path matches forward path
- [ ] Math-mode ∮ and ∬ satisfy Stokes equality
- [ ] Coefficient edit updates within 1 frame
- [ ] Image upload ready in <2s

## Architecture

```
Spanish overlay + Three.js canvas
  subscribe      getState()
5 stores ──→ render loop → uniforms → GPU
Single scene, 3 Groups, 1 camera
DataTexture → vertex shader (Catmull-Rom)
```

## Tech Stack

| Tool | Why |
|------|-----|
| Vite | Fast HMR, static build |
| TypeScript | Type safety |
| Three.js | WebGL, camera, controls |
| GLSL | Custom displacement |

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Merged paths lose per-vortex reversibility | Acceptable — total deformation IS reversible |
| Integral cost at 60fps | Analytical for predefined, numeric every 5-10 frames |
| OrbitControls vs vortex (mode 2) | Ctrl/Cmd+drag=vortex, plain=orbit |
| Image OOM | Downscale to 2048×2048 |
| Mesh boundary artifacts | 20% oversize + Gaussian falloff |

## Rollback Plan

Revert static deploy. No server state.

## Open Questions

- Colormap? (Viridis recommended)
- Deploy target? (Vercel/Netlify/GH Pages)
- Custom controls or dat.GUI?

## Out of Scope (SDD Process)

Specs→sdd-spec. Design→sdd-design. Tasks→sdd-tasks. Apply→sdd-apply.
