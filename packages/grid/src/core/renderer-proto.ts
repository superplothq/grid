import {GridConfig} from "../config";
import {GridDataViewModel} from "../grid-data-viewmodel";
import {ViewState} from "../types";
import {PLayout} from "./layout-proto";

export abstract class PRenderer {
  data: GridDataViewModel | undefined;
  config: GridConfig;
  mountPoint: HTMLElement;
  layout: PLayout;

  constructor(config: GridConfig, mountPoint: HTMLElement, layout: PLayout) {
    this.config = config;
    this.mountPoint = mountPoint;
    this.layout = layout;
  }

  setData(data: GridDataViewModel): void {
    this.data = data;
  }

  abstract render(viewState: ViewState): void;
}
