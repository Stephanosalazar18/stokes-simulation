import * as THREE from "three";
import { FieldStore } from "../stores/FieldStore";
import { UISettingsStore } from "../stores/UISettingsStore";
import { ModeStore } from "../stores/ModeStore";
import { CameraRig } from "./CameraRig";
import { Mode1Renderer } from "../render/Mode1Renderer";

const CUBE_COLORS: Record<number, number> = {
  2: 0xf44336, // red — Mode 2
  3: 0x4caf50, // green — Mode 3
};

export class SceneManager {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly groups: Record<number, THREE.Group> = { 1: new THREE.Group(), 2: new THREE.Group(), 3: new THREE.Group() };

  private cameraRig: CameraRig;
  private mode1Renderer: Mode1Renderer;
  private fieldStore: FieldStore;
  private modeStore: ModeStore;

  constructor(
    canvas: HTMLCanvasElement,
    fieldStore: FieldStore,
    uiStore: UISettingsStore,
    modeStore: ModeStore,
  ) {
    this.fieldStore = fieldStore;
    this.modeStore = modeStore;

    // Note: UISettingsStore is passed only to Mode1Renderer constructor

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);

    this.cameraRig = new CameraRig(this.camera);
    this.cameraRig.configureForMode(1);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Mode 1: replace placeholder cube with particle system
    this.mode1Renderer = new Mode1Renderer(this.groups[1], this.cameraRig, fieldStore, uiStore);

    // Modes 2 and 3: keep placeholder colored cubes
    for (const mode of [2, 3]) {
      const geo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
      const mat = new THREE.MeshBasicMaterial({ color: CUBE_COLORS[mode] });
      const cube = new THREE.Mesh(geo, mat);
      this.groups[mode].add(cube);
    }

    for (const [id, group] of Object.entries(this.groups)) {
      group.visible = Number(id) === 1;
      this.scene.add(group);
    }

    // React to mode changes
    this.modeStore.subscribe(() => {
      const { activeMode } = this.modeStore.getState();
      this.cameraRig.configureForMode(activeMode);
    });

    window.addEventListener("resize", this.onResize);
  }

  setGroupVisible(mode: number, visible: boolean): void {
    for (const [id, group] of Object.entries(this.groups)) {
      group.visible = Number(id) === mode ? visible : false;
    }
  }

  render(dt: number): void {
    const { activeMode } = this.modeStore.getState();
    if (activeMode === 1) {
      const state = this.fieldStore.getState();
      const field = state.fields2D.find((f) => f.id === state.activeFieldId);
      if (field) {
        this.mode1Renderer.update(dt, field);
      }
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    window.removeEventListener("resize", this.onResize);
    this.mode1Renderer.dispose();
    this.renderer.dispose();
  }

  private onResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.cameraRig.updateAspect(w / h);
    this.renderer.setSize(w, h);
  };
}
