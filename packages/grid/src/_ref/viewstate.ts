import { GridConfig, Viewport, MergeState, FacetPositions } from "./types";
import { GridDataViewModel } from "./grid-data-viewmodel";

export class ColumnSizes {
  #rowHeight?: number;
  #indices: number[] = [];
  #override: number[] = [];
  #config: GridConfig;

  constructor(config: GridConfig) {
    this.#config = config;
  }

  set rowHeight(value: number) {
    this.#rowHeight = value;
  }

  get indices() {
    return this.#indices;
  }

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

export class ViewState {
  #config: GridConfig;
  #columnSizes: ColumnSizes;
  #meta = { totalRowsCount: 0, totalColsCount: 0 };

  constructor(config: GridConfig) {
    this.#config = config;
    this.#columnSizes = new ColumnSizes(config);
  }

  get columnSizes(): ColumnSizes {
    return this.#columnSizes;
  }

  get meta() {
    return this.#meta;
  }

  get config(): GridConfig {
    return this.#config;
  }

  updateMeta(data: GridDataViewModel): void {
    const slice = data.getSlice(0, 0, 0, 0);
    this.#meta.totalRowsCount = slice.totalRowsCount;
    this.#meta.totalColsCount = slice.totalColsCount;
  }

  calcTotalWidth(numRowFacets: number): number {
    let total = 0;
    // Row headers
    for (let i = 0; i < numRowFacets; i++) {
      total += this.#columnSizes.getColumnWidth(i);
    }
    // Data columns
    for (let i = 0; i < this.#meta.totalColsCount; i++) {
      total += this.#columnSizes.getColumnWidth(numRowFacets + i);
    }
    return total;
  }

  calcVisibleColumns(startCol: number, viewWidth: number, rowHeaderCount: number): number {
    let width = 0;
    let count = 0;

    while (width < viewWidth && startCol + count < this.#meta.totalColsCount) {
      width += this.#columnSizes.getColumnWidth(rowHeaderCount + startCol + count);
      count++;
    }

    return count + this.#config.overscan;
  }

  computeViewport(
    scrollTop: number,
    scrollLeft: number,
    viewWidth: number,
    viewHeight: number,
    data: GridDataViewModel
  ): Viewport {
    const numColFacets = data.colFacetCount;
    const numRowFacets = data.rowFacetCount;

    // calculate row header width (width of all row facets)
    let rowFacetsWidth = 0;
    for (let i = 0; i < numRowFacets; i++) {
      rowFacetsWidth += this.#columnSizes.getColumnWidth(i);
    }

    // header height = number of column facet levels * row height
    const rowHeight = this.#columnSizes.rowHeight;
    const headerHeight = numColFacets * rowHeight;
    const dataHeight = this.#meta.totalRowsCount * rowHeight;
    const totalHeight = headerHeight + dataHeight;
    const totalWidth = this.calcTotalWidth(numRowFacets);

    // Row range calculation
    const scrollableHeight = Math.max(1, totalHeight - viewHeight);
    const scrollPercent = Math.min(1, scrollTop / scrollableHeight);
    const visibleDataHeight = viewHeight - headerHeight;
    const scrollableRows = Math.max(
      0,
      this.#meta.totalRowsCount - Math.floor(visibleDataHeight / rowHeight)
    );

    const startRowFloat = scrollableRows * scrollPercent;
    const startRow = Math.floor(startRowFloat);
    const visibleRows = Math.ceil(visibleDataHeight / rowHeight) + this.#config.overscan;
    const endRow = Math.min(this.#meta.totalRowsCount, startRow + visibleRows);

    // Column range calculation (variable widths)
    const scrollableWidth = Math.max(1, totalWidth - viewWidth);
    const scrollPercentX = Math.min(1, scrollLeft / scrollableWidth);

    // Calculate max scroll column
    const visibleDataWidth = viewWidth - rowFacetsWidth;
    let maxScrollWidth = 0;
    let maxScrollCol = this.#meta.totalColsCount;
    let lastColWidth = -1;
    while (maxScrollWidth < visibleDataWidth && maxScrollCol > 0) {
      maxScrollCol--;
      lastColWidth = this.#columnSizes.getColumnWidth(data.rowFacetCount + maxScrollCol);
      maxScrollWidth += lastColWidth;
    }
    maxScrollCol = Math.min(
      this.#meta.totalColsCount - 1,
      maxScrollCol + (maxScrollWidth - visibleDataWidth) / lastColWidth
    );

    const startColFloat = maxScrollCol * scrollPercentX;
    const startCol = Math.floor(startColFloat);
    const visibleCols = this.calcVisibleColumns(startCol, visibleDataWidth, numRowFacets);
    const endCol = Math.min(this.#meta.totalColsCount, startCol + visibleCols);

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

  getFacetPositions(rowHeight: number, data: GridDataViewModel): FacetPositions {
    const rowFacetsLeftPositions = [0];
    for (let i = 0; i < data.rowFacetCount - 1; i++) {
      rowFacetsLeftPositions.push(
        rowFacetsLeftPositions[i] + this.#columnSizes.getColumnWidth(i)
      );
    }
    const colFacetsTopPositions: number[] = [];
    for (let i = 0; i < data.colFacetCount; i++) {
      colFacetsTopPositions.push(i * rowHeight);
    }

    return {
      rowFacetsLeftPositions,
      colFacetsTopPositions,
    };
  }

  computeMerges(opts: {
    facetCount: number;
    itemCount: number;
    facets: string[][];
  }): Array<{ level: number; state: MergeState }> {
    const results: Array<{ level: number; state: MergeState }> = [];

    const mergeState: Array<MergeState> = [];
    for (let level = 0; level < opts.facetCount; level++) {
      mergeState[level] = { value: null, start: 0, span: 0 };
    }

    for (let i = 0; i < opts.itemCount; i++) {
      const facet = opts.facets[i] || [];
      for (let level = 0; level < opts.facetCount; level++) {
        const value = facet[level] || "";
        const state = mergeState[level];

        if (value === state.value && i > 0) {
          state.span++;
        } else {
          if (state.span > 0) {
            results.push({ level, state: { ...state } });
          }
          state.value = value;
          state.start = i;
          state.span = 1;
        }
      }
    }

    // Emit remaining merges
    for (let level = 0; level < opts.facetCount; level++) {
      const state = mergeState[level];
      if (state.span > 0) {
        results.push({ level, state: { ...state } });
      }
    }

    return results;
  }
}
