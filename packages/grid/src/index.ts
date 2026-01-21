import {gridCss, gridShadowElsStyle} from "./grid-css.tmp";

interface MergeState {
  value: string | null;
  start: number;
  span: number;
}

interface GridConfig {
  defaultCellHeight: number;
  defaultCellWidth: number;
  overscan: number;
}

const defaultConfig: GridConfig = {
  defaultCellHeight: 19,
  defaultCellWidth: 60,
  overscan: 2
};

export interface SliceResult {
  totalRowsCount: number;
  totalColsCount: number;
  columnFacets?: string[][];
  rowFacets?: string[][];
  data?: any[][];
}

export class GridDataModel {
  #rowsCount: number;
  #colsCount: number;
  #columnFacets: string[] | string[][];
  #rowFacets?: string[][];
  #data: any[][];

  constructor(data: any[][], columnFacets: string[] | string[][], rowFacets?: string[][]) {
    this.#rowsCount = data.length;
    this.#colsCount = data[0].length;
    this.#columnFacets = columnFacets;
    this.#rowFacets = rowFacets;
    this.#data = data;
  }

  get rowFacetCount() {
    return this.#rowFacets?.length ?? 0;
  }

  get colFacetCount() {
    // flat single column table
    if (!(this.#columnFacets[0] instanceof Array)) return 1;
    // nested columns i.e. faces are present
    return this.#columnFacets.length;
  }

  getSlice(x0: number, y0: number, x1: number, y1: number): SliceResult {
    // Metadata-only request
    if (x0 === x1 && y0 === y1) {
      return {
        totalRowsCount: this.#rowsCount,
        totalColsCount: this.#colsCount,
      };
    }

    // Extract column headers for range [x0, x1)
    const columnFacets: string[][] = [];
    for (let x = x0; x < x1; x++) {
      if (this.#columnFacets[0] instanceof Array) {
        // Nested column facets: #columnFacets[level][col]
        const facets: string[] = [];
        for (let level = 0; level < this.#columnFacets.length; level++) {
          facets.push((this.#columnFacets[level] as string[])[x] || "");
        }
        columnFacets.push(facets);
      } else {
        // Simple flat column facets: single level
        columnFacets.push([this.#columnFacets[x] as string]);
      }
    }

    // Extract row headers for range [y0, y1)
    const rowFacets: string[][] = [];
    if (this.rowFacetCount) {
      for (let y = y0; y < y1; y++) {
        const facets: string[] = [];
        for (let level = 0; level < this.rowFacetCount; level++) {
          facets.push(this.#rowFacets![level][y] || "");
        }
        rowFacets.push(facets);
      }
    }

    // Extract data in column-first format for range
    // Input stored as row-first: #data[row][col]
    // Output is column-first: data[col][row] (matches reference impl)
    const data: any[][] = [];
    for (let x = x0; x < x1; x++) {
      const column: any[] = [];
      for (let y = y0; y < y1; y++) {
        column.push(this.#data[y]?.[x] ?? "");
      }
      data.push(column);
    }

    return {
      totalRowsCount: this.#rowsCount,
      totalColsCount: this.#colsCount,
      columnFacets,
      rowFacets,
      data,
    };
  }
}

class ColumnSizes {
  // TODO[improvement] calculate separate column height for value cells and cell from column facets
  #rowHeight?: number;
  #indices: number[] = []; // Max measured width per column (grows only, never shrinks)
  // #auto: number[] = [];       // Same as indices when no override (for reset capability)
  #override = [];   // User-set widths from manual column resize (future feature)
  #config: GridConfig;

  constructor(config: GridConfig) {
    this.#config = config;
  }

  set rowHeight(value: number) {
    this.#rowHeight = value;
  }

  // reset() {
  //   this.#indices.length = 0;
  // }

  get indices() {
    return this.#indices;
  }

  // get auto() {
  //   return this.#auto;
  // }

  get override() {
    return this.#override;
  }

  get rowHeight(): number {
    return this.#rowHeight || this.#config.defaultCellHeight;
  }

  getColumnWidth(index: number) {
    return this.#override[index] ?? this.#indices[index] ?? this.#config.defaultCellWidth;
  }

}

export default class Grid {
  #config: GridConfig;
  #data: GridDataModel | undefined = undefined;
  #mountPoint: HTMLElement;
  #con: HTMLElement;
  #virtualPanelEl: HTMLElement;
  #gridClipEl: HTMLElement;
  #columnSizes: ColumnSizes;
  #viewState = {
    viewport: { x0: 0, y0: 0, x1: 0, y1: 0 },
    meta: { totalRowsCount: 0, totalColsCount: 0 }
  }
  #scrollRAF: ReturnType<typeof requestAnimationFrame> | null = null;
  #scrollListenerSet = false;
  #cellsToMeasure: Array<{ cell: HTMLElement, sizeKey: number }> = [];
  #activeCells: Map<string, HTMLElement> = new Map();
  #cellPool: HTMLElement[] = [];
  #measureSpan: HTMLElement | null = null;
  #renderCount = 0;
  #postRenderAdjustCellsPerLevel: HTMLElement[][] = [];
  #layoutBootstrapped = false;


  constructor(config: Partial<GridConfig>, mountPoint: HTMLElement) {
    this.#config = {
      ...defaultConfig,
      ...config
    };
    this.#columnSizes = new ColumnSizes(this.#config);
    this.#mountPoint = mountPoint;
    [this.#con, , this.#virtualPanelEl, this.#gridClipEl] = this.#attachShadowDom();

    // Measure row height from sample cell
    // TODO[improvement] This is bare minimum that assumes all cells (body + header) wold have same height
    //   Ideally all value cells MIGHT have height, in that case header cells MUST have different
    //   height. More about this is commented in draw method
    this.#measureRowHeight();
  }

  #measureRowHeight() {
    // TODO create the cell inside the grid for proper style application
    //      in fact render the whole row by sampling data
    const sample = document.createElement("div");
    sample.className = "cell";
    sample.style.visibility = "hidden";
    // sample.style.position = "absolute";
    sample.textContent = "Mgy$123,456"; // Mix of chars
    this.#con.appendChild(sample);
    const rect = sample.getBoundingClientRect();
    this.#columnSizes.rowHeight = rect.height;
    this.#con.removeChild(sample);
    console.log(`>>> Measured row height: ${this.#columnSizes.rowHeight}px`);
  }


  set data(value: GridDataModel) {
    this.#data = value;

  }

  get data(): GridDataModel | undefined {
    return this.#data;
  }

  #attachShadowDom() {
    const el = this.#mountPoint;
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

  #setupScrollListener() {
    if (this.#scrollListenerSet) return;
    this.#mountPoint.addEventListener("scroll", () => {
      this.#scrollListenerSet = true;
      if (this.#scrollRAF) return;

      this.#scrollRAF = requestAnimationFrame(() => {
        this.#scrollRAF = null;
        this.draw();
      });
    });
  }

  #calcTotalWidth(numRowFacets: number) {
    let total = 0;
    // Row headers
    for (let i = 0; i < numRowFacets; i++) {
      total += this.#columnSizes.getColumnWidth(i);
    }
    // Data columns
    for (let i = 0; i < this.#viewState.meta.totalColsCount; i++) {
      total += this.#columnSizes.getColumnWidth(numRowFacets + i);
    }
    return total;
  }

  #calcVisibleColumns(startCol: number, viewWidth: number, rowHeaderCount: number) {
    let width = 0;
    let count = 0;

    while (width < viewWidth && startCol + count < this.#viewState.meta.totalColsCount) {
      width += this.#columnSizes.getColumnWidth(rowHeaderCount + startCol + count);
      count++;
    }

    return count + this.#config.overscan;
  }


  #calculateViewport() {
    const scrollTop = this.#mountPoint.scrollTop;
    const scrollLeft = this.#mountPoint.scrollLeft;
    const viewWidth = this.#mountPoint.clientWidth;
    const viewHeight = this.#mountPoint.clientHeight;

    const data = this.#data!;
    const numColFacets = data.colFacetCount;
    const numRowFacets = data.rowFacetCount;

    // calculate row header i.e. width of all row facets
    // TODO[improvment]
    //   rf11 rf12 rf13 ... ...
    //   ____ ____ rf23 ... ...
    //   ____ rf12 rf33 ... ...
    //   ____ ____ rf43 ... ...
    //   1. For config like this if rf12 is overflowing it can wrap it's content
    //   2. Individual row facet might have it's own maxWidth
    let rowFacetsWidth = 0;
    for (let i = 0; i < numRowFacets; i++) {
      rowFacetsWidth += this.#columnSizes.getColumnWidth(i);
    }

    // if there are 3 header facets then there would be 3 rows created for it
    // hence that's the total height of header
    const rowHeight = this.#columnSizes.rowHeight
    const headerHeight = numColFacets * rowHeight;
    const dataHeight = this.#viewState.meta.totalRowsCount * rowHeight;
    // total width of the grid if it was rendered fully
    // this value will be used to calculate scroll position there by setting dimension of virtual-panel
    const totalHeight = headerHeight + dataHeight;
    const totalWidth = this.#calcTotalWidth(numRowFacets);

    // Row range calculation
    // totalHeight <- full data height if it was rendered
    // viewHeight <- viewHeight i.e. grid-content container height
    const scrollableHeight = Math.max(1, totalHeight - viewHeight);
    const scrollPercent = Math.min(1, scrollTop / scrollableHeight);
    // TODO take care of the fact that the full table is visible vertically. visibleDataHeight is
    //      negative in that case
    const visibleDataHeight = viewHeight - headerHeight;
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
    const scrollableRows  = Math.max(0, this.#viewState.meta.totalRowsCount - Math.floor(visibleDataHeight / rowHeight)); 


    const startRowFloat = scrollableRows * scrollPercent;
    const startRow = Math.floor(startRowFloat);
    const visibleRows = Math.ceil(visibleDataHeight / rowHeight) + this.#config.overscan;
    const endRow = Math.min(this.#viewState.meta.totalRowsCount, startRow + visibleRows);


    // Column range calculation (variable widths)
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
    let maxScrollCol = this.#viewState.meta.totalColsCount;
    let lastColWidth = -1;
    while (maxScrollWidth < visibleDataWidth && maxScrollCol > 0) {
      maxScrollCol--;
      lastColWidth =  this.#columnSizes.getColumnWidth(data.rowFacetCount + maxScrollCol);
      maxScrollWidth += lastColWidth;
    }
    maxScrollCol = Math.min(this.#viewState.meta.totalColsCount - 1, maxScrollCol + ((maxScrollWidth - visibleDataWidth)) / lastColWidth);

    const startColFloat = maxScrollCol * scrollPercentX;
    const startCol = Math.floor(startColFloat);
    const visibleCols = this.#calcVisibleColumns(startCol, visibleDataWidth, numRowFacets);
    const endCol = Math.min(this.#viewState.meta.totalColsCount, startCol + visibleCols);

    const offsetY = (startRowFloat - startRow) * rowHeight;
    const startColWidth = this.#columnSizes.getColumnWidth(data.rowFacetCount + startCol);
    const offsetX = (startColFloat - startCol) * startColWidth;

    return {
      x0: startCol,
      y0: startRow,
      x1: endCol,
      y1: endRow,
      offsetX,
      offsetY,
      totalHeight,
      totalWidth,
      rowHeight,
      rowHeaderWidth: rowFacetsWidth,
      headerHeight,
    };
  }

  // Cell pooling: reuse DOM elements instead of creating/destroying.
  // On scroll, cells that leave viewport go to pool; cells entering viewport
  // are taken from pool. Reduces GC pressure and DOM operations.
  #getCell(): HTMLElement {
    if (this.#cellPool.length > 0) {
      return this.#cellPool.pop() as HTMLElement;
    }
    const cell = document.createElement("div");
    cell.className = "cell";
    return cell;
  }

  #placeCellInDom(opts: {
    usedKeys: Set<string>;
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
  }) {
    opts.usedKeys.add(opts.key);
    let cell = this.#activeCells.get(opts.key);
    if (!cell) {
      cell = this.#getCell();
      this.#activeCells.set(opts.key, cell);
      this.#con.appendChild(cell);
    }

    cell.textContent = opts.content;
    cell.className = "cell " + opts.cls;
    cell.style.gridColumn = opts.extraStyles.colspan
      ? `${opts.gridCol} / span ${opts.extraStyles.colspan}`
      : `${opts.gridCol}`;
    cell.style.gridRow = opts.extraStyles.rowspan
      ? `${opts.gridRow} / span ${opts.extraStyles.rowspan}`
      : `${opts.gridRow}`;

    // Apply sticky positions
    if (opts.extraStyles.top !== undefined) {
      cell.style.top = `${opts.extraStyles.top}px`;
    }
    if (opts.extraStyles.left !== undefined) {
      cell.style.left = `${opts.extraStyles.left}px`;
    }
    if (opts.extraStyles.transform !== undefined) {
      cell.style.transform = opts.extraStyles.transform;
    }

    // Queue for measurement - we measure ALL visible cells every render,
    // not just unmeasured ones, because virtualized data means larger content
    // can appear at any time during scroll.
    // Skip merged cells (colspan > 1): their visual width spans multiple columns
    // so measuring them would give inflated per-column width.
    const isMerged = (opts.extraStyles.colspan && opts.extraStyles.colspan > 1);
    if (opts.sizeKey !== undefined && !isMerged) {
      this.#cellsToMeasure.push({ cell, sizeKey: opts.sizeKey });
    }

    return cell;
  }

  #invalidateViewport() {
    const vp = this.#calculateViewport();

    // Virtual panel sized to full virtual dimensions - this empty div creates
    // the scrollbar range. As more columns get measured, totalWidth becomes
    // more accurate and scrollbar thumb position improves.
    this.#virtualPanelEl.style.width = `${vp.totalWidth}px`;
    this.#virtualPanelEl.style.height = `${vp.totalHeight}px`;

    // Sub-cell offset enables smooth pixel-level scrolling despite cell-based rendering.
    // Without it: scroll jumps by whole cell heights/widths (jerky).
    // With it: gridContent shifts by fractional cell offset, scroll appears continuous.
    // Example: if row 5.3 is visible, we render from row 5 but shift up by 0.3*rowHeight.
    this.#con.style.setProperty("--offset-x", `${vp.offsetX}px`);
    this.#con.style.setProperty("--offset-y", `${vp.offsetY}px`);
    return vp;
  }

