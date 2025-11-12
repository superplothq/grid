import { GridConfig } from "./config";
import { GridData } from "./types";

export default abstract class GridLayoutSpaceManager {
  #dim: {w: number, h: number};
  #config: GridConfig;
  #mountEl: HTMLElement;
  #data: GridData;

  constructor(
    dim: {w: number, h: number},
    config: GridConfig,
    mountEl: HTMLElement,
    data: GridData
    
  ) {
    this.#dim = dim;
    this.#config = config;
    this.#mountEl = mountEl;
    this.#data = data;
  }

  get dim(): {w: number, h: number} {
    return this.#dim;
  }

  set dim(value: {w: number, h: number}) {
    this.#dim = value;
  }

  get config(): GridConfig {
    return this.#config;
  }

  set config(value: GridConfig) {
    this.#config = value;
  }

  get mountEl(): HTMLElement {
    return this.#mountEl;
  }

  set mountEl(value: HTMLElement) {
    this.#mountEl = value;
  }

  get data(): GridData {
    return this.#data;
  }

  set data(value: GridData) {
    this.#data = value;
  }

  abstract calculate(): void;

  abstract render(): void;
}
