import { Store } from "./Store";

export interface InteractionState {
  mouseWorld: { x: number; y: number } | null;
  mouseSpeed: number;
  clickHeld: boolean;
  effectRadius: number;
  baseRadius: number;
}

export class InteractionStore extends Store<InteractionState> {
  constructor() {
    super({
      mouseWorld: null,
      mouseSpeed: 0,
      clickHeld: false,
      baseRadius: 0.5,
      effectRadius: 0.5,
    });
  }

  updateMouse(world: { x: number; y: number }): void {
    this.setState({ mouseWorld: world });
  }

  updateSpeed(speed: number): void {
    this.setState({ mouseSpeed: speed });
  }

  setClickHeld(held: boolean): void {
    const base = this.getState().baseRadius;
    this.setState({ clickHeld: held, effectRadius: held ? base * 3 : base });
  }

  setRadius(r: number): void {
    const held = this.getState().clickHeld;
    this.setState({ baseRadius: r, effectRadius: held ? r * 3 : r });
  }
}
