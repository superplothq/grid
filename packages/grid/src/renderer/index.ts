import { GridDataViewModel } from "./grid-data-viewmodel";
import { GridConfig, defaultConfig } from "./grid-config";
import CellManager from "./cell-manager";
import { addToRegistry } from "./registry";
import { Constructor, FacetPredicate } from "./types";
import "./themes";
import StandardLayout, { LayoutEvents } from "./standard-layout";
import GroupedRowLayout from "./grouped-row-layout";
import { WithEvents, EventEmitter } from "./mixins";
import { SelectionRuleStore, Selection } from "./select-all";

export type LayoutType = "pivot" | "flat";

// TODO this used to be the entry point, now it's not, so lot of this config
// is not necessary
export { StandardLayout };
export { default as GroupedRowLayout } from "./grouped-row-layout";
export { GridConfig, defaultConfig } from "./grid-config";
export type {
  IColAutoSize,
  IColAutoSizeStrategyMaxCell,
  IColAutoSizeStrategyFixedWidth,
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
  SelectionProps,
} from "./types";
export { Selection, CellSelection } from "./select-all";
export { registerTheme, getTheme } from "./registry";
export { GridDataViewModel, MetaState } from "./grid-data-viewmodel";
export { PivotDataViewModel } from "./pivot-data-viewmodel";
export { FlattenedDataViewModel, createRowMeta } from "./flattened-data-viewmodel";
export type { BaseViewModel } from "./layout-proto";
export type { LayoutEvents } from "./standard-layout";
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

export type SelectionPayload = {
  hash: string;
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
};

export type GridEvents = LayoutEvents & {
  selectionAdded: SelectionPayload;
  selectionRemoved: SelectionPayload;
};

class GridBase {}
const GridWithEvents = WithEvents<GridEvents>()(GridBase);

export type SelectionType = "cell" | "row" | "column" | "range";
export type SelectionResult = [hash: string, unsub: () => void] | null;

function fastHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

/**
 * The public entry point for the grid renderer. Wraps a layout engine (`StandardLayout` or `GroupedRowLayout`),
 * a cell pool, and a selection rule store. Set a [GridDataViewModel](/docs/viewmodel) via the `data` setter, then
 * call `draw()` to render. The Grid forwards all [layout events](/docs/renderer/events) and adds selection events.
 */
export default class Grid extends GridWithEvents {
  #config: GridConfig;
  #data: GridDataViewModel | undefined;
  #cellManager: CellManager;
  #layout: StandardLayout;
  #renderCount = 0;
  #selections: Map<string, [fromRow: number, fromCol: number, toRow: number, toCol: number]> = new Map();
  #ruleStore: SelectionRuleStore;

