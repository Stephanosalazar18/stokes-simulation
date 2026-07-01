import { ModeStore } from "./stores/ModeStore";
import { SceneManager } from "./scene/SceneManager";

export class App {
  private modeStore: ModeStore;
  private scene: SceneManager;
  private buttons: HTMLButtonElement[] = [];
  private rafId = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.modeStore = new ModeStore();
    this.scene = new SceneManager(canvas);
    this.setupModeSwitcher();
    this.modeStore.subscribe(() => this.onModeChange());
  }

  private setupModeSwitcher(): void {
    const nav = document.getElementById("mode-switcher");
    if (!nav) return;
    this.buttons = Array.from(nav.querySelectorAll("button")) as HTMLButtonElement[];
    for (const btn of this.buttons) {
      btn.addEventListener("click", () => {
        const m = Number(btn.dataset.mode) as 1 | 2 | 3;
        this.modeStore.setMode(m);
      });
    }
    document.addEventListener("keydown", (e) => {
      if (e.key === "1" || e.key === "2" || e.key === "3") {
        this.modeStore.setMode(Number(e.key) as 1 | 2 | 3);
      }
    });
  }

  private onModeChange(): void {
    const { activeMode } = this.modeStore.getState();
    this.scene.setGroupVisible(activeMode, true);
    for (const btn of this.buttons) {
      const m = Number(btn.dataset.mode);
      const isActive = m === activeMode;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-checked", String(isActive));
    }
  }

  start(): void {
    const loop = (): void => {
      this.scene.render();
      this.rafId = requestAnimationFrame(loop);
    };
    loop();
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    this.scene.dispose();
  }
}
