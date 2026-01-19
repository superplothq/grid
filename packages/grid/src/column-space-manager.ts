import {GridConfig} from "./config";
import GridLayoutSpaceManager from "./grid-layout-space-manager";
import {GridData} from "./types";
import {ColumnViewModel} from "./types";

export default class ColumnSpaceManager extends GridLayoutSpaceManager {
  #tHeadEl: HTMLTableSectionElement;
  #tBodyEl: HTMLTableSectionElement;
  #colViewModel: Array<ColumnViewModel<{ overflown: boolean }>> = [];
  #drawProgress: boolean;

  constructor(
    dim: {w: number, h: number},
    config: GridConfig,
    mountEl: HTMLElement,
    data: GridData
  ) {
    super(dim, config, mountEl, data);

    this.#drawProgress = true;
    this.#tHeadEl = document.createElement("thead");
    this.#tBodyEl = document.createElement("tbody");
    this.#tHeadEl.style.visibility = "hidden";
    this.showHideEl([this.#tHeadEl, this.#tBodyEl], false);
    this.mountEl.append(this.#tHeadEl, this.#tBodyEl);
    this.#genColViewModel(data);
  }

  #genColViewModel(data: GridData): void {
    this.#colViewModel = data.columns.map((col, idx) => {
      return {
        name: col,
        idx: idx,
        width: 0,
        maxContentWidth: 0,
        headerContentWidth: 0,
        proposedWidth: 0,
        __meta__: { overflown: false}
      };
    });
  }

  showHideEl(els: HTMLElement[], show: boolean) {
    els.forEach(el => {
      if (show) {
        el.style.visibility = "visible";
        el.style.opacity = "1";
      } else {
        el.style.visibility = "hidden";
        el.style.opacity = "0";
      }
    });
  }

  get data(): GridData {
    return super.data;
  }

  set data(value: GridData) {
    super.data = value;
    this.#genColViewModel(value);
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
    this.#colViewModel.forEach(model => model.proposedWidth = colWidth);
  }

  // TODO different type of renderer
  async render(): Promise<void> {
    this.calculate();

    // draw header
    const tr = document.createElement("tr");
    this.data.columns.forEach((col, colIdx) => {
      const th = document.createElement("th");
      // const w = this.#colViewModel[colIdx].width + "px";
      // th.style.minWidth = th.style.maxWidth= w;
      th.innerText = col;
      tr.appendChild(th);
    });
    this.#tHeadEl.appendChild(tr);

    // draw rows
    let trs: Array<HTMLTableRowElement> = [];
    for (let colIdx = 0; colIdx < this.data.columns.length; colIdx++) {
      for (let rowIdx = 0; rowIdx < this.data.data[colIdx].length; rowIdx++) {
        let tr = trs[rowIdx];
        if (!tr) {
          tr = document.createElement("tr");
          trs.push(tr);
        }
        const td = document.createElement("td");
        // const w = this.#colViewModel[colIdx].width + "px";
        // td.style.minWidth = td.style.maxWidth = w;
        // td.classList.add("txt-trunc");
        td.innerText = String(this.data.data[colIdx][rowIdx]);
        tr.appendChild(td);
      }
    }

    trs.reduce((parent, tr) => {
      parent.append(tr);
      return parent;
    }, this.#tBodyEl)

    return new Promise(done => {
      requestAnimationFrame(() => {
        const t1 = performance.now();
        // 1. calculate original width of each column model if it was rendered as is before applying any space management
        const trs = this.#tBodyEl.querySelectorAll("tr");
        for (let trIdx = 0; trIdx < trs.length; trIdx++) { // for each visible row
          const tds = trs[trIdx].querySelectorAll("td");
          for (let colModelIdx = 0; colModelIdx < this.#colViewModel.length; colModelIdx++) { // for each column model
            const colModel = this.#colViewModel[colModelIdx];
            colModel.maxContentWidth = Math.max(colModel.maxContentWidth, Math.round(tds[colModelIdx].getBoundingClientRect().width))
          }
        }

        // 2. check the columns that are being truncated wrt boundary of column as fit-all
        // 3. give space to truncated columns to make them full width; maxed to fit-all
        // TODO distribute space based on column width distribution
        let totalOverflowedCols = 0;
        let widthRemainingAfterOverflowAdjustment = 0;
        let totalOverflowedWidth = 0;
        for (let colModelIdx = 0; colModelIdx < this.#colViewModel.length; colModelIdx++) {
          const colModel = this.#colViewModel[colModelIdx];
          if (colModel.maxContentWidth >= colModel.proposedWidth) {
            colModel.__meta__.overflown = true;
            totalOverflowedWidth += colModel.maxContentWidth - colModel.proposedWidth;
            totalOverflowedCols++;
          }
          widthRemainingAfterOverflowAdjustment +=  colModel.proposedWidth - colModel.maxContentWidth;
        }

        if (totalOverflowedCols === this.#colViewModel.length) {
          // If all the columns are overflowed then we can assign the proposed width to all columns as no matter what
          // columns will be overflowded
          this.#colViewModel.forEach(model => model.width = model.proposedWidth);
        } else if (widthRemainingAfterOverflowAdjustment > 0) {
          // If across not all columns are overflown, and after overflown column is adjusted, there is still extra space,
          // so equally distribute the extra space
          const extraSpacePerCol = widthRemainingAfterOverflowAdjustment / this.#colViewModel.length;
          this.#colViewModel.forEach(model => model.width = model.maxContentWidth + extraSpacePerCol);
        } else {
          // TODO
        }

        for (let trIdx = 0; trIdx < trs.length; trIdx++) { // for each visible row
          const tds = trs[trIdx].querySelectorAll("td");
          for (let colModelIdx = 0; colModelIdx < this.#colViewModel.length; colModelIdx++) {
            tds[colModelIdx].style.minWidth = tds[colModelIdx].style.maxWidth = this.#colViewModel[colModelIdx].width + "px";
          }
        }
        

        console.log(this.#colViewModel, widthRemainingAfterOverflowAdjustment);
        console.log("[p] space calculation time", Number(performance.now() - t1).toFixed(2) + "ms");


        requestAnimationFrame(() => {
          this.showHideEl([this.#tHeadEl, this.#tBodyEl], true);
          done();
        });
      });
    })
  }
}
