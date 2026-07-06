// Renderer return type convention:
// - CellRenderer, FacetCellRenderer, FacetHeaderRenderer can all return `void`.
// - When a renderer returns `void`, it signals that the renderer has taken ownership of the
//   container element (e.g. React's createRoot renders directly into it). In that case the
//   layout must NOT replace or append children — the container already holds the rendered content.
// - When a renderer returns content (string, HTMLElement, HTMLElement[], FacetCellContent),
//   the layout is responsible for placing that content into the DOM via getCommonCellForContainer.

import CellManager from "./cell-manager";
import { PHorizontalFixture, PVerticalFixture } from "./fixture-proto";
import { GridConfig } from "./grid-config";
import { GridDataViewModel } from "./grid-data-viewmodel";
import PLayout, { BaseViewModel, RenderCtx } from "./layout-proto";
import { addOrReplaceChildren, WithCellPlacement, WithEvents } from "./mixins";
import { getTheme } from "./registry";
import {
  CellToMeasure,
  FacetCellContent,
  FacetCellRenderer,
  FacetDataContext,
  FacetDef,
  HeaderCellContext,
  FacetRendererContext,
  ColAutoSizeConfig,
  IColAutoSizeStrategyFixedWidth,
  IColAutoSizeStrategyStatic,
  PivotSliceResult,
  SelectionRule,
} from "./types";
import { evaluateRulesForDataCell, evaluateRulesForFacetCell } from "./select-all";
import { computeMerges, MergeState } from "./utils";