  constructor(config: Partial<GridConfig>, mountPoint: HTMLElement, layoutType: LayoutType = "pivot", opts?: {
    onCellRelease?: (key: string, cell: HTMLElement) => void;
    onBeforeMeasure?: () => void;
  }) {
    super();
    this.#config = { ...defaultConfig, ...config };

    this.#cellManager = new CellManager();
    if (opts?.onCellRelease) this.#cellManager.onRelease = opts.onCellRelease;
    const LayoutClass = layoutType === "flat" ? GroupedRowLayout : StandardLayout;
    this.#layout = new LayoutClass(this.#config, mountPoint, this.#cellManager);
    if (opts?.onBeforeMeasure) this.#layout.onBeforeMeasure = opts.onBeforeMeasure;

    this.#ruleStore = new SelectionRuleStore(() => this.draw());

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
      return target.closest<HTMLElement>("[data-cell-action-resize='1']");
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
      } else if (region === "left" && (e.target as HTMLElement).dataset.groupFacetResize === "1") {
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

      if (region === "left" && (e.target as HTMLElement).dataset.groupFacetResize === "1") {
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

  #scheduleDrawPending = false;

  /** Sets the viewmodel that provides data for rendering. After setting, call `draw()` to trigger the first render. Reassign after `updateData()` to push new data into the grid. */
  set data(value: GridDataViewModel) {
    this.#data = value;
    this.#layout.setData(value);
  }

  /** Returns the current viewmodel, or `undefined` if none has been set. */
  get data(): GridDataViewModel | undefined {
    return this.#data;
  }

  /** Schedules a draw on the next animation frame. Multiple calls before the frame fires are coalesced into a single render. */
  scheduleDraw(): void {
    if (this.#scheduleDrawPending) return;
    this.#scheduleDrawPending = true;
    requestAnimationFrame(() => {
      this.#scheduleDrawPending = false;
      this.draw();
    });
  }

  /** Creates a [Selection](/docs/renderer/selections) builder that targets facet cells matching the predicate. Chain `.selectAll()` to add more predicates, then `.style()` or `.prop()` to apply effects. */
  selectAll(predicate: FacetPredicate): Selection {
    return new Selection(this.#ruleStore, [{ type: "facet", predicate }]);
  }

  /** Triggers a synchronous render cycle: calculates the viewport, fetches the data slice, renders cells, auto-sizes columns, and emits `renderComplete`. Throws if `data` has not been set. */
  draw(): void {
    const startTime = performance.now();
    this.#renderCount++;

    if (!this.#data) throw new Error("Data is not set!");

    this.#layout.setSelectAllRules(this.#ruleStore.rules);
    const viewModel = this.#layout.calculateViewModel();
    this.#layout.render(viewModel, { t1: startTime });
  }

  #makeSelectionId(fromRow: number, fromCol: number, toRow: number, toCol: number): string {
    const r = (v: number) => v === Infinity ? "inf" : String(v);
    return `${r(fromRow)};${r(toRow)};${r(fromCol)};${r(toCol)}`;
  }

  #getSelectionType(fromRow: number, fromCol: number, toRow: number, toCol: number): SelectionType {
    if (fromRow === toRow && fromCol === toCol) return "cell";
    if (fromCol === 0 && toCol === Infinity) return "row";
    if (fromRow === 0 && toRow === Infinity) return "column";
    return "range";
  }

  #getCurrentSelectionType(): SelectionType | null {
    const first = this.#selections.values().next().value;
    if (!first) return null;
    return this.#getSelectionType(first[0], first[1], first[2], first[3]);
  }

  #resolveConflictsAndAddSelection(fromRow: number, fromCol: number, toRow: number, toCol: number): {
    id: string;
    hash: string;
    isDuplicate: boolean;
    removed: SelectionPayload[];
    added: SelectionPayload[]
  } {
    const newType = this.#getSelectionType(fromRow, fromCol, toRow, toCol);
    const currentType = this.#getCurrentSelectionType();
    const id = this.#makeSelectionId(fromRow, fromCol, toRow, toCol);
    const hash = fastHash(id);

    if (this.#selections.has(id)) {
      return { id, hash, isDuplicate: true, removed: [], added: [] };
    }

    const removed: SelectionPayload[] = [];

    // if range selection: then all previous selections are cleared including range
    // if cell selection: only keep if previous selection is cell
    // if col selection: only keep if previous selection is col
    // if row selection: only keep if previous selection is row
    if (newType === "range" || (currentType && currentType !== newType)) {
      for (const [existingId, selection] of this.#selections) {
        removed.push({ hash: fastHash(existingId), fromRow: selection[0], fromCol: selection[1], toRow: selection[2], toCol: selection[3] });
      }
      this.#selections.clear();
    }

    this.#selections.set(id, [fromRow, fromCol, toRow, toCol]);
    const added: SelectionPayload[] = [{ hash, fromRow, fromCol, toRow, toCol }];
    return { id, hash, isDuplicate: false, removed, added };
  }

  #raiseSelectionEvents(result: { removed: SelectionPayload[]; added: SelectionPayload[] }): void {
    for (const r of result.removed) {
      this.emit("selectionRemoved", r);
    }
    for (const a of result.added) {
      this.emit("selectionAdded", a);
    }
  }

