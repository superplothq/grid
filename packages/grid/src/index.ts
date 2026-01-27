import {GridDataViewModel} from "./grid-data-viewmodel";
import { GridConfig, REG_NAME_STD, REG_TYPE_LAYOUT, defaultConfig } from "./config";
import CellManager from "./core/cell-manager";
import PLayout from "./core/layout-proto";
import {addToRegistry, getFromRegistry} from "./registry";
import { Constructor } from "./types";
import StandardLayout, { LayoutEvents, SelectionType } from "./core/standard-layout";
import { WithEvents, EventEmitter } from "./core/mixins";

export { StandardLayout };
export { GridConfig, defaultConfig } from "./config";
export { PLayout, GridDataViewModel };
export type { BaseViewModel as BaseViewState } from "./core/layout-proto";
export type { SliceResult } from "./types";
export type { LayoutEvents, SelectionType } from "./core/standard-layout";
export type { EventEmitter };

export type GridEvents = LayoutEvents;

class GridBase {}
const GridWithEvents = WithEvents<GridEvents>()(GridBase);

export default class Grid extends GridWithEvents {
  #config: GridConfig;
  #data: GridDataViewModel | undefined;
  #cellManager: CellManager;
  #layout: StandardLayout;
  #renderCount = 0;
  #selections: Map<string, [fromRow: number, fromCol: number, toRow: number, toCol: number]> = new Map();

  constructor(config: Partial<GridConfig>, mountPoint: HTMLElement) {
    super();
    this.#config = { ...defaultConfig, ...config };

    const LayoutClass = getFromRegistry<StandardLayout>(REG_TYPE_LAYOUT, this.#config.layoutType);
    if (!LayoutClass) {
      throw new Error(`Can't find entry in registery. Name ${this.#config.layoutType} of type ${REG_TYPE_LAYOUT}. Register one first by calling \`Grid.register(..., ..., ...)\`.`);

    }

    this.#cellManager = new CellManager();
    this.#layout = new LayoutClass(this.#config, mountPoint, this.#cellManager);

    // Forward layout events to Grid
    this.forwardFrom(this.#layout as unknown as EventEmitter<LayoutEvents>, ["renderComplete", "debug_perf:metrics"]);
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
    this.#layout.render(viewModel, {t1: startTime});
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

  #resolveConflictsAndAddSelection(fromRow: number, fromCol: number, toRow: number, toCol: number): string {
    const newType = this.#getSelectionType(fromRow, fromCol, toRow, toCol);
    const currentType = this.#getCurrentSelectionType();

    // if range selection: then all previous selections are cleared including range
    // if cell selection: only keep if previous selection is cell
    // if col selection: only keep if previous selection is col
    // if row selection: only keep if previous selection is row
    if (newType === "range" || (currentType && currentType !== newType)) {
      this.#selections.clear();
    }

    const id = this.#makeSelectionId(fromRow, fromCol, toRow, toCol);
    this.#selections.set(id, [fromRow, fromCol, toRow, toCol]);
    return id;
  }

  #syncSelectionsToLayout(): void {
    const selectionsArray = Array.from(this.#selections.values());
    this.#layout.viewModelProposal({ selections: selectionsArray });
  }

  selectCellByDataIndex(row: number, col: number): () => void {
    const id = this.#resolveConflictsAndAddSelection(row, col, row, col);
    this.#syncSelectionsToLayout();
    this.draw();
    return () => {
      this.#selections.delete(id);
      this.#syncSelectionsToLayout();
      this.draw();
    };
  }

  selectRangeByDataIndex(fromRow: number, fromCol: number, toRow: number, toCol: number): () => void {
    // Normalize to ensure from <= to
    const normFromRow = Math.min(fromRow, toRow);
    const normFromCol = Math.min(fromCol, toCol);
    const normToRow = Math.max(fromRow, toRow);
    const normToCol = Math.max(fromCol, toCol);

    const id = this.#resolveConflictsAndAddSelection(normFromRow, normFromCol, normToRow, normToCol);
    this.#syncSelectionsToLayout();
    this.draw();
    return () => {
      this.#selections.delete(id);
      this.#syncSelectionsToLayout();
      this.draw();
    };
  }

  selectColumnByDataIndex(colIndex: number): () => void {
    const id = this.#resolveConflictsAndAddSelection(0, colIndex, Infinity, colIndex);
    this.#syncSelectionsToLayout();
    this.draw();
    return () => {
      this.#selections.delete(id);
      this.#syncSelectionsToLayout();
      this.draw();
    };
  }

  selectRowByDataIndex(rowIndex: number): () => void {
    const id = this.#resolveConflictsAndAddSelection(rowIndex, 0, rowIndex, Infinity);
    this.#syncSelectionsToLayout();
    this.draw();
    return () => {
      this.#selections.delete(id);
      this.#syncSelectionsToLayout();
      this.draw();
    };
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

Grid.register<PLayout>(REG_TYPE_LAYOUT, REG_NAME_STD, StandardLayout);
