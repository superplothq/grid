import { GridConfig } from "./config";
import { EventEmitter } from "./events";
import { IRenderer } from "./renderers/types";
import { TableRenderer } from "./renderers/table-renderer";
import { GridData } from "./types";

export interface GridViewEvents {
  rendered: void;
  destroyed: void;
}

export default class GridView extends EventEmitter<GridViewEvents> {
  #config: GridConfig;
  #container: HTMLElement | null = null;
  #data: GridData | null = null;
  #renderer: IRenderer;

  constructor(config: GridConfig, renderer?: IRenderer) {
    super();
    this.#config = config;
    this.#renderer = renderer ?? new TableRenderer();
  }

  get renderer(): IRenderer {
    return this.#renderer;
  }

  set renderer(value: IRenderer) {
    if (this.#container) {
      this.#renderer.destroy();
      this.#renderer = value;
      this.#renderer.mount(this.#container);
      if (this.#data) {
        this.render();
      }
    } else {
      this.#renderer = value;
    }
  }

  mount(container: HTMLElement): void {
    this.#container = container;
    this.#renderer.mount(container);
  }

  set data(value: GridData) {
    this.#data = value;
  }

  get data(): GridData | null {
    return this.#data;
  }

  render(): void {
    if (!this.#data) {
      return;
    }
    this.#renderer.render(this.#data);
    this.emit("rendered", undefined as void);
  }

  destroy(): void {
    this.#renderer.destroy();
    this.#container = null;
    this.#data = null;
    this.emit("destroyed", undefined as void);
    this.removeAllListeners();
  }
}
