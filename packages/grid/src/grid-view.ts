import {GridConfig} from "./config";
import {GridData} from "./types";

export default class GridView {
  #config: GridConfig;
  #mountEl: HTMLElement;
  #data: GridData;

  constructor(config: GridConfig) {
    this.#config = config;
  }

  set mountEl(value: HTMLElement) {
    this.#mountEl = value;
  }

  set data(value: GridData) {
    this.#data = value;
  }

  render(): void {
    console.log("GridView render");
  }
}
