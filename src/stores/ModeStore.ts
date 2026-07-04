import { Store } from "./Store";

export interface ModeState {
  activeMode: 1 | 2 | 3;
  mathMode: boolean;
}

export class ModeStore extends Store<ModeState> {
  constructor() {
    super({ activeMode: 1, mathMode: false });
  }

  setMode(m: 1 | 2 | 3): void {
    if (m === this.getState().activeMode) return;
    this.setState({ activeMode: m });
  }

  toggleMathMode(): void {
    this.setState({ mathMode: !this.getState().mathMode });
  }
}
