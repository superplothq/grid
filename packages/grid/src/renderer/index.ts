import { GridDataViewModel } from "./grid-data-viewmodel";
import { GridConfig, defaultConfig } from "./grid-config";
import CellManager from "./cell-manager";
import { addToRegistry } from "./registry";
import { Constructor, FacetPredicate } from "./types";
import { applyThemeTokens } from "./themes";
import StandardLayout, { LayoutEvents } from "./standard-layout";
import GroupedRowLayout from "./grouped-row-layout";
import { WithEvents, EventEmitter, addOrReplaceChildren } from "./mixins";
import { MatchingRuleStore, Matching } from "./match-all";

export type LayoutType = "pivot" | "flat";

// TODO this used to be the entry point, now it's not, so lot of this config
// is not necessary
export { StandardLayout };
export { default as GroupedRowLayout } from "./grouped-row-layout";
export { GridConfig, defaultConfig } from "./grid-config";
export type {
  IColAutoSize,
  IColAutoSizeStrategyMaxCell,
  IColAutoSizeStrategyClampedWidth,
  ColAutoSizeConfig,
  VTrackDef,
  ResolvedVTrackDef,
  GridDataViewModelOptions,
  BaseSliceResult,
  PivotSliceResult,
  FlatSliceResult,
  Theme,
  FacetCellRenderer,
  FacetRendererContext,
  FacetDataContext,
  FacetCellContent,
  FacetDef,
  FacetMeta,
  FacetHeaderRenderer,
  HeaderCellContext as FacetHeaderContext,
  FacetData,
  FlatRowMeta,
  DataViewport,
  FacetPredicate,
  CellPredicate,
  MatchingRuleProps,
  ViewModelMetadata,
  MetadataValue,
  ColumnFacetMetadata,
  RowFacetMetadata,
  HeaderMetadata,
  ValueColumnMetadata,
  ValueRowMetadata,
  ValueCellMetadata,
  ValueCellDataContext,
  ValueFormatter,
} from "./types";
export { Matching, CellMatching } from "./match-all";
export { registerTheme, getTheme } from "./registry";
export { GridDataViewModel, MetaState } from "./grid-data-viewmodel";
export type { ViewModelInitParams } from "./grid-data-viewmodel";
export { PivotDataViewModel } from "./pivot-data-viewmodel";
export { FlattenedDataViewModel, createRowMeta } from "./flattened-data-viewmodel";
export type { BaseViewModel } from "./layout-proto";
export type { LayoutEvents, ViewDataEmptyPayload } from "./standard-layout";
export { PVerticalFixture, PHorizontalFixture } from "./fixture-proto";
export type { BaseFixtureViewModel } from "./fixture-proto";
export type { EventEmitter };
export {
  textRenderer,
  createChartRenderer,
  defaultChartConfig,
  defaultFacetRenderer,
  defaultFacetHeaderRenderer,
  type CellConfig,
  type ChartConfig,
  type CellWithConfigRenderer,
  type CellRenderer,
  type RendererContext,
} from "./cell-renderers";
export {
  blankGridLoadingRenderer,
  type LoadingRenderer,
  type LoadingRendererContext,
} from "./loading-renderers";

export type HighlightPayload = {
  hash: string;
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
};

export type GridEvents = LayoutEvents & {
  highlightAdded: HighlightPayload;
  highlightRemoved: HighlightPayload;
};

class GridBase {}
const GridWithEvents = WithEvents<GridEvents>()(GridBase);

export type HighlightType = "cell" | "row" | "column" | "range";
export type HighlightResult = [hash: string, unsub: () => void] | null;

function fastHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

/**
 * The public entry point for the grid renderer. Wraps a layout engine (`StandardLayout` or `GroupedRowLayout`),
 * a cell pool, and a matching rule store. Set a [GridDataViewModel](/docs/viewmodel) via the `data` setter, then
 * call `draw()` to render. The Grid forwards all [layout events](/docs/renderer/events) and adds highlight events.
 */
