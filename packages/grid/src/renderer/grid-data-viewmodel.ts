import { SliceResult, GridDataViewModelOptions, ColDef, ResolvedColDef, ColAutoSizeConfig, ResolvedFacetRenderers } from "./types";
import { ColDefsForFacet } from "../types";
import { textRenderer, defaultFacetRenderer } from "./core/cell-renderers";

const defaultColAutoSize: ColAutoSizeConfig = { strategy: "max-cell" };

export class MetaState {
  #store: Map<string, Record<string, any>> = new Map();

  set(namespace: string, key: string, value: any): void {
    let ns = this.#store.get(namespace);
    if (!ns) {
      ns = {};
      this.#store.set(namespace, ns);
    }
    ns[key] = value;
  }

  get(namespace: string): Record<string, any> | undefined {
    return this.#store.get(namespace);
  }

  clear(namespace: string, key?: string): void {
    if (key === undefined) {
      this.#store.delete(namespace);
    } else {
      const ns = this.#store.get(namespace);
      if (ns) {
        delete ns[key];
      }
    }
  }
}

export class GridDataViewModel {
  #numRows: number;
  #numCols: number;
  #colFacets: (string | null)[][];
  #rowFacets?: (string | null)[][];
  #data: any[][];
  #resolvedColDefs: ResolvedColDef[];
  #resolvedFacetRenderers: ResolvedFacetRenderers;
  #defsForFacet: { row: ColDefsForFacet[]; col: ColDefsForFacet[] };
  readonly metaState: MetaState = new MetaState();

  constructor(
    data: any[][],
    columnFacets: (string | null)[][],
    rowFacets?: (string | null)[][],
    options?: GridDataViewModelOptions) {
    this.#numCols = data.length;
    this.#numRows = data[0].length;
    this.#colFacets = columnFacets;
    this.#rowFacets = rowFacets;
    this.#data = data;
    this.#resolvedColDefs = this.#normalizeColDefs(options?.colDefs ?? []);
    this.#resolvedFacetRenderers = {
      row: options?.facetRenderer?.row ?? defaultFacetRenderer,
      column: options?.facetRenderer?.column ?? defaultFacetRenderer,
    };
    this.#defsForFacet = {
      row: options?.colDefsForRowFacet ?? [],
      col: options?.colDefsForColFacet ?? [],
    };
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

  get facetRenderers(): ResolvedFacetRenderers {
    return this.#resolvedFacetRenderers;
  }

  get defsForFacet(): { row: ColDefsForFacet[]; col: ColDefsForFacet[] } {
    return this.#defsForFacet;
  }

  setColSize(colIndex: number, colSize: ResolvedColDef["colSize"]): void {
    this.#resolvedColDefs[colIndex].colSize = colSize;
  }

  get numRowFacetLevels() {
    return this.#rowFacets?.length ?? 0;
  }

  get numColFacetLevels() {
    return this.#colFacets.length;
  }

  get numRows() {
    return this.#numRows;
  }

  get numCols() {
    return this.#numCols;
  }

  getColFacetValue(level: number, colIndex: number): string | null | undefined {
    return this.#colFacets[level][colIndex];
  }

  get columnFacets(): (string | null)[][] {
    return this.#colFacets;
  }

  get rowFacets(): (string | null)[][] {
    return this.#rowFacets || [];
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

    const columnFacets: (string | null)[][] = [];
    for (let x = x0; x < x1; x++) {
      const facets: (string | null)[] = [];
      for (let level = 0; level < this.#colFacets.length; level++) {
        facets.push(this.#colFacets[level][x]);
      }
      columnFacets.push(facets);
    }

    const rowFacets: (string | null)[][] = [];
    if (this.numRowFacetLevels) {
      for (let y = y0; y < y1; y++) {
        const facets: (string | null)[] = [];
        for (let level = 0; level < this.numRowFacetLevels; level++) {
          facets.push(this.#rowFacets![level][y]);
        }
        rowFacets.push(facets);
      }
    }

    const data: any[][] = [];
    for (let x = x0; x < x1; x++) {
      const column: any[] = [];
      for (let y = y0; y < y1; y++) {
        column.push(this.#data[x][y]);
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
