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


// import ColumnSpaceManager from "./column-space-manager";
import { defaultConfig, GridConfig } from "./config";
import { GridData } from "./types";
import { tableCss } from "./table-css";
import GridView from "./grid-view";


class Grid extends HTMLElement {
  #data: GridData = {
    columns: [],
    data: []
  };

  #tableEl: HTMLTableElement | null = null;
  #containerDim = { h: 0, w: 0 };
  // #colSpaceManager: ColumnSpaceManager | null = null;
  config: GridConfig;
  view: GridView;

  constructor(config: Partial<GridConfig> = {}) {
    super();
    // TODO better parsing with allowed values or null / undefined value handling
    this.config = { ...defaultConfig, ...config };
    this.view = new GridView(this.config);
  }

  connectedCallback() {
    this.#attachShadowDom();

    const rect = this.getBoundingClientRect();
    this.#containerDim.h = rect.height;
    this.#containerDim.w = rect.width;

    this.view.mountEl = this.#tableEl!;
    console.log("dim", this.#containerDim);

    // this.#colSpaceManager = new ColumnSpaceManager(
    //   this.#containerDim,
    //   this.config,
    //   this.#tableEl!,
    //   this.#data
    // );
  }

  get data(): GridData {
    return this.#data;
  }

  set data(value: GridData) {
    this.#data = value;
    this.view.data = value;
    // if (this.#colSpaceManager) {
    //   this.#colSpaceManager.data = value;
    // }
  }

  async render() {
    if (this.data.columns.length === 0) {
      console.log("TODO no data");
      return;
    }

    // await this.#colSpaceManager!.render();    
    // console.log("Grid will render", this.data);
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
        }
      </style>
      <div class="scroll-backdrop"></div>
      <div class="viewport"><slot></slot></div>
    `;

    const style = document.createElement("style");
    style.innerHTML = tableCss;
    this.append(style);

    this.#tableEl = document.createElement("table");
    this.#tableEl.setAttribute("cellspacing", "0");
    this.append(this.#tableEl)
  }
}

// TODO decide name of the component
if (document.createElement("dataflow-grid").constructor === HTMLElement) {
  window.customElements.define("dataflow-grid", Grid);
}

export default Grid;
export { GridData, GridConfig }
