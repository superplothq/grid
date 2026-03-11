import { GridConfig } from "./grid-config";
import { GridDataViewModel } from "./grid-data-viewmodel";
import CellManager from "./cell-manager";
import { BaseViewModel } from "./layout-proto";
import { WithCellPlacement } from "./mixins";
import { BaseSliceResult, HeaderCellContext } from "./types";

export interface BaseFixtureViewModel {
  offset: number;
  track: number;
}

export default abstract class PFixture {
  data: GridDataViewModel | undefined;
  config: GridConfig;
  cellManager: CellManager;
  con: HTMLElement;

  constructor(config: GridConfig, con: HTMLElement, cellManager: CellManager) {
    this.config = config;
    this.con = con;
    this.cellManager = cellManager;
  }

  setData(data: GridDataViewModel): void {
    this.data = data;
  }

  abstract viewModelKey(): string;

  abstract getCellsToRender(
    viewModel: BaseViewModel,
    fixtureViewModel: BaseFixtureViewModel,
    sliceData: BaseSliceResult
  ): {
    nodesToAppend: HTMLElement[];
  };
}

export abstract class PVerticalFixture extends WithCellPlacement(PFixture) {
  abstract headerCells(ctx: HeaderCellContext): HTMLElement | HTMLElement[] | string | null;
}

export abstract class PHorizontalFixture extends WithCellPlacement(PFixture) {
  abstract getHeight(): number;
}
