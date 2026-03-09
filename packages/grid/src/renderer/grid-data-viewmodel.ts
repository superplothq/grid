import { BaseSliceResult, GridDataViewModelOptions, ResolvedVTrackDef, ColAutoSizeConfig, FacetDef, FacetData } from "./types";
import { textRenderer, defaultFacetRenderer, defaultFacetHeaderRenderer } from "./cell-renderers";

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

export abstract class GridDataViewModel {
  #numRows: number;
  #numCols: number;
  #colFacets: FacetData;
  protected data: any[][];
  #resolvedVTrackDefs!: ResolvedVTrackDef[];
  #facetDefs!: { row: FacetDef[]; col: FacetDef[]; axis: "row" | "col" };
  readonly metaState: MetaState = new MetaState();

  constructor(data: any[][], columnFacets: FacetData) {
    this.#numCols = data.length;
    this.#numRows = data[0].length;
    this.#colFacets = columnFacets;
    this.data = data;
  }

  protected updateBase(data: any[][], columnFacets: FacetData): void {
    this.#numCols = data.length;
    this.#numRows = data[0].length;
    this.#colFacets = columnFacets;
    this.data = data;
  }

  protected init(options: GridDataViewModelOptions | undefined): void {
    const base = this.normalizeBaseOptions(options, this.#numCols, this.#colFacets.length);
    this.#resolvedVTrackDefs = base.resolvedVTrackDefs;
    this.#facetDefs = {
      row: this.normalizeRowFacetDefs(options),
      col: base.colFacetDefs,
      axis: options?.facetDefs?.axis ?? "col",
    };
  }

  private normalizeRowFacetDefs(options: GridDataViewModelOptions | undefined): FacetDef[] {
    const inputFacetDefs = options?.facetDefs;
    const rowFacetDefs: FacetDef[] = [];
    for (let i = 0; i < this.numRowFacetLevels; i++) {
      const d = inputFacetDefs?.row[i];
      rowFacetDefs.push({
        text: d?.text ?? "",
        trackRenderer: d?.trackRenderer ?? defaultFacetRenderer,
        headerRenderer: d?.headerRenderer ?? defaultFacetHeaderRenderer,
        ...(d?.meta !== undefined && { meta: d.meta }),
        ...(d?.pseudo !== undefined && { pseudo: d.pseudo }),
      });
    }
    return rowFacetDefs;
  }

  private normalizeBaseOptions(
    options: GridDataViewModelOptions | undefined,
    numCols: number,
    numColFacetLevels: number,
  ): { resolvedVTrackDefs: ResolvedVTrackDef[]; colFacetDefs: FacetDef[] } {
    const inputVTrackDefs = options?.vTrackDefs;
    const resolvedVTrackDefs: ResolvedVTrackDef[] = [];
    for (let col = 0; col < numCols; col++) {
      const def = inputVTrackDefs?.[col];
      if (def?.renderer) {
        resolvedVTrackDefs.push({
          renderer: def.renderer,
          cellHeight: def.cellHeight,
          sampleData: def.sampleData,
          isCustom: true,
          colSize: def.colSize ?? defaultColAutoSize,
        });
      } else {
        resolvedVTrackDefs.push({
          renderer: textRenderer,
          isCustom: false,
          colSize: def?.colSize ?? defaultColAutoSize,
        });
      }
    }

    const inputFacetDefs = options?.facetDefs;
    const colFacetDefs: FacetDef[] = [];
    for (let i = 0; i < numColFacetLevels; i++) {
      const d = inputFacetDefs?.col[i];
      colFacetDefs.push({
        text: d?.text ?? "",
        trackRenderer: d?.trackRenderer ?? defaultFacetRenderer,
        headerRenderer: d?.headerRenderer ?? defaultFacetHeaderRenderer,
        ...(d?.meta !== undefined && { meta: d.meta }),
        ...(d?.pseudo !== undefined && { pseudo: d.pseudo }),
      });
    }

    return { resolvedVTrackDefs, colFacetDefs };
  }

  get vTrackDefs(): ResolvedVTrackDef[] {
    return this.#resolvedVTrackDefs;
  }

  get facetDefs(): { row: FacetDef[]; col: FacetDef[]; axis: "row" | "col" } {
    return this.#facetDefs;
  }

  setColSize(colIndex: number, colSize: ResolvedVTrackDef["colSize"]): void {
    this.#resolvedVTrackDefs[colIndex].colSize = colSize;
  }

  abstract get numRowFacetLevels(): number;

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

  get columnFacets(): FacetData {
    return this.#colFacets;
  }

  abstract get rowFacets(): FacetData;

  // TODO this can be optimized since this sits in the hot path of every render cycle
  //      we can operate using just pointers.
  protected sliceBase(x0: number, y0: number, x1: number, y1: number): BaseSliceResult {
    if (x0 === x1 && y0 === y1) {
      return {
        numRows: this.#numRows,
        numCols: this.#numCols,
        sliceNumRows: 0,
        sliceNumCols: 0,
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

    const data: any[][] = [];
    for (let x = x0; x < x1; x++) {
      const column: any[] = [];
      for (let y = y0; y < y1; y++) {
        column.push(this.data[x][y]);
      }
      data.push(column);
    }

    return {
      numRows: this.#numRows,
      numCols: this.#numCols,
      sliceNumRows: y1 - y0,
      sliceNumCols: x1 - x0,
      columnFacets,
      data,
    };
  }

  abstract getSlice(x0: number, y0: number, x1: number, y1: number): BaseSliceResult;
}
