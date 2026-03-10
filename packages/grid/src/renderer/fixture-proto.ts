import { GridConfig } from "./grid-config";
import { GridDataViewModel } from "./grid-data-viewmodel";
import CellManager from "./cell-manager";
import { BaseViewModel } from "./layout-proto";
import { WithCellPlacement } from "./mixins";
import { BaseSliceResult, CellToMeasure, HeaderCellContext } from "./types";

export interface BaseFixtureViewModel {
}

// can be added to the left or right of the grid
// one entry in header cell if it's on the left hand side, on right, it gets it's own header cell
export interface BaseVFixtureViewModel extends BaseFixtureViewModel {
  width: number;
}

// can be added to top (right below column facet) / bottom of the grid
export interface BaseHFixtureViewModel extends BaseFixtureViewModel {
  height: number;
}

export type LayoutViewModelForFixture = BaseViewModel & { offset: number };

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

  abstract getCellsToRender(viewModel: LayoutViewModelForFixture, fixtureViewModel: BaseFixtureViewModel, sliceData: BaseSliceResult): {
    nodesToAppend: HTMLElement[];
    cellsToMeasure: CellToMeasure[];
  };

  abstract viewModel(): BaseFixtureViewModel;
}

export abstract class PVerticalFixture extends WithCellPlacement(PFixture) {
  abstract viewModel(): BaseVFixtureViewModel;

  abstract headerCells(ctx: HeaderCellContext): HTMLElement | HTMLElement[] | string | null;
}

export abstract class PHorizontalFixture extends PFixture {
  abstract viewModel(): BaseHFixtureViewModel;
}
