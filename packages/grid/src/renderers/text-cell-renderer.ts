import { CellValue, ICellRenderer } from "./types";

export class TextCellRenderer implements ICellRenderer {
  render(value: CellValue, _rowIdx: number, _colIdx: number): HTMLElement {
    const td = document.createElement("td");
    td.textContent = this.#formatValue(value);
    return td;
  }

  #formatValue(value: CellValue): string {
    if (value === null || value === undefined) {
      return "";
    }
    return String(value);
  }
}
