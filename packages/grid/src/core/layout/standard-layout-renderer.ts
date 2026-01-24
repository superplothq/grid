import {GridConfig} from "../../config";
import {ViewState} from "../../types";
import CellManager from "../cell-manager";
import {PLayout} from "../layout-proto";
import {WithCellPlacement} from "../renderer-base";
import {PRenderer} from "../renderer-proto";
import {gridCss, gridShadowElsStyle} from "./grid-css.tmp";
import StandardLayout from "./standard-layout";

interface MergeState {
  value: string | null;
  start: number;
  span: number;
}

interface CellToMeasure {
  cell: HTMLElement;
  sizeKey: number;
}

const StandardLayoutRendererBase = WithCellPlacement(PRenderer);

export default class StandardLayoutRenderer extends StandardLayoutRendererBase {
  #con: HTMLElement;
  #virtualPanelEl: HTMLElement;
  #gridClipEl: HTMLElement;
  #scrollRAF: number | null = null;
  #scrollListenerSet = false;
  #renderCount = 0;
  #layoutBootstrapped = false;

  #cellsToMeasure: CellToMeasure[] = [];
  #postRenderAdjustCellsPerLevel: HTMLElement[][] = [];

  constructor(config: GridConfig, mountPoint: HTMLElement, layout: PLayout, cellManager: CellManager) {
    super(config, mountPoint, layout, cellManager);

    [this.#con, , this.#virtualPanelEl, this.#gridClipEl] = this.#attachShadowDom();

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

  #autosizeCells(): void {
    if (this.#cellsToMeasure.length === 0) return;

    const layout = this.layout as StandardLayout;
    const indices: number[] = [];

    for (const { cell, sizeKey } of this.#cellsToMeasure) {
      const width = cell.getBoundingClientRect().width;
      if (!width) continue;
      if (width > (indices[sizeKey] || 0)) {
        indices[sizeKey] = width;
      }
    }

    for (let i = 0; i < indices.length; i++) {
      if (indices[i] === undefined) continue;
      layout.colsWidth.indices[i] = indices[i];
    }

    this.#cellsToMeasure = [];
  }

  #computeMerges(
    facetCount: number,
    itemCount: number,
    facets: string[][]
  ): Array<{ level: number; value: string; start: number; span: number }> {
    const results: Array<{ level: number; value: string; start: number; span: number }> = [];
    const mergeState: MergeState[] = [];

    for (let level = 0; level < facetCount; level++) {
      mergeState[level] = { value: null, start: 0, span: 0 };
    }

    for (let i = 0; i < itemCount; i++) {
      const facet = facets[i] || [];
      for (let level = 0; level < facetCount; level++) {
        const value = facet[level] || "";
        const state = mergeState[level];

        if (value === state.value && i > 0) {
          state.span++;
        } else {
          if (state.span > 0) {
            results.push({
              level,
              value: state.value as string,
              start: state.start,
              span: state.span
            });
          }
          state.value = value;
          state.start = i;
          state.span = 1;
        }
      }
    }

    for (let level = 0; level < facetCount; level++) {
      const state = mergeState[level];
      if (state.span > 0) {
        results.push({
          level,
          value: state.value as string,
          start: state.start,
          span: state.span
        });
      }
    }

    return results;
  }

  #onLayoutBootstrap(vs: ViewState): void {
    this.#updateVirtualPanel(vs);

    for (let i = 0; i < this.#postRenderAdjustCellsPerLevel.length; i++) {
      const cells = this.#postRenderAdjustCellsPerLevel[i];
      for (let j = 0; j < cells.length; j++) {
        const cell = cells[j];
        cell.style.left = `${vs.rowFacetsLeftPositions[i]}px`;
      }
    }
  }

