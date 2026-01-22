import {GridConfig} from "../../config";
import {ViewState} from "../../types";
import {PLayout} from "../layout-proto";
import {PRenderer} from "../renderer-proto";
import {gridCss, gridShadowElsStyle} from "./grid-css.tmp";
import StandardLayout from "./standard-layout";

export default class StandardLayoutRenderer extends PRenderer {
  #con: HTMLElement;
  #virtualPanelEl: HTMLElement;
  #gridClipEl: HTMLElement;

  constructor(config: GridConfig, mountPoint: HTMLElement, layout: PLayout) {
    super(config, mountPoint, layout);

    [this.#con, , this.#virtualPanelEl, this.#gridClipEl] = this.#attachShadowDom();
  }

  #attachShadowDom(): HTMLElement[] {
    const el = this.mountPoint;
    el.attachShadow({ mode: "open" });
    el.style.overflow = "auto";
    (el.shadowRoot as ShadowRoot).innerHTML = `
      <style>
        ${gridShadowElsStyle}
      </style>
      <div class="virtual-panel"></div>
      <div class="grid-clip"><slot></slot></div>
    `;

    const style = document.createElement("style");
    style.innerHTML = gridCss;
    el.append(style);
    const con = document.createElement("div");
    con.className = "grid-content";
    el.appendChild(con);

    return [con, ...Array.from(el.shadowRoot!.children)] as HTMLElement[];
  }

  updateVirtualPanel(vs: ViewState): void {
    // Virtual panel sized to full virtual dimensions - this empty div creates
    // the scrollbar range. As more columns get measured, totalWidth becomes
    // more accurate and scrollbar thumb position improves.
    this.#virtualPanelEl.style.width = `${vs.totalWidth}px`;
    this.#virtualPanelEl.style.height = `${vs.totalHeight}px`;

    // Sub-cell offset enables smooth pixel-level scrolling despite cell-based rendering.
    // Without it: scroll jumps by whole cell heights/widths (jerky).
    // With it: gridContent shifts by fractional cell offset, scroll appears continuous.
    // Example: if row 5.3 is visible, we render from row 5 but shift up by 0.3*rowHeight.
    this.#con.style.setProperty("--offset-x", `${vs.offsetX}px`);
    this.#con.style.setProperty("--offset-y", `${vs.offsetY}px`);
  }

  setGridTemplate(columns: string, rows: string): void {
    this.#con.style.gridTemplateColumns = columns;
    this.#con.style.gridTemplateRows = rows;
  }

  render(vs: ViewState): void {
    if (!this.data) throw new Error("Data is not set!");

    this.updateVirtualPanel(vs);

    const sliceForFrame = this.data.getSlice(vs.x0, vs.y0, vs.x1, vs.y1);
    const numDataColsVisible = vs.x1 - vs.x0;
    const numDataRowsVisible = vs.y1 - vs.y0;
    const { numRowFacets, numColFacets}  = this.data;

    const regions = this.layout.calculateLayout(vs);

    const template = (this.layout as StandardLayout).getGridTemplate(
      this.data.numRowFacets,
      this.data.numColFacets,
      numDataColsVisible,
      numDataRowsVisible,
    );
    this.setGridTemplate(template.columns, template.rows);

  }
}
