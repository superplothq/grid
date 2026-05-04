import { PivotSliceResult, GridDataViewModelOptions, FacetData } from "./types";
import { GridDataViewModel } from "./grid-data-viewmodel";
import type { DataSchema } from "../datamodel/types";

/**
 * Output of [`PivotTableDataModel.getViewModelData`](/docs/datamodel/pivot-table-datamodel#how-it-works). A fully reshaped 2D pivot grid ready for the renderer.
 */
export interface PivotDataViewModelParams {
  /** 2D grid of aggregated values. `data[col][row]` holds the value at column position `col` and row position `row`. `null` means no data exists for that cell (the combination was not observed in the source data). */
  data: any[][];
  /** Column facet levels. Each inner array holds values for one facet level. For `cross("quarter", concat("revenue", "cost"))`, this has two dimension levels (quarter) plus a measure-name level. */
  columnFacets: FacetData;
  /** Row facet levels. Same structure as `columnFacets` but for the row axis. Absent when the row axis has no dimensions. */
  rowFacets?: FacetData;
  /** Facet metadata such as projection state for each facet level. */
  options?: GridDataViewModelOptions;
  /** The original schema passed to the data model. */
  schema?: DataSchema[];
}

// Invariants:
//   this.data.length === this.vTrackDefs.length
//   this.schema.length is different — it holds the raw dimension/measure definitions from the
//     dataset (e.g. 5 fields), while data.length is the pivoted column count wrt dimensional value
//     after reshaping (e.g. 2 dimensions × 3 measure values = 6 columns).
/**
 * ViewModel for pivot grids. Adds multi-level row facets on top of [`GridDataViewModel`](/docs/viewmodel). Consecutive rows with the same facet value at a level are merged vertically by the layout; `null` at a deeper level causes the parent level's cell to span horizontally.
 */
export class PivotDataViewModel extends GridDataViewModel {
  #rowFacets?: FacetData;

  /**
   * @param params - [`PivotDataViewModelParams`](/docs/api-references/type-references#pivotdataviewmodelparams) containing the reshaped 2D pivot data.
   */
  constructor(params: PivotDataViewModelParams) {
    super(params.data, params.columnFacets);
    this.#rowFacets = params.rowFacets;
    this.schema = params.schema;
    this.init(params.options);
  }

  /** Number of row facet levels. For `hierarchy("region", "country")` on the row axis, returns 2. Returns 0 when there are no row dimensions. */
  get numRowFacetLevels() {
    return this.#rowFacets?.length ?? 0;
  }

  /** All row facet levels. `rowFacets[level][rowIndex]` is the facet value. Returns `[]` when there are no row dimensions. */
  get rowFacets(): FacetData {
    return this.#rowFacets || [];
  }

  /**
   * Swaps internal data arrays, row facets, and re-initializes rendering options without constructing a new instance. `metaState` is preserved.
   * @param params - New [`PivotDataViewModelParams`](/docs/api-references/type-references#pivotdataviewmodelparams).
   */
  updateData(params: PivotDataViewModelParams): void {
    this.updateBase(params.data, params.columnFacets);
    this.#rowFacets = params.rowFacets;
    if (params.schema !== undefined) this.schema = params.schema;
    this.init(params.options);
  }

  /**
   * Returns a [`PivotSliceResult`](/docs/api-references/type-references#pivotsliceresult) for the given range. Extends the base slice with row facets transposed to `rowFacets[rowIndex][level]`.
   * @param x0 - Start column index (inclusive).
   * @param y0 - Start row index (inclusive).
   * @param x1 - End column index (exclusive).
   * @param y1 - End row index (exclusive).
   * @returns Slice data with `rowFacets` grouped per row.
   */
  getSlice(x0: number, y0: number, x1: number, y1: number): PivotSliceResult {
    const result = { ...this.sliceBase(x0, y0, x1, y1), rowFacets: [] as (string | null)[][] };
    if (x0 === x1 && y0 === y1) {
      return result;
    }
    if (!this.numRowFacetLevels) {
      result.rowFacets = [];
      return result;
    }
    const rowFacets: (string | null)[][] = [];
    for (let y = y0; y < y1; y++) {
      const facets: (string | null)[] = [];
      for (let level = 0; level < this.#rowFacets!.length; level++) {
        facets.push(this.#rowFacets![level][y]);
      }
      rowFacets.push(facets);
    }
    result.rowFacets = rowFacets;
    return result;
  }
}
