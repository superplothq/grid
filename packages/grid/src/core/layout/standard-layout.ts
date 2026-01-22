import {GridDataViewModel} from "../../grid-data-viewmodel";
import {ViewState} from "../../types";
import {PLayout} from "../layout-proto";
import {RegionLayout} from "./types";

export default class StandardLayout extends PLayout {
  numRowFacets: number = 0;
  numColFacets: number = 0;
  numRows = 0;
  numCols = 0;
  // all column can be of different sizes hence those are tracked based on
  // column indices
  colsWidth = {
    indices: [],
    override: [],
  }
  // facet row and data row can have spearate sizes hence those are tracked
  // based on row type. But then all facet rows would have same size and all
  // data rows would have same size.
  rowHeightByType = {
    facet: 0,
    data: 0,
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

    while (width < viewWidth && startCol + count < this.numCols) {
      width += this.getColumnWidth(rowHeaderCount + startCol + count);
      count++;
    }

    return count + this.config.overscan;
  }

  setData(data: GridDataViewModel): void {
    super.setData(data);

    const slice = this.data!.getSlice(0, 0, 0, 0);
    // these are total number of rows and columns (not slice's rows and cols)
    this.numRows = slice.numRows;
    this.numCols = slice.numCols;
    this.numRowFacets = data.numRowFacets;
    this.numColFacets = data.numColFacets;
  }

  calculateVisibleRowRanges() {
    const scrollTop = this.mountPoint.scrollTop;
    const viewHeight = this.mountPoint.clientHeight;

    // if there are 3 header facets then there would be 3 rows created for it
    // hence that's the total height of header
    const heightPerFacetRow = this.rowHeightByType.facet;
    const colFacetsHeight = this.numColFacets * heightPerFacetRow;
    const dataHeight = this.numCols * this.rowHeightByType.data;
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
    const scrollableRows  = Math.max(0, this.numRows - Math.floor(visibleDataHeight / this.rowHeightByType.data)); 

    const startRowFloat = scrollableRows * scrollPercent;
    const startRow = Math.floor(startRowFloat);
    const visibleRows = Math.ceil(visibleDataHeight / this.rowHeightByType.data) + this.config.overscan;
    const endRow = Math.min(this.numRows, startRow + visibleRows);
    const offsetY = (startRowFloat - startRow) * this.rowHeightByType.data;

    return {
      startRowFloat,
      startRow,
      endRow,
      totalHeight,
      colFacetsHeight,
      offsetY
    }
  }

  // Column range calculation (variable widths)
  calculateVisibleColRanges() {
    const scrollLeft = this.mountPoint.scrollLeft;
    const viewWidth = this.mountPoint.clientWidth;

    // TODO[improvment]
    //   rf11 rf12 rf13 ... ...
    //   ____ ____ rf23 ... ...
    //   ____ rf12 rf33 ... ...
    //   ____ ____ rf43 ... ...
    //   1. For config like this if rf12 is overflowing it can wrap it's content
    //   2. Individual row facet might have it's own maxWidth
    const rowFacetsWidth = this.getColWidthTillIdx(this.numRowFacets);
    const totalWidth = this.getColWidthTillIdx(this.numColFacets + this.numCols);
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
    let maxScrollCol = this.numCols;
    let lastColWidth = -1;
    while (maxScrollWidth < visibleDataWidth && maxScrollCol > 0) {
      maxScrollCol--;
      lastColWidth =  this.getColumnWidth(this.numRowFacets + maxScrollCol);
      maxScrollWidth += lastColWidth;
    }
    maxScrollCol = Math.min(this.numCols - 1, maxScrollCol + ((maxScrollWidth - visibleDataWidth)) / lastColWidth);

    const startColFloat = maxScrollCol * scrollPercentX;
    const startCol = Math.floor(startColFloat);
    const visibleCols = this.calcNumVisibleColumns(startCol, visibleDataWidth, this.numRowFacets);
    const endCol = Math.min(this.numCols, startCol + visibleCols);
      
    const startColWidth = this.getColumnWidth(this.numRowFacets + startCol);
    const offsetX = (startColFloat - startCol) * startColWidth;


    return {
      startColFloat,
      startCol,
      endCol,
      totalWidth,
      rowFacetsWidth,
      offsetX
    }
  }

  calculateViewState(): ViewState {
    if (!this.data) throw new Error("Data is not set!");

    const vsVertical = this.calculateVisibleRowRanges();
    const vsHorizontal = this.calculateVisibleColRanges();

    return {
      x0: vsHorizontal.startCol,
      y0: vsVertical.startRow,
      x1: vsHorizontal.endCol,
      y1: vsVertical.endRow,
      offsetX: vsHorizontal.offsetX,
      offsetY: vsVertical.offsetY,
      totalHeight: vsVertical.totalHeight,
      totalWidth: vsHorizontal.totalWidth,
      // rowHeight,
      rowFacetsWidth: vsHorizontal.rowFacetsWidth,
      colFacetsHeight: vsVertical.colFacetsHeight,
    }
  }

  calculateLayout(vs: ViewState): RegionLayout[] {
    const numDataColsVisible = vs.x1 - vs.x0;
    const numDataRowsVisible = vs.y1 - vs.y0;

    const regions: RegionLayout[] = [];

    // Corner region (if row facets exist i.e. pivot table is being drawn)
    if (this.numRowFacets > 0 && this.numColFacets > 0) {
      regions.push({
        type: "corner",
        gridArea: {
          rowStart: 1,
          rowEnd: this.numColFacets + 1,
          colStart: 1,
          colEnd: this.numRowFacets + 1,
        },
        cells: [],
      });
    }

    if (this.numColFacets > 0) {
      regions.push({
        type: "colFacet",
        gridArea: {
          rowStart: 1,
          rowEnd: this.numColFacets + 1,
          colStart: this.numRowFacets + 1,
          colEnd: this.numRowFacets + numDataColsVisible + 1,
        },
        cells: [],
      });
    }

    // Row facet region
    if (this.numRowFacets > 0) {
      regions.push({
        type: "rowFacet",
        gridArea: {
          rowStart: this.numColFacets + 1,
          rowEnd: this.numColFacets + numDataRowsVisible + 1,
          colStart: 1,
          colEnd: this.numRowFacets + 1,
        },
        cells: [],
      });
    }

    // Value region (always present)
    regions.push({
      type: "values",
      gridArea: {
        rowStart: this.numColFacets + 1,
        rowEnd: this.numColFacets + numDataRowsVisible + 1,
        colStart: this.numRowFacets + 1,
        colEnd: this.numRowFacets + numDataColsVisible + 1,
      },
      cells: [],
    });

    return regions;
  }

  getGridTemplate(
    numRowFacets: number,
    numColFacets: number,
    numDataCols: number,
    numDataRows: number,
  ): { columns: string; rows: string } {
    return {
      columns: `repeat(${numRowFacets + numDataCols}, max-content)`,
      rows: `repeat(${numColFacets}, ${this.rowHeightByType.facet}) repeat(${numDataRows}, ${this.rowHeightByType.data})`,
    };
  }
}
