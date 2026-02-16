import { SliceResult, GridDataViewModelOptions, ColDef, ResolvedColDef, ColAutoSizeConfig } from "./types";
import { textRenderer } from "./core/cell-renderers";

const defaultColAutoSize: ColAutoSizeConfig = { strategy: "max-cell" };

export class GridDataViewModel {
  #numRows: number;
  #numCols: number;
  #colFacets: string[] | string[][];
  #rowFacets?: string[][];
  #data: any[][];
  #resolvedColDefs: ResolvedColDef[];

  constructor(data: any[][], columnFacets: string[] | string[][], rowFacets?: string[][], options?: GridDataViewModelOptions) {
    this.#numRows = data.length;
    this.#numCols = data[0].length;
    this.#colFacets = columnFacets;
    this.#rowFacets = rowFacets;
    this.#data = data;
    this.#resolvedColDefs = this.#normalizeColDefs(options?.colDefs ?? []);
  }

  #normalizeColDefs(colDefs: ColDef[]): ResolvedColDef[] {
    const result: ResolvedColDef[] = [];

    for (let col = 0; col < this.#numCols; col++) {
      const def = colDefs[col];
      if (def?.renderer) {
        result.push({
          renderer: def.renderer,
          cellHeight: def.cellHeight,
          sampleData: def.sampleData,
          isCustom: true,
          colSize: def.colSize ?? defaultColAutoSize,
        });
      } else {
        result.push({
          renderer: textRenderer,
          isCustom: false,
          colSize: def?.colSize ?? defaultColAutoSize,
        });
      }
    }

    return result;
  }

  get colDefs(): ResolvedColDef[] {
    return this.#resolvedColDefs;
  }

  setColSize(colIndex: number, colSize: ResolvedColDef["colSize"]): void {
    this.#resolvedColDefs[colIndex].colSize = colSize;
  }

  get numRowFacetLevels() {
    return this.#rowFacets?.length ?? 0;
  }

  get numColFacetLevels() {
    if (!(this.#colFacets[0] instanceof Array)) return 1; // Regular table with one level of columns
    return this.#colFacets.length; // multiple level of cols i.e. facets are present
  }

  get numRows() {
    return this.#numRows;
  }

  get numCols() {
    return this.#numCols;
  }


  getColFacetValue(level: number, colIndex: number): string | undefined {
    if (!(this.#colFacets[0] instanceof Array)) {
      if (level !== 0) return undefined;
      return this.#colFacets[colIndex] as string;
    }
    if (level >= this.#colFacets.length) return undefined;
    return (this.#colFacets[level] as string[])[colIndex];
  }

  getRowFacetValue(level: number, rowIndex: number): string | undefined {
    if (!this.#rowFacets || level >= this.#rowFacets.length) return undefined;
    return this.#rowFacets[level][rowIndex];
  }

  // TODO don't take column facet as a 1D flat array it opens up requirement for normalizatoin every where.
  //      Always take it as a 2D array
  get columnFacets(): string[][] {
    if (!(this.#colFacets[0] instanceof Array)) {
      return [this.#colFacets as string[]];
    }
    return this.#colFacets as string[][];
  }

  // TODO this can be optimized since this sits in the hot path of every render cycle
  //      we can operate using just pointers.
  getSlice(x0: number, y0: number, x1: number, y1: number): SliceResult {
    if (x0 === x1 && y0 === y1) {
      return {
        numRows: this.#numRows,
        numCols: this.#numCols,
      };
    }

    const columnFacets: string[][] = [];
    for (let x = x0; x < x1; x++) {
      if (this.#colFacets[0] instanceof Array) {
        const facets: string[] = [];
        for (let level = 0; level < this.#colFacets.length; level++) {
          facets.push((this.#colFacets[level] as string[])[x] || "");
        }
        columnFacets.push(facets);
      } else {
        columnFacets.push([this.#colFacets[x] as string]);
      }
    }

    const rowFacets: string[][] = [];
    if (this.numRowFacetLevels) {
      for (let y = y0; y < y1; y++) {
        const facets: string[] = [];
        for (let level = 0; level < this.numRowFacetLevels; level++) {
          facets.push(this.#rowFacets![level][y] || "");
        }
        rowFacets.push(facets);
      }
    }

    const data: any[][] = [];
    for (let x = x0; x < x1; x++) {
      const column: any[] = [];
      for (let y = y0; y < y1; y++) {
        column.push(this.#data[y]?.[x] ?? "");
      }
      data.push(column);
    }

    return {
      numRows: this.#numRows,
      numCols: this.#numCols,
      columnFacets,
      rowFacets,
      data,
    };
  }
}