export default class Grid extends GridWithEvents {
  #config: GridConfig;
  #data: GridDataViewModel | undefined;
  #cellManager: CellManager;
  #layout: StandardLayout;
  #renderCount = 0;
  #highlights: Map<string, [fromRow: number, fromCol: number, toRow: number, toCol: number]> = new Map();
  #ruleStore: MatchingRuleStore;
  #scheduleDrawPending = false;
  #mountPoint: HTMLElement;
  #loadingEl: HTMLElement | undefined;

  constructor(config: Partial<GridConfig>, mountPoint: HTMLElement, layoutType: LayoutType = "pivot", opts?: {
    onCellRelease?: (key: string, cell: HTMLElement) => void;
    onBeforeMeasure?: () => void;
  }) {
    super();
    this.#config = { ...defaultConfig, ...config };
    this.#mountPoint = mountPoint;
    // Absolute against the mount point rather than in flow: `.grid-clip` already fills the host's
    // height, so an in-flow sibling would start a full viewport below the visible area. The mount only
    // needs a positioning context when it has none - callers commonly mount into an `absolute; inset: 0`
    // element, and overwriting that would leave the grid without its dimensions.
    if (getComputedStyle(this.#mountPoint).position === "static") {
      this.#mountPoint.style.position = "relative";
    }


    this.#cellManager = new CellManager();
    if (opts?.onCellRelease) this.#cellManager.onRelease = opts.onCellRelease;
    // TODO[beforeRelease] do it gracefully
    const LayoutClass = layoutType === "flat" ? GroupedRowLayout : StandardLayout;
    this.#layout = new LayoutClass(this.#config, mountPoint, this.#cellManager);
    // TODO[beforeRelease] make it part of the layout opts
    if (opts?.onBeforeMeasure) this.#layout.onBeforeMeasure = opts.onBeforeMeasure;

    this.#ruleStore = new MatchingRuleStore(() => this.draw());

    // Forward layout events to Grid
    this.forwardFrom(this.#layout as unknown as EventEmitter<LayoutEvents>, ["renderComplete", "debug_perf:metrics", "viewDataEmpty", "viewModelDataChanged"]);

    this.#setupResizeHandler();
  }

  #setupResizeHandler(): void {
    if (!this.#config.enableResizeUI) return;

    const container = this.#layout.gridContainer;
    const isResizeHandle = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      return target.classList.contains("resize-handle");
    };

    const getResizeTarget = (target: EventTarget | null): HTMLElement | null => {
      if (!(target instanceof HTMLElement)) return null;
      return target.closest<HTMLElement>("[data-cell-resize-target='1']");
    };

    const findFullColumnRange = (level: number, rightPtr: number): { start: number; end: number } => {
      const facets = this.#layout.data!.columnFacets;
      const facetValue = facets[level][rightPtr];

      let leftPtr = rightPtr;
      while (leftPtr > 0 && facets[level][leftPtr - 1] === facetValue) {
        leftPtr--;
      }

      return { start: leftPtr, end: rightPtr };
    };

    const getVisibleLeafColumns = (rangeStart: number, rangeEnd: number): number[] => {
      const leafLevel = this.#layout.data!.numColFacetLevels - 1;
      const leafCells = container.querySelectorAll<HTMLElement>(
        `[data-cell-type='column-facet'][data-facet-level='${leafLevel}']`
      );

      const visibleCols: number[] = [];
      leafCells.forEach(cell => {
        const hix = parseInt(cell.dataset.hix!, 10);
        if (hix >= rangeStart && hix <= rangeEnd) {
          visibleCols.push(hix);
        }
      });

      return visibleCols.sort((a, b) => a - b);
    };

    container.addEventListener("mousedown", (e: MouseEvent) => {
      if (!isResizeHandle(e.target)) return;
      const cell = getResizeTarget(e.target);
      if (!cell) return;

      const region = cell.dataset.cellRegion as "left" | "center" | "right";
      const startX = e.clientX;

      type ResizeController = ReturnType<StandardLayout["changeLeafColWidth"]>;
      const resizeControllers: { idx: number; ctrl: ResizeController }[] = [];
      const createControllers: (() => void)[] = [];
      let totalColCount = 1;

      if (region === "center") {
        const level = parseInt(cell.dataset.facetLevel!, 10);
        // See the diagram in the comment on standard-layout.ts
        // since for facets level < leaf levels, columns are merged (by applying colspan), rightPtr contains the right
        // most index of the merged column facet value from the data view model.
        const numLeftFixedTracks = this.#layout.numLeftFixedTracks;
        const rightPtr = parseInt(cell.dataset.hix!, 10) - numLeftFixedTracks;

        // column facets level = leaf levels provides header cells for data cells. These two essentially create a standard table.
        // Column facets level < leaf levels create hierarchy/nesting and spans over multiple leaf level columns.
        // Here we find out : for a given level and value of column facet what are the leaf level columns over which the
        // column facet spans. This would contain columns that are in viewport and that are invisible and not in dom
        // because of virtualization
        const leafLevel = this.#layout.data!.numColFacetLevels - 1;
        const fullRange = level < leafLevel
          ? findFullColumnRange(level, rightPtr)
          : { start: rightPtr, end: rightPtr };
        totalColCount = fullRange.end - fullRange.start + 1;

        // Find out out of all leaf level nodes over which the column being dragged spans, which columns are in dom
        const visibleCols = getVisibleLeafColumns(fullRange.start + numLeftFixedTracks, fullRange.end + numLeftFixedTracks);
        // TODO for cells that are not currently in dom atm, but would appear in dom as we scroll / reduce size of columns
        //      we need to update the change in size of columns to be considered as they appears on the dom

        for (const colIdx of visibleCols) {
          createControllers.push(() => resizeControllers.push({ idx: colIdx, ctrl: this.#layout.changeLeafColWidth(colIdx) }));
        }
      } else if (region === "left" && (e.target as HTMLElement).dataset.groupTrackResize === "1") {
        const numLeftFixtures = this.#layout.numLeftFixedTracks - this.#layout.data!.numRowFacetLevels;
        const numRowFacetLevels = this.#layout.data!.numRowFacetLevels;
        totalColCount = numRowFacetLevels;
        for (let i = 0; i < numRowFacetLevels; i++) {
          const trackIndex = numLeftFixtures + i;
          createControllers.push(() => resizeControllers.push({ idx: trackIndex, ctrl: this.#layout.changeLeftStickyTrackWidth(trackIndex) }));
        }
      } else if (region === "left") {
        const trackIndex = parseInt(cell.dataset.leftStickyTrackIndex!, 10);
        createControllers.push(() => resizeControllers.push({ idx: trackIndex, ctrl: this.#layout.changeLeftStickyTrackWidth(trackIndex) }));
      } else if (region === "right") {
        const trackIndex = parseInt(cell.dataset.rightStickyTrackIndex!, 10);
        createControllers.push(() => resizeControllers.push({ idx: trackIndex, ctrl: this.#layout.changeRightStickyTrackWidth(trackIndex) }));
      }

      if (createControllers.length === 0) return;

      // Defer controller creation to the first mousemove. Creating controllers eagerly on mousedown
      // mutates gridTemplateColumns (override set + #applyColumnTemplate), and the cancel on mouseup
      // mutates it again. These two mutations on a no-drag click cause a browser relayout that
      // breaks dblclick detection. By deferring, single clicks cause zero template mutations.
      let didDrag = false;
      const onMouseMove = (moveEvent: MouseEvent) => {
        if (!didDrag) {
          didDrag = true;
          for (const fn of createControllers) fn();
        }
        container.style.cursor = "col-resize";
        const deltaX = moveEvent.clientX - startX;
        const lastPerColDelta = (region === "right" ? -deltaX : deltaX) / totalColCount;
        resizeControllers.forEach(c => c.ctrl.byDelta(lastPerColDelta));
      };

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        container.style.cursor = "";

        if (didDrag) {
          resizeControllers.forEach(c => c.ctrl.commit());
          this.draw();
        }
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);

      e.preventDefault();
    });

    container.addEventListener("dblclick", (e: MouseEvent) => {
      if (!isResizeHandle(e.target)) return;
      const cell = getResizeTarget(e.target);
      if (!cell) return;

      const region = cell.dataset.cellRegion as "left" | "center" | "right";

      if (region === "left" && (e.target as HTMLElement).dataset.groupTrackResize === "1") {
        const numLeftFixtures = this.#layout.numLeftFixedTracks - this.#layout.data!.numRowFacetLevels;
        const numRowFacetLevels = this.#layout.data!.numRowFacetLevels;
        for (let i = 0; i < numRowFacetLevels; i++) {
          this.#layout.autofitLeftStickyTrackWidth(numLeftFixtures + i);
        }
        this.draw();
      } else if (region === "left") {
        const trackIndex = parseInt(cell.dataset.leftStickyTrackIndex!, 10);
        this.#layout.autofitLeftStickyTrackWidth(trackIndex);
        this.draw();
      } else if (region === "right") {
        const trackIndex = parseInt(cell.dataset.rightStickyTrackIndex!, 10);
        this.#layout.autofitRightStickyTrackWidth(trackIndex);
        this.draw();
      } else if (region === "center") {
        const leafLevel = this.#layout.data!.numColFacetLevels - 1;
        if (parseInt(cell.dataset.facetLevel!, 10) !== leafLevel) return;
        const colIdx = parseInt(cell.dataset.hix!, 10);
        this.#layout.autofitLeafColWidth(colIdx);
        this.draw();
      }
    });
  }

  // TODO[beforeRelease] all the other methods are call as setData() ; here also do the same. Remove the pattern setter
  // pattern. So is getData() below
  /**
   * Sets the viewmodel that provides data for rendering. After setting, call `draw()` to trigger the first render.
   * Reassign after `updateData()` to push new data into the grid. A blank viewmodel is held back from the layout -
   * it has no columns or facet defs to lay out - so a grid started blank must be reassigned once the viewmodel is filled.
   */
  set data(value: GridDataViewModel) {
    this.#data = value;
    if (value.isDataLoaded()) this.#layout.setData(value);
  }

  /** Returns the current viewmodel, or `undefined` if none has been set. */
  get data(): GridDataViewModel | undefined {
    return this.#data;
  }

  /** The container the grid tracks are rendered onto - the element that carries the theme's CSS custom properties. Set style tokens (e.g. `--cell-padding-y`) on it to override theme values. */
  get trackSurfaceContainer(): HTMLElement {
    return this.#layout.gridContainer;
  }

  // TODO[beforeRelease] usage pattern
  /** Schedules a draw on the next animation frame. Multiple calls before the frame fires are coalesced into a single render. */
  scheduleDraw(): void {
    if (this.#scheduleDrawPending) return;
    this.#scheduleDrawPending = true;
    requestAnimationFrame(() => {
      this.#scheduleDrawPending = false;
      this.draw();
    });
  }

  /** Creates a [Matching](/docs/renderer/match-all) builder that targets facet cells matching the predicate. Chain `.matchAll()` to add more predicates, then `.style()` or `.prop()` to apply effects. */
  matchAll(predicate: FacetPredicate): Matching {
    return new Matching(this.#ruleStore, [{ type: "facet", predicate }]);
  }

  /** Triggers a synchronous render cycle: calculates the viewport, fetches the data slice, renders cells, auto-sizes columns, and emits `renderComplete`. Throws if `data` has not been set. When the viewmodel is blank (`isDataLoaded()` is `false`), nothing is rendered - the grid emits `viewDataEmpty` with reason `no-data` and returns, leaving the consumer to fetch data or show its own empty state. */
  draw(): void {
    if (!this.#data) throw new Error("Data is not set!");

    if (!this.#data.isDataLoaded()) {
      this.#showLoading();
      this.emit("viewDataEmpty", { reason: "no-data" });
      return;
    }

    this.#hideLoading();
    if (this.#layout.data !== this.#data) this.#layout.setData(this.#data);


    const startTime = performance.now();
    this.#renderCount++;

    this.#layout.setMatchingRules(this.#ruleStore.rules);
    const viewModel = this.#layout.calculateViewModel();
    this.#layout.render(viewModel, { t1: startTime });
  }

  // The container is built on first use and kept for the life of the grid: `config.loadingRenderer` may
  // hand it to a framework (a React root binds to the element), so it must not be recreated per draw.
  #showLoading(): void {
    this.#layout.collapseScrollArea();

    if (this.#loadingEl) {
      this.#loadingEl.style.display = "block";
      return;
    }

    this.#loadingEl = document.createElement("div");
    Object.assign(this.#loadingEl.style, {
      position: "absolute",
      inset: "0",
      overflow: "hidden",
      zIndex: "1",
      display: "block",
    });
    applyThemeTokens(this.#loadingEl, this.#config.theme);
    this.#mountPoint.shadowRoot!.appendChild(this.#loadingEl);

    const content = this.#config.loadingRenderer({ container: this.#loadingEl });
    if (content !== undefined) addOrReplaceChildren(this.#loadingEl, content);
  }

  #hideLoading(): void {
    if (this.#loadingEl) this.#loadingEl.style.display = "none";
  }

  #makeHighlightId(fromRow: number, fromCol: number, toRow: number, toCol: number): string {
    const r = (v: number) => v === Infinity ? "inf" : String(v);
    return `${r(fromRow)};${r(toRow)};${r(fromCol)};${r(toCol)}`;
  }

  #getHighlightType(fromRow: number, fromCol: number, toRow: number, toCol: number): HighlightType {
    if (fromRow === toRow && fromCol === toCol) return "cell";
    if (fromCol === 0 && toCol === Infinity) return "row";
    if (fromRow === 0 && toRow === Infinity) return "column";
    return "range";
  }

  #getCurrentHighlightType(): HighlightType | null {
    const first = this.#highlights.values().next().value;
    if (!first) return null;
    return this.#getHighlightType(first[0], first[1], first[2], first[3]);
  }

  #resolveConflictsAndAddHighlight(fromRow: number, fromCol: number, toRow: number, toCol: number): {
    id: string;
    hash: string;
    isDuplicate: boolean;
    removed: HighlightPayload[];
    added: HighlightPayload[]
  } {
    const newType = this.#getHighlightType(fromRow, fromCol, toRow, toCol);
    const currentType = this.#getCurrentHighlightType();
    const id = this.#makeHighlightId(fromRow, fromCol, toRow, toCol);
    const hash = fastHash(id);

    if (this.#highlights.has(id)) {
      return { id, hash, isDuplicate: true, removed: [], added: [] };
    }

    const removed: HighlightPayload[] = [];

    // if range highlight: then all previous highlights are cleared including range
    // if cell highlight: only keep if previous highlight is cell
    // if col highlight: only keep if previous highlight is col
    // if row highlight: only keep if previous highlight is row
    if (newType === "range" || (currentType && currentType !== newType)) {
      for (const [existingId, highlight] of this.#highlights) {
        removed.push({ hash: fastHash(existingId), fromRow: highlight[0], fromCol: highlight[1], toRow: highlight[2], toCol: highlight[3] });
      }
      this.#highlights.clear();
    }

    this.#highlights.set(id, [fromRow, fromCol, toRow, toCol]);
    const added: HighlightPayload[] = [{ hash, fromRow, fromCol, toRow, toCol }];
    return { id, hash, isDuplicate: false, removed, added };
  }

  #raiseHighlightEvents(result: { removed: HighlightPayload[]; added: HighlightPayload[] }): void {
    for (const r of result.removed) {
      this.emit("highlightRemoved", r);
    }
    for (const a of result.added) {
      this.emit("highlightAdded", a);
    }
  }

  #syncHighlightsToLayout(): void {
    const highlightsArray = Array.from(this.#highlights.values());
    this.#layout.viewModelProposal({ highlights: highlightsArray });
  }

  /** Highlights a single cell by its data row and column index. Returns `[hash, unsub]` where `hash` identifies the highlight and `unsub()` removes it. Returns `null` if the cell is already highlighted. Emits `highlightAdded`; calling `unsub()` emits `highlightRemoved`. */
  highlightCellByDataIndex(row: number, col: number): HighlightResult {
    const result = this.#resolveConflictsAndAddHighlight(row, col, row, col);
    if (result.isDuplicate) return null;

    this.#syncHighlightsToLayout();
    this.draw();
    this.#raiseHighlightEvents(result);

    return [result.hash, () => {
      if (!this.#highlights.has(result.id)) return;
      this.#highlights.delete(result.id);
      this.#syncHighlightsToLayout();
      this.draw();
      this.#raiseHighlightEvents({ removed: result.added, added: [] });
    }];
  }

  /** Highlights a rectangular range of cells. Coordinates are normalized (min/max) internally. A range highlight clears all previous highlights. Returns `[hash, unsub]` or `null` if already highlighted. */
  highlightRangeByDataIndex(fromRow: number, fromCol: number, toRow: number, toCol: number): HighlightResult {
    // Normalize to ensure from <= to
    const normFromRow = Math.min(fromRow, toRow);
    const normFromCol = Math.min(fromCol, toCol);
    const normToRow = Math.max(fromRow, toRow);
    const normToCol = Math.max(fromCol, toCol);

    const result = this.#resolveConflictsAndAddHighlight(normFromRow, normFromCol, normToRow, normToCol);
    if (result.isDuplicate) return null;

    this.#syncHighlightsToLayout();
    this.draw();
    this.#raiseHighlightEvents(result);

    return [result.hash, () => {
      if (!this.#highlights.has(result.id)) return;
      this.#highlights.delete(result.id);
      this.#syncHighlightsToLayout();
      this.draw();
      this.#raiseHighlightEvents({ removed: result.added, added: [] });
    }];
  }

  /** Highlights an entire column by its data index (all rows from 0 to Infinity). Column highlights accumulate; adding a non-column highlight clears them. Returns `[hash, unsub]` or `null` if already highlighted. */
  highlightColumnByDataIndex(colIndex: number): HighlightResult {
    const result = this.#resolveConflictsAndAddHighlight(0, colIndex, Infinity, colIndex);
    if (result.isDuplicate) return null;

    this.#syncHighlightsToLayout();
    this.draw();
    this.#raiseHighlightEvents(result);

    return [result.hash, () => {
      if (!this.#highlights.has(result.id)) return;
      this.#highlights.delete(result.id);
      this.#syncHighlightsToLayout();
      this.draw();
      this.#raiseHighlightEvents({ removed: result.added, added: [] });
    }];
  }

  /** Highlights an entire row by its data index (all columns from 0 to Infinity). Row highlights accumulate; adding a non-row highlight clears them. Returns `[hash, unsub]` or `null` if already highlighted. */
  highlightRowByDataIndex(rowIndex: number): HighlightResult {
    const result = this.#resolveConflictsAndAddHighlight(rowIndex, 0, rowIndex, Infinity);
    if (result.isDuplicate) return null;

    this.#syncHighlightsToLayout();
    this.draw();
    this.#raiseHighlightEvents(result);

    return [result.hash, () => {
      if (!this.#highlights.has(result.id)) return;
      this.#highlights.delete(result.id);
      this.#syncHighlightsToLayout();
      this.draw();
      this.#raiseHighlightEvents({ removed: result.added, added: [] });
    }];
  }

  /** Programmatically scrolls to a row or column by its absolute index. For columns, retries up to 5 times to handle auto-sizing geometry changes. Throws if `data` has not been set. */
  scrollTo(axis: "row" | "column", absoluteIndex: number): void {
    if (!this.#data) throw new Error("Data is not set!");
    if (axis === "row") {
      this.#layout.scrollToRow(absoluteIndex);
    } else {
      this.#layout.scrollToCol(absoluteIndex);
    }
  }

  /** Removes all active cell/row/column/range highlights and triggers a re-render. */
  clearAllHighlights(): void {
    this.#highlights.clear();
    this.#syncHighlightsToLayout();
    this.draw();
  }

  static register<T>(type: string, name: string, cls: Constructor<T>): void {
    addToRegistry(type, name, cls);
  }
}
