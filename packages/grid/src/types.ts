export type ComponentClass = new (...args: any[]) => any;

export type Registry = Map<string, Map<string, ComponentClass>>;

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

export interface ViewState {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  offsetX: number;
  offsetY: number;
  totalHeight: number;
  totalWidth: number;
  rowFacetsWidth: number;
  colFacetsHeight: number;
  // rowHeight: number;
}

