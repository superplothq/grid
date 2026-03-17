import { GridDataViewModel } from "./grid-data-viewmodel";
import { GridConfig, defaultConfig } from "./grid-config";
import CellManager from "./cell-manager";
import { addToRegistry } from "./registry";
import { Constructor } from "./types";
import "./themes";
import StandardLayout, { LayoutEvents } from "./standard-layout";
import GroupedRowLayout from "./grouped-row-layout";
import { WithEvents, EventEmitter } from "./mixins";

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
} from "./types";
export { registerTheme } from "./registry";
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

export default class Grid extends GridWithEvents {
  #config: GridConfig;
  #data: GridDataViewModel | undefined;
  #cellManager: CellManager;
  #layout: StandardLayout;
  #renderCount = 0;
  #selections: Map<string, [fromRow: number, fromCol: number, toRow: number, toCol: number]> = new Map();

  constructor(config: Partial<GridConfig>, mountPoint: HTMLElement, layoutType: LayoutType = "pivot") {
    super();
    this.#config = { ...defaultConfig, ...config };

    this.#cellManager = new CellManager();
    const LayoutClass = layoutType === "flat" ? GroupedRowLayout : StandardLayout;
    this.#layout = new LayoutClass(this.#config, mountPoint, this.#cellManager);

    // Forward layout events to Grid
    this.forwardFrom(this.#layout as unknown as EventEmitter<LayoutEvents>, ["renderComplete", "debug_perf:metrics", "viewDataEmpty"]);

    this.#setupResizeHandler();
  }

  #setupResizeHandler(): void {
    if (!this.#config.enableResizeUI) return;

    const container = this.#layout.gridContainer;
    const EDGE_THRESHOLD = 4;

    const isNearRightEdge = (cell: HTMLElement, clientX: number): boolean => {
      const rect = cell.getBoundingClientRect();
      return clientX >= rect.right - EDGE_THRESHOLD;
    };

    const getHeaderCell = (target: EventTarget | null): HTMLElement | null => {
      if (!(target instanceof HTMLElement)) return null;
      return target.closest<HTMLElement>("[data-cell-type='column-facet']");
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
      const cell = getHeaderCell(e.target);
      if (!cell || !isNearRightEdge(cell, e.clientX)) return;

      const level = parseInt(cell.dataset.facetLevel!, 10);
      // See the diagram in the comment on standard-layout.ts
      // since for facets level < leaf levels, columns are merged (by applying colspan), rightPtr contains the right
      // most index of the merged column facet value from the data view model.

      // TODO[1] this confusing rowFacetAdjustment is necessary because the dataset indices (hix, cclix)
      //      includes row facets while computing the indices. But column facets / col defs in data view model
      //      does not include row facets header.
      //      This is a temporary fix. To fix it properly - add rowFacet headers in both colDefs and columnFacets
      //      (we will need it when we have to show row header / enable row resizing).
      const rowFacetAdjustment = this.#layout.data!.numRowFacetLevels;
      const rightPtr = parseInt(cell.dataset.hix!, 10) - rowFacetAdjustment;

      // column facets level = leaf levels provides header cells for data cells. These two essentially create a standard table.
      // Column facets level < leaf levels create hierarchy/nesting and spans over multiple leaf level columns.
      // Here we find out : for a given level and value of column facet what are the leaf level columns over which the
      // column facet spans. This would contain columns that are in viewport and that are invisible and not in dom
      // because of virtualization
      const fullRange = findFullColumnRange(level, rightPtr);
      const totalColCount = fullRange.end - fullRange.start + 1;
      const startX = e.clientX;

      // Find out out of all leaf level nodes over which the column being dragged spans, which columns are in dom
      // TODO[1]
      const visibleCols = getVisibleLeafColumns(fullRange.start + rowFacetAdjustment, fullRange.end + rowFacetAdjustment);
      // TODO for cells that are not currently in dom atm, but would appear in dom as we scroll / reduce size of columns
      //      we need to update the change in size of columns to be considered as they appears on the dom

      type ResizeController = ReturnType<StandardLayout["changeLeafColWidth"]>;
      const resizeControllers: { idx: number; ctrl: ResizeController }[] = [];
      for (const colIdx of visibleCols) {
        resizeControllers.push({ idx: colIdx, ctrl: this.#layout.changeLeafColWidth(colIdx) });
      }


      const onMouseMove = (moveEvent: MouseEvent) => {
        container.style.cursor = "col-resize";
        const deltaX = moveEvent.clientX - startX;
        const lastPerColDelta = deltaX / totalColCount;
        resizeControllers.forEach(c => c.ctrl.byDelta(lastPerColDelta));
      };

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        container.style.cursor = "";

        resizeControllers.forEach(c => c.ctrl.commit());
        this.draw();
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);

      e.preventDefault();
    });
  }

  set data(value: GridDataViewModel) {
    this.#data = value;
    this.#layout.setData(value);
  }

  get data(): GridDataViewModel | undefined {
    return this.#data;
  }

  draw(): void {
    const startTime = performance.now();
    this.#renderCount++;

    if (!this.#data) throw new Error("Data is not set!");

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

  clearAllSelections(): void {
    this.#selections.clear();
    this.#syncSelectionsToLayout();
    this.draw();
  }

  static register<T>(type: string, name: string, cls: Constructor<T>): void {
    addToRegistry(type, name, cls);
  }
}
