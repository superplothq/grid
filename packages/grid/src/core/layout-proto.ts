import {GridConfig} from "../config";
import {GridDataViewModel} from "../grid-data-viewmodel";
import {ViewState} from "../types";
import CellManager from "./cell-manager";

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

  // TODO the ViewState value should generic. If a different layout to be registered, it expectes the same viewstate
  // which is not correct
  abstract calculateViewState(): ViewState;

  abstract render(viewState: ViewState): void;
}