  #syncSelectionsToLayout(): void {
    const selectionsArray = Array.from(this.#selections.values());
    this.#layout.viewModelProposal({ selections: selectionsArray });
  }

  /** Selects a single cell by its data row and column index. Returns `[hash, unsub]` where `hash` identifies the selection and `unsub()` removes it. Returns `null` if the cell is already selected. Emits `selectionAdded`; calling `unsub()` emits `selectionRemoved`. */
  selectCellByDataIndex(row: number, col: number): SelectionResult {
    const result = this.#resolveConflictsAndAddSelection(row, col, row, col);
    if (result.isDuplicate) return null;

    this.#syncSelectionsToLayout();
    this.draw();
    this.#raiseSelectionEvents(result);

    return [result.hash, () => {
      if (!this.#selections.has(result.id)) return;
      this.#selections.delete(result.id);
      this.#syncSelectionsToLayout();
      this.draw();
      this.#raiseSelectionEvents({ removed: result.added, added: [] });
    }];
  }

  /** Selects a rectangular range of cells. Coordinates are normalized (min/max) internally. A range selection clears all previous selections. Returns `[hash, unsub]` or `null` if already selected. */
  selectRangeByDataIndex(fromRow: number, fromCol: number, toRow: number, toCol: number): SelectionResult {
    // Normalize to ensure from <= to
    const normFromRow = Math.min(fromRow, toRow);
    const normFromCol = Math.min(fromCol, toCol);
    const normToRow = Math.max(fromRow, toRow);
    const normToCol = Math.max(fromCol, toCol);

    const result = this.#resolveConflictsAndAddSelection(normFromRow, normFromCol, normToRow, normToCol);
    if (result.isDuplicate) return null;

    this.#syncSelectionsToLayout();
    this.draw();
    this.#raiseSelectionEvents(result);

    return [result.hash, () => {
      if (!this.#selections.has(result.id)) return;
      this.#selections.delete(result.id);
      this.#syncSelectionsToLayout();
      this.draw();
      this.#raiseSelectionEvents({ removed: result.added, added: [] });
    }];
  }

  /** Selects an entire column by its data index (all rows from 0 to Infinity). Column selections accumulate; adding a non-column selection clears them. Returns `[hash, unsub]` or `null` if already selected. */
  selectColumnByDataIndex(colIndex: number): SelectionResult {
    const result = this.#resolveConflictsAndAddSelection(0, colIndex, Infinity, colIndex);
    if (result.isDuplicate) return null;

    this.#syncSelectionsToLayout();
    this.draw();
    this.#raiseSelectionEvents(result);

    return [result.hash, () => {
      if (!this.#selections.has(result.id)) return;
      this.#selections.delete(result.id);
      this.#syncSelectionsToLayout();
      this.draw();
      this.#raiseSelectionEvents({ removed: result.added, added: [] });
    }];
  }

  /** Selects an entire row by its data index (all columns from 0 to Infinity). Row selections accumulate; adding a non-row selection clears them. Returns `[hash, unsub]` or `null` if already selected. */
  selectRowByDataIndex(rowIndex: number): SelectionResult {
    const result = this.#resolveConflictsAndAddSelection(rowIndex, 0, rowIndex, Infinity);
    if (result.isDuplicate) return null;

    this.#syncSelectionsToLayout();
    this.draw();
    this.#raiseSelectionEvents(result);

    return [result.hash, () => {
      if (!this.#selections.has(result.id)) return;
      this.#selections.delete(result.id);
      this.#syncSelectionsToLayout();
      this.draw();
      this.#raiseSelectionEvents({ removed: result.added, added: [] });
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

  /** Removes all active cell/row/column/range selections and triggers a re-render. */
  clearAllSelections(): void {
    this.#selections.clear();
    this.#syncSelectionsToLayout();
    this.draw();
  }

  static register<T>(type: string, name: string, cls: Constructor<T>): void {
    addToRegistry(type, name, cls);
  }
}