  render(vs: ViewState): void {
    if (!this.data) throw new Error("Data is not set!");
    this.#renderCount++;

    const numDataColsVisible = vs.x1 - vs.x0;
    const numDataRowsVisible = vs.y1 - vs.y0;

    const layout = this.layout as StandardLayout;

    this.#updateVirtualPanel(vs);
    const sliceData = this.data.getSlice(vs.x0, vs.y0, vs.x1, vs.y1);

    const template = layout.getGridTemplate(
      layout.numRowFacets,
      layout.numColFacets,
      numDataColsVisible,
      numDataRowsVisible
    );
    this.#con.style.gridTemplateColumns = template.columns;
    this.#con.style.gridTemplateRows = template.rows;

    this.cellManager.beginFrame();
    this.#cellsToMeasure = [];

    for (let i = 0; i < layout.numRowFacets; i++) {
      this.#postRenderAdjustCellsPerLevel.push([]);
    }

    let nodeAppendList = [];
    for (let hRow = 0; hRow < layout.numColFacets; hRow++) {
      for (let hCol = 0; hCol < layout.numRowFacets; hCol++) {
        const key = `corner-${hRow}-${hCol}`;
        const [cell, needAppend] = this.placeCellInDom({
          key,
          gridRow: hRow + 1,
          gridCol: hCol + 1,
          content: "",
          cls: `corner level-${hRow}${hCol === layout.numRowFacets - 1 ? " edge-r" : ""}${hRow === layout.numColFacets - 1 ? " edge-b" : ""}`,
          extraStyles: {
            top: vs.colFacetsTopPositions[hRow],
            left: vs.rowFacetsLeftPositions[hCol],
          },
        });
        needAppend && nodeAppendList.push(cell);
        this.#cellsToMeasure.push({ cell, sizeKey: hCol });
        this.#postRenderAdjustCellsPerLevel[hCol].push(cell);
      }
    }

    let merges = this.#computeMerges(layout.numColFacets, numDataColsVisible, sliceData.columnFacets!);
    for (const merge of merges) {
      const key = `col-h-${merge.level}-${vs.x0 + merge.start}`;
      const sizeKey = layout.numRowFacets + vs.x0 + merge.start;
      const colspan = merge.span;
      const [cell, needAppend] = this.placeCellInDom({
        key,
        gridRow: merge.level + 1,
        gridCol: layout.numRowFacets + merge.start + 1,
        content: merge.value,
        cls: `col-header level-${merge.level}`,
        extraStyles: {
          colspan,
          top: vs.colFacetsTopPositions[merge.level],
        },
      });
      needAppend && nodeAppendList.push(cell);
      if (!(colspan && colspan > 1)) {
        this.#cellsToMeasure.push({ cell, sizeKey });
      }
    }

    merges.length = 0;
    merges = this.#computeMerges(layout.numRowFacets, numDataRowsVisible, sliceData.rowFacets!);
    for (const merge of merges) {
      const key = `row-h-${merge.level}-${vs.y0 + merge.start}`;
      const [cell, needAppend] = this.placeCellInDom({
        key,
        gridRow: layout.numColFacets + merge.start + 1,
        gridCol: merge.level + 1,
        content: merge.value,
        cls: `row-header level-${merge.level}`,
        extraStyles: {
          rowspan: merge.span,
          left: vs.rowFacetsLeftPositions[merge.level],
          transform: merge.level === sliceData.rowFacets![0].length - 1 ? "" : "translate(0, calc(var(--offset-y)))",
        },
      });
      needAppend && nodeAppendList.push(cell);
      this.#cellsToMeasure.push({ cell, sizeKey: merge.level });
      this.#postRenderAdjustCellsPerLevel[merge.level].push(cell);
    }

    for (let i = 0; i < numDataColsVisible; i++) {
      const colData = sliceData.data ? sliceData.data[i] ?? [] : [];
      const gridCol = layout.numRowFacets + i + 1;
      const sizeKey = layout.numRowFacets + vs.x0 + i;

      for (let j = 0; j < numDataRowsVisible; j++) {
        const key = `data-${vs.x0 + i}-${vs.y0 + j}`;
        const value = colData[j] ?? "";
        const [cell, needAppend] = this.placeCellInDom({
          key,
          gridRow: layout.numColFacets + j + 1,
          gridCol,
          content: String(value),
          cls: "data",
          extraStyles: {},
        });
        needAppend && nodeAppendList.push(cell);
        this.#cellsToMeasure.push({ cell, sizeKey });
      }
    }

    // append all cells to the DOM in one go
    this.#con.append(...nodeAppendList);

    // endFrame returns cells that were not used this render cycle - remove them from DOM but hold it in the pool
    const cellsToRemove = this.cellManager.endFrame();
    for (const cell of cellsToRemove) {
      this.#con.removeChild(cell);
    }

    this.#autosizeCells();
    this.#setupScrollListener();

    if (!this.#layoutBootstrapped) {
      this.#layoutBootstrapped = true;
      const vsUpdated = this.layout.calculateViewState();
      this.#onLayoutBootstrap(vsUpdated);
    }

    this.#postRenderAdjustCellsPerLevel.length = 0;
  }
}
