import {GridConfig} from "../config";
import {GridDataViewModel} from "../grid-data-viewmodel";
import {ViewState} from "../types";

export default abstract class PLayout {
  data: GridDataViewModel | undefined;
  config: GridConfig;
  mountPoint: HTMLElement;

  constructor(config: GridConfig, mountPoint: HTMLElement) {
    this.config = config;
    this.mountPoint = mountPoint;
  }

  setData(data: GridDataViewModel): void {
    this.data = data;
  }

  abstract calculateViewState(): ViewState;
}

