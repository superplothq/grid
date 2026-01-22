import { SliceResult } from "./types";

export class GridDataViewModel {
  #rowsCount: number;
  #colsCount: number;
  #columnFacets: string[] | string[][];
  #rowFacets?: string[][];
  #data: any[][];

  constructor(data: any[][], columnFacets: string[] | string[][], rowFacets?: string[][]) {
    this.#rowsCount = data.length;
    this.#colsCount = data[0].length;
    this.#columnFacets = columnFacets;
    this.#rowFacets = rowFacets;
    this.#data = data;
  }

  get rowFacetCount() {
    return this.#rowFacets?.length ?? 0;
  }

  get colFacetCount() {
    // flat single column table
    if (!(this.#columnFacets[0] instanceof Array)) return 1;
    // nested columns i.e. facets are present
    return this.#columnFacets.length;
  }

  getSlice(x0: number, y0: number, x1: number, y1: number): SliceResult {
    // Metadata-only request
    if (x0 === x1 && y0 === y1) {
      return {
        totalRowsCount: this.#rowsCount,
        totalColsCount: this.#colsCount,
      };
    }

    // Extract column headers for range [x0, x1)
    const columnFacets: string[][] = [];
    for (let x = x0; x < x1; x++) {
      if (this.#columnFacets[0] instanceof Array) {
        // Nested column facets: #columnFacets[level][col]
        const facets: string[] = [];
        for (let level = 0; level < this.#columnFacets.length; level++) {
          facets.push((this.#columnFacets[level] as string[])[x] || "");
        }
        columnFacets.push(facets);
      } else {
        // Simple flat column facets: single level
        columnFacets.push([this.#columnFacets[x] as string]);
      }
    }

    // Extract row headers for range [y0, y1)
    const rowFacets: string[][] = [];
    if (this.rowFacetCount) {
      for (let y = y0; y < y1; y++) {
        const facets: string[] = [];
        for (let level = 0; level < this.rowFacetCount; level++) {
          facets.push(this.#rowFacets![level][y] || "");
        }
        rowFacets.push(facets);
      }
    }

    // Extract data in column-first format for range
    // Input stored as row-first: #data[row][col]
    // Output is column-first: data[col][row] (matches reference impl)
    const data: any[][] = [];
    for (let x = x0; x < x1; x++) {
      const column: any[] = [];
      for (let y = y0; y < y1; y++) {
        column.push(this.#data[y]?.[x] ?? "");
      }
      data.push(column);
    }

    return {
      totalRowsCount: this.#rowsCount,
      totalColsCount: this.#colsCount,
      columnFacets,
      rowFacets,
      data,
    };
  }
}
