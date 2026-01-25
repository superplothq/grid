import {GridConfig} from "../config";
import {GridDataViewModel} from "../grid-data-viewmodel";
import CellManager from "./cell-manager";

export default abstract class PFixture {
  data: GridDataViewModel | undefined;
  config: GridConfig;
  cellManager: CellManager

  constructor(config: GridConfig, cellManager: CellManager) {
    this.config = config;
    this.cellManager = cellManager;
  }

  setData(data: GridDataViewModel): void {
    this.data = data;
  }

  abstract getElsToRender(): HTMLElement[];
}

export abstract class PVerticalFixture extends PFixture {
  abstract getHeight(): number;
}

export abstract class PHorizontalFixture extends PFixture {
  abstract getWidth(): number;
}
