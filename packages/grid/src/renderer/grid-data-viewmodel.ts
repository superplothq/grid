import { BaseSliceResult, GridDataViewModelOptions, ResolvedVTrackDef, ColAutoSizeConfig, IColAutoSizeStrategyStatic, FacetDef, FacetData } from "./types";
import { textRenderer, defaultFacetRenderer, defaultFacetHeaderRenderer } from "./cell-renderers";

const defaultColAutoSize: ColAutoSizeConfig = { strategy: "max-cell" };
const defaultStaticColSize: IColAutoSizeStrategyStatic = { strategy: "static", width: 1, unit: "fr" };

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

// Bridge between datamodel and renderer. Holds column-major data arrays and facet metadata.
//
// numRows / numCols — dimensions of the loaded data[][] arrays.
//
// totalRows — total number of rows in the dataset, not just the ones loaded in memory.
//   With pagination, data is fetched in pages (e.g. 100 rows at a time). numRows reflects
//   how many rows are currently loaded, while totalRows reflects the full dataset size
//   reported by the server/datamodel. The renderer uses totalRows to compute scroll height
//   (totalRows × rowHeight) so the scrollbar represents the entire dataset.
//   For pivot tables where all data is fetched at once, totalRows = numRows.
//
// offsetTop — number of rows before the currently loaded page. With pagination, the loaded
//   page may not start at row 0 (e.g. the user scrolled to page 3). The renderer uses
//   offsetTop × rowHeight as top padding so the loaded rows are positioned correctly
//   within the full scroll space.
//   For pivot tables, offsetTop = 0.
export abstract class GridDataViewModel {
  #numRows: number;
  #numCols: number;
  #colFacets: FacetData;
  protected data: any[][];
  #resolvedVTrackDefs!: ResolvedVTrackDef[];
  #facetDefs!: { row: FacetDef[]; col: FacetDef[]; axis: "row" | "col" };
  #staticStrategy!: boolean;
  #totalRows: number | undefined;
  #offsetTop: number | undefined;
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
    const resolved = this.normalizeOptions(options);
    this.#resolvedVTrackDefs = resolved.vTrackDefs;
    this.#facetDefs = {
      row: resolved.rowFacetDefs,
      col: resolved.colFacetDefs,
      axis: options?.facetDefs?.axis ?? "col",
    };
    this.#staticStrategy = this.#resolvedVTrackDefs.some(d => d.colSize.strategy === "static") ||
      this.#facetDefs.row.some(d => d.colSize?.strategy === "static");
    if (this.#staticStrategy) {
      for (const d of [...this.#resolvedVTrackDefs, ...this.#facetDefs.row]) {
        if (d.colSize?.strategy !== "static") d.colSize = defaultStaticColSize;
      }
    }
    this.#totalRows = options?.totalRows;
    this.#offsetTop = options?.offsetTop;
  }

  private normalizeOptions(options: GridDataViewModelOptions | undefined): {
    vTrackDefs: ResolvedVTrackDef[];
    colFacetDefs: FacetDef[];
    rowFacetDefs: FacetDef[];
  } {
    const inputVTrackDefs = options?.vTrackDefs;
    const vTrackDefs: ResolvedVTrackDef[] = [];
    for (let col = 0; col < this.#numCols; col++) {
      const def = inputVTrackDefs?.[col];
      if (def?.renderer) {
        vTrackDefs.push({
          renderer: def.renderer,
          cellHeight: def.cellHeight,
          sampleData: def.sampleData,
          isCustom: true,
          colSize: def.colSize ?? defaultColAutoSize,
        });
      } else {
        vTrackDefs.push({
          renderer: textRenderer,
          isCustom: false,
          colSize: def?.colSize ?? defaultColAutoSize,
        });
      }
    }

    const inputFacetDefs = options?.facetDefs;

    const colFacetDefs = this.normalizeFacetDefs(inputFacetDefs?.col, this.#colFacets.length);
    const rowFacetDefs = this.normalizeFacetDefs(inputFacetDefs?.row, this.numRowFacetLevels);

    return { vTrackDefs, colFacetDefs, rowFacetDefs };
  }

  private normalizeFacetDefs(input: Partial<FacetDef>[] | undefined, count: number): FacetDef[] {
    const defs: FacetDef[] = [];
    for (let i = 0; i < count; i++) {
      const d = input?.[i];
      defs.push({
        text: d?.text ?? "",
        trackRenderer: d?.trackRenderer ?? defaultFacetRenderer,
        headerRenderer: d?.headerRenderer ?? defaultFacetHeaderRenderer,
        ...(d?.facetField !== undefined && { facetField: d.facetField }),
        ...(d?.meta !== undefined && { meta: d.meta }),
        ...(d?.pseudo !== undefined && { pseudo: d.pseudo }),
        ...(d?.colSize !== undefined && { colSize: d.colSize }),
      });
    }
    return defs;
  }

  get vTrackDefs(): ResolvedVTrackDef[] {
    return this.#resolvedVTrackDefs;
  }

  get facetDefs(): { row: FacetDef[]; col: FacetDef[]; axis: "row" | "col" } {
    return this.#facetDefs;
  }

  get hasStaticStrategy(): boolean {
    return this.#staticStrategy;
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

  get totalRows(): number {
    return this.#totalRows ?? this.#numRows;
  }

  get offsetTop(): number {
    return this.#offsetTop ?? 0;
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
