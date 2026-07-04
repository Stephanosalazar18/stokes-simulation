import { Store } from "./Store";

export type ColorByMode = "magnitude" | "direction" | "curl";

export interface UISettingsState {
  particleDensity: number;
  showStreamlines: boolean;
  showMathMode: boolean;
  colorBy: ColorByMode;
}

export class UISettingsStore extends Store<UISettingsState> {
  constructor() {
    super({
      particleDensity: 5,
      showStreamlines: false,
      showMathMode: false,
      colorBy: "magnitude",
    });
  }

  setParticleDensity(n: number): void {
    this.setState({ particleDensity: n });
  }

  toggleStreamlines(): void {
    this.setState({ showStreamlines: !this.getState().showStreamlines });
  }

  toggleMathMode(): void {
    this.setState({ showMathMode: !this.getState().showMathMode });
  }

  setColorBy(mode: ColorByMode): void {
    this.setState({ colorBy: mode });
  }
}
