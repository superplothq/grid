import { GridData } from "../types";
import { CellRendererRegistry, IRenderer } from "./types";
import { TextCellRenderer } from "./text-cell-renderer";

export class TableRenderer implements IRenderer {
  #container: HTMLElement | null = null;
  #tableEl: HTMLTableElement | null = null;
  #theadEl: HTMLTableSectionElement | null = null;
  #tbodyEl: HTMLTableSectionElement | null = null;
  #cellRegistry: CellRendererRegistry;

  constructor(cellRegistry?: CellRendererRegistry) {
    this.#cellRegistry = cellRegistry ?? new CellRendererRegistry(new TextCellRenderer());
  }

  get cellRegistry(): CellRendererRegistry {
    return this.#cellRegistry;
  }

  mount(container: HTMLElement): void {
    this.#container = container;

    this.#tableEl = document.createElement("table");
    this.#tableEl.setAttribute("cellspacing", "0");

    this.#theadEl = document.createElement("thead");
    this.#tbodyEl = document.createElement("tbody");

    this.#tableEl.appendChild(this.#theadEl);
    this.#tableEl.appendChild(this.#tbodyEl);
    this.#container.appendChild(this.#tableEl);
  }

  render(data: GridData): void {
    if (!this.#tableEl || !this.#theadEl || !this.#tbodyEl) {
      throw new Error("TableRenderer not mounted. Call mount() first.");
    }

    this.#renderHeader(data.columns);
    this.#renderBody(data);
  }

  #renderHeader(columns: string[]): void {
    this.#theadEl!.innerHTML = "";

    const tr = document.createElement("tr");
    for (const col of columns) {
      const th = document.createElement("th");
      th.textContent = col;
      tr.appendChild(th);
    }
    this.#theadEl!.appendChild(tr);
  }

  #renderBody(data: GridData): void {
    this.#tbodyEl!.innerHTML = "";

    const { columns, data: columnData } = data;
    if (columns.length === 0 || columnData.length === 0) {
      return;
    }

    const rowCount = columnData[0].length;

    for (let rowIdx = 0; rowIdx < rowCount; rowIdx++) {
      const tr = document.createElement("tr");

      for (let colIdx = 0; colIdx < columns.length; colIdx++) {
        const value = columnData[colIdx][rowIdx];
        const renderer = this.#cellRegistry.getRenderer(colIdx, columns[colIdx], value);
        const td = renderer.render(value, rowIdx, colIdx);
        tr.appendChild(td);
      }

      this.#tbodyEl!.appendChild(tr);
    }
  }

  destroy(): void {
    if (this.#tableEl && this.#container) {
      this.#container.removeChild(this.#tableEl);
    }
    this.#tableEl = null;
    this.#theadEl = null;
    this.#tbodyEl = null;
    this.#container = null;
  }
}
