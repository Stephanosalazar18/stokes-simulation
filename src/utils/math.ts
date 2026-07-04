export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function vec2(x: number, y: number): { x: number; y: number } {
  return { x, y };
}

export function vec3(x: number, y: number, z: number): { x: number; y: number; z: number } {
  return { x, y, z };
}
