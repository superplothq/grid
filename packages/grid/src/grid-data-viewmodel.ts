import { SliceResult } from "./types";
import {
  GridDataViewModelOptions,
  RendererConfig,
  ResolvedRenderer,
  ColumnQualifier,
  textRenderer,
} from "./core/cell-renderers";

export class GridDataViewModel {
  #numRows: number;
  #numCols: number;
  #colFacets: string[] | string[][];
  #rowFacets?: string[][];
  #data: any[][];
  #renderers: ResolvedRenderer[];

  constructor(data: any[][], columnFacets: string[] | string[][], rowFacets?: string[][], options?: GridDataViewModelOptions) {
    this.#numRows = data.length;
    this.#numCols = data[0].length;
    this.#colFacets = columnFacets;
    this.#rowFacets = rowFacets;
    this.#data = data;
    this.#renderers = this.#normalizeRenderers(options?.renderers ?? []);
  }

  #normalizeRenderers(configs: RendererConfig[]): ResolvedRenderer[] {
    const result: ResolvedRenderer[] = [];

    for (let col = 0; col < this.#numCols; col++) {
      const colFacets = this.#getColumnFacets(col);
      let matched: ResolvedRenderer | null = null;

      for (const config of configs) {
        if (this.#matchesQualifier(colFacets, config.columnQualifier)) {
          matched = {
            renderer: config.renderer,
            cellHeight: config.cellHeight,
            sampleData: config.sampleData,
            isCustom: true,
          };
          break;
        }
      }

      result.push(matched ?? {
        renderer: textRenderer,
        isCustom: false,
      });
    }

    return result;
  }

  /*
    * Column facts are in this format
    * [[ "CF0_0", "CF0_0", "CF0_0", "CF0_0", "CF0_0", "CF0_0", "CF0_0", "CF0_0", "CF0_0", "CF0_1", "CF0_1", "CF0_1", "CF0_1", "CF0_1", "CF0_1", "CF0_1", "CF0_1", "CF0_1" ], // l2
    *  [ "CF1_0", "CF1_0", "CF1_0", "CF1_1", "CF1_1", "CF1_1", "CF1_2", "CF1_2", "CF1_2", "CF1_0", "CF1_0", "CF1_0", "CF1_1", "CF1_1", "CF1_1", "CF1_2", "CF1_2", "CF1_2" ], // l1
    *  [ "CF2_0", "CF2_1", "CF2_2", "CF2_0", "CF2_1", "CF2_2", "CF2_0", "CF2_1", "CF2_2", "CF2_0", "CF2_1", "CF2_2", "CF2_0", "CF2_1", "CF2_2", "CF2_0", "CF2_1", "CF2_2" ]] // l0
    */
  #getColumnFacets(colIndex: number): string[] {
    if (!(this.#colFacets[0] instanceof Array)) {
      return [this.#colFacets[colIndex] as string];
    }
    const facets: string[] = [];
    for (let level = 0; level < this.#colFacets.length; level++) {
      facets.push((this.#colFacets[level] as string[])[colIndex] || "");
    }
    return facets;
  }

  #matchesQualifier(colFacets: string[], qualifier: ColumnQualifier): boolean {
    if (qualifier.length !== colFacets.length) return false;

    for (let level = 0; level < qualifier.length; level++) {
      const pattern = qualifier[level];
      const value = colFacets[level];

      if (pattern === "*") continue;
      if (Array.isArray(pattern)) {
        if (!pattern.includes(value)) return false;
      } else {
        if (pattern !== value) return false;
      }
    }
    return true;
  }

  get renderers(): ResolvedRenderer[] {
    return this.#renderers;
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
