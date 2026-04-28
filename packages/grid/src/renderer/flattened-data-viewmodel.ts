import { FlatSliceResult, GridDataViewModelOptions, FacetData, FlatRowMeta } from "./types";
import { GridDataViewModel } from "./grid-data-viewmodel";
import type { DataSchema } from "../datamodel/types";

const DEPTH_SHIFT = 4;
const DEPTH_MASK  = 0xF0;
const LEAF_MASK   = 0x08;
const EXPAND_MASK = 0x04;

function getDepth(bits: number): number {
  return (bits & DEPTH_MASK) >> DEPTH_SHIFT;
}

export function createRowMeta(depth: number, isLeaf: boolean, isExpanded: boolean): number {
  return ((depth << DEPTH_SHIFT) & DEPTH_MASK) | (isLeaf ? LEAF_MASK : 0) | (isExpanded ? EXPAND_MASK : 0);
}

/**
 * The view model output produced by [`StandardTableDataModel`](/docs/datamodel/standard-table-datamodel). Contains the flattened row data ready for the renderer.
 */
export interface FlattenedDataViewModelParams {
  /** Column-major data arrays for the visible rows. Each inner array holds all values for one column - e.g. 3 rows with columns `[name, age]` is `[["Alice", "Bob", "Carol"], [30, 25, 28]]`. This data is always contiguous (no gaps) - only pages that form a contiguous block around the current scroll position are included. Column-major layout supports large datasets efficiently as the renderer can access and iterate a single column array without touching other columns. */
  data: any[][];
  /** Column header labels. The layout uses this to render hierarchical column headers - each level is an array of labels. For standard tables, there is only one level and all columns are leaf-level headers. */
  columnFacets: FacetData;
  /** Row facet values. When `groupBy` is active, some rows are group rows (showing a group label like "USA") and others are data/leaf rows. Group rows have their group value here (e.g. `"USA"`); leaf/data rows have `null`. The renderer uses this to display group row labels in a separate facet column on the left, visually distinguishing group headers from data rows. Only present when `groupBy` is non-empty. */
  rowFacet?: (string | null)[];
  /** Packed row metadata byte array encoding depth, isLeaf, and isExpanded per row. */
  rowMeta?: Uint8Array;
  /** Renderer options forwarded from `setViewModelOptions`. */
  options?: GridDataViewModelOptions;
  /** [`DataSchema`](/docs/api-references/type-references#dataschema) definitions. */
  schema?: DataSchema[];
  /** Total number of rows the data source has, including expanded children. This is larger than the rows in `data` since pages are lazy loaded - only a contiguous subset is present in `data`. The renderer uses this for scrollbar sizing and virtual scroll calculations. */
  totalRows?: number;
  /** Number of rows in the data source that precede the returned `data` block. Since pages are lazy loaded, the page cache can have holes - only a contiguous block around the current scroll position is included in `data`. `offsetTop` tells the renderer how many rows come before this block, so it can position the rendered rows correctly within the full virtual scroll area. */
  offsetTop?: number;
}

// Invariants:
//   this.data.length === this.vTrackDefs.length (both equal numCols, built from ir.project)
//     If this viewmodel is being generated from datamodel, projection (ir.project) determines
//     which all fields are present in viewmodel.
//   this.schema.length === this.data.length - Should be true
//     Note for upstream (datamodel layer): schema is fully generated from datamodel, if projection
//     is present, schema needs to be updated to reflect the projection so that extra fields from
//     the original datamodel are not present in the viewmodel.
//
// ColumnFacets: the last level holds the original column names/labels. Any nesting or
//     grouping is done by building additional layers on top.
export class FlattenedDataViewModel extends GridDataViewModel {
  #rowFacet?: (string | null)[];
  #rowMeta?: Uint8Array;

  constructor(params: FlattenedDataViewModelParams) {
    super(params.data, params.columnFacets);
    this.#rowFacet = params.rowFacet;
    this.#rowMeta = params.rowMeta;
    this.schema = params.schema;
    this.init(params.options);
    this.updatePagination(params.totalRows, params.offsetTop);
  }

  get numRowFacetLevels(): number {
    return this.#rowFacet ? 1 : 0;
  }

  get rowFacets(): FacetData {
    return this.#rowFacet ? [this.#rowFacet] : [];
  }

  expand(rowIndex: number): void {
    this.#rowMeta![rowIndex] = this.#rowMeta![rowIndex] | EXPAND_MASK;
  }

  collapse(rowIndex: number): void {
    this.#rowMeta![rowIndex] = this.#rowMeta![rowIndex] & ~EXPAND_MASK;
  }

  toggleExpand(rowIndex: number): void {
    this.#rowMeta![rowIndex] = this.#rowMeta![rowIndex] ^ EXPAND_MASK;
  }

  updateData(params: FlattenedDataViewModelParams): void {
    this.updateBase(params.data, params.columnFacets);
    this.#rowFacet = params.rowFacet;
    this.#rowMeta = params.rowMeta;
    this.updatePagination(params.totalRows, params.offsetTop);
  }

  getSelectPath(rowIndex: number): string[] {
    const meta = this.#rowMeta!;
    const facet = this.#rowFacet!;
    const targetDepth = getDepth(meta[rowIndex]);
    const path: string[] = new Array(targetDepth + 1);
    path[targetDepth] = facet[rowIndex] as string;
    let remaining = targetDepth;
    for (let i = rowIndex - 1; i >= 0 && remaining > 0; i--) {
      const d = getDepth(meta[i]);
      if (d < remaining) {
        path[d] = facet[i] as string;
        remaining = d;
      }
    }
    return path;
  }

  private unpackMeta(bits: number): FlatRowMeta {
    return {
      depth: getDepth(bits),
      isLeaf: (bits & LEAF_MASK) !== 0,
      isExpanded: (bits & EXPAND_MASK) !== 0,
    };
  }

  getSlice(x0: number, y0: number, x1: number, y1: number): FlatSliceResult {
    const result = { ...this.sliceBase(x0, y0, x1, y1), rowFacets: [] as (string | null)[], rowMeta: [] as FlatRowMeta[] };
    if (x0 === x1 && y0 === y1) {
      return result;
    }
    if (!result.data) {
      return result;
    }
    if (this.#rowFacet) {
      for (let y = y0; y < y1; y++) {
        result.rowFacets.push(this.#rowFacet[y]);
      }
    }

    if (this.#rowMeta) {
      for (let y = y0; y < y1; y++) {
        result.rowMeta.push(this.unpackMeta(this.#rowMeta[y]));
      }
    }

    return result;
  }
}
