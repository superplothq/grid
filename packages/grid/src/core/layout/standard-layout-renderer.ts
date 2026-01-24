import {GridConfig} from "../../config";
import {ViewState} from "../../types";
import {PLayout} from "../layout-proto";
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

class CellPool {
  #pool: HTMLElement[] = [];

  acquire(): HTMLElement {
    if (this.#pool.length > 0) {
      return this.#pool.pop()!;
    }
    const cell = document.createElement("div");
    cell.className = "cell";
    return cell;
  }

  release(cell: HTMLElement): void {
    cell.className = "cell";
    cell.style.cssText = "";
    cell.textContent = "";
    this.#pool.push(cell);
  }

  get size(): number {
    return this.#pool.length;
  }
}

export default class StandardLayoutRenderer extends PRenderer {
  #con: HTMLElement;
  #virtualPanelEl: HTMLElement;
  #gridClipEl: HTMLElement;
  #scrollRAF: number | null = null;
  #scrollListenerSet = false;
  #renderCount = 0;
  #layoutBootstrapped = false;

  #cellPool: CellPool = new CellPool();
  #activeCells: Map<string, HTMLElement> = new Map();
  #usedKeys: Set<string> = new Set();
  #cellsToMeasure: CellToMeasure[] = [];
  #postRenderAdjustCellsPerLevel: HTMLElement[][] = [];

  constructor(config: GridConfig, mountPoint: HTMLElement, layout: PLayout) {
    super(config, mountPoint, layout);

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

  #placeCellInDom(opts: {
    key: string;
    sizeKey: number;
    content: string;
    cls: string;
    gridRow: number;
    gridCol: number;
    extraStyles: {
      colspan?: number;
      rowspan?: number;
      top?: number;
      left?: number;
      transform?: string;
    };
  }): [HTMLElement, boolean] {
    this.#usedKeys.add(opts.key);
    let cell = this.#activeCells.get(opts.key);
    let needAppend = false;
    if (!cell) {
      cell = this.#cellPool.acquire();
      this.#activeCells.set(opts.key, cell);
      // this.#con.appendChild(cell);
      needAppend = true;
    }

    cell.textContent = opts.content;
    cell.className = "cell " + opts.cls;
    cell.style.gridColumn = opts.extraStyles.colspan
      ? `${opts.gridCol} / span ${opts.extraStyles.colspan}`
      : `${opts.gridCol}`;
    cell.style.gridRow = opts.extraStyles.rowspan
      ? `${opts.gridRow} / span ${opts.extraStyles.rowspan}`
      : `${opts.gridRow}`;

    if (opts.extraStyles.top !== undefined) {
      cell.style.top = `${opts.extraStyles.top}px`;
    }
    if (opts.extraStyles.left !== undefined) {
      cell.style.left = `${opts.extraStyles.left}px`;
    }
    if (opts.extraStyles.transform !== undefined) {
      cell.style.transform = opts.extraStyles.transform;
    }

    const isMerged = (opts.extraStyles.colspan && opts.extraStyles.colspan > 1) ||
                     (opts.extraStyles.rowspan && opts.extraStyles.rowspan > 1);
    if (opts.sizeKey !== undefined && !isMerged) {
      this.#cellsToMeasure.push({ cell, sizeKey: opts.sizeKey });
    }

    return [cell, needAppend];
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

    this.#usedKeys.clear();
    this.#cellsToMeasure = [];

    for (let i = 0; i < layout.numRowFacets; i++) {
      this.#postRenderAdjustCellsPerLevel.push([]);
    }

    let nodeAppendList = [];
    for (let hRow = 0; hRow < layout.numColFacets; hRow++) {
      for (let hCol = 0; hCol < layout.numRowFacets; hCol++) {
        const key = `corner-${hRow}-${hCol}`;
        const cell = this.#placeCellInDom({
          key,
          gridRow: hRow + 1,
          gridCol: hCol + 1,
          content: "",
          cls: `corner level-${hRow}${hCol === layout.numRowFacets - 1 ? " edge-r" : ""}${hRow === layout.numColFacets - 1 ? " edge-b" : ""}`,
          sizeKey: hCol,
          extraStyles: {
            top: vs.colFacetsTopPositions[hRow],
            left: vs.rowFacetsLeftPositions[hCol],
          },
        });
        cell[1] && nodeAppendList.push(cell[0]);
        this.#postRenderAdjustCellsPerLevel[hCol].push(cell[0]);
      }
    }

    let merges = this.#computeMerges(layout.numColFacets, numDataColsVisible, sliceData.columnFacets!);
    for (const merge of merges) {
      const key = `col-h-${merge.level}-${vs.x0 + merge.start}`;
      const sizeKey = layout.numRowFacets + vs.x0 + merge.start;
      const cell = this.#placeCellInDom({
        key,
        gridRow: merge.level + 1,
        gridCol: layout.numRowFacets + merge.start + 1,
        content: merge.value,
        cls: `col-header level-${merge.level}`,
        sizeKey,
        extraStyles: {
          colspan: merge.span,
          top: vs.colFacetsTopPositions[merge.level],
        },
      });
      cell[1] && nodeAppendList.push(cell[0]);
    }

    merges.length = 0;
    merges = this.#computeMerges(layout.numRowFacets, numDataRowsVisible, sliceData.rowFacets!);
    for (const merge of merges) {
      const key = `row-h-${merge.level}-${vs.y0 + merge.start}`;
      const cell = this.#placeCellInDom({
        key,
        gridRow: layout.numColFacets + merge.start + 1,
        gridCol: merge.level + 1,
        content: merge.value,
        cls: `row-header level-${merge.level}`,
        sizeKey: merge.level,
        extraStyles: {
          rowspan: merge.span,
          left: vs.rowFacetsLeftPositions[merge.level],
          transform: merge.level === sliceData.rowFacets![0].length - 1 ? "" : "translate(0, calc(var(--offset-y)))",
        },
      });
      cell[1] && nodeAppendList.push(cell[0]);
      this.#postRenderAdjustCellsPerLevel[merge.level].push(cell[0]);
    }

    for (let i = 0; i < numDataColsVisible; i++) {
      const colData = sliceData.data ? sliceData.data[i] ?? [] : [];
      const gridCol = layout.numRowFacets + i + 1;
      const sizeKey = layout.numRowFacets + vs.x0 + i;

      for (let j = 0; j < numDataRowsVisible; j++) {
        const key = `data-${vs.x0 + i}-${vs.y0 + j}`;
        const value = colData[j] ?? "";
        const cell =  this.#placeCellInDom({
          key,
          gridRow: layout.numColFacets + j + 1,
          gridCol,
          content: String(value),
          cls: "data",
          sizeKey,
          extraStyles: {},
        });
        cell[1] && nodeAppendList.push(cell[0]);
      }
    }

    // append all cells to the DOM in one go
    this.#con.append(...nodeAppendList);

    for (const [key, cell] of this.#activeCells) {
      if (!this.#usedKeys.has(key)) {
        this.#con.removeChild(cell);
        this.#cellPool.release(cell);
        this.#activeCells.delete(key);
      }
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
