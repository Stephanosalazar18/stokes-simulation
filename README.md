# Stokes Fluid Simulation

Eulerian 2D fluid simulation running on WebGL2. Based on the stable fluids method (Stam) with a Shadertoy reference implementation.

## Features

- Semi-Lagrangian advection
- Jacobi pressure solve (20 iterations)
- Divergence-free velocity projection
- Interactive mouse-driven vorticity injection

## Setup

```bash
pnpm install
pnpm dev
```

## Architecture

Single-file implementation (`src/main.js`) using raw WebGL2 with ping-pong FBOs:

- **Advection** — moves velocity field along itself
- **Jacobi** — solves pressure Poisson equation
- **Projection** — subtracts pressure gradient to enforce incompressibility
- **Splat** — Gaussian splat for mouse interaction
- **Display** — renders dye channel to screen

## License

MIT
