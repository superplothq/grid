import { CellRenderer } from "./core/cell-renderers";

export type Constructor<T> = new (...args: any[]) => T;

export type Registry = Map<string, Map<string, Object>>;

export type GridWin = Window & {
  __dataflow_grid__: {
    registry: Registry;
  };
};

export interface SliceResult {
  numRows: number;
  numCols: number;
  columnFacets?: string[][];
  rowFacets?: string[][];
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

export interface GridDataViewModelOptions {
  colDefs?: ColDef[];
}

export interface ResolvedColDef extends ColDef {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderer: CellRenderer<any>;
  isCustom: boolean;
  colSize: ColAutoSizeConfig;
}
