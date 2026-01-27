import {GridConfig, REG_NAME_COLUMN_FACETS, REG_NAME_ROW_FACETS, REG_TYPE_FIXTURE} from "../config";
import {GridDataViewModel} from "../grid-data-viewmodel";
import {addToRegistry, getFromRegistry} from "../registry";
import {Constructor, SliceResult} from "../types";
import PLayout, {BaseLayoutViewModel} from "./layout-proto";

import PFixture, {BaseHFixtureViewModel, BaseVFixtureViewModel, CellToMeasure, PHorizontalFixture, PVerticalFixture} from "./fixture-proto";
import {gridCss, gridShadowElsStyle} from "./grid-css.tmp";
import {WithCellPlacement} from "./mixins";
import CellManager from "./cell-manager";

// TODO will be moved to mixin
export interface MergeState {
  value: string | null;
  start: number;
  span: number;
}

export interface StandardLayoutViewModel extends BaseLayoutViewModel {
  offsetX: number;
  offsetY: number;
  rowFacetsWidth: number;
  // colFacetsHeight: number;
  rowFacetsLeftPositions: number[];
  // colFacetsTopPositions: number[];
}

interface Fixtures {
  top: PFixture[];
  left: PFixture[];
  bottom: PFixture[];
  right: PFixture[];
  ColumnFacetsFixtureCls: Constructor<PFixture>;
  RowFacetsFixtureCls: Constructor<PFixture>;
}

// TODO mock class
class RowFactsFixtureMock extends PHorizontalFixture {
  viewModelKey(): string {
    throw new Error("Method not implemented.");
  }
  getCellsToRender(viewModel: BaseLayoutViewModel, sliceData: SliceResult): {nodesToAppend: HTMLElement[]; cellsToMeasure: CellToMeasure[];} {
    throw new Error("Method not implemented.");
  }
  viewModel(): BaseHFixtureViewModel {
    return {
      width: 100,
    }
  }
}
addToRegistry(REG_TYPE_FIXTURE, REG_NAME_ROW_FACETS, RowFactsFixtureMock);

export default class StandardLayout extends WithCellPlacement(PLayout) {
  // all column can be of different sizes hence those are tracked based on column indices
  colsWidth: { indices: number[]; override: number[] } = {
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
  #fixtures: Fixtures;
  #con: HTMLElement;
  #virtualPanelEl: HTMLElement;
  #gridClipEl: HTMLElement;
  #scrollRAF: number | null = null;
  #scrollListenerSet = false;
  #renderCount = 0;
  #layoutBootstrapped = false;
  #cellsToMeasure: CellToMeasure[] = [];
  #postRenderAdjustCellsPerLevel: HTMLElement[][] = [];

  
  constructor(config: GridConfig, mountPoint: HTMLElement, cellManager: CellManager) {
    super(config, mountPoint, cellManager);

    [this.#con, , this.#virtualPanelEl, this.#gridClipEl] = this.#attachShadowDom();
    this.#measureRowHeight();
    this.#fixtures = this.#validateFixtures();
  }

  #attachShadowDom(): HTMLElement[] {
    const el = this.mountPoint;
    el.attachShadow({ mode: "open" });
    // TODO so that container size does not get reduced
    el.style.overflow = "scroll";
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

    this.rowHeightByType.facet = height;
    this.rowHeightByType.data = height;

    console.log(`>>> Measured row height: ${height}px`);
  }

  // TODO Move this up to the caller of layout
  #setupScrollListener(): void {
    if (this.#scrollListenerSet) return;
    this.#scrollListenerSet = true;
    this.mountPoint.addEventListener("scroll", () => {
      if (this.#scrollRAF) return;

      this.#scrollRAF = requestAnimationFrame(() => {
        this.#scrollRAF = null;
        const vs = this.viewModel();
        this.render(vs);
      });
    });
  }

  // Validation rules:
  // 1. top and bottom fixetures need to implement PVerticalFixture
  // 2. left and right fixetures need to implement PHorizontalFixture
  // 3. Must be one columnFacetsFixture and atmost one rowFacetsFixture should be present
  #validateFixtures(): Fixtures {
    const ColumnFacetsFixtureCls = getFromRegistry<PFixture>(REG_TYPE_FIXTURE, this.config.columnFacetsFixtureType);
    if (!(ColumnFacetsFixtureCls && ColumnFacetsFixtureCls.prototype instanceof PVerticalFixture)) {
      throw new Error(`Error in fixture for column facet ${ColumnFacetsFixtureCls?.name}. Must implement ${PVerticalFixture.name}`);
    }
    // const RowFacetsFixtureCls = getFromRegistry<PFixture>(REG_TYPE_FIXTURE, this.config.rowFacetsFixtureType);
    // if (!(RowFacetsFixtureCls && RowFacetsFixtureCls.prototype instanceof PHorizontalFixture)) {
    //   throw new Error(`Error in fixture for row facet ${RowFacetsFixtureCls?.name}. Must implement ${PHorizontalFixture.name}`);
    // }

