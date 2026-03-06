import {GridConfig} from "./grid-config";
import {GridDataViewModel} from "./grid-data-viewmodel";
import CellManager from "./cell-manager";

export interface BaseViewModel {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface RenderCtx {
  t1: number;
  hintContentDirty?: boolean;
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

  abstract calculateViewModel(): BaseViewModel;

  abstract render(viewModel: BaseViewModel, ctx: RenderCtx): void;
}

