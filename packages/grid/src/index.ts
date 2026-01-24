import {GridDataViewModel} from "./grid-data-viewmodel";
import { GridConfig, defaultConfig } from "./config";
import CellManager from "./core/cell-manager";
import {PLayout} from "./core/layout-proto";
import {PRenderer} from "./core/renderer-proto";
import {addToRegistry, getFromRegistry} from "./registry";
import { ComponentClass } from "./types";
import StandardLayout from "./core/layout/standard-layout";
import StandardLayoutRenderer from "./core/layout/standard-layout-renderer";

export { StandardLayout, StandardLayoutRenderer };

export { GridDataViewModel } from "./grid-data-viewmodel";
export { GridConfig, defaultConfig } from "./config";
export { PLayout } from "./core/layout-proto";
export { PRenderer } from "./core/renderer-proto";
export type { ViewState, SliceResult } from "./types";

export default class Grid {
  #config: GridConfig;
  #data: GridDataViewModel | undefined;
  #cellManager: CellManager;
  #layout: PLayout;
  #renderer: PRenderer;
  #renderCount = 0;


  constructor(config: Partial<GridConfig>, mountPoint: HTMLElement) {
    this.#config = { ...defaultConfig, ...config };

    const StandardLayout = getFromRegistry("layout", this.#config.layoutType);
    if (!StandardLayout) {
      throw new Error(`No layout of type ${this.#config.layoutType} is present in the registry. Register one first by calling \`Grid.register(..., ..., ...)\`.`);

    }
    const StandardRenderer = getFromRegistry("renderer", this.#config.rendererType);
    if (!StandardRenderer) {
      throw new Error(`No layout of type ${this.#config.layoutType} is present in the registry. Register one first by calling \`Grid.register(..., ..., ...)\`.`);
    }

    this.#cellManager = new CellManager();
    this.#layout = new StandardLayout(this.#config, mountPoint);
    this.#renderer = new StandardRenderer(this.#config, mountPoint, this.#layout, this.#cellManager);
  }

  set data(value: GridDataViewModel) {
    this.#data = value;
    this.#renderer.setData(value);
    this.#layout.setData(value);
  }

  get data(): GridDataViewModel | undefined {
    return this.#data;
  }

  draw(): void {
    const startTime = performance.now();
    this.#renderCount++;

    if (!this.#data) throw new Error("Data is not set!");

    const vs = this.#layout.calculateViewState();
    this.#renderer.render(vs);
  }

  static register<T extends ComponentClass>(type: string, name: string, cls: T): void {
    addToRegistry(type, name, cls);
  }
}

Grid.register("layout", "standard", StandardLayout);
Grid.register("renderer", "standard", StandardLayoutRenderer);
