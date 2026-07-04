import * as THREE from "three";
import type { Field2D } from "../../fields/Field";
import { magnitude2D } from "../../fields/fieldOps";
import { FieldStore } from "../../stores/FieldStore";
import { UISettingsStore } from "../../stores/UISettingsStore";
import { mulberry32 } from "../../utils/rng";
import { viridis } from "../colormaps";
import vertShader from "../shaders/mode1.vert.glsl";
import fragShader from "../shaders/mode1.frag.glsl";

const DOMAIN_HALF = 2.5;
const RK4_DT = 0.016; // ~60fps fixed step

interface Particle {
  x: number;
  y: number;
  age: number;
  maxAge: number;
}

function densityToCount(d: number): number {
  return Math.max(2000, Math.min(10000, d * 1000));
}

export class ParticleSystem2D {
  private points: THREE.Points;
  private geometry: THREE.BufferGeometry;
  private material: THREE.ShaderMaterial;
  private particles: Particle[];
  private positions: Float32Array;
  private colors: Float32Array;
  private magnitudes: Float32Array;
  private rng: () => number;
  private unsubscribeField: () => void;
  private unsubscribeUI: () => void;
  private count: number;
  private needsResize = false;

  constructor(
    private fieldStore: FieldStore,
    private uiStore: UISettingsStore,
  ) {
    this.count = densityToCount(this.uiStore.getState().particleDensity);
    this.rng = mulberry32(42);

    // Initialize particle data
    this.particles = new Array<Particle>(this.count);
    for (let i = 0; i < this.count; i++) {
      this.particles[i] = this.spawnParticle();
    }

    // Create buffers
    this.positions = new Float32Array(this.count * 3);
    this.colors = new Float32Array(this.count * 3);
    this.magnitudes = new Float32Array(this.count);

    // Sync initial state to buffers
    for (let i = 0; i < this.count; i++) {
      const p = this.particles[i];
      this.positions[i * 3 + 0] = p.x;
      this.positions[i * 3 + 1] = p.y;
      this.positions[i * 3 + 2] = 0;
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute("aMagnitude", new THREE.BufferAttribute(this.magnitudes, 1));

    this.material = new THREE.ShaderMaterial({
      vertexShader: vertShader,
      fragmentShader: fragShader,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      vertexColors: true,
    });

    this.points = new THREE.Points(this.geometry, this.material);

    // Subscribe to stores
    this.unsubscribeField = this.fieldStore.subscribe(() => this.onFieldChange());
    this.unsubscribeUI = this.uiStore.subscribe(() => this.onDensityChange());
  }

  getPoints(): THREE.Points {
    return this.points;
  }

  update(dt: number, field: Field2D): void {
    if (this.needsResize) {
      this.resize();
      this.needsResize = false;
    }

    const steps = Math.max(1, Math.round(dt / RK4_DT));
    const h = dt / steps;

    for (let s = 0; s < steps; s++) {
      for (let i = 0; i < this.count; i++) {
        const p = this.particles[i];
        p.age += h;

        // RK4 integration
        const v = field.eval(p.x, p.y);
        const k1x = h * v.x;
        const k1y = h * v.y;

        const v2 = field.eval(p.x + k1x * 0.5, p.y + k1y * 0.5);
        const k2x = h * v2.x;
        const k2y = h * v2.y;

        const v3 = field.eval(p.x + k2x * 0.5, p.y + k2y * 0.5);
        const k3x = h * v3.x;
        const k3y = h * v3.y;

        const v4 = field.eval(p.x + k3x, p.y + k3y);
        const k4x = h * v4.x;
        const k4y = h * v4.y;

        p.x += (k1x + 2 * k2x + 2 * k3x + k4x) / 6;
        p.y += (k1y + 2 * k2y + 2 * k3y + k4y) / 6;

        // Recycle if expired or out of bounds
        if (p.age > p.maxAge || Math.abs(p.x) > DOMAIN_HALF || Math.abs(p.y) > DOMAIN_HALF) {
          const fresh = this.spawnParticle();
          p.x = fresh.x;
          p.y = fresh.y;
          p.age = 0;
          p.maxAge = fresh.maxAge;
        }
      }
    }

    // Upload positions and colors
    for (let i = 0; i < this.count; i++) {
      const p = this.particles[i];
      this.positions[i * 3 + 0] = p.x;
      this.positions[i * 3 + 1] = p.y;

      const v = field.eval(p.x, p.y);
      const mag = magnitude2D(v);
      this.magnitudes[i] = mag;

      const t = Math.min(mag / 5, 1);
      const [r, g, b] = viridis(t);
      this.colors[i * 3 + 0] = r;
      this.colors[i * 3 + 1] = g;
      this.colors[i * 3 + 2] = b;
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.attributes.aMagnitude.needsUpdate = true;
  }

  dispose(): void {
    this.unsubscribeField();
    this.unsubscribeUI();
    this.geometry.dispose();
    this.material.dispose();
  }

  // ---- internal helpers ----

  private spawnParticle(): Particle {
    return {
      x: (this.rng() - 0.5) * DOMAIN_HALF * 2,
      y: (this.rng() - 0.5) * DOMAIN_HALF * 2,
      age: 0,
      maxAge: 5 + this.rng() * 10,
    };
  }

  private onFieldChange(): void {
    // Reset all ages so particles respawn naturally with new field
    for (let i = 0; i < this.count; i++) {
      this.particles[i].age = this.particles[i].maxAge; // triggers recycle next frame
    }
  }

  private onDensityChange(): void {
    this.needsResize = true;
  }

  private resize(): void {
    const newCount = densityToCount(this.uiStore.getState().particleDensity);
    if (newCount === this.count) return;

    this.count = newCount;
    this.particles = new Array<Particle>(this.count);
    for (let i = 0; i < this.count; i++) {
      this.particles[i] = this.spawnParticle();
    }

    this.positions = new Float32Array(this.count * 3);
    this.colors = new Float32Array(this.count * 3);
    this.magnitudes = new Float32Array(this.count);

    for (let i = 0; i < this.count; i++) {
      this.positions[i * 3 + 0] = this.particles[i].x;
      this.positions[i * 3 + 1] = this.particles[i].y;
    }

    this.geometry.dispose();
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute("aMagnitude", new THREE.BufferAttribute(this.magnitudes, 1));
    this.points.geometry = this.geometry;
  }
}
