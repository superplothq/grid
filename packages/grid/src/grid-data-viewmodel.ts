import { SliceResult } from "./types";

export class GridDataViewModel {
  #numRows: number;
  #numCols: number;
  #colFacets: string[] | string[][];
  #rowFacets?: string[][];
  #data: any[][];

  // TODO[doc] Mention: data must be padded properly
  constructor(data: any[][], columnFacets: string[] | string[][], rowFacets?: string[][]) {
    this.#numRows = data.length;
    this.#numCols = data[0].length;
    this.#colFacets = columnFacets;
    this.#rowFacets = rowFacets;
    this.#data = data;
  }

  get numRowFacetLevels() {
    return this.#rowFacets?.length ?? 0;
  }

  get numColFacetLevels() {
    if (!(this.#colFacets[0] instanceof Array)) return 1; // Regular table with one level of columns
    return this.#colFacets.length; // multiple level of cols i.e. facets are present
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
