import {GridDataViewModel} from "./grid-data-viewmodel";
import { GridConfig, defaultConfig } from "./config";
import {PLayout} from "./core/layout-proto";
import {PRenderer} from "./core/renderer-proto";
import {addToRegistry, getFromRegistry} from "./registry";
import { ComponentClass } from "./types";

function addToMap<T>(
  map: Map<string, Map<string, T>>,
  type: string,
  name: string,
  cls: T
): void {
  if (!map.has(type)) {
    map.set(type, new Map());
  }
  map.get(type)!.set(name, cls);
}

export class Grid {
  #config: GridConfig;
  #data: GridDataViewModel | undefined;
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

    this.#layout = new StandardLayout(config, mountPoint);
    this.#renderer = new StandardRenderer(config, mountPoint, this.#layout);
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
