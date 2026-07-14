import { BaseSliceResult, DataViewport, GridDataViewModelOptions, ResolvedVTrackDef, ColAutoSizeConfig, IColAutoSizeStrategyStatic, FacetDef, FacetData, ViewModelMetadata, MetadataValue, ValueFormatter } from "./types";
import { textRenderer, defaultFacetRenderer, defaultFacetHeaderRenderer } from "./cell-renderers";
import { DataSchema } from "../datamodel/types";

const defaultColAutoSize: ColAutoSizeConfig = { strategy: "max-cell" };
const defaultStaticColSize: IColAutoSizeStrategyStatic = { strategy: "static", width: 1, unit: "fr" };
const VIEWPORT_CALLBACK_DEBOUNCE_MS = 50;

export interface ViewModelCallbacks {
  viewportDataChange: (viewport: DataViewport) => void;
}

/**
 * Namespaced key-value store attached to the viewmodel. Persists across data updates and any lifecycle changes in the grid - use it as a general-purpose grid store. The namespace is typically the calling component's name, preventing key collisions when multiple components store state in the same metaState instance.
 */
export class MetaState {
  #store: Map<string, Record<string, any>> = new Map();

  /** Sets a value under `namespace` and `key`. */
  set(namespace: string, key: string, value: any): void {
    let ns = this.#store.get(namespace);
    if (!ns) {
      ns = {};
      this.#store.set(namespace, ns);
    }
    ns[key] = value;
  }

  /** Returns all key-value pairs under `namespace`, or `undefined` if the namespace does not exist. */
  get(namespace: string): Record<string, any> | undefined {
    return this.#store.get(namespace);
  }