    const validatedFixtures: Fixtures = {
      left: [],
      right: [],
      top: [],
      bottom: [],
      ColumnFacetsFixtureCls: ColumnFacetsFixtureCls,
      // RowFacetsFixtureCls: RowFacetsFixtureCls
      RowFacetsFixtureCls: RowFactsFixtureMock
    }
    const layoutFixtures = this.config.layoutFixtures;
    let numColFacetFixtureImpl = 0;
    let numRowFacetFixtureImpl = 0;
    for (const type of ["top", "left", "bottom", "right"] as const) {
      const fixtureNames = layoutFixtures[type];
      for (const fixtureName of fixtureNames ?? []) {
        const FixtureCls = getFromRegistry<PFixture>(REG_TYPE_FIXTURE, fixtureName);
        if (!FixtureCls) {
          throw new Error(`Can't find entry in registery. Name ${fixtureName} of type ${REG_TYPE_FIXTURE}. Register one first by calling \`Grid.register(..., ..., ...)\`.`);
        }

        const fixture = new FixtureCls(this.config, this.#con, this.cellManager);
        switch (type) {
        case "top":
        case "bottom":
          if (!(fixture instanceof PVerticalFixture)) {
            throw new Error(`${type} fixture ${fixtureName} must implement ${PVerticalFixture.name}`)
          }
          if (fixture instanceof ColumnFacetsFixtureCls) numColFacetFixtureImpl++;
          break;
        case "left":
        case "right":
          if (!(fixture instanceof PHorizontalFixture)) {
            throw new Error(`${type} fixture ${fixtureName} must implement ${PHorizontalFixture.name}`)
          }
          // if (fixture instanceof RowFacetsFixtureCls) numRowFacetFixtureImpl++;
          if (fixture instanceof RowFactsFixtureMock) numRowFacetFixtureImpl++;
          break;
        }

        validatedFixtures[type]!.push(fixture);
      }
    }

    if (numColFacetFixtureImpl !== 1) {
      throw new Error(`There must be exactly one column facet fixture. Found ${numColFacetFixtureImpl}`);
    }
    if (numRowFacetFixtureImpl > 1) {
      throw new Error(`There must be atmost one row facet fixtures. Found ${numRowFacetFixtureImpl}`);
    }

    return validatedFixtures;
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
    for (const fixture of [...this.#fixtures.top, ...this.#fixtures.bottom, ...this.#fixtures.left, ...this.#fixtures.right]) {
      fixture.setData(data);
    }
  }

  verticalViewModel() {
    const scrollTop = this.mountPoint.scrollTop;
    const viewHeight = this.mountPoint.clientHeight;

    // if there are 3 header facets then there would be 3 rows created for it
    // hence that's the total height of header
    // const heightPerFacetRow = this.rowHeightByType.facet;
    // const colFacetsHeight = this.data!.numColFacetLevels * heightPerFacetRow;
    const fixtureVms: Record<string, BaseVFixtureViewModel> = {};
    let fixturesHeight = 0;
    for (const fixture of this.#fixtures.top.concat(this.#fixtures.bottom)) {
      let vm = fixture.viewModel() as BaseVFixtureViewModel;
      fixtureVms[fixture.viewModelKey()] = vm;
      fixturesHeight += vm.height;
    }
    const dataHeight = this.data!.numRows * this.rowHeightByType.data;
    // total width of the grid if it was rendered fully
    // this value will be used to calculate scroll position there by setting dimension of virtual-panel
    const totalHeight = fixturesHeight + dataHeight;

    // Row range calculation
    // totalHeight <- full data height if it was rendered
    // viewHeight <- viewport height i.e. grid-content container height
    const scrollableHeight = Math.max(1, totalHeight - viewHeight);
    const scrollPercent = Math.min(1, scrollTop / scrollableHeight);
    const visibleDataHeight = viewHeight - fixturesHeight;

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

    console.log(">>> diff", endRow - startRow, "visibleRows", visibleRows, "scrollableRows", scrollableRows);
    // const colFacetsTopPositions: number[] = [];
    // const facetRowHeight = this.getRowHeight("facet");
    // for (let i = 0; i < this.data!.numColFacetLevels; i++) {
    //   colFacetsTopPositions.push(i * facetRowHeight);
    // }
    return {
      startRowFloat,
      startRow,
      endRow,
      totalHeight,
      offsetY,
      fixturesHeight,
      // colFacetsHeight,
      // colFacetsTopPositions
      vertFixtureVms: fixtureVms,
    }
  }

  horizontalViewModel() {
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

  viewModel(): StandardLayoutViewModel {
    if (!this.data) throw new Error("Data is not set!");

    const vsVertical = this.verticalViewModel();
    const vsHorizontal = this.horizontalViewModel();

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
      fixtures: {
        ...vsVertical.vertFixtureVms
      },
      // colFacetsHeight: vsVertical.colFacetsHeight,
      rowFacetsLeftPositions: vsHorizontal.rowFacetsLeftPositions,
      // colFacetsTopPositions: vsVertical.colFacetsTopPositions,
    }
  }

  getGridTemplate(
    numRowFacets: number,
    numColFacets: number,
    numDataCols: number,
    numDataRows: number,
  ): { columns: string; rows: string } {
    return {
      columns: `repeat(${numRowFacets + numDataCols}, max-content)`,
      rows: `repeat(${numColFacets}, ${this.rowHeightByType.facet}px) repeat(${numDataRows}, ${this.rowHeightByType.data}px)`,
    };
  }

  #updateVirtualPanel(vs: StandardLayoutViewModel): void {
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

  #onLayoutBootstrap(viewModel: StandardLayoutViewModel): void {
    this.#updateVirtualPanel(viewModel);

    for (let i = 0; i < this.#postRenderAdjustCellsPerLevel.length; i++) {
      const cells = this.#postRenderAdjustCellsPerLevel[i];
      for (let j = 0; j < cells.length; j++) {
        const cell = cells[j];
        cell.style.left = `${viewModel.rowFacetsLeftPositions[i]}px`;
      }
    }
  }

