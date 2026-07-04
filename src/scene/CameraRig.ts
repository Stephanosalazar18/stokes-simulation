import * as THREE from "three";

/**
 * CameraRig manages a shared PerspectiveCamera across the three visualization modes.
 * Mode 1: top-down 2D view at z=5.
 * Mode 2: perspective 3D orbit view at (3,3,5).
 * Mode 3: close XY-plane view at z=3.
 */
export class CameraRig {
  constructor(private camera: THREE.PerspectiveCamera) {}

  configureForMode(mode: 1 | 2 | 3): void {
    switch (mode) {
      case 1:
        this.camera.position.set(0, 0, 5);
        this.camera.lookAt(0, 0, 0);
        this.camera.up.set(0, 1, 0);
        break;
      case 2:
        this.camera.position.set(3, 3, 5);
        this.camera.lookAt(0, 0, 0);
        break;
      case 3:
        this.camera.position.set(0, 0, 3);
        this.camera.lookAt(0, 0, 0);
        break;
    }
  }

  updateAspect(a: number): void {
    this.camera.aspect = a;
    this.camera.updateProjectionMatrix();
  }

  getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }
}
