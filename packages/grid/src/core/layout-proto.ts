import {GridConfig} from "../config";
import {GridDataViewModel} from "../grid-data-viewmodel";
import CellManager from "./cell-manager";

export interface BaseLayoutViewModel {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  totalHeight: number;
  totalWidth: number;
}

export default abstract class PLayout {
  data: GridDataViewModel | undefined;
  config: GridConfig;
  mountPoint: HTMLElement;
  cellManager: CellManager;


  constructor(config: GridConfig, mountPoint: HTMLElement, cellManager: CellManager) {
    this.config = config;
    this.mountPoint = mountPoint;
    this.cellManager = cellManager;
  }

  setData(data: GridDataViewModel): void {
    this.data = data;
  }

  abstract viewModel(): BaseLayoutViewModel;

  abstract render(viewModel: BaseLayoutViewModel): void;
}

