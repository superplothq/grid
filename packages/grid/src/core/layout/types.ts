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
