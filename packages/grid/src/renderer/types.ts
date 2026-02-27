import { CellRenderer } from "./core/cell-renderers";
import { ColDefsForFacet } from "../types";
import { GridDataViewModel } from "./grid-data-viewmodel";

export type Constructor<T> = new (...args: any[]) => T;

export type Registry = Map<string, Map<string, Object>>;

export type Theme = Record<string, string | number>;

export type GridWin = Window & {
  __dataflow_grid__: {
    registry: Registry;
    themes: Map<string, Theme>;
  };
};

export interface SliceResult {
  numRows: number;
  numCols: number;
  columnFacets?: (string | null)[][];
  rowFacets?: (string | null)[][];
  data?: any[][];
}

export interface IColAutoSize {
  strategy: "max-cell" | "fixed-width";
  excludeColumnFacets?: boolean;
}

export interface IColAutoSizeStrategyMaxCell extends IColAutoSize {
  strategy: "max-cell";
}

export interface IColAutoSizeStrategyFixedWidth extends IColAutoSize {
  strategy: "fixed-width";
  widthInPx?: number;
  maxWidthInPx?: number;
  minWidthInPx?: number;
}

export type ColAutoSizeConfig =
  | IColAutoSizeStrategyMaxCell
  | IColAutoSizeStrategyFixedWidth;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ColDef<T = any> {
  renderer?: CellRenderer<T>;
  cellHeight?: number;
  sampleData?: T;
  colSize?: ColAutoSizeConfig;
}
type El = HTMLElement | HTMLElement[] | string;

export interface FacetRendererContext {
  render: (viewModel: GridDataViewModel) => void;
}

export interface FacetDataContext {
  viewModel: GridDataViewModel;
  path: (string | null)[];
  level: number;
  index: number;
}

export interface FacetCellContent {
  left?: El;
  content: El;
  right?: El;
}

export type FacetCellRenderer<T = string> = (
  data: T,
  dataCtx: FacetDataContext,
  ctx: FacetRendererContext
) => FacetCellContent | El;

export interface ResolvedFacetRenderers {
  row: FacetCellRenderer;
  column: FacetCellRenderer;
}

export interface GridDataViewModelOptions {
  colDefs?: ColDef[];
  // TODO[later] to be merged with colDefs
  colDefsForRowFacet?: ColDefsForFacet[];
  colDefsForColFacet?: ColDefsForFacet[];
  facetRenderer?: {
    row?: FacetCellRenderer;
    column?: FacetCellRenderer;
  };
}

export interface ResolvedColDef extends ColDef {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderer: CellRenderer<any>;
  isCustom: boolean;
  colSize: ColAutoSizeConfig;
}
