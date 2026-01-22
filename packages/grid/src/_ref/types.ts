export interface MergeState {
  value: string | null;
  start: number;
  span: number;
}

export interface GridConfig {
  defaultCellHeight: number;
  defaultCellWidth: number;
  overscan: number;
}

export const defaultConfig: GridConfig = {
  defaultCellHeight: 19,
  defaultCellWidth: 60,
  overscan: 2
};

export interface SliceResult {
  totalRowsCount: number;
  totalColsCount: number;
  columnFacets?: string[][];
  rowFacets?: string[][];
  data?: any[][];
}

export interface Viewport {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  offsetX: number;
  offsetY: number;
  totalHeight: number;
  totalWidth: number;
  rowHeight: number;
  rowHeaderWidth: number;
  headerHeight: number;
}

export interface CellPlacement {
  key: string;
  sizeKey: number;
  content: string;
  cls: string;
  gridRow: number;
  gridCol: number;
  colspan?: number;
  rowspan?: number;
  top?: number;
  left?: number;
  transform?: string;
}

export interface RenderContext {
  usedKeys: Set<string>;
  placeCellInDom: (placement: CellPlacement) => HTMLElement;
}

export interface GridLayout {
  regions: RegionLayout[];
  totalWidth: number;
  totalHeight: number;
}

export interface RegionLayout {
  type: "corner" | "rowFacet" | "colFacet" | "values";
  gridArea: {
    rowStart: number;
    rowEnd: number;
    colStart: number;
    colEnd: number;
  };
  cells: CellLayout[];
}

export interface CellLayout {
  key: string;
  content: string;
  gridRow: number;
  gridCol: number;
  colspan?: number;
  rowspan?: number;
}

export interface FacetPositions {
  rowFacetsLeftPositions: number[];
  colFacetsTopPositions: number[];
}
