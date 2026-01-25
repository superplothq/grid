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

// TODO specific to registered component. Make it part of the component.
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
  rowFacetsLeftPositions: number[];
  colFacetsTopPositions: number[];
}

export interface  LayoutFixtures {
  top?: string[];
  left?: string[];
  bottom?: string[];
  right?: string[];
}

