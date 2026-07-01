import * as THREE from "three";

const CUBE_COLORS: Record<number, number> = {
  1: 0x2196f3, // blue
  2: 0xf44336, // red
  3: 0x4caf50, // green
};

export class SceneManager {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly groups: Record<number, THREE.Group> = { 1: new THREE.Group(), 2: new THREE.Group(), 3: new THREE.Group() };

  private cubes: Record<number, THREE.Mesh> = {};

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
    this.camera.position.set(0, 0, 5);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    for (const [id, group] of Object.entries(this.groups)) {
      const mode = Number(id);
      const geo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
      const mat = new THREE.MeshBasicMaterial({ color: CUBE_COLORS[mode] });
      const cube = new THREE.Mesh(geo, mat);
      group.add(cube);
      group.visible = mode === 1;
      this.scene.add(group);
      this.cubes[mode] = cube;
    }

    window.addEventListener("resize", this.onResize);
  }

  setGroupVisible(mode: number, visible: boolean): void {
    for (const [id, group] of Object.entries(this.groups)) {
      group.visible = Number(id) === mode ? visible : false;
    }
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    window.removeEventListener("resize", this.onResize);
    this.renderer.dispose();
  }

  private onResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };
}
