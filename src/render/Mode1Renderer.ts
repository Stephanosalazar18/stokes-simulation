import * as THREE from "three";
import type { Field2D } from "../fields/Field";
import { FieldStore } from "../stores/FieldStore";
import { UISettingsStore } from "../stores/UISettingsStore";
import { CameraRig } from "../scene/CameraRig";
import { ParticleSystem2D } from "./particles/ParticleSystem2D";

/**
 * Mode1Renderer orchestrates the 2D flow visualization in Mode 1.
 * It replaces the placeholder cube with a particle system that traces
 * field streamlines via RK4 integration.
 */
export class Mode1Renderer {
  private ps: ParticleSystem2D;
  private group: THREE.Group;

  constructor(
    group: THREE.Group,
    cameraRig: CameraRig,
    fieldStore: FieldStore,
    uiStore: UISettingsStore,
  ) {
    this.group = group;

    // Remove placeholder geometry (colored cube from boot)
    while (group.children.length > 0) {
      const child = group.children[0];
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
      group.remove(child);
    }

    cameraRig.configureForMode(1);

    this.ps = new ParticleSystem2D(fieldStore, uiStore);
    group.add(this.ps.getPoints());
  }

  update(dt: number, field: Field2D): void {
    this.ps.update(dt, field);
  }

  dispose(): void {
    this.ps.dispose();
    // Remove Points from group (material + geometry handled by ps.dispose)
    this.group.remove(this.ps.getPoints());
  }
}
