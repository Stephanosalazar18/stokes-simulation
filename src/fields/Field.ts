export interface Field2D {
  id: string;
  name: string;
  formula: string;
  eval: (x: number, y: number) => { x: number; y: number };
  curl: (x: number, y: number) => number;
  divergence: (x: number, y: number) => number;
}

export interface Field3D {
  id: string;
  name: string;
  formula: string;
  eval: (x: number, y: number, z: number) => { x: number; y: number; z: number };
  curl: (x: number, y: number, z: number) => { x: number; y: number; z: number };
  divergence: (x: number, y: number, z: number) => number;
}