export type LayoutEvents = {
  renderComplete: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
  viewDataEmpty: {
    startRow: number;
    endRow: number;
  };
  viewModelDataChanged: {
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

export interface LayoutFixtures {
  top: Array<PHorizontalFixture>;
  left: Array<PVerticalFixture>;
  bottom: Array<PHorizontalFixture>;
  right: Array<PVerticalFixture>;
}

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
  fixedLeftVTrackPositions: number[];
  fixedRightVTrackPositions: number[];
  fixedTopHTrackPositions: number[];
  fixedBottomHTrackPositions: number[];
  colFacetsTopPositions: number[];
  selections: SelectionState[];
  fixtures: LayoutFixtures;
  logicalStartRow: number;
  logicalEndRow: number;
}

export interface CellRenderResult {
  cellsToMeasure: CellToMeasure[];
  adjustCells: { cell: HTMLElement; level: number }[];
  nodesToAppend: HTMLElement[];
}

function colSizeToCss(colSize: ColAutoSizeConfig | undefined): string {
  if (colSize?.strategy === "static") {
    const s = colSize as IColAutoSizeStrategyStatic;
    return `${s.width}${s.unit}`;
  }
  return "1fr";
}

const StandardLayoutBase = WithEvents<LayoutEvents>()(WithCellPlacement(PLayout));

interface ResizeState {
  widthBeforeResize: number;
  currentWidth: number;
}


export default class StandardLayout extends StandardLayoutBase {
  // the grid is divided into three regions: left, center and right
  // left region is sticky and hosts fixture + row facets + pinned columns (later)
  // right region is sticky and hosts pinned columns (later) + fixture
  // center region is where the value cells are displayed
  colsWidth: {
    left: { indices: number[]; override: number[] };
    center: { indices: number[]; override: number[] };
    right: { indices: number[]; override: number[] };
  } = {
      left: { indices: [], override: [] },
      center: { indices: [], override: [] },
      right: { indices: [], override: [] },
    };
  #resizeState: Map<string, ResizeState> = new Map();
  // facet row and data row can have spearate sizes hence those are tracked
  // based on row type. But then all facet rows would have same size and all
  // data rows would have same size.
  rowHeightByType = {
    facet: 0,
    data: 0,
  };
  #con: HTMLElement;
  #virtualPanelEl: HTMLElement;
  #gridClipEl: HTMLElement;
  #scrollRAF: number | null = null;
  #scrollListenerSet = false;
  #scrollAxisLock: "x" | "y" | null = null;
  #renderCount = 0;
  #layoutBootstrapped = false;
  #viewDataEmptyTimer: ReturnType<typeof setTimeout> | null = null;
  #cellsToMeasure: CellToMeasure[] = [];
  #postRenderAdjustLeftCellsPerLevel: HTMLElement[][] = [];
  #postRenderAdjustRightCellsPerLevel: HTMLElement[][] = [];
  #proposal: ViewModelProposal = {};
  #fixtures: LayoutFixtures;
  #fixtureMeasurements = { top: [] as number[], topTotal: 0, bottom: [] as number[], bottomTotal: 0 };
  #selectAllRules: readonly SelectionRule[] = [];
  #isStaticStrategy = false;
  #viewportDataChangeUnsub: (() => void) | null = null;
  #columnTemplateParts: string[] | null = null;
  #columnTemplateDataStartCol = 0;

  constructor(config: GridConfig, mountPoint: HTMLElement, cellManager: CellManager) {
    super(config, mountPoint, cellManager);

    [this.#con, , this.#virtualPanelEl, this.#gridClipEl] = this.#attachShadowDom();
    this.#applyTheme();
    this.#fixtures = this.#validateFixtures();
  }

  viewModelProposal(proposal: ViewModelProposal): void {
    Object.assign(this.#proposal, proposal);
  }

  setSelectAllRules(rules: readonly SelectionRule[]): void {
    this.#selectAllRules = rules;
  }

  protected get selectAllRules(): readonly SelectionRule[] {
    return this.#selectAllRules;
  }

  protected resolveFacetOverrides(facetPath: (string | null)[], facetDefs: FacetDef[]): { trackRenderer: FacetCellRenderer | undefined; styleFns: ((el: HTMLElement) => void)[] } {
    if (this.#selectAllRules.length === 0) return { trackRenderer: undefined, styleFns: [] };
    const result = evaluateRulesForFacetCell(this.#selectAllRules, facetPath, facetDefs);
    return { trackRenderer: result.effectiveTrackRenderer, styleFns: result.styleFns };
  }

  get gridContainer(): HTMLElement {
    return this.#con;
  }

  get numLeftFixedTracks(): number {
    return this.#fixtures.left.length + this.data!.numRowFacetLevels;
  }

  protected get numLeftFixtures(): number {
    return this.#fixtures.left.length;
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

  #applyTheme(): void {
    const theme = getTheme(this.config.theme);
    if (!theme) return;
    for (const [key, value] of Object.entries(theme)) {
      const cssVar = "--" + key.replace(/[A-Z]/g, m => "-" + m.toLowerCase());
      this.#con.style.setProperty(cssVar, String(value));
    }
  }
  // Validation rules:
  // 1. top and bottom fixetures need to implement PHorizontalFixture i.e. they are laid out horizontally parallel to
  //    grid x spanning all the columns
  // 2. left and right fixetures need to implement PHorizontalFixture i.e. they are laid out vertically parallel to
  //    grid y spanning all the rows
  #validateFixtures(): LayoutFixtures {
    const fixtureDefs = this.config.fixtures;
    const fixtures: LayoutFixtures = {
      top: [],
      left: [],
      bottom: [],
      right: [],
    };

    for (const type of ["top", "left", "bottom", "right"] as const) {
      for (const FixtureCls of fixtureDefs[type]) {
        const inst = new FixtureCls(this.config, this.#con, this.cellManager);
        switch (type) {
        case "left":
        case "right":
          if (!(inst instanceof PVerticalFixture)) {
            throw new Error(`${type} fixture ${inst.constructor.name} must implement ${PVerticalFixture.name}`);
          }
          fixtures[type].push(inst);
          break;
        case "top":
        case "bottom":
          if (!(inst instanceof PHorizontalFixture)) {
            throw new Error(`${type} fixture ${inst.constructor.name} must implement ${PHorizontalFixture.name}`);
          }
          fixtures[type].push(inst);
          break;
        }
      }
    }

    return fixtures;
  }

  // calculate both facet and data row heights
  // TODO if fixtures are added get height of a row with fixtures as they might increase the size
  #measureRowHeight(): void {
    const facetSample = document.createElement("div");
    facetSample.className = "cell col-facet facet";
    facetSample.style.visibility = "hidden";
    // TODO[now] implement custom renderers and includeing renderder void (renderer from framework)
    const sampleMerge: MergeState = { value: "Mgy$123,456", path: "Mgy$123,456", level: 0, start: 0, spanPrimary: 1, spanSecondary: 1 };
    const colFacetDefs = this.data!.facetDefs.col;
    this.buildAndPlaceFacetCell(facetSample, colFacetDefs, sampleMerge, [["Mgy$123,456"]], "test-measurement-track");
    this.#con.appendChild(facetSample);
    this.onBeforeMeasure?.();
    let facetHeight = facetSample.getBoundingClientRect().height;
    this.#con.removeChild(facetSample);
    this.cellManager.onRelease("test-measurement-track", facetSample);

    const headerSample = document.createElement("div");
    headerSample.className = "cell col-header header";
    headerSample.style.visibility = "hidden";
    const headerContainer = this.createFacetContainer(headerSample);
    const headerContent = colFacetDefs[0].headerRenderer("Mgy$123,456", { viewModel: this.data!, level: 0, key: "__measure", cell: headerSample, container: headerContainer, render: (vm: GridDataViewModel) => this.renderWithDataViewModel(vm) });
    this.populateFacetContainer(headerSample, headerContainer, headerContent);
    this.#con.appendChild(headerSample);
    this.onBeforeMeasure?.();
    facetHeight = Math.max(facetHeight, headerSample.getBoundingClientRect().height);
    this.#con.removeChild(headerSample);
    this.cellManager.onRelease("__measure", headerSample);

    const rowFacetDefs = this.data!.facetDefs.row;
    if (rowFacetDefs.length > 0) {
      const rowHeaderSample = document.createElement("div");
      rowHeaderSample.className = "cell corner header";
      rowHeaderSample.style.visibility = "hidden";
      const rowHeaderContainer = this.createFacetContainer(rowHeaderSample);
      const rowHeaderContent = rowFacetDefs[0].headerRenderer(rowFacetDefs[0].text, { viewModel: this.data!, level: 0, key: "__row_header_measure", cell: rowHeaderSample, container: rowHeaderContainer, render: (vm: GridDataViewModel) => this.renderWithDataViewModel(vm) });
      this.populateFacetContainer(rowHeaderSample, rowHeaderContainer, rowHeaderContent);
      this.#con.appendChild(rowHeaderSample);
      this.onBeforeMeasure?.();
      facetHeight = Math.max(facetHeight, rowHeaderSample.getBoundingClientRect().height);
      this.#con.removeChild(rowHeaderSample);
      this.cellManager.onRelease("__row_header_measure", rowHeaderSample);
    }

    this.rowHeightByType.facet = facetHeight;

    const colDefs = this.data!.vTrackDefs;
    const measureCells: HTMLElement[] = [];

    for (let col = 0; col < this.data!.numCols; col++) {
      const colDef = colDefs[col];
      const cell = document.createElement("div");
      cell.className = "cell data";
      cell.style.visibility = "hidden";
      cell.style.gridRow = "9999";
      cell.style.gridColumn = `${col + 1}`;

      if (colDef.cellHeight !== undefined) {
        cell.style.height = `${colDef.cellHeight}px`;
      } else {
        const sampleValue = colDef.sampleData ?? this.data!.getSlice(col, 0, col + 1, 1).data?.[0]?.[0];
        const content = colDef.renderer(sampleValue, { viewModel: this.data!, rowIndex: 0, colIndex: col }, { container: cell, key: `test-measurement-${col}` });
        if (content !== undefined) addOrReplaceChildren(cell, content);
      }
      measureCells.push(cell);
    }

    this.#con.append(...measureCells);
    this.onBeforeMeasure?.();

    let maxHeight = 0;
    for (const cell of measureCells) {
      maxHeight = Math.max(maxHeight, cell.getBoundingClientRect().height);
    }
    this.rowHeightByType.data = maxHeight || this.rowHeightByType.facet;

    for (const cell of measureCells) {
      this.#con.removeChild(cell);
    }

    this.#fixtureMeasurements = { top: [], topTotal: 0, bottom: [], bottomTotal: 0 };
    for (const side of ["top", "bottom"] as const) {
      for (const fixture of this.#fixtures[side]) {
        const h = fixture.getHeight();
        this.#fixtureMeasurements[side].push(h);
        this.#fixtureMeasurements[`${side}Total`] += h;
      }
    }
  }

  protected createFacetContainer(cell: HTMLElement): HTMLElement {
    const existing = cell.querySelector(".f-cell-con") as HTMLElement | null;
    if (existing) return existing;
    const container = document.createElement("div");
    container.className = "f-cell-con";
    return container;
  }

  protected populateFacetContainer(cell: HTMLElement, container: HTMLElement, result: FacetCellContent | string | HTMLElement | HTMLElement[] | void | null): void {
    if (result !== undefined && result !== null) {
      const children = this.getCommonCellForContainer(result);
      container.replaceChildren(...children);
    }
    addOrReplaceChildren(cell, container);
  }

  private getCommonCellForContainer(result: FacetCellContent | string | HTMLElement | HTMLElement[]): HTMLElement[] {
    const isFacetCellContent = typeof result === "object" && !(result instanceof HTMLElement) && !Array.isArray(result) && "content" in result;

    if (!isFacetCellContent) {
      const span = document.createElement("span");
      span.className = "content";
      addOrReplaceChildren(span, result as string | HTMLElement | HTMLElement[]);
      return [span];
    }

    const { left, content: center, right } = result as FacetCellContent;
    const children: HTMLElement[] = [];

    if (left !== undefined) {
      const leftDiv = document.createElement("div");
      addOrReplaceChildren(leftDiv, left);
      children.push(leftDiv);
    }

    const contentDiv = document.createElement("div");
    contentDiv.className = "content";
    if (center !== undefined) {
      addOrReplaceChildren(contentDiv, center);
    }
    children.push(contentDiv);

    if (right !== undefined) {
      const rightDiv = document.createElement("div");
      addOrReplaceChildren(rightDiv, right);
      children.push(rightDiv);
    }

    return children;
  }

  protected appendResizeHandle(cell: HTMLElement, region: "left" | "center" | "right"): HTMLElement {
    const handle = document.createElement("span");
    handle.className = "resize-handle";
    cell.dataset.cellActionResize = "1";
    cell.dataset.cellRegion = region;
    cell.appendChild(handle);
    return handle;
  }

  protected buildAndPlaceFacetCell(cell: HTMLElement, facetDefs: FacetDef[], merge: MergeState, facets: (string | null)[][], key: string, opts?: { rendererOverride?: FacetCellRenderer; resizeHandle?: boolean; absoluteIndex?: number }): void {
    const renderer = opts?.rendererOverride ?? facetDefs[merge.level].trackRenderer;
    const container = this.createFacetContainer(cell);
    const dataCtx: FacetDataContext = {
      viewModel: this.data!,
      path: facets[merge.start],
      level: merge.level,
      index: opts?.absoluteIndex ?? merge.start,
      key,
    };
    const rendererCtx: FacetRendererContext = {
      render: (vm: GridDataViewModel) => this.renderWithDataViewModel(vm),
      cell,
      container,
    };
    const result = renderer(merge.value, dataCtx, rendererCtx);
    this.populateFacetContainer(cell, container, result);
    if (opts?.resizeHandle) {
      this.appendResizeHandle(cell, "center");
    }
  }

  // TODO smooth scrolling. scrolling behaves a litte weird across different devices.
  #setupScrollListener(): void {
    if (this.#scrollListenerSet) return;
    this.#scrollListenerSet = true;

    const scheduleRender = () => {
      if (this.#scrollRAF) return;
      this.#scrollRAF = requestAnimationFrame(() => {
        this.#scrollRAF = null;
        const t1 = performance.now();
        const viewModel = this.calculateViewModel();
        this.render(viewModel, { t1, hintContentDirty: true });
      });
    };

    this.mountPoint.addEventListener("wheel", (e) => {
      e.preventDefault();

      const absDX = Math.abs(e.deltaX);
      const absDY = Math.abs(e.deltaY);

      this.#scrollAxisLock = absDX > absDY ? "x" : "y";
      if (this.#scrollAxisLock === "x") {
        this.mountPoint.scrollLeft += e.deltaX;
      } else {
        this.mountPoint.scrollTop += e.deltaY;
      }

      scheduleRender();
    }, { passive: false });

    this.mountPoint.addEventListener("scroll", () => { scheduleRender(); });
  }

  getRowHeight(type: "facet" | "data") {
    return this.rowHeightByType[type] || this.config.defaultCellHeight;
  }

  // TODO[now] all new methods should be private
  getColumnWidth(region: "left" | "center" | "right", index: number): number {
    return this.colsWidth[region].override[index]
      ?? this.colsWidth[region].indices[index]
      ?? this.config.defaultCellWidth;
  }

  #getLeftRegionWidth(): number {
    return this.#getLeftFixtureWidth() + this.#getRowFacetsWidth();
  }

  #getLeftFixtureWidth(): number {
    let width = 0;
    for (let i = 0; i < this.#fixtures.left.length; i++) {
      width += this.getColumnWidth("left", i);
    }
    return width;
  }

  #getRowFacetsWidth(): number {
    let width = 0;
    const start = this.#fixtures.left.length;
    for (let i = 0; i < this.data!.numRowFacetLevels; i++) {
      width += this.getColumnWidth("left", start + i);
    }
    return width;
  }

  #getRightFixtureWidth(): number {
    let width = 0;
    for (let i = 0; i < this.#fixtures.right.length; i++) {
      width += this.getColumnWidth("right", i);
    }
    return width;
  }

  #getCenterTotalWidth(): number {
    let width = 0;
    for (let i = 0; i < this.data!.numCols; i++) {
      width += this.getColumnWidth("center", i);
    }
    return width;
  }

  #calcNumVisibleDataColumns(startCol: number, viewWidth: number) {
    let width = 0;
    let count = 0;

    while (width < viewWidth && startCol + count < this.data!.numCols) {
      width += this.getColumnWidth("center", startCol + count);
      count++;
    }

    return count + this.config.overscan;
  }

  setData(data: GridDataViewModel): void {
    if (this.#viewportDataChangeUnsub) {
      this.#viewportDataChangeUnsub();
      this.#viewportDataChangeUnsub = null;
    }
    super.setData(data);
    this.#viewportDataChangeUnsub = data.register("viewportDataChange", (viewport) => {
      this.emit("viewModelDataChanged", viewport);
    });
    for (const side of ["top", "left", "bottom", "right"] as const) {
      for (const inst of this.#fixtures[side]) {
        inst.setData(data);
      }
    }
    this.#isStaticStrategy = data.hasStaticStrategy ||
      [...this.#fixtures.left, ...this.#fixtures.right].some(f => f.colSize.strategy === "static");
    this.#measureRowHeight();
  }

  renderWithDataViewModel(data: GridDataViewModel): void {
    this.setData(data);
    const t1 = performance.now();
    const viewModel = this.calculateViewModel();
    this.render(viewModel, { t1 });
  }

  calculateVerticalViewModel() {
    const scrollTop = this.mountPoint.scrollTop;
    const viewHeight = this.mountPoint.clientHeight;

    const fixtureHeightTop = this.#fixtureMeasurements.topTotal;
    const fixtureHeightBottom = this.#fixtureMeasurements.bottomTotal;

    // if there are 3 header facets then there would be 3 rows created for it
    // hence that's the total height of header
    const heightPerFacetRow = this.rowHeightByType.facet;
    const colFacetsHeight = this.data!.numColFacetLevels * heightPerFacetRow;
    const dataHeight = this.data!.totalRows * this.rowHeightByType.data;
    // total width of the grid if it was rendered fully
    // this value will be used to calculate scroll position there by setting dimension of virtual-panel
    const totalHeight = colFacetsHeight + dataHeight + fixtureHeightTop + fixtureHeightBottom;

    // Row range calculation
    // totalHeight <- full data height if it was rendered
    // viewHeight <- viewport height i.e. grid-content container height
    const scrollableHeight = Math.max(1, totalHeight - viewHeight);
    const scrollPercent = Math.min(1, scrollTop / scrollableHeight);
    const visibleDataHeight = viewHeight - colFacetsHeight - fixtureHeightTop - fixtureHeightBottom;

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
    const scrollableRows  = Math.max(0, this.data!.totalRows - Math.floor(visibleDataHeight / this.rowHeightByType.data));

    const startRowFloat = scrollableRows * scrollPercent;
    const logicalStartRow = Math.floor(startRowFloat);
    const visibleRows = Math.ceil(visibleDataHeight / this.rowHeightByType.data) + this.config.overscan;
    const logicalEndRow = Math.min(this.data!.totalRows, logicalStartRow + visibleRows);
    const offsetY = (startRowFloat - logicalStartRow) * this.rowHeightByType.data;

    const dataOffsetTop = this.data!.offsetTop;
    const startRow = Math.max(0, Math.min(this.data!.numRows, logicalStartRow - dataOffsetTop));
    const endRow = Math.max(0, Math.min(this.data!.numRows, logicalEndRow - dataOffsetTop));

    const colFacetsTopPositions: number[] = [];
    const facetRowHeight = this.getRowHeight("facet");
    for (let i = 0; i < this.data!.numColFacetLevels; i++) {
      colFacetsTopPositions.push(i * facetRowHeight);
    }

    const fixedTopHTrackPositions: number[] = [];
    let accFixtureTop = colFacetsHeight;
    for (const h of this.#fixtureMeasurements.top) {
      fixedTopHTrackPositions.push(accFixtureTop);
      accFixtureTop += h;
    }

    const fixedBottomHTrackPositions: number[] = [];
    let accFixtureBottom = 0;
    for (let i = this.#fixtureMeasurements.bottom.length - 1; i >= 0; i--) {
      fixedBottomHTrackPositions[i] = accFixtureBottom;
      accFixtureBottom += this.#fixtureMeasurements.bottom[i];
    }

    return {
      startRowFloat,
      startRow,
      endRow,
      totalHeight,
      colFacetsHeight,
      offsetY,
      colFacetsTopPositions,
      fixedTopHTrackPositions,
      fixedBottomHTrackPositions,
      logicalStartRow,
      logicalEndRow,
    };
  }

  calculateHorizontalViewModelForFitContainer() {
    const viewWidth = this.mountPoint.clientWidth;

    const fixedVTrackLeftPositions = [0];
    const numLeftTracks = this.#fixtures.left.length + this.data!.numRowFacetLevels;
    for (let i = 0; i < numLeftTracks - 1; i++) {
      fixedVTrackLeftPositions.push(
        fixedVTrackLeftPositions[fixedVTrackLeftPositions.length - 1] + this.getColumnWidth("left", i));
    }

    const fixedVTrackRightPositions: number[] = [];
    let accRightWidth = 0;
    for (let i = this.#fixtures.right.length - 1; i >= 0; i--) {
      fixedVTrackRightPositions[i] = accRightWidth;
      accRightWidth += this.getColumnWidth("right", i);
    }

    const rowFacetsWidth = this.#getRowFacetsWidth();

    return {
      startColFloat: 0,
      startCol: 0,
      endCol: this.data!.numCols,
      totalWidth: viewWidth,
      rowFacetsWidth,
      offsetX: 0,
      fixedVTrackLeftPositions,
      fixedVTrackRightPositions,
    };
  }

  calculateHorizontalViewModel() {
    const scrollLeft = this.mountPoint.scrollLeft;
    const viewWidth = this.mountPoint.clientWidth;

    const leftFixtureWidth = this.#getLeftFixtureWidth();
    // TODO[improvment]
    //   rf11 rf12 rf13 ... ...
    //   ____ ____ rf23 ... ...
    //   ____ rf12 rf33 ... ...
    //   ____ ____ rf43 ... ...
    //   1. For config like this if rf12 is overflowing it can wrap it's content
    //   2. Individual row facet might have it's own maxWidth
    const rowFacetsWidth = this.#getRowFacetsWidth();
    const rightFixtureWidth = this.#getRightFixtureWidth();
    const totalWidth = this.#getLeftRegionWidth() + this.#getCenterTotalWidth() + rightFixtureWidth;
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
    const visibleDataWidth = viewWidth - rowFacetsWidth - leftFixtureWidth - rightFixtureWidth;
    let maxScrollWidth = 0;
    let maxScrollCol = this.data!.numCols;
    let lastColWidth = -1;
    while (maxScrollWidth < visibleDataWidth && maxScrollCol > 0) {
      maxScrollCol--;
      lastColWidth = this.getColumnWidth("center", maxScrollCol);
      maxScrollWidth += lastColWidth;
    }
    maxScrollCol = Math.min(this.data!.numCols - 1, maxScrollCol + ((maxScrollWidth - visibleDataWidth)) / lastColWidth);

    const startColFloat = maxScrollCol * scrollPercentX;
    const startCol = Math.floor(startColFloat);
    const visibleCols = this.#calcNumVisibleDataColumns(startCol, visibleDataWidth);
    const endCol = Math.min(this.data!.numCols, startCol + visibleCols);

    const startColWidth = this.getColumnWidth("center", startCol);
    const offsetX = (startColFloat - startCol) * startColWidth;

    const numLeftTracks = this.#fixtures.left.length + this.data!.numRowFacetLevels;
    const fixedVTrackLeftPositions = [0];
    for (let i = 0; i < numLeftTracks - 1; i++) {
      fixedVTrackLeftPositions.push(
        fixedVTrackLeftPositions[fixedVTrackLeftPositions.length - 1] + this.getColumnWidth("left", i));
    }

    const fixedVTrackRightPositions: number[] = [];
    let accRightWidth = 0;
    for (let i = this.#fixtures.right.length - 1; i >= 0; i--) {
      fixedVTrackRightPositions[i] = accRightWidth;
      accRightWidth += this.getColumnWidth("right", i);
    }

    return {
      startColFloat,
      startCol,
      endCol,
      totalWidth,
      rowFacetsWidth,
      offsetX,
      fixedVTrackLeftPositions,
      fixedVTrackRightPositions,
    };
  }

  calculateViewModel(): ViewModel {
    if (!this.data) throw new Error("Data is not set!");

    const vsVertical = this.calculateVerticalViewModel();
    const vsHorizontal = this.#isStaticStrategy
      ? this.calculateHorizontalViewModelForFitContainer()
      : this.calculateHorizontalViewModel();

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
      fixedLeftVTrackPositions: vsHorizontal.fixedVTrackLeftPositions,
      fixedRightVTrackPositions: vsHorizontal.fixedVTrackRightPositions,
      fixedTopHTrackPositions: vsVertical.fixedTopHTrackPositions,
      fixedBottomHTrackPositions: vsVertical.fixedBottomHTrackPositions,
      colFacetsTopPositions: vsVertical.colFacetsTopPositions,
      selections,
      fixtures: this.#fixtures,
      logicalStartRow: vsVertical.logicalStartRow,
      logicalEndRow: vsVertical.logicalEndRow,
    };
  }

  scrollToRow(targetRow: number): void {
    const viewHeight = this.mountPoint.clientHeight;
    const fixtureHeightTop = this.#fixtureMeasurements.topTotal;
    const fixtureHeightBottom = this.#fixtureMeasurements.bottomTotal;
    const colFacetsHeight = this.data!.numColFacetLevels * this.rowHeightByType.facet;
    const dataHeight = this.data!.totalRows * this.rowHeightByType.data;
    const totalHeight = colFacetsHeight + dataHeight + fixtureHeightTop + fixtureHeightBottom;
    const scrollableHeight = Math.max(1, totalHeight - viewHeight);
    const visibleDataHeight = viewHeight - colFacetsHeight - fixtureHeightTop - fixtureHeightBottom;
    const scrollableRows = Math.max(0, this.data!.totalRows - Math.floor(visibleDataHeight / this.rowHeightByType.data));

    const clampedRow = Math.max(0, Math.min(scrollableRows, targetRow));
    const scrollPercent = scrollableRows > 0 ? clampedRow / scrollableRows : 0;
    this.mountPoint.scrollTop = scrollPercent * scrollableHeight;
  }

  scrollToCol(targetCol: number, onDone?: () => void): void {
    const MAX_ATTEMPTS = 5;
    const clampedCol = Math.max(0, Math.min(this.data!.numCols - 1, targetCol));

    const attempt = (remaining: number) => {
      const viewWidth = this.mountPoint.clientWidth;
      const leftFixtureWidth = this.#getLeftFixtureWidth();
      const rowFacetsWidth = this.#getRowFacetsWidth();
      const rightFixtureWidth = this.#getRightFixtureWidth();
      const totalWidth = this.#getLeftRegionWidth() + this.#getCenterTotalWidth() + rightFixtureWidth;
      const scrollableWidth = Math.max(1, totalWidth - viewWidth);
      const visibleDataWidth = viewWidth - rowFacetsWidth - leftFixtureWidth - rightFixtureWidth;

      let maxScrollWidth = 0;
      let maxScrollCol = this.data!.numCols;
      let lastColWidth = -1;
      while (maxScrollWidth < visibleDataWidth && maxScrollCol > 0) {
        maxScrollCol--;
        lastColWidth = this.getColumnWidth("center", maxScrollCol);
        maxScrollWidth += lastColWidth;
      }
      maxScrollCol = Math.min(this.data!.numCols - 1, maxScrollCol + (maxScrollWidth - visibleDataWidth) / lastColWidth);

      const clampedToMax = Math.min(clampedCol, maxScrollCol);
      const scrollPercentX = maxScrollCol > 0 ? clampedToMax / maxScrollCol : 0;
      this.mountPoint.scrollLeft = scrollPercentX * scrollableWidth;

      if (remaining <= 0) { onDone?.(); return; }

      const unsub = this.on("renderComplete", (payload) => {
        unsub();
        if (clampedCol >= payload.x0 && clampedCol < payload.x1) {
          onDone?.();
        } else {
          attempt(remaining - 1);
        }
      });
    };

    attempt(MAX_ATTEMPTS);
  }

  getGridTemplate(
    numRowFacets: number,
    numColFacets: number,
    numDataCols: number,
    numDataRows: number,
    fixtures: LayoutFixtures
  ): { columns: string; rows: string } {
    const numLeftFixtures = fixtures.left.length;
    const numRightFixtures = fixtures.right.length;

    const topFixtureRows = fixtures.top.map(f => f.getHeight() + "px").join(" ");
    const bottomFixtureRows = fixtures.bottom.map(f => f.getHeight() + "px").join(" ");
    const colFacetRows = `repeat(${numColFacets}, ${this.rowHeightByType.facet}px)`;
    const dataRows = `repeat(${numDataRows}, ${this.rowHeightByType.data}px)`;

    const parts: string[] = [];
    if (this.#isStaticStrategy) {
      for (const f of fixtures.left) parts.push(colSizeToCss(f.colSize));
      for (const d of this.data!.facetDefs.row) parts.push(colSizeToCss(d.colSize));
      for (const d of this.data!.vTrackDefs) parts.push(colSizeToCss(d.colSize));
      for (const f of fixtures.right) parts.push(colSizeToCss(f.colSize));
    } else {
      for (let i = 0; i < numLeftFixtures; i++) parts.push("max-content");
      for (let i = 0; i < numRowFacets; i++) parts.push("max-content");
      for (let i = 0; i < numDataCols; i++) parts.push("max-content");
      for (let i = 0; i < numRightFixtures; i++) parts.push("max-content");
    }
    this.#columnTemplateParts = parts;

    return {
      columns: this.#buildColumnTemplateWithOverrides(),
      rows: [colFacetRows, topFixtureRows, dataRows, bottomFixtureRows].filter(Boolean).join(" "),
    };
  }

  #buildColumnTemplateWithOverrides(): string {
    if (!this.#columnTemplateParts) return "";
    const parts = [...this.#columnTemplateParts];
    const numLeft = this.#fixtures.left.length + this.data!.numRowFacetLevels;
    const numRight = this.#fixtures.right.length;
    const numCenter = parts.length - numLeft - numRight;

    for (let i = 0; i < numLeft; i++) {
      if (this.colsWidth.left.override[i] !== undefined) parts[i] = `${this.colsWidth.left.override[i]}px`;
    }
    const x0 = this.#columnTemplateDataStartCol;
    for (let i = 0; i < numCenter; i++) {
      const absIdx = x0 + i;
      if (this.colsWidth.center.override[absIdx] !== undefined) parts[numLeft + i] = `${this.colsWidth.center.override[absIdx]}px`;
    }
    for (let i = 0; i < numRight; i++) {
      if (this.colsWidth.right.override[i] !== undefined) parts[numLeft + numCenter + i] = `${this.colsWidth.right.override[i]}px`;
    }
    return parts.join(" ");
  }

  #applyColumnTemplate(): void {
    this.#con.style.gridTemplateColumns = this.#buildColumnTemplateWithOverrides();
  }

  #updateVirtualPanel(vs: ViewModel): void {
    this.#virtualPanelEl.style.width = `${vs.totalWidth}px`;
    this.#virtualPanelEl.style.height = `${vs.totalHeight}px`;
    this.#con.style.setProperty("--offset-x", `${vs.offsetX}px`);
    this.#con.style.setProperty("--offset-y", `${vs.offsetY}px`);
  }

  // INFO: This function figures out width of each columns in the grid
  // The width calcualtion is tricky because row facets can have horizontal (secondary span) spans if they are null.
  // Hence we don't calculate width from row facets at all - rather we calculate it from header cells
  // (In order to get the width from css layout) 
  // This puts constraints on header cells (in future)
  // - header cells can't be merged
  // - header cells can't be (contain: inline-size;) to skip header size from calculation
  #autosizeCells(): void {
    if (this.#isStaticStrategy) { this.#cellsToMeasure = []; return; }
    if (this.#cellsToMeasure.length === 0) return;

    const regionIndicesMap: Record<string, number[]> = { left: [], center: [], right: [] };

    let cornerCells: HTMLElement[][] = [];
    for (const { cell, sizeKey, region } of this.#cellsToMeasure) {
      const width = cell.getBoundingClientRect().width;
      if (!width) continue;
      const indices = regionIndicesMap[region];
      if (width > (indices[sizeKey] || 0)) {
        indices[sizeKey] = width;
      }

      if (cell.classList.contains("corner") && !cell.classList.contains("right-fixture") && !cell.classList.contains("left-fixture")) {
        let cellsInIndex = cornerCells[sizeKey];
        if (!cellsInIndex)  cellsInIndex = cornerCells[sizeKey] = [];
        cellsInIndex.push(cell);
      }
    }

    const maxSeen = this.config.columnAutosizingStrategyOnScroll === "max-seen";
    for (const region of ["left", "center", "right"] as const) {
      const indices = regionIndicesMap[region];
      const store = this.colsWidth[region];
      for (let i = 0; i < indices.length; i++) {
        if (indices[i] === undefined) continue;
        if (maxSeen && indices[i] <= (store.indices[i] || 0)) {
          for (const { cell, sizeKey, region: r } of this.#cellsToMeasure) {
            // TODO[now] instead of #cellsToMeasure a flat array with iteration make #cellsToMeasure a map
            // Record<sizeKey: number, cells: HTMLElement[]> so that 
            // this following operation becomes O(1)
            // Currently this is O(n^2) with the above loop
            if (r === region && sizeKey === i) cell.style.minWidth = `${store.override[i] || store.indices[i]}px`;
          }
          continue;
        }
        store.indices[i] = indices[i];
      }
    }


    // Sometimes when there is a row facet width change at the edge of the data, the corner cells are not rendered properly
    // as after autosize size readjustments are not applied
    // This is a workaround to fix that
    let left = 0;
    for (let i = 0; i < cornerCells.length; i++) {
      if (i > 0) left = left + this.getColumnWidth("left", i - 1);
      const cells = cornerCells[i];
      if (!cells) continue;
      for (const cell of cells) {
        cell.style.left = `${left}px`;
      }
    }

    this.#cellsToMeasure = [];
  }

  #onLayoutBootstrap(viewModel: ViewModel): void {
    this.#updateVirtualPanel(viewModel);

    for (let i = 0; i < this.#postRenderAdjustLeftCellsPerLevel.length; i++) {
      const cells = this.#postRenderAdjustLeftCellsPerLevel[i];
      for (let j = 0; j < cells.length; j++) {
        cells[j].style.left = `${viewModel.fixedLeftVTrackPositions[i]}px`;
      }
    }

    for (let i = 0; i < this.#postRenderAdjustRightCellsPerLevel.length; i++) {
      const cells = this.#postRenderAdjustRightCellsPerLevel[i];
      for (let j = 0; j < cells.length; j++) {
        cells[j].style.right = `${viewModel.fixedRightVTrackPositions[i]}px`;
      }
    }
  }

  // ctx.hintContentDirty controls whether cell content dirty-checking is enabled.
  // When set (true), cells reuse existing DOM content if the cell key matches — only positioning
  // styles are updated. This avoids rebuilding facet renderer output and replacing children every
  // frame, reducing both CPU work and GC pressure. It also preserves DOM state such as event
  // listeners attached by custom renderers.
  // The scroll handler sets this flag because scroll only changes which slice of the same dataset
  // is visible; cells that map to the same absolute key contain identical content.
  // When unset (undefined/false), content is always rebuilt and reappended — used by draw() to
  // ensure fresh data is reflected after a viewmodel change.
  render(viewModel: ViewModel, ctx: RenderCtx): void {
    if (!this.data) throw new Error("Data is not set!");
    this.#renderCount++;
    const hintContentDirty = ctx.hintContentDirty;

    // TODO the same information is returned via sliceData.sliceNumCols. Remove this.
    const numDataColsVisible = viewModel.x1 - viewModel.x0;

    this.#updateVirtualPanel(viewModel);
    const sliceData = this.data.getViewportData(viewModel.x0, viewModel.y0, viewModel.x1, viewModel.y1) as PivotSliceResult;

    const { fixtures } = viewModel;
    const gridRowOffset = this.data!.numColFacetLevels + fixtures.top.length;
    const numColFacetLevels = this.data!.numColFacetLevels;
    const numLeftVFixedTrack = this.data!.numRowFacetLevels + fixtures.left.length;

    this.#columnTemplateDataStartCol = viewModel.x0;
    const template = this.getGridTemplate(
      this.data!.numRowFacetLevels,
      this.data!.numColFacetLevels,
      sliceData.sliceNumCols,
      sliceData.sliceNumRows,
      fixtures
    );
    this.#con.style.gridTemplateColumns = template.columns;
    this.#con.style.gridTemplateRows = template.rows;

    this.cellManager.beginFrame();
    this.#cellsToMeasure = [];
    for (let i = 0; i < numLeftVFixedTrack; i++) {
      this.#postRenderAdjustLeftCellsPerLevel.push([]);
    }
    for (let i = 0; i < fixtures.right.length; i++) {
      this.#postRenderAdjustRightCellsPerLevel.push([]);
    }

    // render corner cells which results from intersection of row and column facets
    let nodeAppendList: HTMLElement[] = [];

    const axis = this.data!.facetDefs.axis;
    const rowFacetDefs = this.data!.facetDefs.row.filter(d => !d.pseudo);
    const colFacetDefs = this.data!.facetDefs.col.filter(d => !d.pseudo);
    const numLeftFixtures = fixtures.left.length;
    const numRowFacetLevels = this.data!.numRowFacetLevels;

    // render left fixture header cells
    const fixtureHeaderOpts = { numColFacetLevels, viewModel, hintContentDirty, nodeAppendList };
    this.#renderFixtureHeaders(fixtures.left, "left", { ...fixtureHeaderOpts, gridColStart: 1 });

    // render corner cells which results from intersection of row and column facets
    let cmnCornerCls = "corner header";
    for (let hRow = 0; hRow < numColFacetLevels; hRow++) { // each row of header cells
      for (let hCol = 0; hCol < numRowFacetLevels; hCol++) { // each row facet column
        const absCol = hCol + numLeftFixtures;
        const key = `corner-${hRow}-${absCol}`;

        let shouldSpan = false;
        let isSpanned = false;
        let headerDef: FacetDef | null = null;
        let drawGroupResizeHandler = false;

        if (axis === "col") {
          if (hRow < numColFacetLevels - 1) { // column facet header spanned horizontally
            if (hCol === 0) {
              shouldSpan = true;
              const def = colFacetDefs[hRow];
              if (def && !def.pseudo) { headerDef = def; drawGroupResizeHandler = hRow === numColFacetLevels - 2; }
            } else { // the rest of the cells in the horizontal track are merged via colspan
              isSpanned = true;
            }
          } else { // last row would hold all the row facet headers
            const def = rowFacetDefs[hCol];
            if (def && !def.pseudo) { headerDef = def; }
          }
        } else { // axis == "row"
          if (hRow === 0) {
            shouldSpan = true;
            const def = rowFacetDefs[hCol];
            if (def && !def.pseudo) { headerDef = def; }
          } else { // merged via rowspan
            isSpanned = true;
          }
        }

        if (isSpanned) continue;

        const extraStyles: Record<string, any> = {
          top: viewModel.colFacetsTopPositions[hRow],
          left: viewModel.fixedLeftVTrackPositions[absCol],
        };

        if (shouldSpan) {
          if (axis === "col") {
            extraStyles.colspan = numRowFacetLevels;
          } else {
            extraStyles.rowspan = numColFacetLevels;
          }
        }

        const [cell, needAppend, contentDirty] = this.placeCellInDom({
          key,
          gridRow: hRow + 1,
          gridCol: absCol + 1,
          hintContentDirty,
          cls: cmnCornerCls,
          extraStyles,
        });
        if (contentDirty) {
          const headerContainer = this.createFacetContainer(cell);
          const ctx: HeaderCellContext = { viewModel: this.data!, level: hRow, key, cell, container: headerContainer, render: (vm: GridDataViewModel) => this.renderWithDataViewModel(vm) };
          let headerContent: FacetCellContent | string | HTMLElement | HTMLElement[] | void | null = null;
          if (headerDef) headerContent = headerDef.headerRenderer(headerDef.text, ctx);
          this.populateFacetContainer(cell, headerContainer, headerContent);
          if (!(shouldSpan && axis === "col")) {
            this.appendResizeHandle(cell, "left");
            cell.dataset.leftStickyTrackIndex = String(absCol);
          }
          if (drawGroupResizeHandler) {
            const handler = this.appendResizeHandle(cell, "left");
            handler.style.height = (88 * (numColFacetLevels - 1))  + "%";
            handler.style.bottom = "4px";
            handler.dataset.groupFacetResize = "1";
          }
        }
        cell.style.zIndex = `${8888 - hCol}`;
        needAppend && nodeAppendList.push(cell);
        const hasHorizontalSpan = shouldSpan && axis === "col";
        if (!hasHorizontalSpan) {
          // only push cells that are not merged horizontally otherwise incorrect cell size will be reported
          this.#cellsToMeasure.push({ cell, sizeKey: absCol, region: "left" });
        }
        this.#postRenderAdjustLeftCellsPerLevel[absCol].push(cell);
      }
    }

    // render right fixture header cells
    this.#renderFixtureHeaders(fixtures.right, "right", { ...fixtureHeaderOpts, gridColStart: numLeftVFixedTrack + numDataColsVisible + 1 });

    // render column facets
    const colDefs = this.data!.vTrackDefs;
    // Horizontal sticky scrolling for non leaf column facets are applied after auto sizing, hence here we store the
    // value for which sticky scrolling should be applied.
    const nonLeafColFacets: { cell: HTMLElement; mergeStart: number; mergeSpan: number }[] = [];

    let merges = computeMerges(this.data!.numColFacetLevels, numDataColsVisible, sliceData.columnFacets!);
    for (const merge of merges) {
      const colIndex = viewModel.x0 + merge.start;
      // TODO[1]
      const colDef = colDefs[colIndex];
      const skipSizeClass = colDef.colSize.excludeColumnFacets ? " skp-sz" : "";
      const absoluteColIndex = numLeftVFixedTrack + colIndex;
      const key = `col-h-${merge.level}-${absoluteColIndex}`;
      const colspan = merge.spanPrimary;

      const isLeafLevel = merge.level === this.data!.numColFacetLevels - 1;
      const shouldApplyWidth = isLeafLevel && colspan === 1 && !colDef.colSize.excludeColumnFacets && colDef.colSize.strategy === "fixed-width";
      const fixedSize = shouldApplyWidth ? colDef.colSize as IColAutoSizeStrategyFixedWidth : null;

      let boundaryCellCls = (merge.start + merge.spanPrimary === numDataColsVisible ? "r-edge " : "");
      const [cell, needAppend, contentDirty] = this.placeCellInDom({
        key,
        gridRow: merge.level + 1,
        gridCol: numLeftVFixedTrack + merge.start + 1,
        hintContentDirty,
        cls: `col-facet header facet ${skipSizeClass}${!isLeafLevel ? " non-leaf" : " facet-b-edge"} ${boundaryCellCls}`,
        extraStyles: {
          colspan,
          top: viewModel.colFacetsTopPositions[merge.level],
          ...(merge.spanSecondary > 1 && { rowspan: merge.spanSecondary }),
          ...(fixedSize?.minWidthInPx !== undefined && { minWidth: fixedSize.minWidthInPx }),
          ...(fixedSize?.maxWidthInPx !== undefined && { maxWidth: fixedSize.maxWidthInPx }),
        },
      });
      if (contentDirty) {
        const { trackRenderer: colTrackRenderer, styleFns: colStyleFns } = this.resolveFacetOverrides([sliceData.columnFacets![merge.start][merge.level]], [this.data!.facetDefs.col[merge.level]]);
        this.buildAndPlaceFacetCell(cell, this.data!.facetDefs.col, merge, sliceData.columnFacets!, key, { rendererOverride: colTrackRenderer, resizeHandle: true, absoluteIndex: viewModel.x0 + merge.start });
        for (const fn of colStyleFns) fn(cell);
      }
      if (!isLeafLevel) {
        nonLeafColFacets.push({ cell, mergeStart: merge.start, mergeSpan: merge.spanPrimary });
      }
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
      cell.style.zIndex = `${999 - merge.start}`;
      needAppend && nodeAppendList.push(cell);
      if (isLeafLevel) {
        this.#cellsToMeasure.push({ cell, sizeKey: colIndex, region: "center" });
      }
    }

    // Render row facets
    const rowFacetResult = this.renderRowFacets(sliceData, viewModel, { hintContentDirty });
    this.#addCellRenderResult(rowFacetResult);
    nodeAppendList.push(...rowFacetResult.nodesToAppend);

    // Render data region
    const dataResult = this.renderDataCells(sliceData, viewModel, { hintContentDirty });
    this.#addCellRenderResult(dataResult);
    nodeAppendList.push(...dataResult.nodesToAppend);
    const contentCellRerenderCount = dataResult.contentCellRerenderCount;

    // render fixtures
    for (const side of ["top", "left", "bottom", "right"] as const) {
      for (let fi = 0; fi < fixtures[side].length; fi++) {
        const inst = fixtures[side][fi];
        let offset: number;
        let track: number;
        if (side === "left") {
          offset = viewModel.fixedLeftVTrackPositions[fi];
          track = fi + 1;
        } else if (side === "right") {
          offset = viewModel.fixedRightVTrackPositions[fi];
          track = numLeftVFixedTrack + numDataColsVisible + fi + 1;
        } else if (side === "top") {
          offset = viewModel.fixedTopHTrackPositions[fi];
          track = numColFacetLevels + fi + 1;
        } else {
          offset = viewModel.fixedBottomHTrackPositions[fi];
          track = numColFacetLevels + fixtures.top.length + sliceData.sliceNumRows + fi + 1;
        }
        const suggestedCls = [`${side}-fixture`];
        if ((side === "left" || side === "right") && fi === fixtures[side].length - 1) suggestedCls.push("last-fixture");
        const fixtureResult = inst.getCellsToRender(viewModel, { offset, track, suggestedCls }, sliceData);
        const stickyTrackAttr = `${side}StickyTrackIndex`;
        for (const node of fixtureResult.nodesToAppend) node.dataset[stickyTrackAttr] = String(fi);
        nodeAppendList.push(...fixtureResult.nodesToAppend);
        if (side === "left") this.#postRenderAdjustLeftCellsPerLevel[fi].push(...fixtureResult.nodesToAppend);
        else if (side === "right") {
          for (const node of fixtureResult.nodesToAppend) {
            node.style.right = `${viewModel.fixedRightVTrackPositions[fi]}px`;
            node.style.left = "";
          }
          this.#postRenderAdjustRightCellsPerLevel[fi].push(...fixtureResult.nodesToAppend);
        } else if (side === "top" || side === "bottom") {
          for (let lfi = 0; lfi < fixtures.left.length; lfi++) {
            const [cell, needAppend] = this.#createFixtureSpacerCell({
              key: `${side}-fixture-left-empty-${fi}-${lfi}`,
              gridRow: track, gridCol: lfi + 1, hintContentDirty,
              hFixtureSide: side, hFixtureOffset: offset,
              stickyRegion: "left", stickyTrackIndex: lfi,
              stickyPosition: viewModel.fixedLeftVTrackPositions[lfi],
            });
            needAppend && nodeAppendList.push(cell);
            this.#postRenderAdjustLeftCellsPerLevel[lfi].push(cell);
          }
          for (let rfLevel = 0; rfLevel < numRowFacetLevels; rfLevel++) {
            const stickyTrackIndex = numLeftFixtures + rfLevel;
            const hFixture = fixtures[side][fi] as PHorizontalFixture;
            const headerKey = `${side}-fixture-rf-${fi}-${rfLevel}`;
            const [cell, needAppend, contentDirty] = this.placeCellInDom({
              key: headerKey,
              gridRow: track,
              gridCol: numLeftFixtures + rfLevel + 1,
              hintContentDirty,
              cls: `header ${side}-fixture intersect-left`,
              extraStyles: {
                [side]: offset,
                left: viewModel.fixedLeftVTrackPositions[stickyTrackIndex],
              },
            });
            if (contentDirty) {
              const headerContainer = this.createFacetContainer(cell);
              const headerCtx: HeaderCellContext = { viewModel: this.data!, level: rfLevel, key: headerKey, cell, container: headerContainer, render: (vm: GridDataViewModel) => this.renderWithDataViewModel(vm) };
              const headerContent = hFixture.headerCell(headerCtx);
              if (headerContent === null) {
                // TODO does it makes sense to release / delete the cell?
                cell.style.display = "none";
              } else if (headerContent === undefined) {
                cell.classList.add("fixture-spacer");
              } else {
                this.populateFacetContainer(cell, headerContainer, headerContent);
              }
            }
            cell.dataset.leftStickyTrackIndex = String(stickyTrackIndex);
            needAppend && nodeAppendList.push(cell);
            this.#postRenderAdjustLeftCellsPerLevel[stickyTrackIndex].push(cell);
          }
          for (let rfi = 0; rfi < fixtures.right.length; rfi++) {
            const [cell, needAppend] = this.#createFixtureSpacerCell({
              key: `${side}-fixture-right-empty-${fi}-${rfi}`,
              gridRow: track, gridCol: numLeftVFixedTrack + numDataColsVisible + rfi + 1, hintContentDirty,
              hFixtureSide: side, hFixtureOffset: offset,
              stickyRegion: "right", stickyTrackIndex: rfi,
              stickyPosition: viewModel.fixedRightVTrackPositions[rfi],
            });
            needAppend && nodeAppendList.push(cell);
            this.#postRenderAdjustRightCellsPerLevel[rfi].push(cell);
          }
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

      const [el, needAppend, selContentDirty] = this.placeCellInDom({
        key: `sel-${sel.fromRow};${sel.toRow};${sel.fromCol};${sel.toCol}`,
        hintContentDirty,
        cls: "selection-overlay",
        gridRow: gridRowOffset + (visFromRow - viewModel.y0) + 1,
        gridCol: numLeftVFixedTrack + (visFromCol - viewModel.x0) + 1,
        extraStyles: {
          rowspan: visToRow - visFromRow + 1,
          colspan: visToCol - visFromCol + 1,
        },
      });
      if (selContentDirty) {
        addOrReplaceChildren(el, "");
      }

      needAppend && nodeAppendList.push(el);
    }

    // append all cells to the DOM in one go
    this.#con.append(...nodeAppendList);

    // endFrame returns cells that were not used this render cycle - remove them from DOM but hold it in the pool
    const cellsToRemove = this.cellManager.endFrame();
    for (const cell of cellsToRemove) {
      this.#con.removeChild(cell);
    }

    this.onBeforeMeasure?.();
    this.#autosizeCells();

    // After autosizing of column, should we apply sticky scrolling for column facets
    // very similar to row facets sticky scrolling calculation
    if (nonLeafColFacets.length > 0) {
      const visibleDataWidth = this.mountPoint.clientWidth - viewModel.rowFacetsWidth;
      const colLeftPositions: number[] = [];
      let accWidth = -viewModel.offsetX;
      for (let i = 0; i < numDataColsVisible; i++) {
        colLeftPositions[i] = accWidth;
        accWidth += this.getColumnWidth("center", viewModel.x0 + i);
      }

      for (const { cell, mergeStart, mergeSpan } of nonLeafColFacets) {
        let cellWidth = 0;
        for (let i = 0; i < mergeSpan; i++) {
          cellWidth += this.getColumnWidth("center", viewModel.x0 + mergeStart + i);
        }
        const cellLeftInDataArea = colLeftPositions[mergeStart];
        const cellRightInDataArea = cellLeftInDataArea + cellWidth;

        const clippedLeft = Math.max(0, -cellLeftInDataArea);
        const clippedRight = Math.max(0, cellRightInDataArea - visibleDataWidth);

        const rawOffset = (clippedLeft - clippedRight) / 2;
        const firstColWidth = this.getColumnWidth("center", viewModel.x0 + mergeStart);
        const maxOffset = Math.max(0, (cellWidth - firstColWidth) / 2);
        const labelOffset = Math.max(-maxOffset, Math.min(maxOffset, rawOffset));

        (cell.firstElementChild as HTMLElement).style.transform = labelOffset !== 0 ? `translateX(${labelOffset}px)` : "";
      }
    }

    this.#setupScrollListener();

    if (!this.#layoutBootstrapped) {
      this.#layoutBootstrapped = true;
      const vmUpdated = this.calculateViewModel();
      this.#onLayoutBootstrap(vmUpdated);
      this.#raiseRenderCompleteEvent(vmUpdated, ctx, { nodeAppendList, cellsToRemove, contentCellRerenderCount });
    } else {
      this.#raiseRenderCompleteEvent(viewModel, ctx, { nodeAppendList, cellsToRemove, contentCellRerenderCount });
    }

    this.#postRenderAdjustLeftCellsPerLevel.length = 0;
    this.#postRenderAdjustRightCellsPerLevel.length = 0;
  }

  #addCellRenderResult(result: CellRenderResult): void {
    this.#cellsToMeasure.push(...result.cellsToMeasure);
    for (const { cell, level } of result.adjustCells) {
      this.#postRenderAdjustLeftCellsPerLevel[level].push(cell);
    }
  }

  #createFixtureSpacerCell(opts: {
    key: string;
    gridRow: number;
    gridCol: number;
    hintContentDirty: boolean | undefined;
    hFixtureSide: "top" | "bottom";
    hFixtureOffset: number;
    stickyRegion: "left" | "right";
    stickyTrackIndex: number;
    stickyPosition: number;
  }): [HTMLElement, boolean] {
    const [cell, needAppend] = this.placeCellInDom({
      key: opts.key,
      gridRow: opts.gridRow,
      gridCol: opts.gridCol,
      hintContentDirty: opts.hintContentDirty,
      cls: `header ${opts.hFixtureSide}-fixture fixture-spacer intersect-${opts.stickyRegion}`,
      extraStyles: {
        [opts.hFixtureSide]: opts.hFixtureOffset,
        [opts.stickyRegion]: opts.stickyPosition,
      },
    });
    cell.dataset[`${opts.stickyRegion}StickyTrackIndex`] = String(opts.stickyTrackIndex);
    return [cell, needAppend];
  }

  #renderFixtureHeaders(
    fixtureDefs: PVerticalFixture[],
    side: "left" | "right",
    opts: {
      numColFacetLevels: number;
      viewModel: ViewModel;
      hintContentDirty: boolean | undefined;
      gridColStart: number;
      nodeAppendList: HTMLElement[];
    },
  ): void {
    const { numColFacetLevels, viewModel, hintContentDirty, gridColStart, nodeAppendList } = opts;
    const adjustArray = side === "left"
      ? this.#postRenderAdjustLeftCellsPerLevel
      : this.#postRenderAdjustRightCellsPerLevel;

    for (let fi = 0; fi < fixtureDefs.length; fi++) {
      const def = fixtureDefs[fi];
      const key = `${side}-fixture-header-${fi}`;
      const gridCol = gridColStart + fi;

      const positionProp = side === "left"
        ? { left: viewModel.fixedLeftVTrackPositions[fi] }
        : { right: viewModel.fixedRightVTrackPositions[fi] };

      const [cell, needAppend, contentDirty] = this.placeCellInDom({
        key,
        gridRow: 1,
        gridCol,
        hintContentDirty,
        cls: `corner header ${side}-fixture${fi === fixtureDefs.length - 1 ? " last-fixture" : ""} header-b-edge`,
        extraStyles: {
          ...(numColFacetLevels > 1 && { rowspan: numColFacetLevels }),
          top: viewModel.colFacetsTopPositions[0],
          ...positionProp,
        },
      });
      if (contentDirty) {
        const headerContainer = this.createFacetContainer(cell);
        const ctx: HeaderCellContext = { viewModel: this.data!, level: 0, key, cell, container: headerContainer, render: (vm: GridDataViewModel) => this.renderWithDataViewModel(vm) };
        const headerContent = def.headerCell(ctx);
        this.populateFacetContainer(cell, headerContainer, headerContent);
        const handle = this.appendResizeHandle(cell, side);
        cell.dataset[`${side}StickyTrackIndex`] = String(fi);
        if (side === "right") {
          handle.style.right = "";
          handle.style.left = "-4px";
        }
        handle.style.height = "90%";
      }
      cell.style.zIndex = side === "left" ? `${9999 - fi}` : `${9990 + fi}`;
      needAppend && nodeAppendList.push(cell);
      this.#cellsToMeasure.push({ cell, sizeKey: fi, region: side });
      if (!adjustArray[fi]) adjustArray[fi] = [];
      adjustArray[fi].push(cell);
    }
  }

  protected renderRowFacets(sliceData: PivotSliceResult, viewModel: ViewModel, ctx: { hintContentDirty: boolean | undefined }): CellRenderResult {
    const adjustCells: { cell: HTMLElement; level: number }[] = [];
    const nodesToAppend: HTMLElement[] = [];
    const hintContentDirty = ctx.hintContentDirty;
    const numDataRowsVisible = sliceData.sliceNumRows;
    let merges = computeMerges(this.data!.numRowFacetLevels, numDataRowsVisible, sliceData.rowFacets!);
    const rowHeight = this.rowHeightByType.data;
    const visibleDataHeight = this.mountPoint.clientHeight - viewModel.colFacetsHeight - this.#fixtureMeasurements.topTotal - this.#fixtureMeasurements.bottomTotal;

    for (const merge of merges) {
      const isLeaf = merge.level + merge.spanSecondary - 1 === sliceData.rowFacets![0].length - 1;
      const absoluteStart = viewModel.y0 + merge.start;
      const key = `row-h-${merge.level}-${absoluteStart}`;

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
        const cellHeight = merge.spanPrimary * rowHeight;
        const cellTopInDataArea = merge.start * rowHeight - viewModel.offsetY;
        const cellBottomInDataArea = cellTopInDataArea + cellHeight;

        const clippedTop = Math.max(0, -cellTopInDataArea);
        const clippedBottom = Math.max(0, cellBottomInDataArea - visibleDataHeight);

        const rawOffset = (clippedTop - clippedBottom) / 2;
        const maxOffset = Math.max(0, (merge.spanPrimary - 1) * rowHeight / 2);
        labelOffset = Math.max(-maxOffset, Math.min(maxOffset, rawOffset));
      }

      const gridRowOffset = viewModel.fixtures.top.length + this.data!.numColFacetLevels;
      const gridColOffset = viewModel.fixtures.left.length;
      const startEndCellCls = `${merge.start === numDataRowsVisible - 1 ? "last" : ""} ${merge.start === 0 ? "first" : ""}`;
      const [cell, needAppend, contentDirty] = this.placeCellInDom({
        key,
        gridRow: gridRowOffset + merge.start + 1,
        gridCol: gridColOffset + merge.level + 1,
        hintContentDirty,
        cls: `row-facet facet ${isLeaf ? " facet-r-edge" : " non-leaf"} ${startEndCellCls}`,
        extraStyles: {
          rowspan: merge.spanPrimary,
          left: viewModel.fixedLeftVTrackPositions[merge.level + gridColOffset],
          ...(merge.spanSecondary > 1 && { colspan: merge.spanSecondary }),
          transform: "",
        },
      });
      if (contentDirty) {
        const { trackRenderer: rowTrackRenderer, styleFns: rowStyleFns } = this.resolveFacetOverrides([sliceData.rowFacets![merge.start][merge.level]], [this.data!.facetDefs.row[merge.level]]);
        this.buildAndPlaceFacetCell(cell, this.data!.facetDefs.row, merge, sliceData.rowFacets!, key, { rendererOverride: rowTrackRenderer, absoluteIndex: viewModel.y0 + merge.start });
        for (const fn of rowStyleFns) fn(cell);
      }
      if (!isLeaf) {
        // TODO transform is applied to cell's content. Find a better way to do this as the content could be custom
        // component
        (cell.firstElementChild as HTMLElement).style.transform = labelOffset !== 0 ? `translateY(${labelOffset}px)` : "";
      }
      cell.dataset.cellType = "row-facet";
      cell.dataset.leftStickyTrackIndex = String(this.#fixtures.left.length + merge.level);
      needAppend && nodesToAppend.push(cell);
      // NOTE: we don't add row facets for column width measurement as corner cells are sent with for measurement
      // itself. This is important as row cells might have span that would would divide the track to equal parts in case
      // secondary span is present. However since corner cells are never merged, they'd provide correct track
      // mesasurement.
      adjustCells.push({ cell, level: merge.level + gridColOffset });
    }
    return { cellsToMeasure: [], adjustCells, nodesToAppend };
  }

  protected renderDataCells(sliceData: PivotSliceResult, viewModel: ViewModel, ctx: { hintContentDirty: boolean | undefined }): CellRenderResult & { contentCellRerenderCount: number } {
    const nodesToAppend: HTMLElement[] = [];
    const hintContentDirty = ctx.hintContentDirty;
    const numDataColsVisible = sliceData.sliceNumCols;
    const numDataRowsVisible = sliceData.sliceNumRows;
    const colDefs = this.data!.vTrackDefs;
    const gridRowOffset = viewModel.fixtures.top.length + this.data!.numColFacetLevels;
    const gridColOffset = viewModel.fixtures.left.length;
    let contentCellRerenderCount = 0;
    for (let i = 0; i < numDataColsVisible; i++) {
      const colData = sliceData.data ? sliceData.data[i] ?? [] : [];
      const gridCol = gridColOffset + this.data!.numRowFacetLevels + i + 1;
      const absoluteColIndex = this.data!.numRowFacetLevels + viewModel.x0 + i;
      // TODO[1]
      const colDef = colDefs[absoluteColIndex - this.data!.numRowFacetLevels];
      const fixedSize = colDef.colSize.strategy === "fixed-width" ? colDef.colSize as IColAutoSizeStrategyFixedWidth : null;

      for (let j = 0; j < numDataRowsVisible; j++) {
        const absoluteRowIndex = this.data!.numColFacetLevels + viewModel.y0 + j;
        const key = `data-${absoluteColIndex}-${absoluteRowIndex}`;
        const value = colData[j];
        const boundaryCellCls = i === numDataColsVisible - 1 ? "r-edge" : "";
        const startEndCellCls = `${j === numDataRowsVisible - 1 ? "last" : ""} ${j === 0 ? "first" : ""}`;
        const [cell, needAppend, contentDirty] = this.placeCellInDom({
          key,
          gridRow: gridRowOffset + j + 1,
          gridCol,
          hintContentDirty,
          cls: `data ${boundaryCellCls} ${colDef.isCustom ? " custom-rendered" : ""} ${startEndCellCls}`,
          extraStyles: {},
        });

        if (contentDirty) {
          contentCellRerenderCount++;

          let renderer = colDef.renderer;
          let dataStyleFns: ((el: HTMLElement) => void)[] = [];
          if (this.selectAllRules.length > 0 && sliceData.rowFacets && sliceData.columnFacets) {
            const rowPath = sliceData.rowFacets[j];
            const colPath = sliceData.columnFacets[i];
            const result = evaluateRulesForDataCell(
              this.selectAllRules,
              rowPath, colPath,
              this.data!.facetDefs.row, this.data!.facetDefs.col,
              value
            );
            if (result.effectiveRenderer) renderer = result.effectiveRenderer;
            dataStyleFns = result.styleFns;
          }

          const content = renderer(value, { viewModel: this.data!, rowIndex: viewModel.y0 + j, colIndex: viewModel.x0 + i }, { container: cell, key });
          if (content !== undefined) addOrReplaceChildren(cell, content);
          cell.dataset.cellType = "value";
          cell.dataset.cclix = String(absoluteColIndex);
          cell.dataset.croix = String(absoluteRowIndex);
          cell.style.minWidth = fixedSize?.minWidthInPx !== undefined ? `${fixedSize.minWidthInPx}px` : "";
          cell.style.maxWidth = fixedSize?.maxWidthInPx !== undefined ? `${fixedSize.maxWidthInPx}px` : "";
          for (const fn of dataStyleFns) fn(cell);
        }

        needAppend && nodesToAppend.push(cell);
      }
    }
    return { cellsToMeasure: [], adjustCells: [], nodesToAppend, contentCellRerenderCount };
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

    const logicalY0 = viewModel.logicalStartRow;
    const logicalY1 = viewModel.logicalEndRow;
    const dataOffsetTop = this.data!.offsetTop;
    const loadedEnd = dataOffsetTop + this.data!.numRows;
    if (logicalY0 < dataOffsetTop || logicalY1 > loadedEnd) {
      if (this.#viewDataEmptyTimer !== null) clearTimeout(this.#viewDataEmptyTimer);
      this.#viewDataEmptyTimer = setTimeout(() => {
        this.#viewDataEmptyTimer = null;
        this.emit("viewDataEmpty", { startRow: logicalY0, endRow: logicalY1 });
      }, this.config.dataFetchDebounceMs);
    }

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

  // For multiple level of column facets, the last level i.e. the leaf nodes are aligned with the cells of the column
  // Meaning, for each vertical column these last level of column acts as a header. (we'll call these trackHeader)
  // Meaning, the last level of column facet alongside the value cells form a standard table. You can think of the
  // nested facets (level_n-1 where nth is leaf nodes) are nesting/hierarchy that aligns with the trackHeader cells.
  // The sizing (width) always gets added to the last level of facets - the nested facets have colspan property set on
  // them that css grid layout manages while creating the nesting/hierarchy.
  #getLeafColCells(colIdx: number): { trackHeaderCell: HTMLElement /* | null; cells: HTMLElement[] */ } {
    const leafLevel = this.data!.numColFacetLevels - 1;
    const trackHeaderCell = this.#con.querySelector<HTMLElement>(`[data-hix="${colIdx}"][data-facet-level="${leafLevel}"]`);
    if (!trackHeaderCell) {
      throw new Error(`No cells found for column ${colIdx} during resize`);
    }
    return { trackHeaderCell };
  }

  #getStickyTrackHeaderCell(side: "left" | "right", trackIndex: number): HTMLElement {
    const headerCell = this.#con.querySelector<HTMLElement>(
      `[data-cell-action-resize][data-${side}-sticky-track-index='${trackIndex}']`
    );
    if (!headerCell) {
      throw new Error(`No ${side} sticky track header found for index ${trackIndex} during resize`);
    }
    return headerCell;
  }

  autofitLeftStickyTrackWidth(trackIndex: number): void {
    const headerCell = this.#getStickyTrackHeaderCell("left", trackIndex);
    this.#autofitTrack("left", trackIndex, headerCell, () => this.changeLeftStickyTrackWidth(trackIndex));
  }

  changeLeftStickyTrackWidth(trackIndex: number) {
    const headerCell = this.#getStickyTrackHeaderCell("left", trackIndex);
    const numLeftFixtures = this.#fixtures.left.length;

    // Collect all left-region cells to the right of this track for live drag adjustment
    const subsequentLeftCells: HTMLElement[] = [];
    const numLeftTracks = numLeftFixtures + this.data!.numRowFacetLevels;
    for (let i = trackIndex + 1; i < numLeftTracks; i++) {
      subsequentLeftCells.push(...Array.from(this.#con.querySelectorAll<HTMLElement>(
        `[data-left-sticky-track-index='${i}']`
      )));
    }

    return this.#changeTrackWidth({
      region: "left",
      regionIndex: trackIndex,
      headerCell,
      onDelta: (widthDelta) => {
        for (const cell of subsequentLeftCells) {
          const currentLeft = parseFloat(cell.style.left) || 0;
          cell.style.left = `${currentLeft + widthDelta}px`;
        }
      },
      onCommit: (finalWidth) => {
        // Left region tracks are laid out as: [fixture0, fixture1, ..., rowFacet0, rowFacet1, ...]
        // Tracks below numLeftFixtures are fixtures; the rest are row facets offset by numLeftFixtures.
        if (trackIndex < numLeftFixtures) {
          this.#fixtures.left[trackIndex].colSize = { strategy: "fixed-width", widthInPx: finalWidth };
        } else {
          this.data!.facetDefs.row[trackIndex - numLeftFixtures].colSize = { strategy: "fixed-width", widthInPx: finalWidth };
        }
      },
    });
  }

  autofitRightStickyTrackWidth(trackIndex: number): void {
    const headerCell = this.#getStickyTrackHeaderCell("right", trackIndex);
    this.#autofitTrack("right", trackIndex, headerCell, () => this.changeRightStickyTrackWidth(trackIndex));
  }

  changeRightStickyTrackWidth(trackIndex: number) {
    const headerCell = this.#getStickyTrackHeaderCell("right", trackIndex);

    const subsequentRightCells: HTMLElement[] = [];
    for (let i = trackIndex - 1; i >= 0; i--) {
      subsequentRightCells.push(...Array.from(this.#con.querySelectorAll<HTMLElement>(
        `[data-right-sticky-track-index='${i}']`
      )));
    }

    return this.#changeTrackWidth({
      region: "right",
      regionIndex: trackIndex,
      headerCell,
      onDelta: (widthDelta) => {
        for (const cell of subsequentRightCells) {
          const currentRight = parseFloat(cell.style.right) || 0;
          cell.style.right = `${currentRight + widthDelta}px`;
        }
      },
      onCommit: (finalWidth) => {
        this.#fixtures.right[trackIndex].colSize = { strategy: "fixed-width", widthInPx: finalWidth };
      },
    });
  }

  autofitLeafColWidth(colIdx: number): void {
    const { trackHeaderCell } = this.#getLeafColCells(colIdx);
    if (!trackHeaderCell) return;
    const centerIdx = colIdx - this.#fixtures.left.length - this.data!.numRowFacetLevels;
    this.#autofitTrack("center", centerIdx, trackHeaderCell, () => this.changeLeafColWidth(colIdx));
  }

  changeLeafColWidth(colIdx: number) {
    const centerIdx = colIdx - this.#fixtures.left.length - this.data!.numRowFacetLevels;
    const { trackHeaderCell } = this.#getLeafColCells(colIdx);
    return this.#changeTrackWidth({
      region: "center",
      regionIndex: centerIdx,
      headerCell: trackHeaderCell,
      onCommit: (finalWidth) => {
        this.data!.setColSize(centerIdx, { strategy: "fixed-width", widthInPx: finalWidth });
      },
    });
  }

  #autofitTrack(region: "left" | "center" | "right", regionIndex: number, headerCell: HTMLElement, createCtrl: () => ReturnType<StandardLayout["changeLeafColWidth"]>): void {
    // Temporarily remove any fixed-width override so the column falls back to max-content,
    // allowing getBoundingClientRect to return the intrinsic content width.
    const store = this.colsWidth[region];
    const hadOverride = regionIndex in store.override;
    const stashedOverride = store.override[regionIndex];
    if (hadOverride) {
      delete store.override[regionIndex];
      this.#applyColumnTemplate();
    }
    headerCell.style.minWidth = "";
    const contentWidth = headerCell.getBoundingClientRect().width;
    if (hadOverride) {
      store.override[regionIndex] = stashedOverride;
      this.#applyColumnTemplate();
    }
    const ctrl = createCtrl();
    ctrl.byAbsValue(contentWidth);
    ctrl.commit();
  }

  #changeTrackWidth(opts: {
    region: "left" | "center" | "right";
    regionIndex: number;
    headerCell: HTMLElement;
    onDelta?: (widthDelta: number) => void;
    onCommit: (finalWidth: number) => void;
  }): {
    byDelta: (dw: number) => number;
    byAbsValue: (width: number) => number;
    commit: () => number;
    cancel: () => number;
  } {
    const { region, regionIndex, headerCell, onDelta, onCommit } = opts;
    const store = this.colsWidth[region];
    const resizeKey = `${region}:${regionIndex}`;

    if (this.#resizeState.has(resizeKey)) {
      console.warn(`Track ${resizeKey} is already being resized. Cleaning up previous resize.`);
      this.#resizeState.delete(resizeKey);
    }

    const widthBeforeResize = headerCell.getBoundingClientRect().width;
    const stashedMinWidth = headerCell.style.minWidth ?? "";
    headerCell.style.minWidth = "";

    store.override[regionIndex] = widthBeforeResize;
    this.#applyColumnTemplate();

    const resizeState: ResizeState = { widthBeforeResize, currentWidth: widthBeforeResize };
    this.#resizeState.set(resizeKey, resizeState);

    return {
      byDelta: (dw: number): number => {
        const newWidth = Math.max(20, resizeState.widthBeforeResize + dw);
        const widthDelta = newWidth - resizeState.currentWidth;
        resizeState.currentWidth = newWidth;
        store.override[regionIndex] = newWidth;
        this.#applyColumnTemplate();
        onDelta?.(widthDelta);
        return newWidth;
      },
      byAbsValue: (width: number): number => {
        const newWidth = Math.max(20, width);
        resizeState.currentWidth = newWidth;
        store.override[regionIndex] = newWidth;
        this.#applyColumnTemplate();
        return newWidth;
      },
      commit: (): number => {
        const finalWidth = resizeState.currentWidth;
        onCommit(finalWidth);
        this.#resizeState.delete(resizeKey);
        return finalWidth;
      },
      cancel: (): number => {
        delete store.override[regionIndex];
        headerCell.style.minWidth = stashedMinWidth;
        this.#applyColumnTemplate();
        this.#resizeState.delete(resizeKey);
        return resizeState.widthBeforeResize;
      },
    };
  }
}