  render(vs: StandardLayoutViewModel): void {
    if (!this.data) throw new Error("Data is not set!");
    this.#renderCount++;

    const numDataColsVisible = vs.x1 - vs.x0;
    const numDataRowsVisible = vs.y1 - vs.y0;

    this.#updateVirtualPanel(vs);
    const sliceData = this.data.getSlice(vs.x0, vs.y0, vs.x1, vs.y1);

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
    // draw it at the very end
    // for (let hRow = 0; hRow < this.data!.numColFacetLevels; hRow++) {
    //   for (let hCol = 0; hCol < this.data!.numRowFacetLevels; hCol++) {
    //     const key = `corner-${hRow}-${hCol}`;
    //     const [cell, needAppend] = this.placeCellInDom({
    //       key,
    //       gridRow: hRow + 1,
    //       gridCol: hCol + 1,
    //       content: "",
    //       cls: `corner level-${hRow}${hCol === this.data!.numRowFacetLevels - 1 ? " edge-r" : ""}${hRow === this.data!.numColFacetLevels - 1 ? " edge-b" : ""}`,
    //       extraStyles: {
    //         top: vs.colFacetsTopPositions[hRow],
    //         left: vs.rowFacetsLeftPositions[hCol],
    //       },
    //     });
    //     needAppend && nodeAppendList.push(cell);
    //     this.#cellsToMeasure.push({ cell, sizeKey: hCol });
    //     this.#postRenderAdjustCellsPerLevel[hCol].push(cell);
    //   }
    // }

    // TODO already moved to fixture class
    // let merges = this.#computeMerges(this.data!.numColFacetLevels, numDataColsVisible, sliceData.columnFacets!);
    // for (const merge of merges) {
    //   const key = `col-h-${merge.level}-${vs.x0 + merge.start}`;
    //   const sizeKey = this.data!.numRowFacetLevels + vs.x0 + merge.start;
    //   const colspan = merge.span;
    //   const [cell, needAppend] = this.placeCellInDom({
    //     key,
    //     gridRow: merge.level + 1,
    //     gridCol: this.data!.numRowFacetLevels + merge.start + 1,
    //     content: merge.value,
    //     cls: `col-header level-${merge.level}`,
    //     extraStyles: {
    //       colspan,
    //       top: vs.colFacetsTopPositions[merge.level],
    //     },
    //   });
    //   needAppend && nodeAppendList.push(cell);
    //   if (!(colspan && colspan > 1)) {
    //     this.#cellsToMeasure.push({ cell, sizeKey });
    //   }
    // }

    for (const fixture of this.#fixtures.top.concat(this.#fixtures.bottom)) {
      const { nodesToAppend, cellsToMeasure } = fixture.getCellsToRender(vs, sliceData);
      nodeAppendList.push(...nodesToAppend);
      this.#cellsToMeasure.push(...cellsToMeasure);
    }

    let merges = [];
    merges = this.#computeMerges(this.data!.numRowFacetLevels, numDataRowsVisible, sliceData.rowFacets!);
    for (const merge of merges) {
      const key = `row-h-${merge.level}-${vs.y0 + merge.start}`;
      const [cell, needAppend] = this.placeCellInDom({
        key,
        gridRow: this.data!.numColFacetLevels + merge.start + 1,
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
      const gridCol = this.data!.numRowFacetLevels + i + 1;
      const sizeKey = this.data!.numRowFacetLevels + vs.x0 + i;

      for (let j = 0; j < numDataRowsVisible; j++) {
        const key = `data-${vs.x0 + i}-${vs.y0 + j}`;
        const value = colData[j] ?? "";
        const [cell, needAppend] = this.placeCellInDom({
          key,
          // gridRow: this.data!.numColFacetLevels + j + 1,
          gridRow: j + 1,
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
      const vsUpdated = this.viewModel();
      this.#onLayoutBootstrap(vsUpdated);
    }

    this.#postRenderAdjustCellsPerLevel.length = 0;
  }
}
