import type { Field2D } from "./Field";

export const fields2D: Field2D[] = [
  {
    id: "vortex-rotacional",
    name: "Vórtice Rotacional",
    formula: "F = (-y, x)",
    eval: (x, y) => ({ x: -y, y: x }),
    curl: () => 2,
    divergence: () => 0,
  },
  {
    id: "expansion-radial",
    name: "Expansión Radial",
    formula: "F = (x, y)",
    eval: (x, y) => ({ x, y }),
    curl: () => 0,
    divergence: () => 2,
  },
  {
    id: "flujo-cortante",
    name: "Flujo Cortante",
    formula: "F = (y, 0)",
    eval: (_x, y) => ({ x: y, y: 0 }),
    curl: () => -1,
    divergence: () => 0,
  },
  {
    id: "punto-de-silla",
    name: "Punto de Silla",
    formula: "F = (x, -y)",
    eval: (x, y) => ({ x, y: -y }),
    curl: () => 0,
    divergence: () => 0,
  },
  {
    id: "vortice-con-fuente",
    name: "Vórtice con Fuente",
    formula: "F = (x - y, x + y)",
    eval: (x, y) => ({ x: x - y, y: x + y }),
    curl: () => 2,
    divergence: () => 2,
  },
  {
    id: "reticula-periodica",
    name: "Retícula Periódica",
    formula: "F = (sen y, sen x)",
    eval: (x, y) => ({ x: Math.sin(y), y: Math.sin(x) }),
    curl: (x, y) => Math.cos(x) - Math.cos(y),
    divergence: () => 0,
  },
];