  /** Clears a single `key` within `namespace`, or the entire namespace if `key` is omitted. */
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
//
//   TODO pagination offsettop etc supported only for flat table not for pivot,
//   but all these are present in GridDataViewModel
/**
 * Stores column-major data arrays (`data[col][row]`), column facets, and rendering configuration (VTrackDefs, FacetDefs). Subclasses must implement `numRowFacetLevels`, `rowFacets`, and `getSlice()` to provide row-axis data. The renderer calls `getViewportData()` each render cycle to get a slice of the visible data.
 */
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
  #viewport: DataViewport = { x0: 0, y0: 0, x1: 0, y1: 0 };
  #callbacks: { [K in keyof ViewModelCallbacks]: Set<ViewModelCallbacks[K]> } = {
    viewportDataChange: new Set(),
  };
  #lastCallbackViewport: DataViewport | null = null;
  #viewportCallbackTimer: ReturnType<typeof setTimeout> | null = null;
  /** [`DataSchema`](/docs/api-references/type-references#dataschema) definitions for the columns in `data`. */
  schema?: DataSchema[];
  /** Namespaced key-value store for arbitrary state that persists across `updateData` calls. See [`MetaState`](/docs/api-references/type-references#metastate). */
  readonly metaState: MetaState = new MetaState();
  /** Metadata for value cells, facets, and headers. Accessor methods are initialized once and survive merges via spread. */
  metadata: ViewModelMetadata;

  #valueCellIndex: Map<string, MetadataValue> = new Map();
  #valueColumnIndex: Map<number, MetadataValue> = new Map();
  #valueRowIndex: Map<number, MetadataValue> = new Map();
  #columnFacetIndex: Map<string, MetadataValue> = new Map();
  #rowFacetIndex: Map<string, MetadataValue> = new Map();
  #headerIndex: Map<string, MetadataValue> = new Map();

  constructor(data: any[][], columnFacets: FacetData) {
    this.#numCols = data.length;
    this.#numRows = data[0].length;
    this.#colFacets = columnFacets;
    this.data = data;
    this.metadata = {
      getValueCellMeta: (col, row) => this.#valueCellIndex.get(`${col}:${row}`),
      getValueColumnMeta: (col) => this.#valueColumnIndex.get(col),
      getValueRowMeta: (row) => this.#valueRowIndex.get(row),
      getColumnFacetMeta: (level, index) => this.#columnFacetIndex.get(`${level}:${index}`),
      getRowFacetMeta: (level, index) => this.#rowFacetIndex.get(`${level}:${index}`),
      getHeaderMeta: (axis, level) => this.#headerIndex.get(`${axis}:${level}`),
    };
  }

  protected mergeMetadata(incoming: Partial<ViewModelMetadata>): void {
    this.metadata = { ...this.metadata, ...incoming };
    this.#rebuildMetadataIndexes();
  }

  #rebuildMetadataIndexes(): void {
    this.#valueCellIndex.clear();
    for (const entry of this.metadata.valueCells ?? []) {
      this.#valueCellIndex.set(`${entry.colIndex}:${entry.rowIndex}`, entry.meta);
    }
    this.#valueColumnIndex.clear();
    for (const entry of this.metadata.valueColumns ?? []) {
      this.#valueColumnIndex.set(entry.colIndex, entry.meta);
    }
    this.#valueRowIndex.clear();
    for (const entry of this.metadata.valueRows ?? []) {
      this.#valueRowIndex.set(entry.rowIndex, entry.meta);
    }
    this.#columnFacetIndex.clear();
    for (const entry of this.metadata.columnFacets ?? []) {
      this.#columnFacetIndex.set(`${entry.level}:${entry.index}`, entry.meta);
    }
    this.#rowFacetIndex.clear();
    for (const entry of this.metadata.rowFacets ?? []) {
      this.#rowFacetIndex.set(`${entry.level}:${entry.index}`, entry.meta);
    }
    this.#headerIndex.clear();
    for (const entry of this.metadata.headers ?? []) {
      this.#headerIndex.set(`${entry.axis}:${entry.level}`, entry.meta);
    }
  }

  /**
   * Replaces the internal data arrays and column facets. Called by subclass `updateData` methods.
   * @param data - Column-major data arrays. `data[col][row]`.
   * @param columnFacets - Column header values. `columnFacets[level][colIndex]`.
   */
  protected updateBase(data: any[][], columnFacets: FacetData): void {
    this.#lastCallbackViewport = null;
    this.#numCols = data.length;
    this.#numRows = data[0].length;
    this.#colFacets = columnFacets;
    this.data = data;
  }

  /**
   * Updates pagination state. Called by subclass `updateData` methods.
   * @param totalRows - Total rows in the full dataset, or `undefined` to default to `numRows`.
   * @param offsetTop - Number of rows before the loaded contiguous block, or `undefined` to default to `0`.
   */
  protected updatePagination(totalRows: number | undefined, offsetTop: number | undefined): void {
    this.#totalRows = totalRows;
    this.#offsetTop = offsetTop;
  }

  /**
   * Resolves [`GridDataViewModelOptions`](/docs/api-references/type-references#griddataviewmodeloptions) into `vTrackDefs` and `facetDefs`. Propagates static sizing strategy to all columns/facets if any column or facet uses it. Called by subclass constructors and `updateData` methods.
   * @param options - Rendering options, or `undefined` to use defaults (textRenderer, max-cell sizing).
   */
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
  }

  private normalizeOptions(options: GridDataViewModelOptions | undefined): {
    vTrackDefs: ResolvedVTrackDef[];
    colFacetDefs: FacetDef[];
    rowFacetDefs: FacetDef[];
  } {
    const inputVTrackDefs = options?.vTrackDefs;
    const inputColFacetDefs = options?.facetDefs?.col;
    let facetValueFormatter: ValueFormatter | undefined;
    if (inputColFacetDefs) {
      for (let level = inputColFacetDefs.length - 1; level >= 0; level--) {
        if (inputColFacetDefs[level]?.valueFormatter) {
          facetValueFormatter = inputColFacetDefs[level].valueFormatter;
          break;
        }
      }
    }
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
          valueFormatter: def.valueFormatter ?? facetValueFormatter,
        });
      } else {
        vTrackDefs.push({
          renderer: textRenderer,
          isCustom: false,
          colSize: def?.colSize ?? defaultColAutoSize,
          valueFormatter: def?.valueFormatter ?? facetValueFormatter,
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
        ...(d?.groupSchema !== undefined && { groupSchema: d.groupSchema }),
        ...(d?.valueFormatter !== undefined && { valueFormatter: d.valueFormatter }),
      });
    }
    return defs;
  }

  /** Resolved per-column rendering configuration. One entry per column in `data`. */
  get vTrackDefs(): ResolvedVTrackDef[] {
    return this.#resolvedVTrackDefs;
  }

  /** Resolved facet rendering configuration for row and column facet levels. */
  get facetDefs(): { row: FacetDef[]; col: FacetDef[]; axis: "row" | "col" } {
    return this.#facetDefs;
  }

  /** `true` if any column or facet uses `"static"` sizing strategy. When true, all columns/facets use static sizing. */
  get hasStaticStrategy(): boolean {
    return this.#staticStrategy;
  }

  /**
   * Overrides the column sizing strategy for a single column.
   * @param colIndex - The column index to update.
   * @param colSize - The new [`ColAutoSizeConfig`](/docs/api-references/type-references#colautosizeconfig) to apply.
   */
  setColSize(colIndex: number, colSize: ResolvedVTrackDef["colSize"]): void {
    this.#resolvedVTrackDefs[colIndex].colSize = colSize;
  }

  /** Number of row facet levels. Subclasses implement this as this class does not handle row facets. */
  abstract get numRowFacetLevels(): number;

  /** Number of column facet levels (header rows above data). */
  get numColFacetLevels() {
    return this.#colFacets.length;
  }

  /** Number of rows in the loaded `data[][]` arrays. */
  get numRows() {
    return this.#numRows;
  }

  /** Number of columns in the loaded `data[][]` arrays. */
  get numCols() {
    return this.#numCols;
  }

  /** Total rows in the full dataset. Used by the renderer for scrollbar sizing. Defaults to `numRows` when not set. */
  get totalRows(): number {
    return this.#totalRows ?? this.#numRows;
  }

  /** Number of rows before the contiguous data block loaded in the viewmodel. The viewmodel can only hold one contiguous block of rows; `offsetTop` tells the renderer where that block sits within the full dataset. Defaults to `0`. */
  get offsetTop(): number {
    return this.#offsetTop ?? 0;
  }

  /**
   * Returns the column facet value at the given level and column index.
   * @param level - The facet level (0 = topmost header row).
   * @param colIndex - The column index.
   * @returns The facet value, `null` if merged with the previous column, or `undefined` if out of bounds.
   */
  getColFacetValue(level: number, colIndex: number): string | null | undefined {
    return this.#colFacets[level][colIndex];
  }

  /** All column facet levels. `columnFacets[level][colIndex]` is the facet value. */
  get columnFacets(): FacetData {
    return this.#colFacets;
  }

  /** All row facet levels. Subclasses implement this as this class does not handle row facets. */
  abstract get rowFacets(): FacetData;

  // TODO this can be optimized since this sits in the hot path of every render cycle
  //      we can operate using just pointers.
  /**
   * Slices the base data and column facets for the given viewport range. Subclass `getSlice` implementations call this and extend the result with row-specific data.
   * @param x0 - Start column index (inclusive).
   * @param y0 - Start row index (inclusive).
   * @param x1 - End column index (exclusive).
   * @param y1 - End row index (exclusive).
   * @returns A [`BaseSliceResult`](/docs/api-references/type-references#basesliceresult) with `data` in column-major format and `columnFacets` transposed to `[colIndex][level]`.
   */
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

  /**
   * Returns a slice of data for the given range. Subclasses override to add row facets and row metadata.
   * @param x0 - Start column index (inclusive).
   * @param y0 - Start row index (inclusive).
   * @param x1 - End column index (exclusive).
   * @param y1 - End row index (exclusive).
   * @returns A subclass-specific slice result ([`PivotSliceResult`](/docs/api-references/type-references#pivotsliceresult) or [`FlatSliceResult`](/docs/api-references/type-references#flatsliceresult)).
   */
  abstract getSlice(x0: number, y0: number, x1: number, y1: number): BaseSliceResult;

  /**
   * Called by the renderer each render cycle. Returns a [`BaseSliceResult`](/docs/api-references/type-references#basesliceresult) for the visible range and fires a debounced `viewportDataChange` callback when the viewport changes.
   * @param x0 - Start column index (inclusive).
   * @param y0 - Start row index (inclusive).
   * @param x1 - End column index (exclusive).
   * @param y1 - End row index (exclusive).
   * @returns The slice result from `getSlice`.
   */
  getViewportData(x0: number, y0: number, x1: number, y1: number): BaseSliceResult {
    this.#viewport = { x0, y0, x1, y1 };
    const result = this.getSlice(x0, y0, x1, y1);

    const prev = this.#lastCallbackViewport;
    if (prev && prev.x0 === x0 && prev.y0 === y0 && prev.x1 === x1 && prev.y1 === y1) {
      return result;
    }
    this.#lastCallbackViewport = { x0, y0, x1, y1 };

    if (this.#viewportCallbackTimer !== null) clearTimeout(this.#viewportCallbackTimer);
    this.#viewportCallbackTimer = setTimeout(() => {
      this.#viewportCallbackTimer = null;
      const vp = this.#viewport;
      for (const cb of this.#callbacks.viewportDataChange) cb(vp);
    }, VIEWPORT_CALLBACK_DEBOUNCE_MS);

    return result;
  }

  /** The most recent viewport bounds passed to `getViewportData`. */
  get viewport(): DataViewport {
    return this.#viewport;
  }

  /**
   * Registers a callback for viewmodel events (e.g. `"viewportDataChange"`).
   * @param name - The event name.
   * @param callback - The callback function.
   * @returns An unsubscribe function that removes the callback.
   */
  register<K extends keyof ViewModelCallbacks>(name: K, callback: ViewModelCallbacks[K]): () => void {
    this.#callbacks[name].add(callback);
    return () => { this.#callbacks[name].delete(callback); };
  }
}
