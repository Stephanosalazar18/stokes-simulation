import type { Field2D } from "./Field";

/** Euclidean magnitude of a 2D vector. */
export function magnitude2D(v: { x: number; y: number }): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

/** Euclidean magnitude of a 3D vector. */
export function magnitude3D(v: { x: number; y: number; z: number }): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

/**
 * Line integral ∮ F·dr over a closed polygon using the trapezoidal rule.
 * `points` should describe a closed loop (last point implicitly connects to first).
 */
export function lineIntegral2D(
  field: Field2D,
  points: Array<{ x: number; y: number }>,
): number {
  const n = points.length;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const p0 = points[i];
    const p1 = points[(i + 1) % n];
    const f0 = field.eval(p0.x, p0.y);
    const f1 = field.eval(p1.x, p1.y);
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    sum += 0.5 * ((f0.x + f1.x) * dx + (f0.y + f1.y) * dy);
  }
  return sum;
}

/**
 * Surface integral ∬ (∇×F)·dS over a rectangular region using the midpoint rule.
 * dS is the unit normal in the +z direction.
 */
export function surfaceIntegralCurl2D(
  field: Field2D,
  xRange: [number, number],
  yRange: [number, number],
  samples = 64,
): number {
  const dx = (xRange[1] - xRange[0]) / samples;
  const dy = (yRange[1] - yRange[0]) / samples;
  const dA = dx * dy;
  let sum = 0;
  for (let i = 0; i < samples; i++) {
    const cx = xRange[0] + (i + 0.5) * dx;
    for (let j = 0; j < samples; j++) {
      const cy = yRange[0] + (j + 0.5) * dy;
      sum += field.curl(cx, cy);
    }
  }
  return sum * dA;
}
