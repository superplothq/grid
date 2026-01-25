import {LayoutFixtures} from "./types";

export const REG_TYPE_LAYOUT = "layout";
export const REG_TYPE_RENDERER = "renderer";
export const REG_TYPE_FIXTURE = "fixture";
export const REG_NAME_STD = "std";
export const REG_NAME_ROW_FACETS = "row-facets";
export const REG_NAME_COLUMN_FACETS = "column-facets";


export interface GridConfig {
  defaultCellHeight: number;
  defaultCellWidth: number;
  overscan: number;
  layoutType: string;
  rendererType: string;
  layoutFixtures: LayoutFixtures;
  columnFacetsFixtureType: string;
  rowFacetsFixtureType: string;
}

export const defaultConfig: GridConfig = {
  defaultCellHeight: 19,
  defaultCellWidth: 60,
  overscan: 2,
  layoutType: REG_NAME_STD,
  rendererType: REG_NAME_STD,
  layoutFixtures: {
    top: [REG_NAME_COLUMN_FACETS],
    left: [REG_NAME_ROW_FACETS]
  },
  columnFacetsFixtureType: REG_NAME_COLUMN_FACETS,
  rowFacetsFixtureType: REG_NAME_ROW_FACETS
};
