import {GridConfig} from "./config";
import GridLayoutSpaceManager from "./grid-layout-space-manager";
import {GridData} from "./types";

export default class ColumnSpaceManager extends GridLayoutSpaceManager {
  #widthPerCol: number[] = [];
  #tHeadEl: HTMLTableSectionElement;
  #tBodyEl: HTMLTableSectionElement;

  constructor(
    dim: {w: number, h: number},
    config: GridConfig,
    mountEl: HTMLElement,
    data: GridData
  ) {
    super(dim, config, mountEl, data);
    this.#widthPerCol = Array(data.columns.length).fill(0);
    this.#tHeadEl = document.createElement("thead");
    this.#tBodyEl = document.createElement("tbody");
    this.mountEl.append(this.#tHeadEl, this.#tBodyEl);
  }

  calculate(): void {
    if (this.config.columnContain === "fit-all") {
      this.#calculateFitAll();
    } else if (this.config.columnContain === "fit-some") {
      throw new Error("TODO not yet implemented");
    } else {
      throw new Error("Invalid columnContain value: " + this.config.columnContain);
    }
  }

  #calculateFitAll(): void {
    const numCols = this.data.columns.length;
    const colWidth = this.dim.w / numCols;
    this.#widthPerCol = Array(numCols).fill(colWidth);
  }

  colWidthByIdx(colIdx: number): number {
    return this.#widthPerCol[colIdx];
  }

  // TODO different type of renderer
  render() {
    this.calculate();

    const tr = document.createElement("tr");
    this.data.columns.forEach((col, colIdx) => {
      const th = document.createElement("th");
      const w = this.colWidthByIdx(colIdx) + "px";
      th.style.minWidth = th.style.maxWidth= w;
      th.innerText = col;
      tr.appendChild(th);
    });
    this.#tHeadEl.appendChild(tr);

    let trs: Array<HTMLTableRowElement> = [];
    for (let colIdx = 0; colIdx < this.data.columns.length; colIdx++) {
      for (let rowIdx = 0; rowIdx < this.data.data[colIdx].length; rowIdx++) {
        let tr = trs[rowIdx];
        if (!tr) {
          tr = document.createElement("tr");
          trs.push(tr);
        }
        const td = document.createElement("td");
        const w = this.colWidthByIdx(colIdx) + "px";
        td.style.minWidth = td.style.maxWidth= w;
        td.classList.add("txt-trunc");
        td.innerText = String(this.data.data[colIdx][rowIdx]);
        tr.appendChild(td);
      }
    }

    trs.reduce((parent, tr) => {
      parent.append(tr);
      return parent;
    }, this.#tBodyEl)
  }
}
