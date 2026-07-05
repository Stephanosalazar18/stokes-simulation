# Stokes Theorem Visualizer

Interactive browser-based visualization of Stokes' Theorem for vector calculus students.

## Tech Stack

- **Vite** — fast dev server and build
- **Vanilla JavaScript (ES modules)** — no TypeScript, no framework
- **WebGL** — GPU fluid simulation adapted from [PavelDoGreat/WebGL-Fluid-Simulation](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation) (MIT)
- **WebGL2** — half-float textures for Stam stable fluids

## Development

```bash
pnpm install
pnpm dev        # Start dev server (http://localhost:5173)
pnpm build      # Production build to dist/
pnpm preview    # Preview production build
```

## Modes

1. **Contornos 2D** — 2D contour rendering *(próximamente)*
2. **Gradientes 3D** — PavelDoGreat-style fluid simulation with live Stokes theorem overlay
3. **Imagen** — Image-based vector field *(próximamente)*
4. **Modo completo** — Combined visualization *(próximamente)*

## Project Structure

```
src/
├── main.js        Entry point, mode manager
├── FluidSim.js    GPU fluid core (MIT-attributed, PavelDoGreat adapted)
├── theorem.js     Curve C, ∮F·dr, ∬(∇×F)·dS, ratio computation
├── ui.js          Spanish UI: theorem panel, mode switcher, radius slider
├── mode1.js       Mode 1: placeholder (próximamente)
├── mode2.js       Mode 2: full gradients + theorem integration
├── mode3.js       Mode 3: placeholder (próximamente)
└── mode4.js       Mode 4: placeholder (próximamente)
```

## License

MIT — original PavelDoGreat/WebGL-Fluid-Simulation code used under MIT.
