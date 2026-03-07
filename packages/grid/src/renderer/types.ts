import { CellRenderer } from "./cell-renderers";
import { ProjectionState } from "../datamodel/types";
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

export type FacetData = (string | null)[][];

export interface FlatRowMeta {
  depth: number;
  isLeaf: boolean;
  isExpanded: boolean;
}

export interface BaseSliceResult {
  numRows: number;
  numCols: number;
  columnFacets?: (string | null)[][];
  data?: any[][];
}

export interface PivotSliceResult extends BaseSliceResult {
  rowFacets: (string | null)[][];
}

export interface FlatSliceResult extends BaseSliceResult {
  rowFacets: (string | null)[];
  rowMeta: FlatRowMeta[];
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
export interface VTrackDef<T = any> {
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

export interface FacetHeaderContext {
  viewModel: GridDataViewModel;
  axis: "row" | "col";
  level: number;
}

export type FacetHeaderRenderer = (
  text: string,
  ctx: FacetHeaderContext
) => FacetCellContent | string | HTMLElement | HTMLElement[];

export interface FacetMeta {
  projectionState: ProjectionState;
  projectedValues: Set<string>;
}

export interface FacetDef {
  text: string;
  headerRenderer: FacetHeaderRenderer;
  trackRenderer: FacetCellRenderer;
  meta?: FacetMeta;
  pseudo?: boolean;
}

export interface GridDataViewModelOptions {
  vTrackDefs?: VTrackDef[];
  facetDefs?: {
    row: Partial<FacetDef>[];
    col: Partial<FacetDef>[];
    axis: "row" | "col";
  };
}

export interface ResolvedVTrackDef extends VTrackDef {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderer: CellRenderer<any>;
  isCustom: boolean;
  colSize: ColAutoSizeConfig;
}
