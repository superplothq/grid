import {GridConfig} from "../../config";
import {ViewState} from "../../types";
import {PLayout} from "../layout-proto";
import {RendererBase} from "../renderer-base";
import {RegionRenderContext, RegionRenderData} from "../region-proto";
import {CornerRegion} from "../regions/corner-region";
import {ColFacetRegion} from "../regions/col-facet-region";
import {RowFacetRegion} from "../regions/row-facet-region";
import {ValueRegion} from "../regions/value-region";
import {gridCss, gridShadowElsStyle} from "./grid-css.tmp";
import StandardLayout from "./standard-layout";

export default class StandardLayoutRenderer extends RendererBase {
  #con: HTMLElement;
  #virtualPanelEl: HTMLElement;
  #gridClipEl: HTMLElement;
  #scrollRAF: number | null = null;
  #scrollListenerSet = false;
  #renderCount = 0;

  // Region instances
  #cornerRegion = new CornerRegion();
  #colFacetRegion = new ColFacetRegion();
  #rowFacetRegion = new RowFacetRegion();
  #valueRegion = new ValueRegion();

  constructor(config: GridConfig, mountPoint: HTMLElement, layout: PLayout) {
    super(config, mountPoint, layout);

    [this.#con, , this.#virtualPanelEl, this.#gridClipEl] = this.#attachShadowDom();

    // Measure row height and update layout
    this.#measureRowHeight();
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

  #measureRowHeight(): void {
    const sample = document.createElement("div");
    sample.className = "cell";
    sample.style.visibility = "hidden";
    sample.textContent = "Mgy$123,456";
    this.#con.appendChild(sample);
    const rect = sample.getBoundingClientRect();
    const height = rect.height;
    this.#con.removeChild(sample);

    // Update layout with measured height
    const layout = this.layout as StandardLayout;
    layout.rowHeightByType.facet = height;
    layout.rowHeightByType.data = height;

    console.log(`>>> Measured row height: ${height}px`);
  }

  #setupScrollListener(): void {
    if (this.#scrollListenerSet) return;
    this.#scrollListenerSet = true;

    this.mountPoint.addEventListener("scroll", () => {
      if (this.#scrollRAF) return;

      this.#scrollRAF = requestAnimationFrame(() => {
        this.#scrollRAF = null;
        // Recalculate view state and re-render
        const vs = this.layout.calculateViewState();
        this.render(vs);
      });
    });
  }

  #updateVirtualPanel(vs: ViewState): void {
    this.#virtualPanelEl.style.width = `${vs.totalWidth}px`;
    this.#virtualPanelEl.style.height = `${vs.totalHeight}px`;
    this.#con.style.setProperty("--offset-x", `${vs.offsetX}px`);
    this.#con.style.setProperty("--offset-y", `${vs.offsetY}px`);
  }

  #setGridTemplate(columns: string, rows: string): void {
    this.#con.style.gridTemplateColumns = columns;
    this.#con.style.gridTemplateRows = rows;
  }

  #calculateFacetPositions(): { rowFacetsLeftPositions: number[]; colFacetsTopPositions: number[] } {
    const layout = this.layout as StandardLayout;

    // Row facets left positions (cumulative widths)
    const rowFacetsLeftPositions = [0];
    for (let i = 0; i < layout.numRowFacets - 1; i++) {
      rowFacetsLeftPositions.push(
        rowFacetsLeftPositions[i] + layout.getColumnWidth(i)
      );
    }

    // Column facets top positions
    const colFacetsTopPositions: number[] = [];
    const facetRowHeight = layout.getRowHeight("facet");
    for (let i = 0; i < layout.numColFacets; i++) {
      colFacetsTopPositions.push(i * facetRowHeight);
    }

    return { rowFacetsLeftPositions, colFacetsTopPositions };
  }

  #measureCells(): void {
    // Measure visible cells and update column widths
    const layout = this.layout as StandardLayout;

    for (const [key, cell] of this.activeCells) {
      // Only measure non-merged data/header cells
      if (!key.startsWith("data-") && !key.startsWith("col-h-") && !key.startsWith("row-h-")) {
        continue;
      }

      const width = cell.getBoundingClientRect().width;
      if (!width) continue;

      // Extract column index from key
      let colIndex = -1;
      if (key.startsWith("data-")) {
        const parts = key.split("-");
        colIndex = layout.numRowFacets + parseInt(parts[1], 10);
      } else if (key.startsWith("col-h-")) {
        const parts = key.split("-");
        colIndex = layout.numRowFacets + parseInt(parts[3], 10);
      } else if (key.startsWith("row-h-")) {
        const parts = key.split("-");
        colIndex = parseInt(parts[2], 10);
      }

      if (colIndex >= 0 && width > (layout.colsWidth.indices[colIndex] || 0)) {
        layout.colsWidth.indices[colIndex] = width;
      }
    }
  }

  // #debugInfo(dt: number): void {
  //   const debugEl = document.getElementById("pref-info");
  //   if (!debugEl) return;
  //   debugEl.innerText = `[dT: ${dt.toFixed(2)}ms] [drawCalled = ${this.#renderCount}] [els: ${document.getElementsByTagName("*").length}] [pool: ${this.poolSize}]`;
  // }

  render(vs: ViewState): void {
    if (!this.data) throw new Error("Data is not set!");
    this.#renderCount++;

    const numDataColsVisible = vs.x1 - vs.x0;
    const numDataRowsVisible = vs.y1 - vs.y0;

    const layout = this.layout as StandardLayout;

    this.#updateVirtualPanel(vs);
    const sliceData = this.data.getSlice(vs.x0, vs.y0, vs.x1, vs.y1);
    const regions = layout.calculateLayout(vs);
    const template = layout.getGridTemplate(
      layout.numRowFacets,
      layout.numColFacets,
      numDataColsVisible,
      numDataRowsVisible
    );
    this.#setGridTemplate(template.columns, template.rows);

    // 5. Begin render cycle
    this.beginRender();

    // 6. Calculate facet positions for sticky headers
    const { rowFacetsLeftPositions, colFacetsTopPositions } = this.#calculateFacetPositions();

    // 7. Create render context for regions
    const ctx: RegionRenderContext = {
      container: this.#con,
      cellPool: this.cellPool,
      activeCells: this.activeCells,
      markKeyUsed: (key) => this.markKeyUsed(key),
      registerCell: (key, cell) => this.registerCell(key, cell)
    };

    // 8. Render each region
    for (const region of regions) {
      const renderData: RegionRenderData = {
        sliceData,
        region,
        numRowFacets: layout.numRowFacets,
        numColFacets: layout.numColFacets,
        viewportX0: vs.x0,
        viewportY0: vs.y0,
        rowHeight: layout.getRowHeight("data"),
        rowFacetsLeftPositions,
        colFacetsTopPositions
      };

      switch (region.type) {
      case "corner":
        this.#cornerRegion.render(ctx, renderData);
        break;
      case "colFacet":
        this.#colFacetRegion.render(ctx, renderData);
        break;
      case "rowFacet":
        this.#rowFacetRegion.render(ctx, renderData);
        break;
      case "values":
        this.#valueRegion.render(ctx, renderData);
        break;
      }
    }

    // 9. End render cycle - cleanup unused cells
    this.endRender(this.#con);

    // 10. Measure cells for auto-sizing
    this.#measureCells();

    // 11. Setup scroll listener
    this.#setupScrollListener();

    // 12. Debug info
    // this.#debugInfo(performance.now() - startTime);
  }
}