  // Sticky headers need explicit top/left positions when stacked.
  // Row header level 0 sticks at left:0, level 1 at left:width_of_level_0, etc.
  // Column header level 0 sticks at top:0, level 1 at top:rowHeight, etc.
  // TODO when calculating this if in row facet there are larger value cells followed by smaller value cells
  //      there is a bug where the last facet cells are moved with transform. Is it because of we keep one
  //      columnWidth? Example ->
  //      row-facet-00 row_facet-01 ...
  //      _            row_facet-11 ...
  //      rf-20        row_facet-21 ...
  #getFacetPositions(vp: { rowHeight: number }) {
    const rowFacetsLeftPositions = [0];
    for (let i = 0; i < this.#data!.rowFacetCount - 1; i++) {
      rowFacetsLeftPositions.push(
        rowFacetsLeftPositions[i] + this.#columnSizes.getColumnWidth(i)
      );
    }
    const colFacetsTopPositions: number[] = [];
    for (let i = 0; i < this.#data!.colFacetCount; i++) {
      colFacetsTopPositions.push(i * vp.rowHeight);
    }

    return {
      rowFacetsLeftPositions,
      colFacetsTopPositions
    }
  }

  draw() {
    const startTime = performance.now();
    this.#renderCount++;

    // TODO performance start counters
    if (!this.#data) throw new Error("Data is not set!");

    const datamodel = this.#data.getSlice(0, 0, 0, 0);
    this.#viewState.meta.totalColsCount = datamodel.totalColsCount;
    this.#viewState.meta.totalRowsCount = datamodel.totalRowsCount;

    // TODO[improvement] when column start & end is calculated, it's done with a default cellWidth(60px) and then
    //      adjusted after the content is rendered. This allows column variable col length.
    //      However It's not the same for row height - all rows are fixed height(19px) - Ideally it should also have
    //      variable row height calculation 
    //      The reason this is not feasbile is because number of columns are low hence width can be cached
    //      however the number of rows are too high hence the height value can't be cached.
    //      but what we can do is to have different height for column facets <> footer <> value rows. Row facets
    //      would increase the height of the row.
    //      get this information from cellRenderer
    //      i.e. render column facets and compute it's height -> render full value cells to compute row height
    const vp = this.#invalidateViewport();


    // Fetch data for visible range
    const data = this.#data.getSlice(vp.x0, vp.y0, vp.x1, vp.y1);

    const numDataColsVisible = vp.x1 - vp.x0;
    const numDataRowsVisible = vp.y1 - vp.y0;
    const numRowFacets = this.#data.rowFacetCount;
    const numColFacets = this.#data.colFacetCount;

    // Grid template uses max-content for ALL columns (not cached fixed widths).
    // This lets CSS Grid auto-expand columns when larger content appears during scroll.
    // The cached widths in ColumnSizes are used for scroll math (virtual panel size,
    // calculating which column is at scroll position), not for constraining visual width.
    // CSS transition on grid-template-columns animates the expansion (Chrome/Edge only).
    let colTemplate = `repeat(${numRowFacets + numDataColsVisible}, max-content) `;
    const rowTemplate = `repeat(${numColFacets + numDataRowsVisible}, ${vp.rowHeight}px)`;
    this.#con.style.gridTemplateColumns = colTemplate;
    this.#con.style.gridTemplateRows = rowTemplate;

    const usedKeys: Set<string> = new Set();
    this.#cellsToMeasure.length = 0;
    const { rowFacetsLeftPositions, colFacetsTopPositions } = this.#getFacetPositions(vp);

    for (let i = 0; i < numRowFacets; i++) {
      this.#postRenderAdjustCellsPerLevel.push([]);
    }

    // Render corner cells
    for (let hRow = 0; hRow < numColFacets; hRow++) {
      for (let hCol = 0; hCol < numRowFacets; hCol++) {
        const key = `corner-${hRow}-${hCol}`;
        const cell = this.#placeCellInDom({
          usedKeys,
          key,
          gridRow: hRow + 1,
          gridCol: hCol + 1,
          content: "",
          cls: `corner level-${hRow} ${hCol === numRowFacets - 1 ? "edge-r" : ""} ${hRow === numColFacets - 1 ? "edge-b" : ""}`,
          sizeKey: hCol,
          extraStyles: {
            top: colFacetsTopPositions[hRow],
            left: rowFacetsLeftPositions[hCol],
          },
        });
        this.#postRenderAdjustCellsPerLevel[hCol].push(cell);
      }
    }


    // column facet merging
    this.#mergeFacetCells({
      facetCount: numColFacets,
      itemCount: numDataColsVisible,
      facets: data.columnFacets!,
      onMerge: (level, state) => {
        const key = `col-h-${level}-${vp.x0 + state.start}`;
        const startGridCol = numRowFacets + state.start + 1;
        const sizeKey = numRowFacets + vp.x0 + state.start;
        this.#placeCellInDom({
          usedKeys,
          key,
          gridRow: level + 1,
          gridCol: startGridCol,
          content: state.value as string,
          cls: `col-header level-${level}`,
          sizeKey,
          extraStyles: {
            colspan: state.span,
            top: colFacetsTopPositions[level],
          },
        });
      }
    });
    // row facet merging
    this.#mergeFacetCells({
      facetCount: numRowFacets,
      itemCount: numDataRowsVisible,
      facets: data.rowFacets!,
      onMerge: (level, state) => {
        const key = `row-h-${level}-${vp.y0 + state.start}`;
        const startGridRow = numColFacets + state.start + 1;
        const cell = this.#placeCellInDom({
          usedKeys,
          key,
          gridRow: startGridRow,
          gridCol: level + 1,
          content: state.value as string,
          cls: `row-header level-${level}`,
          sizeKey: level,
          extraStyles: {
            rowspan: state.span,
            left: rowFacetsLeftPositions[level],
            // stops cell flickering of row facets when vertically scrolled
            transform: "translate(0, calc(var(--offset-y)))"
          },
        });

        let arr;
        if ((arr = this.#postRenderAdjustCellsPerLevel[level]) instanceof Array) {
          arr.push(cell);
        }
      }
    });
    // data cells
    for (let i = 0; i < numDataColsVisible; i++) {
      const colData = data.data ? data.data[i] ?? [] : [];
      const gridCol = numRowFacets + i + 1;
      const sizeKey = numRowFacets + vp.x0 + i;

      for (let j = 0; j < numDataRowsVisible; j++) {
        const key = `data-${vp.x0 + i}-${vp.y0 + j}`;
        const gridRow = numColFacets + j + 1;
        const value = colData[j] || "";
        this.#placeCellInDom({
          usedKeys,
          key,
          gridRow,
          gridCol,
          content: value,
          cls: "data",
          sizeKey,
          extraStyles: {}
        });
      }
    }

    // Remove unused cells
    for (const [key, cell] of this.#activeCells) {
      if (!usedKeys.has(key)) {
        this.#con.removeChild(cell);
        this.#releaseCell(cell);
        this.#activeCells.delete(key);
      }
    }

    this.#autosizeCells();
    this.#setupScrollListener();
    if (!this.#layoutBootstrapped) {
      // First time we calculate some view state assmuning columns width are 60px (default)
      // Following - Once cells are placed in dom and browser layouts the grid real values are
      // used (from browser grid layout) to adjust some state (offset / top, left / stickyness etc)
      this.#layoutBootstrapped = true;
      this.#onlayoutBootstrap();
    }
    
    // cleanup
    this.#postRenderAdjustCellsPerLevel.length = 0;
    
    this.#debugInfo(performance.now() - startTime);
  }

  #onlayoutBootstrap() {
    const vp = this.#invalidateViewport();
    const { rowFacetsLeftPositions } = this.#getFacetPositions(vp);
    for (let i = 0; i < this.#postRenderAdjustCellsPerLevel.length; i++) {
      const cells = this.#postRenderAdjustCellsPerLevel[i];
      for (let j = 0; j < cells.length; j++) {
        const cell = cells[j];
        cell.style.left = `${rowFacetsLeftPositions[i]}px`;
      }
    }
  }

  #debugInfo(dt: number) {
    const debugEl = document.getElementById("pref-info");
    if (!debugEl) return;
    debugEl.innerText = `[dT: ${dt.toFixed(2)}ms] [drawCalled = ${this.#renderCount}] [els: ${document.getElementsByTagName("*").length}] [pool: ${this.#cellPool.length}]`;
  }

  /**
    * Measure-after-render pattern: let CSS Grid auto-size with max-content,
    * then measure actual widths and cache for scroll calculations.
    *
    * Called every render because virtualized data means different content
    * appears as user scrolls - a column might show "$1,234" initially but
    * "$1,234,567,890" later. We need to catch and accommodate larger values.
    * 
    * This is done in two stages i.e. 1st pushed to this.#cellsMeasure and then calulate the
    * column width per column (instead of calculating max width when #placeCellInDom is called)
    * is to reduce layout thrashing while calling getComputedStyle().
    *
    */
  #autosizeCells() {
    if (this.#cellsToMeasure.length === 0) return;
   
    let indices: number[] = []
    for (const { cell, sizeKey } of this.#cellsToMeasure) {
      const width = cell.getBoundingClientRect().width;
      if (!width) continue;
      if (width > (indices[sizeKey] || 0)) {
        indices[sizeKey] = width;
      }
    }
    for (let i = 0; i < indices.length; i++) {
      if (indices[i] === undefined) continue;
      this.#columnSizes.indices[i] = indices[i];
    }
  }

  #releaseCell(cell: HTMLElement) {
    cell.className = "cell";
    cell.style.cssText = "";
    cell.textContent = "";
    this.#cellPool.push(cell);
  }

  // Facet merging: adjacent cells with same value become one cell with colspan/rowspan.
  // Track merge state per facet level - when value changes, emit previous merged cell.
  // This creates the hierarchical header appearance (e.g., "2024" spanning Q1-Q4).
  #mergeFacetCells(opts: {
    facetCount: number,
    itemCount: number, // how many items (rows/cols) are visible
    // [us, electonics, apple]
    // [us, electronics, nest]
    // [us, f&b, cola]
    // [us, f&b, mrpeper]
    facets: string[][],
    onMerge: (level: number, state: MergeState) => void;
  }) {
    const mergeState: Array<MergeState> = [];
    for (let level = 0; level < opts.facetCount; level++) {
      mergeState[level] = { value: null, start: 0, span: 0 };
    }

    for (let i = 0; i < opts.itemCount; i++) {
      // [us, electronics, nest]
      const facet = opts.facets[i] || [];
      for (let level = 0; level < opts.facetCount; level++) {
        const value = facet[level] || "";
        const state = mergeState[level];

        if (value === state.value && i > 0) {
          state.span++;
        } else {
          if (state.span > 0) {
            opts.onMerge(level, state);
          }
          state.value = value;
          state.start = i;
          state.span = 1;
        }
      }
    }

    // Render remaining headers
    for (let level = 0; level < opts.facetCount; level++) {
      const state = mergeState[level];
      if (state.span > 0) {
        opts.onMerge(level, state);
      }
    }
  }
}
