import { GridConfig } from "./grid-config";
import { GridDataViewModel } from "./grid-data-viewmodel";
import { BaseViewModel } from "./layout-proto";
import { PlaceCellFn } from "./mixins";
import { BaseSliceResult, ColAutoSizeConfig, HeaderCellContext } from "./types";

export interface BaseFixtureViewModel {
  offset: number;
  track: number;
  suggestedCls: string[];
}

export default abstract class PFixture {
  data: GridDataViewModel | undefined;
  config: GridConfig;
  con: HTMLElement;
  // Provided by the layout. Places a cell in the grid and stamps the fixture identity attributes on it.
  placeCellInDom: PlaceCellFn;

  constructor(config: GridConfig, con: HTMLElement, placeCellInDom: PlaceCellFn) {
    this.config = config;
    this.con = con;
    this.placeCellInDom = placeCellInDom;
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

// #region vertical-fixture
export abstract class PVerticalFixture extends PFixture {
  #colSize: ColAutoSizeConfig = { strategy: "max-cell" };
  get colSize(): ColAutoSizeConfig { return this.#colSize; }
  set colSize(value: ColAutoSizeConfig) { this.#colSize = value; }
  abstract headerCell(ctx: HeaderCellContext): HTMLElement | HTMLElement[] | string | null;
}
// #endregion vertical-fixture

// #region horizontal-fixture
export abstract class PHorizontalFixture extends PFixture {
  abstract getHeight(): number;
  headerCell(_ctx: HeaderCellContext): HTMLElement | HTMLElement[] | string | null | undefined { return undefined; }
}
// #endregion horizontal-fixture
