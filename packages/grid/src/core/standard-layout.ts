import { GridConfig } from "../config";
import { GridDataViewModel } from "../grid-data-viewmodel";
import { IColAutoSizeStrategyFixedWidth } from "../types";
import {getGridTemplateValsFromEl} from "../utils";
import {
  DiffModelSnapshot,
  EditAction,
  EditEntry,
  FacetMatrixWithFacetCellMap,
  SEPARATOR,
  buildDiffModel,
  buildEditset,
  buildFacetMatrix,
  buildPhasedKeyFrames,
  collectEvacuationKeys,
} from "./animation";
import CellManager from "./cell-manager";
import PLayout, { BaseViewModel, RenderCtx } from "./layout-proto";
import { WithCellPlacement, WithEvents } from "./mixins";

export type LayoutEvents = {
  renderComplete: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
  "debug_perf:metrics": {
    timeToRender: number;
    renderCount: number;
    nodesActive: number;
    nodesAppendedInThisFrame: number;
    nodesDeletedInThisFrame: number;
    contentCellRerenderCount: number;
    poolSize: number;
  };
};

type SelectionProposal = [startRow: number, startCol: number, endRow: number, endCol: number][];

interface ViewModelProposal {
  selections?: SelectionProposal;
}

export interface SelectionState {
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
}

export interface ViewModel extends BaseViewModel {
  offsetX: number;
  offsetY: number;
  totalHeight: number;
  totalWidth: number;
  rowFacetsWidth: number;
  colFacetsHeight: number;
  rowFacetsLeftPositions: number[];
  colFacetsTopPositions: number[];
  selections: SelectionState[];
}

interface MergeState {
  value: string;
  path: string;
  start: number;
  span: number;
}

interface CellToMeasure {
  cell: HTMLElement;
  sizeKey: number;
}

const StandardLayoutBase = WithEvents<LayoutEvents>()(WithCellPlacement(PLayout));

interface ResizeState {
  widthBeforeResize: number;
  currentWidth: number;
  cells: HTMLElement[];
}

type ColSizeState = { indices: number[]; override: number[] };


// TODO unit test this
function computeMerges(facetCount: number, itemCount: number, facets: string[][]): Array<{ level: number; } & MergeState> {
  const results: Array<{ level: number; } & MergeState> = [];
  const mergeState: MergeState[] = [];

  for (let level = 0; level < facetCount; level++) {
    mergeState[level] = { value: "", path: "", start: 0, span: 0 };
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
            path: state.path,
            value: state.value,
            start: state.start,
            span: state.span
          });
        }
        state.path = facet.slice(0, level + 1).join(SEPARATOR);
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
        path: state.path,
        value: state.value,
        start: state.start,
        span: state.span
      });
    }
  }

  return results;
}

export default class StandardLayout extends StandardLayoutBase {
  // all column can be of different sizes hence those are tracked based on column indices
  colsWidth:ColSizeState;
  #resizeState: Map<number, ResizeState> = new Map();
  // facet row and data row can have spearate sizes hence those are tracked
  // based on row type. But then all facet rows would have same size and all
  // data rows would have same size.
  rowHeightByType = {
    facet: 0,
    data: 0,
  }
  #con: HTMLElement;
  #virtualPanelEl: HTMLElement;
  #gridClipEl: HTMLElement;
  #scrollRAF: number | null = null;
  #scrollListenerSet = false;
  #renderCount = 0;
  #layoutBootstrapped;
  #cellsToMeasure: CellToMeasure[] = [];
  #postRenderAdjustCellsPerLevel: HTMLElement[][] = [];
  #proposal: ViewModelProposal = {};
  #prevDiffSnapshot: DiffModelSnapshot | null = null;
  #prevFacetMatrix: FacetMatrixWithFacetCellMap | null = null;
  #runningAnimations: Animation[] = [];
  #evacuatedCells: HTMLElement[] = [];

  constructor(config: GridConfig, mountPoint: HTMLElement, cellManager: CellManager) {
    super(config, mountPoint, cellManager);

    [this.#con, , this.#virtualPanelEl, this.#gridClipEl] = this.#attachShadowDom();
    [this.#layoutBootstrapped, this.colsWidth] = this.#resetAndGetColumnSizeState();
    this.#measureRowHeight();
  }

  viewModelProposal(proposal: ViewModelProposal): void {
    Object.assign(this.#proposal, proposal);
  }

  #resetAndGetColumnSizeState(): [layoutBootstrapped: boolean, colSizeState: ColSizeState] {
    return [false, {
      indices: [],
      override: [],
    }]
  }

  get gridContainer(): HTMLElement {
    return this.#con;
  }

  #attachShadowDom(): HTMLElement[] {
    const el = this.mountPoint;
    el.attachShadow({ mode: "open" });
    el.style.overflow = "auto";
    (el.shadowRoot as ShadowRoot).innerHTML = `
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        /* Virtual scrollable area (creates scrollbar size) */
        .virtual-panel {
          position: absolute;
          top: 0;
          left: 0;
          pointer-events: none;
          z-index: 0;
        }

        /* Visible content clip area - sticks to viewport */
        .grid-clip {
          position: sticky;
          top: 0;
          left: 0;
          overflow: hidden;
          contain: layout style;
          width: 100%;
          height: 100%;
        }
      </style>
      <div class="virtual-panel"></div>
      <div class="grid-clip"><slot></slot></div>
    `;

    const con = document.createElement("div");
    con.className = "grid-content";
    el.appendChild(con);

    return [con, ...Array.from(el.shadowRoot!.children)] as HTMLElement[];
  }

  // calculate both facet and data row heights
  // check if both calculation needs to be separated as later on column header can have icons etc.
  #measureRowHeight(): void {
    const facetSample = document.createElement("div");
    facetSample.className = "cell";
    facetSample.style.visibility = "hidden";
    facetSample.textContent = "Mgy$123,456";
    this.#con.appendChild(facetSample);
    this.rowHeightByType.facet = facetSample.getBoundingClientRect().height;
    this.#con.removeChild(facetSample);

    if (!this.data) {
      this.rowHeightByType.data = this.rowHeightByType.facet;
      return;
    }

    const colDefs = this.data.colDefs;
    const measureCells: HTMLElement[] = [];

    for (let col = 0; col < this.data.numCols; col++) {
      const colDef = colDefs[col];
      const cell = document.createElement("div");
      cell.className = "cell data";
      cell.style.visibility = "hidden";
      cell.style.gridRow = "1";
      cell.style.gridColumn = `${col + 1}`;

      if (colDef.cellHeight !== undefined) {
        cell.style.height = `${colDef.cellHeight}px`;
      } else {
        const sampleValue = colDef.sampleData ?? this.data.getSlice(col, 0, col + 1, 1).data?.[0]?.[0];
        const content = colDef.renderer(sampleValue, {});
        this.#setCellContent(cell, content);
      }
      measureCells.push(cell);
    }

    // gridTemplateColumns: max-content ensures columns don't constrain cell width during measurement
    // (which could cause text wrapping and affect height). Row height is found by manually iterating
    // cells and taking the max - we don't need gridTemplateRows: max-content since we need the pixel
    // value anyway for rowHeightByType.data.
    const prevTemplate = this.#con.style.gridTemplateColumns;
    this.#con.style.gridTemplateColumns = `repeat(${this.data.numCols}, max-content)`;
    this.#con.append(...measureCells);

    let maxHeight = 0;
    for (const cell of measureCells) {
      maxHeight = Math.max(maxHeight, cell.getBoundingClientRect().height);
    }
    this.rowHeightByType.data = maxHeight || this.rowHeightByType.facet;

    for (const cell of measureCells) {
      this.#con.removeChild(cell);
    }
    this.#con.style.gridTemplateColumns = prevTemplate;

    console.log(`>>> Measured data row height: ${this.rowHeightByType.data}px facet row height: ${this.rowHeightByType.facet}px`);
  }

