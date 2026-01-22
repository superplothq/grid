import { GridConfig } from "../types";

export abstract class CellType {
  /**
   * Render value into the cell element.
   */
  abstract render(element: HTMLElement, value: unknown, config: GridConfig): void;

  /**
   * Measure the natural size of this value.
   * Used for auto-sizing columns.
   */
  abstract measure(value: unknown, config: GridConfig): { width: number; height: number };

  /**
   * CSS class to apply to cells of this type.
   */
  abstract get className(): string;

  /**
   * Return styles for this cell type.
   */
  abstract getStyles(): string;
}
