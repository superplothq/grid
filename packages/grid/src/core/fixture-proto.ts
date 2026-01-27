import {GridConfig} from "../config";
import {GridDataViewModel} from "../grid-data-viewmodel";
import {SliceResult} from "../types";
import CellManager from "./cell-manager";
import {BaseLayoutViewModel} from "./layout-proto";

// TODO duplicate implementation with standard layout
export interface CellToMeasure {
  cell: HTMLElement;
  sizeKey: number;
}

export interface BaseFixtureViewModel {
}

export interface BaseVFixtureViewModel extends BaseFixtureViewModel {
  height: number;
}

export interface BaseHFixtureViewModel extends BaseFixtureViewModel {
  width: number;
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

  abstract getCellsToRender(viewModel: BaseLayoutViewModel, sliceData: SliceResult): {
    nodesToAppend: HTMLElement[];
    cellsToMeasure: CellToMeasure[];
  };

  abstract viewModel(): BaseFixtureViewModel;
}

export abstract class PVerticalFixture extends PFixture {
  abstract viewModel(): BaseVFixtureViewModel;
}

export abstract class PHorizontalFixture extends PFixture {
  abstract viewModel(): BaseHFixtureViewModel;
}