  #setCellContent(cell: HTMLElement, content: string | HTMLElement | HTMLElement[]): void {
    if (typeof content === "string") {
      cell.innerHTML = content;
    } else if (Array.isArray(content)) {
      cell.replaceChildren(...content);
    } else {
      cell.replaceChildren(content);
    }
  }

  #setupScrollListener(): void {
    if (this.#scrollListenerSet) return;
    this.#scrollListenerSet = true;
    this.mountPoint.addEventListener("scroll", () => {
      if (this.#scrollRAF) return;

      this.#scrollRAF = requestAnimationFrame(() => {
        this.#scrollRAF = null;
        const t1 = performance.now();
        const viewModel = this.calculateViewModel();
        this.render(viewModel, {t1});
      });
    });
  }

  getRowHeight(type: "facet" | "data") {
    return this.rowHeightByType[type] || this.config.defaultCellHeight;
  }

  getColumnWidth(index: number) {
    return this.colsWidth.override[index] ?? this.colsWidth.indices[index] ?? this.config.defaultCellWidth;
  }

  getColWidthTillIdx(idx: number): number {
    let rowFacetsWidth = 0;
    for (let i = 0; i < idx; i++) {
      rowFacetsWidth += this.getColumnWidth(i);
    }
    return rowFacetsWidth;
  }

  calcNumVisibleColumns(startCol: number, viewWidth: number, rowHeaderCount: number) {
    let width = 0;
    let count = 0;

    while (width < viewWidth && startCol + count < this.data!.numCols) {
      width += this.getColumnWidth(rowHeaderCount + startCol + count);
      count++;
    }

    return count + this.config.overscan;
  }

  setData(data: GridDataViewModel): void {
    super.setData(data);
    [this.#layoutBootstrapped, this.colsWidth] = this.#resetAndGetColumnSizeState();
    this.#measureRowHeight();
  }

  calculateVerticalViewModel() {
    const scrollTop = this.mountPoint.scrollTop;
    const viewHeight = this.mountPoint.clientHeight;

    // if there are 3 header facets then there would be 3 rows created for it
    // hence that's the total height of header
    const heightPerFacetRow = this.rowHeightByType.facet;
    const colFacetsHeight = this.data!.numColFacetLevels * heightPerFacetRow;
    const dataHeight = this.data!.numRows * this.rowHeightByType.data;
    // total width of the grid if it was rendered fully
    // this value will be used to calculate scroll position there by setting dimension of virtual-panel
    const totalHeight = colFacetsHeight + dataHeight;

    // Row range calculation
    // totalHeight <- full data height if it was rendered
    // viewHeight <- viewport height i.e. grid-content container height
    const scrollableHeight = Math.max(1, totalHeight - viewHeight);
    const scrollPercent = Math.min(1, scrollTop / scrollableHeight);
    const visibleDataHeight = viewHeight - colFacetsHeight;

    // scrollableRows is the maximum possible starting row.
    // Imagine the viewport scrolls from 0th row to xth row. Here we are trying to find x.
    //
    // Example: 100 total rows, 10 fit in view
    // scrollableRows = 100 - 10 = 90 → the start row can range from 0 to 90
    // When at row 90, rows 90–99 are visible (the last 10)
    //
    // The formula: startRowFloat = scrollableRows × scrollPercent
    // scrollPercent   startRowFloat   Visible rows
    // 0 (top)         90 × 0 = 0       0–9
    // 0.5 (middle)    90 × 0.5 = 45   45–54
    // 1 (bottom)      90 × 1 = 90     90–99
    // It's mapping the scroll percentage (0–1) to the valid range of starting rows (0–90).
    const scrollableRows  = Math.max(0, this.data!.numRows - Math.floor(visibleDataHeight / this.rowHeightByType.data));

    const startRowFloat = scrollableRows * scrollPercent;
    const startRow = Math.floor(startRowFloat);
    const visibleRows = Math.ceil(visibleDataHeight / this.rowHeightByType.data) + this.config.overscan;
    const endRow = Math.min(this.data!.numRows, startRow + visibleRows);
    const offsetY = (startRowFloat - startRow) * this.rowHeightByType.data;

    const colFacetsTopPositions: number[] = [];
    const facetRowHeight = this.getRowHeight("facet");
    for (let i = 0; i < this.data!.numColFacetLevels; i++) {
      colFacetsTopPositions.push(i * facetRowHeight);
    }

    return {
      startRowFloat,
      startRow,
      endRow,
      totalHeight,
      colFacetsHeight,
      offsetY,
      colFacetsTopPositions
    }
  }

  calculateHorizontalViewModel() {
    const scrollLeft = this.mountPoint.scrollLeft;
    const viewWidth = this.mountPoint.clientWidth;

    // TODO[improvment]
    //   rf11 rf12 rf13 ... ...
    //   ____ ____ rf23 ... ...
    //   ____ rf12 rf33 ... ...
    //   ____ ____ rf43 ... ...
    //   1. For config like this if rf12 is overflowing it can wrap it's content
    //   2. Individual row facet might have it's own maxWidth
    const rowFacetsWidth = this.getColWidthTillIdx(this.data!.numRowFacetLevels);
    const totalWidth = this.getColWidthTillIdx(this.data!.numRowFacetLevels + this.data!.numCols);
    const scrollableWidth = Math.max(1, totalWidth - viewWidth);
    const scrollPercentX = Math.min(1, scrollLeft / scrollableWidth);
    /*
     * Calculate max scroll column
     * This calculates the maximum starting column when fully scrolled right (like scrollableRows for columns).
     * similar to row: we are trying to find the 0 the xth column till where the scrolling would happen.
     * This calculation happens from right to left
     *
     *    ───────────────────────── 110
     *    ··································· 160
     *       1          2         3       4
     *    ┌──────┬────────────┬─────────┬────┐
     *    │      │            │         │    │
     *    │      │            │         │    │
     *    │    30│          60│       50│  20│
     *    │      │            │         │    │
     *    │      │            │         │    │
     *    └──────┴────────────┴─────────┴────┘
     *                                   ····· 20
     *                        ················ 70
     *           ····························· 130 (col_4 + col_3 + col_2) = maxScrollWidth
     *              ───────────────────────── 110 = visibleDataWidth
     * Here we do the fractional col calculation till where the last column touches edge of the viewport.
     * in that case it's maxScrollWidth - visibleDataWidth = fraction of column (col_2) if scrolled to the
     * the last column's right edge touches viewport.
     * Convert it to fraction and add it to previous column
     */
    const visibleDataWidth = viewWidth - rowFacetsWidth;
    let maxScrollWidth = 0;
    let maxScrollCol = this.data!.numCols;
    let lastColWidth = -1;
    while (maxScrollWidth < visibleDataWidth && maxScrollCol > 0) {
      maxScrollCol--;
      lastColWidth =  this.getColumnWidth(this.data!.numRowFacetLevels + maxScrollCol);
      maxScrollWidth += lastColWidth;
    }
    maxScrollCol = Math.min(this.data!.numCols - 1, maxScrollCol + ((maxScrollWidth - visibleDataWidth)) / lastColWidth);

    const startColFloat = maxScrollCol * scrollPercentX;
    const startCol = Math.floor(startColFloat);
    const visibleCols = this.calcNumVisibleColumns(startCol, visibleDataWidth, this.data!.numRowFacetLevels);
    const endCol = Math.min(this.data!.numCols, startCol + visibleCols);

    const startColWidth = this.getColumnWidth(this.data!.numRowFacetLevels + startCol);
    const offsetX = (startColFloat - startCol) * startColWidth;

    const rowFacetsLeftPositions = [0];
    for (let i = 0; i < this.data!.numRowFacetLevels - 1; i++) {
      rowFacetsLeftPositions.push(
        rowFacetsLeftPositions[i] + this.getColumnWidth(i)
      );
    }

    return {
      startColFloat,
      startCol,
      endCol,
      totalWidth,
      rowFacetsWidth,
      offsetX,
      rowFacetsLeftPositions
    }
  }

  calculateViewModel(): ViewModel {
    if (!this.data) throw new Error("Data is not set!");

    const vsVertical = this.calculateVerticalViewModel();
    const vsHorizontal = this.calculateHorizontalViewModel();

    // Resolve selections from proposal
    const selections: SelectionState[] = [];
    const selProp = this.#proposal.selections || [];
    for (const [startRow, startCol, endRow, endCol] of selProp) {
      selections.push({
        fromRow: startRow,
        fromCol: startCol,
        toRow: Math.min(endRow, this.data.numRows - 1),   // Resolve Infinity
        toCol: Math.min(endCol, this.data.numCols - 1),   // Resolve Infinity
      });
    }

    return {
      x0: vsHorizontal.startCol,
      y0: vsVertical.startRow,
      x1: vsHorizontal.endCol,
      y1: vsVertical.endRow,
      offsetX: vsHorizontal.offsetX,
      offsetY: vsVertical.offsetY,
      totalHeight: vsVertical.totalHeight,
      totalWidth: vsHorizontal.totalWidth,
      rowFacetsWidth: vsHorizontal.rowFacetsWidth,
      colFacetsHeight: vsVertical.colFacetsHeight,
      rowFacetsLeftPositions: vsHorizontal.rowFacetsLeftPositions,
      colFacetsTopPositions: vsVertical.colFacetsTopPositions,
      selections,
    }
  }

  getGridTemplate(
    numRowFacets: number,
    numColFacets: number,
    numDataCols: number,
    numDataRows: number
  ): { columns: string; rows: string } {
    return {
      columns: `repeat(${numRowFacets + numDataCols}, max-content)`,
      rows: `repeat(${numColFacets}, ${this.rowHeightByType.facet}px) repeat(${numDataRows}, ${this.rowHeightByType.data}px)`,
    };
  }

  #updateVirtualPanel(vs: ViewModel): void {
    this.#virtualPanelEl.style.width = `${vs.totalWidth}px`;
    this.#virtualPanelEl.style.height = `${vs.totalHeight}px`;
    this.#con.style.setProperty("--offset-x", `${vs.offsetX}px`);
    this.#con.style.setProperty("--offset-y", `${vs.offsetY}px`);
  }

  #autosizeCells(): void {
    if (this.#cellsToMeasure.length === 0) return;

    const indices: number[] = [];

    for (const { cell, sizeKey } of this.#cellsToMeasure) {
      const width = cell.getBoundingClientRect().width;
      if (!width) continue;
      // sizeKey is the index of the column facet for the leaf column facet level (for which the data cells are aligned)
      // For one column - calculate the max width of all the data cells in the column as that'd be the width of the column
      if (width > (indices[sizeKey] || 0)) {
        indices[sizeKey] = width;
      }
    }

    for (let i = 0; i < indices.length; i++) {
      if (indices[i] === undefined) continue;
      this.colsWidth.indices[i] = indices[i];
    }

    this.#cellsToMeasure = [];
  }

  #onLayoutBootstrap(viewModel: ViewModel): void {
    this.#updateVirtualPanel(viewModel);

    for (let i = 0; i < this.#postRenderAdjustCellsPerLevel.length; i++) {
      const cells = this.#postRenderAdjustCellsPerLevel[i];
      for (let j = 0; j < cells.length; j++) {
        const cell = cells[j];
        cell.style.left = `${viewModel.rowFacetsLeftPositions[i]}px`;
      }
    }
  }

  async render(viewModel: ViewModel, ctx: RenderCtx): Promise<void> {
    if (!this.data) throw new Error("Data is not set!");
    this.#renderCount++;

    const shouldAnimate = ctx.animate === true && this.#prevDiffSnapshot !== null && this.#prevFacetMatrix !== null;
    // Pre render phase to calculate details before it can be animated
    let colEditset: EditEntry[] | null = null;
    let rowEditset: EditEntry[] | null = null;
    let hasAnimatable = false;

    // TODO if facet levels are not equal, then don't do animation as it'll be very confusing
    //
    // Calculte bunch of details before the render function draws the new layout. This is not FLIP sytle animation.
    // We draw the new layout with deleted columns / rows inserted then animate the deleted columns from width -> 0px
    // (slide out) and animate the inserted columns from 0px -> width
    // The detection of what needs to be animated is done automatically (right now it's columns / rows anaimation
    // including facets).
    if (shouldAnimate) {
      for (const anim of this.#runningAnimations) anim.cancel();
      this.#runningAnimations.length = 0;

      // Generates the model based on which diff will be calculated (previous render vs current render) - this diff is
      // used to animate the columns / rows
      const newColKeysOnly = buildDiffModel({
        fromPtr: viewModel.x0,
        toPtr: viewModel.x1,
        levels: this.data!.numColFacetLevels,
        getFacetValue: (level: number, idx: number) => this.data!.getColFacetValue(level, idx),
      });
      const newRowKeysOnly = buildDiffModel({
        fromPtr: viewModel.y0,
        toPtr: viewModel.y1,
        levels: this.data!.numRowFacetLevels,
        getFacetValue: (level: number, idx: number) => this.data!.getRowFacetValue(level, idx),
      });

      // editSet is an (LCS) edit script that transfroms old facet config -> new facet config
      // Hence this set contains information about per facet KEEP / DELETE / INSERT in ordered fashion
      colEditset = buildEditset(this.#prevDiffSnapshot!.columns, newColKeysOnly);
      rowEditset = buildEditset(this.#prevDiffSnapshot!.rows, newRowKeysOnly);

      hasAnimatable = colEditset.some(e => e.action !== EditAction.KEEP) || rowEditset.some(e => e.action !== EditAction.KEEP);
      if (hasAnimatable) {
        // Keep the deleted elements in dom by taking ownership of cells out of cell manager (evac) and later deleteing
        // those cells on complete of animation
        //
        // TODO what happens when a full facet gets deleted (let's say level1 facet)? - does it contain evackeys for 
        // non leaf facets.
        const colEvac = collectEvacuationKeys({ editset: colEditset, matrix: this.#prevFacetMatrix!, axis: "col" });
        const rowEvac = collectEvacuationKeys({ editset: rowEditset, matrix: this.#prevFacetMatrix!, axis: "row" });
        for (const group of [...colEvac, ...rowEvac]) {
          for (const cellKey of group.cellKeys) {
            let el = this.cellManager.evacuate(cellKey);
            if (!el) {
              // This happens when the cell is already evacuated. Think about a case where a row and cols got deleted in
              // the same time and the element in the intersection of deleted rows and cols would be returned twice (by colEvac
              // as well as rowEvac), hence it'll be evacuated twice.
              // When this happens element won't be present in cellManager then we would find that element in the list
              // of evacuated cells.
              el = this.#evacuatedCells.find(cell => cell.dataset.cellKey === cellKey)!;
              el.dataset[`${group.axis}FacetPathKey`] = group.facetPathKey;
              continue;
            } else {
              el.dataset.cellKey = cellKey;
              el.dataset[`${group.axis}FacetPathKey`] = group.facetPathKey;
            }
            el.dataset.evac = "1";
            this.#evacuatedCells.push(el);
          }
        }
      }
    }

    const numDataColsVisible = viewModel.x1 - viewModel.x0;
    const numDataRowsVisible = viewModel.y1 - viewModel.y0;

    this.#updateVirtualPanel(viewModel);
    const sliceData = this.data.getSlice(viewModel.x0, viewModel.y0, viewModel.x1, viewModel.y1);

    const template = this.getGridTemplate(
      this.data!.numRowFacetLevels,
      this.data!.numColFacetLevels,
      numDataColsVisible,
      numDataRowsVisible
    );
    this.#con.style.gridTemplateColumns = template.columns;
    this.#con.style.gridTemplateRows = template.rows;

    this.cellManager.beginFrame();
    this.#cellsToMeasure = [];

    for (let i = 0; i < this.data!.numRowFacetLevels; i++) {
      this.#postRenderAdjustCellsPerLevel.push([]);
    }
    let nodeAppendList = [];

    // render corner cells which results from intersection of row and column facets
    for (let hRow = 0; hRow < this.data!.numColFacetLevels; hRow++) {
      for (let hCol = 0; hCol < this.data!.numRowFacetLevels; hCol++) {
        const key = `corner-${hRow}-${hCol}`;
        const [cell, needAppend] = this.placeCellInDom({
          key,
          gridRow: hRow + 1,
          gridCol: hCol + 1,
          content: "",
          cls: `corner level-${hRow}${hCol === this.data!.numRowFacetLevels - 1 ? " edge-r" : ""}${hRow === this.data!.numColFacetLevels - 1 ? " edge-b" : ""}`,
          extraStyles: {
            top: viewModel.colFacetsTopPositions[hRow],
            left: viewModel.rowFacetsLeftPositions[hCol],
          },
        });
        cell.dataset.cellType = "corner";
        needAppend && nodeAppendList.push(cell);
        this.#cellsToMeasure.push({ cell, sizeKey: hCol });
        this.#postRenderAdjustCellsPerLevel[hCol].push(cell);
      }
    }

    // render column facets
    const colDefs = this.data!.colDefs;
    // Horizontal sticky scrolling for non leaf column facets are applied after auto sizing, hence here we store the
    // value for which sticky scrolling should be applied.
    const nonLeafColFacets: { cell: HTMLElement; mergeStart: number; mergeSpan: number }[] = [];

    let merges = computeMerges(this.data!.numColFacetLevels, numDataColsVisible, sliceData.columnFacets!);
    const colFacetPathToCellMap = new Map<string, string>();
    for (const merge of merges) {
      const colIndex = viewModel.x0 + merge.start;
      // TODO[1]
      const colDef = colDefs[colIndex];
      const skipSizeClass = colDef.colSize.excludeColumnFacets ? " skp-sz" : "";
      const absoluteColIndex = this.data!.numRowFacetLevels + colIndex;
      const key = `col-h-${merge.level}-${absoluteColIndex}`;
      colFacetPathToCellMap.set(merge.path, key);
      const colspan = merge.span;

      const isLeafLevel = merge.level === this.data!.numColFacetLevels - 1;
      const shouldApplyWidth = isLeafLevel && colspan === 1 && !colDef.colSize.excludeColumnFacets && colDef.colSize.strategy === "fixed-width";
      const fixedSize = shouldApplyWidth ? colDef.colSize as IColAutoSizeStrategyFixedWidth : null;

      const [cell, needAppend] = this.placeCellInDom({
        key,
        gridRow: merge.level + 1,
        gridCol: this.data!.numRowFacetLevels + merge.start + 1,
        content: `<span class="content">${merge.value}</span>`,
        cls: `col-header level-${merge.level}${skipSizeClass}${!isLeafLevel ? " non-leaf" : ""}`,
        extraStyles: {
          colspan,
          top: viewModel.colFacetsTopPositions[merge.level],
          ...(fixedSize?.widthInPx !== undefined && { width: fixedSize.widthInPx }),
          ...(fixedSize?.minWidthInPx !== undefined && { minWidth: fixedSize.minWidthInPx }),
          ...(fixedSize?.maxWidthInPx !== undefined && { maxWidth: fixedSize.maxWidthInPx }),
        },
      });
      if (!isLeafLevel) {
        nonLeafColFacets.push({ cell, mergeStart: merge.start, mergeSpan: merge.span });
      }
      cell.dataset.path = merge.path;
      cell.dataset.cellType = "column-facet";
      cell.dataset.facetLevel = String(merge.level);
      // For a nested column facet which is not at the last level (not leaf nodes), hix is the rightmost column index
      // [f0_0, f0_0, f0_0, f0_0, f1_1, f1_1, f1_1, f1_1]
      // [f1_0, f1_0, f1_1, f1_1, f1_0, f1_0, f1_1, f1_1]
      // [f2_0, f2_1, f2_0, f2_1, f2_0, f2_1, f2_0, f2_1]
      // Gets rendered as:
      // | ----------- f0_0--------- | ----------- f0_1--------- |  <- level=0
      // | -- f1_0 --  | -- f1_1 --  | -- f1_0 --  | -- f1_1 --  |  <- level=1
      // | f2_0 | f2_1 | f2_0 | f2_1 | f2_0 | f2_1 | f2_0 | f2_1 |  <- level=2 / leaf nodes
      // here hix attach to dom node
      //   0       1      2       3     4       5     6      7      <- level=2 / leaf nodes
      //           1              3             5            7      <- level=1
      //                          3                          7      <- level=0
      cell.dataset.hix = String(absoluteColIndex + colspan - 1);
      needAppend && nodeAppendList.push(cell);
      if (!(colspan && colspan > 1)) {
        this.#cellsToMeasure.push({ cell, sizeKey: absoluteColIndex });
      }
    }

    // render row facets
    merges.length = 0;
    merges = computeMerges(this.data!.numRowFacetLevels, numDataRowsVisible, sliceData.rowFacets!);
    const rowFacetPathToCellMap = new Map<string, string>();
    const rowHeight = this.rowHeightByType.data;
    const visibleDataHeight = this.mountPoint.clientHeight - viewModel.colFacetsHeight;
    for (const merge of merges) {
      const isLeaf = merge.level === sliceData.rowFacets![0].length - 1;
      const absoluteStart = viewModel.y0 + merge.start;
      const key = `row-h-${merge.level}-${absoluteStart}`;
      rowFacetPathToCellMap.set(merge.path, key);

      let labelOffset = 0;

      // Sticky label positioning for non-leaf row facet cells.
      //
      // Non-leaf cells span multiple rows. Flexbox (align-items:center) centers the label vertically
      // in the full cell height. But the container height is not equal to the visible area height,
      // making the labels not centered vertically visually. Although wrt flex container it's centered properly.
      //
      // On top of that - while scrolling, transform is applied on the grid container and when
      // transform is reset then grid layout is recalculated as new rows might be added or removed.
      // This behaviour makes label scroll while the transform is applied while scrolling, and then jumped
      // back to grid position when transform is reset and grid layout is recalculated - causing visual jitter.
      //
      // Moreover, since ach cell is independent, they are not in sync (aligned with surrounding facet) causing visual
      // anomalies and additional treatment for matching borders.
      //
      // We compute a translateY offset to keepthe label centered within the visible portion, clamped at cell edges.
      //
      // The cell itself is translated (moving content + borders). To keep horizontal borders aligned with facet-leaf cells,
      // the bottom border is drawn via a ::after pseudo-element that counter-translates using --label-offset CSS var (see grid.less).
      // This is requried to keep the non leaf facet border aligned with the leaf cell borders.
      //
      // Four states of a non-leaf cell:
      //
      // 1. Fully visible (clippedTop=0, clippedBottom=0):
      //    No transform. Label is naturally centered by CSS. Borders align.
      //    Flex center is visual center
      //
      //    ┌─────────── viewport ───────────┐
      //    │                                │
      //    │   ┌── cell ──┐                 │
      //    │   │          │                 │
      //    │   │  label   │ ← centered      │
      //    │   │          │                 │
      //    │   └──────────┘                 │
      //    │                                │
      //    └────────────────────────────────┘
      //
      // 2. Some invisible top (group extends above viewport):
      //    Flex center is ABOVE visual center
      //    Label shifts down to center in the visible portion.
      //
      //    ╔══ cell ══╗  ← above viewport (clippedTop)
      //    ║          ║
      //    ┌────────────────────────────────┐
      //    ║          ║                     │
      //    ║  label   ║ ← shifted down      │
      //    ║          ║                     │
      //    ╚══════════╝                     │
      //    │                                │
      //    └────────────────────────────────┘
      //
      // 3. Some invisible bottom (group extends below viewport):
      //    Flex center is BELOW visual center
      //    Label shifts up to center in the visible portion.
      //
      //    ┌────────────────────────────────┐
      //    │                                │
      //    ╔══ cell ══╗                     │
      //    ║          ║                     │
      //    ║  label   ║ ← shifted up        │
      //    ║          ║                     │
      //    └────────────────────────────────┘
      //    ║          ║  ← below viewport (clippedBottom)
      //    ╚══════════╝
      //
      // 4. Both top and bottom invisible (cell taller than viewport):
      //    Flex center is NOT visual center if clippedTop != clippedBottom
      //    Label centered in the visible data area.
      //
      //    ╔══ cell ══╗  ← above viewport (clippedTop)
      //    ║          ║
      //    ┌────────────────────────────────┐
      //    ║          ║                     │
      //    ║  label   ║ ← centered in view  │
      //    ║          ║                     │
      //    └────────────────────────────────┘
      //    ║          ║  ← below viewport (clippedBottom)
      //    ╚══════════╝
      //
      //  cellHeight          - total pixel height of this merged cell: span * rowHeight
      //                        (as the row is merged and spanned across multiple rows)
      //  cellTopInDataArea   - top edge of cell relative to viewport top of data area.
      //                        Negative when cell starts above the viewport.
      //  cellBottomInDataArea- bottom edge of cell relative to viewport top of data area.
      //                        Values > visibleDataHeight means cell extends below viewport.
      //  clippedTop          - pixels of the cell hidden above viewport (0 if top is visible)
      //  clippedBottom       - pixels of the cell hidden below viewport (0 if bottom is visible)
      //  rawOffset           - The visibleHeight of the cell is (cellHeight - clippedTop - clippedBottom).
      //                        Its center sits at clippedTop + visibleHeight/2 from cell top.
      //                        The label's natural center (from flexbox) is at cellHeight/2.
      //                        Amount of transform requires = The difference between where the label should be
      //                        and where it naturally is: (clippedTop + visibleHeight/2) - cellHeight/2
      //                        which simplifies to (clippedTop - clippedBottom) / 2.
      //                        Positive = push label down (top is clipped), negative = push
      //                        label up (bottom is clipped), zero = fully visible.
      //                        If you look at this calculation - this is calculating how much of the container is
      //                        bleeding outside the visible area and then applying the tranform WRT the current center
      //                        that css flex box computed.
      //  maxOffset           - Now rawOffset takes care of the part where there is uniform bleeding from both top and
      //                        bottom.
      //                        rawOffset alone could push the label outside the cell. Consider
      //                        a 4-row cell where 3 rows are clipped above: rawOffset wants to
      //                        push the label far down, but it can't go past the bottom edge.
      //                        The label occupies ~1 row of height and sits at the cell center.
      //                        The farthest it can travel from center before hitting an edge is
      //                        (span - 1) * rowHeight / 2. This is the clamping bound.
      //  labelOffset         - rawOffset clamped to [-maxOffset, maxOffset] - The expression below does this clamping.
      //                        This is the final value applied as translateY on the cell. Also stored as
      //                        --label-offset CSS var so the ::after border pseudo-element can
      //                        counter-translate to stay aligned with leaf cell borders.
      //
      //  Offset diagrams (4-row cell, rowHeight=30, cellHeight=120):
      //
      //  Case: clipped top (60px above viewport)
      //    clippedTop=60, clippedBottom=0, visibleHeight=60
      //
      //         cell
      //    ┌────────────┐ ─┐
      //    │            │  │ clippedTop=60
      //    │  label(N)  │  │ ← natural center at cellHeight/2 = 60
      //  ──┼────────────┼──┘─── viewport top
      //    │            │  │
      //    │  label(*)  │  │ visibleHeight=60  ← desired center at 60 + 30 = 90
      //    │            │  │
      //    └────────────┘──┘─── viewport bottom
      //
      //    rawOffset  = (60 - 0) / 2 = +30    (push label 30px down from natural center)
      //    maxOffset  = (4-1) * 30 / 2 = 45   (label can travel ±45px from center)
      //    labelOffset = clamp(30, -45, 45) = 30 ✓ within bounds
      //
      //  Case: clipped bottom (60px below viewport)
      //    clippedTop=0, clippedBottom=60, visibleHeight=60
      //
      //         cell
      //    ┌────────────┐──┐─── viewport top
      //    │            │  │
      //    │  label(*)  │  │ visibleHeight=60  ← desired center at 0 + 30 = 30
      //    │            │  │
      //  ──┼────────────┼──┘─── viewport bottom
      //    │  label(N)  │  │ ← natural center at 60
      //    │            │  │ clippedBottom=60
      //    └────────────┘ ─┘
      //
      //    rawOffset  = (0 - 60) / 2 = -30    (push label 30px up from natural center)
      //    maxOffset  = 45
      //    labelOffset = clamp(-30, -45, 45) = -30 ✓ within bounds
      //
      //  Case: clipped both (cell taller than viewport, 60px above, 30px below)
      //    clippedTop=60, clippedBottom=30, visibleHeight=30
      //
      //         cell
      //    ┌────────────┐ ─┐
      //    │            │  │ clippedTop=60
      //    │  label(N)  │  │ ← natural center at 60
      //  ──┼────────────┼──┘─── viewport top
      //    │  label(*)  │  │ visibleHeight=30  ← desired center at 60 + 15 = 75
      //  ──┼────────────┼──┘─── viewport bottom
      //    │            │  │ clippedBottom=30
      //    └────────────┘ ─┘
      //
      //    rawOffset  = (60 - 30) / 2 = +15   (push label 15px down from natural center)
      //    maxOffset  = 45
      //    labelOffset = clamp(15, -45, 45) = 15 ✓ within bounds
      //
      //    If clippedTop were 110 (almost fully scrolled out, only 10px visible at bottom):
      //    rawOffset  = (110 - 0) / 2 = +55   (wants to push 55px down)
      //    maxOffset  = 45                     (but label would exit the cell)
      //    labelOffset = clamp(55, -45, 45) = 45 ← clamped, label sticks near bottom edge
      //
      //  Cells from leaf facets does not require this tereatment as they are not merged cells.
      if (!isLeaf) {
        const cellHeight = merge.span * rowHeight;
        const cellTopInDataArea = merge.start * rowHeight - viewModel.offsetY;
        const cellBottomInDataArea = cellTopInDataArea + cellHeight;

        const clippedTop = Math.max(0, -cellTopInDataArea);
        const clippedBottom = Math.max(0, cellBottomInDataArea - visibleDataHeight);

        const rawOffset = (clippedTop - clippedBottom) / 2;
        const maxOffset = Math.max(0, (merge.span - 1) * rowHeight / 2);
        labelOffset = Math.max(-maxOffset, Math.min(maxOffset, rawOffset));
      }

      const [cell, needAppend] = this.placeCellInDom({
        key,
        gridRow: this.data!.numColFacetLevels + merge.start + 1,
        gridCol: merge.level + 1,
        content: `<span class="content">${merge.value}</span>`,
        cls: `row-header level-${merge.level}${isLeaf ? "" : " non-leaf"}`,
        extraStyles: {
          rowspan: merge.span,
          left: viewModel.rowFacetsLeftPositions[merge.level],
          transform: "",
        },
      });
      if (!isLeaf) {
        // TODO transform is applied to cell's content. Find a better way to do this as the content could be custom
        // component
        (cell.firstElementChild as HTMLElement).style.transform = labelOffset !== 0 ? `translateY(${labelOffset}px)` : "";
      }
      cell.dataset.path = merge.path;
      cell.dataset.cellType = "row-facet";
      cell.dataset.facetLevel = String(merge.level);
      needAppend && nodeAppendList.push(cell);
      this.#cellsToMeasure.push({ cell, sizeKey: merge.level });
      this.#postRenderAdjustCellsPerLevel[merge.level].push(cell);
    }

    // render data cells
    let contentCellRerenderCount = 0;
    for (let i = 0; i < numDataColsVisible; i++) {
      const colData = sliceData.data ? sliceData.data[i] ?? [] : [];
      const gridCol = this.data!.numRowFacetLevels + i + 1;
      const absoluteColIndex = this.data!.numRowFacetLevels + viewModel.x0 + i;
      // TODO[1]
      const colDef = colDefs[absoluteColIndex - this.data!.numRowFacetLevels];
      const fixedSize = colDef.colSize.strategy === "fixed-width" ? colDef.colSize as IColAutoSizeStrategyFixedWidth : null;

      for (let j = 0; j < numDataRowsVisible; j++) {
        const absoluteRowIndex = this.data!.numColFacetLevels + viewModel.y0 + j;
        const key = `data-${absoluteColIndex}-${absoluteRowIndex}`;
        const value = colData[j];
        const [cell, needAppend] = this.cellManager.acquire(key);
        const needsContentRerender = needAppend || cell.dataset.cclix !== String(absoluteColIndex) || cell.dataset.croix !== String(absoluteRowIndex);

        if (needsContentRerender) {
          contentCellRerenderCount++;
          const isNullish = value === null || value === undefined;
          if (isNullish) {
            cell.innerHTML = "";
          } else {
            const content = colDef.renderer(value, {});
            this.#setCellContent(cell, content);
          }
          cell.dataset.cclix = String(absoluteColIndex); // short for cell column index
          cell.dataset.croix = String(absoluteRowIndex); // short for cell row index
        }

        cell.className = "cell data" + (colDef.isCustom ? " custom-rendered" : "");
        cell.dataset.cellType = "value";
        cell.style.gridColumn = `${gridCol}`;
        cell.style.gridRow = `${this.data!.numColFacetLevels + j + 1}`;

        cell.style.width = fixedSize?.widthInPx !== undefined ? `${fixedSize.widthInPx}px` : "";
        cell.style.minWidth = fixedSize?.minWidthInPx !== undefined ? `${fixedSize.minWidthInPx}px` : "";
        cell.style.maxWidth = fixedSize?.maxWidthInPx !== undefined ? `${fixedSize.maxWidthInPx}px` : "";

        needAppend && nodeAppendList.push(cell);
        if (!colDef.isCustom) {
          this.#cellsToMeasure.push({ cell, sizeKey: absoluteColIndex });
        }
      }
    }

    // draw selections if present
    for (const sel of viewModel.selections) {
      const visFromRow = Math.max(sel.fromRow, viewModel.y0);
      const visToRow = Math.min(sel.toRow, viewModel.y1 - 1);
      const visFromCol = Math.max(sel.fromCol, viewModel.x0);
      const visToCol = Math.min(sel.toCol, viewModel.x1 - 1);

      if (visFromRow > visToRow || visFromCol > visToCol) continue;

      const [el, needAppend] = this.placeCellInDom({
        key: `sel-${sel.fromRow};${sel.toRow};${sel.fromCol};${sel.toCol}`,
        content: "",
        cls: "selection-overlay",
        gridRow: this.data!.numColFacetLevels + (visFromRow - viewModel.y0) + 1,
        gridCol: this.data!.numRowFacetLevels + (visFromCol - viewModel.x0) + 1,
        extraStyles: {
          rowspan: visToRow - visFromRow + 1,
          colspan: visToCol - visFromCol + 1,
        },
      });

      needAppend && nodeAppendList.push(el);
    }

    // append all cells to the DOM in one go
    this.#con.append(...nodeAppendList);

    // endFrame returns cells that were not used this render cycle - remove them from DOM but hold it in the pool
    const cellsToRemove = this.cellManager.endFrame();
    for (const cell of cellsToRemove) {
      this.#con.removeChild(cell);
    }

    this.#autosizeCells();

    // After autosizing of column, should we apply sticky scrolling for column facets
    // very similar to row facets sticky scrolling calculation
    if (nonLeafColFacets.length > 0) {
      const visibleDataWidth = this.mountPoint.clientWidth - viewModel.rowFacetsWidth;
      const colLeftPositions: number[] = [];
      let accWidth = -viewModel.offsetX;
      for (let i = 0; i < numDataColsVisible; i++) {
        colLeftPositions[i] = accWidth;
        accWidth += this.getColumnWidth(this.data!.numRowFacetLevels + viewModel.x0 + i);
      }

      for (const { cell, mergeStart, mergeSpan } of nonLeafColFacets) {
        let cellWidth = 0;
        for (let i = 0; i < mergeSpan; i++) {
          cellWidth += this.getColumnWidth(this.data!.numRowFacetLevels + viewModel.x0 + mergeStart + i);
        }
        const cellLeftInDataArea = colLeftPositions[mergeStart];
        const cellRightInDataArea = cellLeftInDataArea + cellWidth;

        const clippedLeft = Math.max(0, -cellLeftInDataArea);
        const clippedRight = Math.max(0, cellRightInDataArea - visibleDataWidth);

        const rawOffset = (clippedLeft - clippedRight) / 2;
        const firstColWidth = this.getColumnWidth(this.data!.numRowFacetLevels + viewModel.x0 + mergeStart);
        const maxOffset = Math.max(0, (cellWidth - firstColWidth) / 2);
        const labelOffset = Math.max(-maxOffset, Math.min(maxOffset, rawOffset));

        (cell.firstElementChild as HTMLElement).style.transform = labelOffset !== 0 ? `translateX(${labelOffset}px)` : "";
      }
    }

    // TODO if this eats up frames during scrolling (as scrolling performance needs to be super fast - currently low of
    // 3ms) then prform this at the very end of the scrolling (delayed by setTimeout 16ms -> combine -> calculate at
    // once)
    const newSnapshot: DiffModelSnapshot = {
      columns: buildDiffModel({
        fromPtr: viewModel.x0,
        toPtr: viewModel.x1,
        levels: this.data!.numColFacetLevels,
        getFacetValue: (level: number, colIdx: number) => this.data!.getColFacetValue(level, colIdx),
        getMeasurement: (colIdx: number) => this.getColumnWidth(this.data!.numRowFacetLevels + colIdx)
      }),
      rows: buildDiffModel({
        fromPtr: viewModel.y0,
        toPtr: viewModel.y1,
        levels: this.data!.numRowFacetLevels,
        getFacetValue: (level: number, rowIdx: number) => this.data!.getRowFacetValue(level, rowIdx),
        getMeasurement: () => this.rowHeightByType.data,
      })
    };
    const facetMatrix: FacetMatrixWithFacetCellMap = {
      ...buildFacetMatrix({
        data: this.data,
        x0: Math.abs(viewModel.x0),
        y0: Math.abs(viewModel.y0),
        x1: Math.abs(viewModel.x1),
        y1: Math.abs(viewModel.y1),
        numRowFacetLevels: this.data.numRowFacetLevels,
        numColFacetLevels: this.data.numColFacetLevels,
      }),
      numRowFacetLevels: this.data.numRowFacetLevels,
      numColFacetLevels: this.data.numColFacetLevels,
      rowFacetPathToCellMap,
      colFacetPathToCellMap
    };

    // Execute animatinos
    if (shouldAnimate && hasAnimatable && colEditset && rowEditset) {
      // Remap active cells' gridColumn to merged positions (account for DELETE tracks)
      // We are creating a merged layout of previous and new columns (or rows) -> slideout the deleted columns (to
      // width 0) -> reset the merged layout to new layout. Logically the merged layout with deleted columns width = 0 is
      // equal to the new layout.
      const colDeleteShifts = this.#computeDeleteShifts(colEditset);
      const rowDeleteShifts = this.#computeDeleteShifts(rowEditset);
      const mergedColFacetAnimState = this.#computeMergeFacetForAnimState(colEditset, this.data!.numColFacetLevels);
      const mergedRowFacetAnimState = this.#computeMergeFacetForAnimState(rowEditset, this.data!.numRowFacetLevels);

      // INFO: cellManager.entries() return all kind of cells (facets cells, value cells, corner cells)
      // but deleteShift is computed from editset that calculate deletion / insertion of column / rows (stack of value cells)
      // for only value cells
      for (const [, cell] of this.cellManager.entries()) {
        if (cell.dataset.cellType === "corner") continue;
        
        // For facets that are non leaf, we need to adjust span + start properly - there are multiple edge cases here
        // For example: 
        // |     l0_0    |    l0_1      |
        // | l1_0 | l1_1 | l1_0 |  l1_1 |
        //    1      2      3      4
        // If 2 gets deleted we have to reduce start of l0_1 & reduce span of l0_0;
        // but if 3 gets deleted we have to reduce start & span of l0_1
        // Similarly if a new column gets added between 2 and 3 we have to figure out is it part of l0_0 or l0_1
        // and adjust start and span accordingly
        // We do this by contructing the merged state of the facets and then runing merges again on the combined layout
        if (cell.dataset.cellType === "column-facet" && +cell.dataset.facetLevel! < this.data!.numColFacetLevels - 1) {
          const mergeState = mergedColFacetAnimState[cell.dataset.path!];
          cell.dataset.buGridColumn = cell.style.gridColumn;
          cell.style.gridColumn = `${this.data!.numRowFacetLevels + mergeState.start + 1} / span ${mergeState.span}`;
          cell.dataset.dirtyAfterAnimation = "1";
          continue;
        }
        if (cell.dataset.cellType === "row-facet" && +cell.dataset.facetLevel! < this.data!.numRowFacetLevels - 1) {
          const mergeState = mergedRowFacetAnimState[cell.dataset.path!];
          cell.dataset.buGridRow = cell.style.gridRow;
          cell.style.gridRow = `${this.data!.numColFacetLevels + mergeState.start + 1} / span ${mergeState.span}`;
          cell.dataset.dirtyAfterAnimation = "1";
          continue;
        }

        // Apply the shift to current rows/ columns so that deleted cells can be inserted
        // At this point the layout contains the current layout but it makes space for (empty tracks) deleted columns
        // This gets applied only on last level of facet and value cells
        this.#remapCellPosition(cell, colDeleteShifts, this.data!.numRowFacetLevels, "gridColumn");
        this.#remapCellPosition(cell, rowDeleteShifts, this.data!.numColFacetLevels, "gridRow");
      }

      // Since the layout has changed to reflect merged data - update the grid templates
      this.#con.dataset.buColTemplate = this.#con.style.gridTemplateColumns;
      this.#con.dataset.buRowTemplate = this.#con.style.gridTemplateRows;
      const newTemplate = this.getGridTemplate(
        this.data!.numRowFacetLevels,
        this.data!.numColFacetLevels,
        colEditset.length,
        rowEditset.length);
      this.#con.style.gridTemplateColumns = newTemplate.columns;
      this.#con.style.gridTemplateRows = newTemplate.rows;

      // Place evacuated cells at merged DELETE positions
      // So far deleted rows/columns were logically accounted for, now we render the deleted cells.
      // Once this is done it the new layout exactly matches the old layout and we have everything we need for
      // animation
      this.#placeEvacuatedCells(colEditset, rowEditset, this.data!.numRowFacetLevels, this.data!.numColFacetLevels, colDeleteShifts, rowDeleteShifts);

      const computedStyle = getComputedStyle(this.#con);
      const newColTemplate = computedStyle.gridTemplateColumns.split(/\s+/);
      const newRowTemplate = computedStyle.gridTemplateRows.split(/\s+/);

      // Calculate all the keyframes in one shot (we use offset to achieve staggered animation)
      const [colKeyframes, totalColAnimStages] = buildPhasedKeyFrames({
        editset: colEditset,
        cssTemplate: newColTemplate,
        prop: "gridTemplateColumns",
        trackOffset: this.data!.numRowFacetLevels,
      });
      const [rowKeyframes, totalRowAnimStages] = buildPhasedKeyFrames({
        editset: rowEditset,
        cssTemplate: newRowTemplate,
        prop: "gridTemplateRows",
        trackOffset: this.data!.numColFacetLevels,
      });

      const colAnimDuration =  totalColAnimStages / (totalColAnimStages + totalRowAnimStages) * this.config.animationDuration;
      const rowAnimDuration = totalRowAnimStages / (totalColAnimStages + totalRowAnimStages) * this.config.animationDuration;

      if (totalColAnimStages > 0) {
        this.#runningAnimations.push(
          this.#con.animate(colKeyframes, {
            duration: colAnimDuration,
            easing: this.config.animationEasing,
          })
        )
      }
      if (totalRowAnimStages > 0) {
        this.#runningAnimations.push(
          this.#con.animate(rowKeyframes, {
            duration: rowAnimDuration,
            easing: this.config.animationEasing,
          })
        )
      }

      const cleanup = () => {
        console.log(">>> TODO cleanuped");
        // return;
        this.#cleanupEvacuatedCells();
        // reset the columns / rows to it's original position
        this.#con.querySelectorAll("*[data-dirty-after-animation=\"1\"]").forEach(elm => {
          const el = elm as HTMLElement;
          if (el.dataset.buGridColumn) el.style.gridColumn = el.dataset.buGridColumn;
          if (el.dataset.buGridRow) el.style.gridRow = el.dataset.buGridRow;
          delete el.dataset.buGridColumn;
          delete el.dataset.buGridRow;
          delete el.dataset.dirtyAfterAnimation;
          this.#runningAnimations.length = 0;

          delete this.#con.dataset.buRowTemplate;
          delete this.#con.dataset.buColTemplate;

        });
        this.#con.style.gridTemplateColumns = this.#con.dataset.buColTemplate!;
        this.#con.style.gridTemplateRows = this.#con.dataset.buRowTemplate!;
      };
      Promise.all(this.#runningAnimations.map(a => a.finished)).then(cleanup, cleanup);
    }

    this.#prevDiffSnapshot = newSnapshot;
    this.#prevFacetMatrix = facetMatrix;

    this.#setupScrollListener();

    if (!this.#layoutBootstrapped) {
      this.#layoutBootstrapped = true;
      const vmUpdated = this.calculateViewModel();
      this.#onLayoutBootstrap(vmUpdated);
      this.#raiseRenderCompleteEvent(vmUpdated, ctx, {nodeAppendList, cellsToRemove, contentCellRerenderCount});
    } else {
      this.#raiseRenderCompleteEvent(viewModel, ctx, {nodeAppendList, cellsToRemove, contentCellRerenderCount});
    }

    this.#postRenderAdjustCellsPerLevel.length = 0;
  }

  #computeMergeFacetForAnimState(editset: EditEntry[], facetCount: number) {
    const keys = editset.map(e => e.key);
    const facetForMergedAnimState: string[][] = new Array(keys.length);
    for (let i = 0; i < keys.length; i++) {
      facetForMergedAnimState[i] = keys[i].split(SEPARATOR);
    }
    return computeMerges(facetCount, keys.length, facetForMergedAnimState)
      .reduce((store, val) => (store[val.path] = val, store), {} as Record<string, MergeState>);
  }

  #cleanupEvacuatedCells(): void {
    for (const el of this.#evacuatedCells) el.remove();
    this.#evacuatedCells.length = 0;
  }

  // old facet [a, b, c, d]
  // new facet [a, d, x]
  // b, c deleted from old layout and not present in new layout
  // So while creating a merged layout we need to shift new layout from [a, d, x] to [a, b_del, c_del, d, x]
  // This method returns an array FOR NEW LAYOUT that keep tracks on how many shift requires to enter the deleted
  // columns / rows
  // So in this case the result is: [0, 2, 2] i.e.
  // No shift for a -> 2 shifts for d (to allocate space for b and c) -> 2 shifts for x
  #computeDeleteShifts(editset: EditEntry[]): number[] {
    const shifts: number[] = [];
    let deleteCount = 0;
    for (const entry of editset) {
      if (entry.action === EditAction.DELETE) {
        deleteCount++;
      } else {
        shifts.push(deleteCount);
      }
    }
    return shifts;
  }
  

  // Ajust gridColumn and gridRow values for asuuming that deleted rows / columns are now part of the grid
  // - For value cells and last level of facet cells this is straight forward and can be done by deleteShifts directly
  // - For facet cells with level < leaf level, we have to calculate merging based on leaf cells.
  #remapCellPosition(cell: HTMLElement, deleteShifts: number[], facetTrackCount: number, prop: "gridColumn" | "gridRow"): void {
    const [start, span] = getGridTemplateValsFromEl(cell, prop);
    if (start === -1 || span === -1) return;

    // the grid returns track index with facet adjustment
    // For facet cells in one axis and delete in another axis datPos is negative,
    // hence we dont' change the grid values
    // For example column facet cell 
    let dataPos = start - facetTrackCount - 1;
    if (dataPos < 0) return;
    const shift = deleteShifts[dataPos];
    cell.dataset[`bu${prop === "gridColumn" ? "GridColumn": "GridRow"}`] = cell.style[prop];
    cell.dataset.dirtyAfterAnimation = "1";
    if (cell.dataset.cellType === "row-facet" || cell.dataset.cellType === "column-facet") {

      const newStart = start + shift;
      const end = start + span - 1;
      const newEnd = end + deleteShifts[end - facetTrackCount - 1];
      cell.style[prop] = `${newStart} / span ${newEnd - newStart + 1}`;
    } else if (cell.dataset.cellType === "value"){
      cell.style[prop] = `${start + shift}`;
    }
  }

  #placeEvacuatedCells(
    colEditset: EditEntry[],
    rowEditset: EditEntry[],
    facetColTrackCount: number,
    facetRowTrackCount: number,
    colDeleteShifts: number[],
    rowDeleteShifts: number[],
  ): void {
    const colDeletePositions = this.#buildDeletePositionMap(colEditset, facetColTrackCount);
    const rowDeletePositions = this.#buildDeletePositionMap(rowEditset, facetRowTrackCount);

    for (const el of this.#evacuatedCells) {
      const cellType = el.dataset.cellType;
      if (cellType === "value") {
        const cclix = parseInt(el.dataset.cclix!, 10);
        const croix = parseInt(el.dataset.croix!, 10);

        const colFacetKey = el.dataset.colFacetPathKey;
        const rowFacetKey = el.dataset.rowFacetPathKey;

        if (colFacetKey) {
          // cell got deleted and reason for deletion was column got deleted
          el.style.gridColumn = `${colDeletePositions.get(colFacetKey)}`;
        } else {
          // cell got deleted and reason for deletion was row got deleted
          const colDataPos = cclix - facetColTrackCount;
          el.style.gridColumn = `${cclix + 1 + colDeleteShifts[colDataPos]}`;
        }

        if (rowFacetKey) {
          // cell got deleted and reason for deletion was row got deleted
          el.style.gridRow = `${rowDeletePositions.get(rowFacetKey)}`;
        } else {
          const rowDataPos = croix - facetRowTrackCount;
          el.style.gridRow = `${croix + 1 + rowDeleteShifts[rowDataPos]}`;
        }
      } else if (cellType === "column-facet") {
        const colFacetKey = el.dataset.colFacetPathKey;
        if (colFacetKey) {
          el.style.gridColumn = `${colDeletePositions.get(colFacetKey)}`;
        }
      } else if (cellType === "row-facet") {
        const rowFacetKey = el.dataset.rowFacetPathKey;
        if (rowFacetKey) {
          el.style.gridRow = `${rowDeletePositions.get(rowFacetKey)}`;
        }
      }
    }
  }

  #buildDeletePositionMap(editset: EditEntry[], facetTrackCount: number): Map<string, number> {
    const positions = new Map<string, number>();
    let mergedIdx = 0;
    for (const entry of editset) {
      if (entry.action === EditAction.DELETE) {
        positions.set(entry.key, facetTrackCount + mergedIdx + 1);
      }
      mergedIdx++;
    }
    return positions;
  }

  #raiseRenderCompleteEvent(viewModel: ViewModel, ctx: RenderCtx, additionalMetrics: {
    nodeAppendList: HTMLElement[],
    cellsToRemove: HTMLElement[],
    contentCellRerenderCount: number,
  }): void {
    this.emit("renderComplete", {
      x0: viewModel.x0,
      y0: viewModel.y0,
      x1: viewModel.x1,
      y1: viewModel.y1,
    });

    this.emit("debug_perf:metrics", {
      timeToRender: +(performance.now() - ctx.t1).toFixed(2),
      renderCount: this.#renderCount,
      nodesActive: this.cellManager.activeCount,
      nodesAppendedInThisFrame: additionalMetrics.nodeAppendList.length,
      nodesDeletedInThisFrame: additionalMetrics.cellsToRemove.length,
      contentCellRerenderCount: additionalMetrics.contentCellRerenderCount,
      poolSize: this.cellManager.poolSize,
    });
  }

  // colIdx is the absolute column index including row facets
  changeLeafColWidth(colIdx: number): {
    byDelta: (dw: number) => number;
    byAbsValue: (width: number) => number;
    commit: () => number;
    cancel: () => number;
  } {
    const cleanup = () => {
      const state = this.#resizeState.get(colIdx);
      if (!state) return;
      for (const cell of state.cells) {
        delete cell.dataset.stashedWidth;
        delete cell.dataset.stashedMinWidth;
        delete cell.dataset.stashedMaxWidth;
      }
      this.#resizeState.delete(colIdx);
    };

    if (this.#resizeState.has(colIdx)) {
      console.warn(`Column ${colIdx} is already being resized. Cleaning up previous resize.`);
    }
    cleanup();

    // For multiple level of column facets, the last level i.e. the leaf nodes are aligned with the cells of the column
    // Meaning, for each vertical column these last level of column acts as a header. (we'll call these header)
    // Meaning, the last level of column facet alongside the value cells form a standard table. You can think of the
    // nested facets (level_n-1 where nth is leaf nodes) are nesting/hierarchy that aligns with the header cells.
    // The sizing (width) always gets added to the last level of facets - the nested facets have colspan property set on
    // them that css grid layout manages while creating the nesting/hierarchy.
    const leafLevel = this.data!.numColFacetLevels - 1;
    const headerCell = this.#con.querySelector<HTMLElement>(`[data-hix="${colIdx}"][data-facet-level="${leafLevel}"]`);
    const dataCells = Array.from(this.#con.querySelectorAll<HTMLElement>(`[data-cclix="${colIdx}"]`));
    const cells: HTMLElement[] = headerCell ? [headerCell, ...dataCells] : dataCells;

    if (cells.length === 0) {
      throw new Error(`No cells found for column ${colIdx}`);
    }

    const widthBeforeResize = cells[0].getBoundingClientRect().width;

    for (const cell of cells) {
      if (cell.style.width) {
        cell.dataset.stashedWidth = cell.style.width;
      }
      if (cell.style.minWidth) {
        cell.dataset.stashedMinWidth = cell.style.minWidth;
        cell.style.minWidth = "";
      }
      if (cell.style.maxWidth) {
        cell.dataset.stashedMaxWidth = cell.style.maxWidth;
        cell.style.maxWidth = "";
      }
      cell.style.width = `${widthBeforeResize}px`;
    }

    let resizeState = {
      widthBeforeResize,
      currentWidth: widthBeforeResize,
      cells,
    };
    this.#resizeState.set(colIdx, resizeState);

    return {
      byDelta: (dw: number): number => {
        // 20 is minimum width that a column can be resized to
        const newWidth = Math.max(20, resizeState.widthBeforeResize + dw);
        resizeState.currentWidth = newWidth;
        for (const cell of resizeState.cells) {
          cell.style.width = `${newWidth}px`;
        }
        return newWidth;
      },
      byAbsValue: (width: number): number => {
        const newWidth = Math.max(20, width);
        resizeState.currentWidth = newWidth;
        for (const cell of resizeState.cells) {
          cell.style.width = `${newWidth}px`;
        }
        return newWidth;
      },
      commit: (): number => {
        const finalWidth = resizeState.currentWidth;
        // TODO[1]
        this.data!.setColSize(colIdx - this.data!.numRowFacetLevels, { strategy: "fixed-width", widthInPx: finalWidth });
        this.colsWidth.override[colIdx] = finalWidth;
        cleanup();
        return finalWidth;
      },
      cancel: (): number => {
        const originalWidth = resizeState.widthBeforeResize;
        for (const cell of resizeState.cells) {
          if (cell.dataset.stashedWidth) {
            cell.style.width = cell.dataset.stashedWidth;
          } else {
            cell.style.width = "";
          }
          if (cell.dataset.stashedMinWidth) {
            cell.style.minWidth = cell.dataset.stashedMinWidth;
          }
          if (cell.dataset.stashedMaxWidth) {
            cell.style.maxWidth = cell.dataset.stashedMaxWidth;
          }
        }
        cleanup();
        return originalWidth;
      },
    };
  }
}
