/**
  * TODO[doc]
  * Mostly the data would be in the format of 2D array
  * [[col1, col2,   col3],
  *  [1,    val2_1, val_3_1],
  *  [2,    val2_2, val3_2],
  *  [3,    val2_3, val3_3],
  *  [4,    val2_4, val3_4]]
  *  This creates too many array allocations. So we would change the structure from row first to column first.
  *
  * Sample data structure of IData
  * {
  *   columns: ["col1", "col2", "col3"],
  *   data: [
  *     [1, 2, 3, 4],
  *     [val2_1", "val_3_1", "val2_4"],
  *     [val2_2", "val_3_2", "val2_3"],
  *   ]
  * }
  *
  * Here `columns` keeps the order of columns and `data` keeps the order of rows.
  *
  * In row first format, for 150k rows across 20 columns, total 150k array of 20 elements each would be created.
  * In column first format, for 150k rows across 20 columns, total 20 array of 150k elements each would be created.
  *
  * TODO:
  *   1. data for spark line charts
  *   2. data navigation with row_left, row_right, col_top, col_bottom
  */

import { defaultConfig, GridConfig } from "./config";
import { GridData } from "./types";
import { tableCss } from "./table-css";
import GridView from "./grid-view";

class Grid extends HTMLElement {
  #data: GridData = {
    columns: [],
    data: []
  };

  #containerDim = { h: 0, w: 0 };
  config: GridConfig;
  view: GridView;

  constructor(config: Partial<GridConfig> = {}) {
    super();
    this.config = { ...defaultConfig, ...config };
    this.view = new GridView(this.config);
  }

  connectedCallback() {
    this.#attachShadowDom();

    const rect = this.getBoundingClientRect();
    this.#containerDim.h = rect.height;
    this.#containerDim.w = rect.width;

    this.view.mount(this);
  }

  get data(): GridData {
    return this.#data;
  }

  set data(value: GridData) {
    this.#data = value;
    this.view.data = value;
  }

  render(): void {
    if (this.data.columns.length === 0) {
      return;
    }
    this.view.render();
  }

  #attachShadowDom() {
    this.attachShadow({ mode: "open" });
    (this.shadowRoot as ShadowRoot).innerHTML = `
      <style>
        :host {
          display: block;
          width: 100%;
          height: 100%;
          overflow: hidden;
          position: relative;
        }
        .viewport {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          overflow: auto;
        }
      </style>
      <div class="scroll-backdrop"></div>
      <div class="viewport"><slot></slot></div>
    `;

    const style = document.createElement("style");
    style.innerHTML = tableCss;
    this.append(style);
  }
}

if (document.createElement("dataflow-grid").constructor === HTMLElement) {
  window.customElements.define("dataflow-grid", Grid);
}

export default Grid;
export { GridData, GridConfig };
