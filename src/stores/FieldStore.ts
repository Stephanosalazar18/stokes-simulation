import { Store } from "./Store";
import type { Field2D, Field3D } from "../fields/Field";

export interface FieldState {
  activeFieldId: string;
  fields2D: Field2D[];
  fields3D: Field3D[];
}

export class FieldStore extends Store<FieldState> {
  constructor(fields2D: Field2D[]) {
    super({
      activeFieldId: fields2D.length > 0 ? fields2D[0].id : "",
      fields2D,
      fields3D: [],
    });
  }

  setField(id: string): void {
    if (id === this.getState().activeFieldId) return;
    this.setState({ activeFieldId: id });
  }

  getField(id: string): Field2D | Field3D | null {
    const s = this.getState();
    return (
      s.fields2D.find((f) => f.id === id) ??
      s.fields3D.find((f) => f.id === id) ??
      null
    );
  }
}
