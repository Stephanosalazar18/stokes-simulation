# Stokes Theorem Visualizer

Interactive browser-based visualization of Stokes' theorem for vector calculus students.

## Tech Stack

- **Vite** — fast dev server and build
- **TypeScript** — strict mode
- **Three.js** — WebGL 3D rendering
- **GLSL** — custom vertex/fragment shaders

## Development

```bash
npm install
npm run dev       # Start dev server (http://localhost:5173)
npm run build     # Production build to dist/
npm run preview   # Preview production build
npm run type-check  # TypeScript strict check
```

## Modes

1. **Flujo 2D** — 2D particle flow visualization with RK4 integration
2. **Gradientes 3D** — 3D particle grid encoding field direction
3. **Deformación** — Mesh deformation with reversible vortex effects

## Project Structure

```
src/
├── main.ts              Entry point
├── app.ts               App lifecycle and mode switching
├── stores/              Reactive state management
│   ├── Store.ts         Base observable class
│   └── ModeStore.ts     Mode and math-mode state
└── scene/               Three.js scene management
    └── SceneManager.ts  Scene, camera, renderer, mode groups
```

## License

MIT
