import { Grid } from "../../grid";
import { CellType } from "../cell-type";
import { GridConfig } from "../../types";

export class NumberCell extends CellType {
  render(element: HTMLElement, value: unknown, config: GridConfig): void {
    if (typeof value === "number") {
      element.textContent = value.toLocaleString();
    } else {
      element.textContent = String(value ?? "");
    }
  }

  measure(value: unknown, config: GridConfig): { width: number; height: number } {
    // For now, rely on CSS max-content
    return { width: config.defaultCellWidth, height: config.defaultCellHeight };
  }

  get className(): string {
    return "cell-number";
  }

  getStyles(): string {
    return "";
  }
}

Grid.register("cell", "number", NumberCell);
