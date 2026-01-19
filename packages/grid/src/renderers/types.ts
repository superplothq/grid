import { GridData } from "../types";

export type CellValue = string | number | boolean | null | undefined;

export interface IRenderer {
  mount(container: HTMLElement): void;
  render(data: GridData): void;
  destroy(): void;
}

export interface ICellRenderer {
  render(value: CellValue, rowIdx: number, colIdx: number): HTMLElement;
}

export type CellRendererMatch = {
  type: "index";
  index: number;
} | {
  type: "name";
  name: string;
} | {
  type: "datatype";
  datatype: "string" | "number" | "boolean" | "null";
};

export class CellRendererRegistry {
  #byIndex: Map<number, ICellRenderer> = new Map();
  #byName: Map<string, ICellRenderer> = new Map();
  #byType: Map<string, ICellRenderer> = new Map();
  #default: ICellRenderer;

  constructor(defaultRenderer: ICellRenderer) {
    this.#default = defaultRenderer;
  }

  registerByIndex(index: number, renderer: ICellRenderer): void {
    this.#byIndex.set(index, renderer);
  }

  registerByName(name: string, renderer: ICellRenderer): void {
    this.#byName.set(name, renderer);
  }

  registerByType(datatype: string, renderer: ICellRenderer): void {
    this.#byType.set(datatype, renderer);
  }

  getRenderer(colIdx: number, colName: string, value: CellValue): ICellRenderer {
    // Priority: index > name > type > default
    if (this.#byIndex.has(colIdx)) {
      return this.#byIndex.get(colIdx)!;
    }

    if (this.#byName.has(colName)) {
      return this.#byName.get(colName)!;
    }

    const valueType = value === null ? "null" : typeof value;
    if (this.#byType.has(valueType)) {
      return this.#byType.get(valueType)!;
    }

    return this.#default;
  }

  clear(): void {
    this.#byIndex.clear();
    this.#byName.clear();
    this.#byType.clear();
  }
}
