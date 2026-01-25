import {GridConfig} from "../config";
import {GridDataViewModel} from "../grid-data-viewmodel";
import CellManager from "./cell-manager";


export default abstract class PFixture {
  data: GridDataViewModel | undefined;
  config: GridConfig;

  constructor(config: GridConfig) {
    this.config = config;
  }

  setData(data: GridDataViewModel): void {
    this.data = data;
  }

  abstract getElsToRender(cellManager: CellManager): HTMLElement[];
}

export abstract class PVerticalFixture extends PFixture {
  abstract getHeight(): number;
}

export abstract class PHorizontalFixture extends PFixture {
  abstract getWidth(): number;
}
