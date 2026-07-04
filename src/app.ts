import { ModeStore } from "./stores/ModeStore";
import { FieldStore } from "./stores/FieldStore";
import { UISettingsStore } from "./stores/UISettingsStore";
import { InteractionStore } from "./stores/InteractionStore";
import { SceneManager } from "./scene/SceneManager";
import { fields2D } from "./fields/fields2D";
import { STRINGS } from "./ui/es";

export class App {
  readonly modeStore: ModeStore;
  readonly fieldStore: FieldStore;
  readonly uiStore: UISettingsStore;
  readonly interactionStore: InteractionStore;

  private scene: SceneManager;
  private buttons: HTMLButtonElement[] = [];
  private rafId = 0;
  private lastTime = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.modeStore = new ModeStore();
    this.fieldStore = new FieldStore(fields2D);
    this.uiStore = new UISettingsStore();
    this.interactionStore = new InteractionStore();

    this.scene = new SceneManager(canvas, this.fieldStore, this.uiStore, this.modeStore);

    this.setupModeSwitcher();
    this.setupFieldPanel();
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

  private setupFieldPanel(): void {
    const select = document.getElementById("field-select") as HTMLSelectElement | null;
    const status = document.getElementById("field-status") as HTMLSpanElement | null;
    const density = document.getElementById("density-slider") as HTMLInputElement | null;

    // Populate field dropdown
    if (select) {
      const state = this.fieldStore.getState();
      for (const f of state.fields2D) {
        const opt = document.createElement("option");
        opt.value = f.id;
        opt.textContent = STRINGS.fields[f.id as keyof typeof STRINGS.fields] ?? f.name;
        select.appendChild(opt);
      }
      select.value = state.activeFieldId;
      select.addEventListener("change", () => {
        this.fieldStore.setField(select.value);
      });
    }

    // Wire density slider
    if (density) {
      density.addEventListener("input", () => {
        this.uiStore.setParticleDensity(Number(density.value));
      });
    }

    // Update status on field change
    this.fieldStore.subscribe(() => {
      const s = this.fieldStore.getState();
      const field = s.fields2D.find((f) => f.id === s.activeFieldId);
      if (status) {
        status.textContent = field ? field.formula : "";
      }
      if (select) {
        select.value = s.activeFieldId;
      }
    });

    // Set initial status
    if (status) {
      const field = this.fieldStore.getState().fields2D.find(
        (f) => f.id === this.fieldStore.getState().activeFieldId,
      );
      status.textContent = field ? field.formula : "";
    }
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
    const loop = (time: number): void => {
      const dt = this.lastTime ? (time - this.lastTime) / 1000 : 0.016;
      this.lastTime = time;
      this.scene.render(dt);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    this.scene.dispose();
  }
}
