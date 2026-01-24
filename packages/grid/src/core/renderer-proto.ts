import {GridConfig} from "../config";
import {GridDataViewModel} from "../grid-data-viewmodel";
import {ViewState} from "../types";
import CellManager from "./cell-manager";
import {PLayout} from "./layout-proto";

export abstract class PRenderer {
  data: GridDataViewModel | undefined;
  config: GridConfig;
  mountPoint: HTMLElement;
  layout: PLayout;
  cellManager: CellManager;

  constructor(config: GridConfig, mountPoint: HTMLElement, layout: PLayout, cellManager: CellManager) {
    this.config = config;
    this.mountPoint = mountPoint;
    this.layout = layout;
    this.cellManager = cellManager;
  }

  setData(data: GridDataViewModel): void {
    this.data = data;
  }

  abstract render(viewState: ViewState): void;
}
