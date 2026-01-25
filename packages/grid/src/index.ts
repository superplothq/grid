import {GridDataViewModel} from "./grid-data-viewmodel";
import { GridConfig, REG_NAME_STD, REG_TYPE_LAYOUT, defaultConfig } from "./config";
import CellManager from "./core/cell-manager";
import PLayout from "./core/layout-proto";
import {addToRegistry, getFromRegistry} from "./registry";
import { Constructor } from "./types";
import StandardLayout from "./core/standard-layout";

export { StandardLayout };
export { GridConfig, defaultConfig } from "./config";
export { PLayout, GridDataViewModel };
export type { BaseViewModel as BaseViewState } from "./core/layout-proto";
export type { SliceResult } from "./types";

export default class Grid {
  #config: GridConfig;
  #data: GridDataViewModel | undefined;
  #cellManager: CellManager;
  #layout: PLayout;
  #renderCount = 0;


  constructor(config: Partial<GridConfig>, mountPoint: HTMLElement) {
    this.#config = { ...defaultConfig, ...config };

    const StandardLayout = getFromRegistry<PLayout>(REG_TYPE_LAYOUT, this.#config.layoutType);
    if (!StandardLayout) {
      throw new Error(`Can't find entry in registery. Name ${this.#config.layoutType} of type ${REG_TYPE_LAYOUT}. Register one first by calling \`Grid.register(..., ..., ...)\`.`);

    }

    this.#cellManager = new CellManager();
    this.#layout = new StandardLayout(this.#config, mountPoint, this.#cellManager);
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

    const viewModel = this.#layout.viewModel();
    this.#layout.render(viewModel);
  }

  static register<T>(type: string, name: string, cls: Constructor<T>): void {
    addToRegistry(type, name, cls);
  }
}

Grid.register<PLayout>(REG_TYPE_LAYOUT, REG_NAME_STD, StandardLayout);
