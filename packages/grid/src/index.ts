import {GridDataViewModel} from "./grid-data-viewmodel";
import { GridConfig, REG_NAME_STD, REG_TYPE_LAYOUT, defaultConfig } from "./config";
import CellManager from "./core/cell-manager";
import PLayout from "./core/layout-proto";
import {addToRegistry, getFromRegistry} from "./registry";
import { Constructor } from "./types";
import StandardLayout, { LayoutEvents } from "./core/standard-layout";
import { WithEvents, EventEmitter } from "./core/mixins";

export { StandardLayout };
export { GridConfig, defaultConfig } from "./config";
export { PLayout, GridDataViewModel };
export type { BaseViewModel as BaseViewState } from "./core/layout-proto";
export type { SliceResult } from "./types";
export type { LayoutEvents } from "./core/standard-layout";
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

  selectCellByDataIndex(row: number, col: number): () => void {
    this.#layout.viewModelProposal({ selection: [row, col, row, col] });
    this.draw();
    return () => {
      this.#layout.viewModelProposal({ selection: [] });
      this.draw();
    };
  }

  selectRangeByDataIndex(fromRow: number, fromCol: number, toRow: number, toCol: number): () => void {
    // Normalize to ensure from <= to
    this.#layout.viewModelProposal({
      selection: [
        Math.min(fromRow, toRow),
        Math.min(fromCol, toCol),
        Math.max(fromRow, toRow),
        Math.max(fromCol, toCol),
      ]
    });
    this.draw();
    return () => {
      this.#layout.viewModelProposal({ selection: [] });
      this.draw();
    };
  }

  selectColumnByDataIndex(colIndex: number): () => void {
    this.#layout.viewModelProposal({ selection: [0, colIndex, Infinity, colIndex] });
    this.draw();
    return () => {
      this.#layout.viewModelProposal({ selection: [] });
      this.draw();
    };
  }

  selectRowByDataIndex(rowIndex: number): () => void {
    this.#layout.viewModelProposal({ selection: [rowIndex, 0, rowIndex, Infinity] });
    this.draw();
    return () => {
      this.#layout.viewModelProposal({ selection: [] });
      this.draw();
    };
  }

  static register<T>(type: string, name: string, cls: Constructor<T>): void {
    addToRegistry(type, name, cls);
  }
}

Grid.register<PLayout>(REG_TYPE_LAYOUT, REG_NAME_STD, StandardLayout);
