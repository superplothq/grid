export type Constructor<T> = new (...args: any[]) => T;

export type Registry = Map<string, Map<string, Object>>;

export type GridWin = Window & {
  __dataflow_grid__: {
      registry: Registry;
  }
};

export interface SliceResult {
  numRows: number;
  numCols: number;
  columnFacets?: string[][];
  rowFacets?: string[][];
  data?: any[][];
}
