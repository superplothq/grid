import { FlatSliceResult, GridDataViewModelOptions, FacetData, FlatRowMeta } from "./types";
import { GridDataViewModel } from "./grid-data-viewmodel";

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

export class FlattenedDataViewModel extends GridDataViewModel {
  #rowFacet?: (string | null)[];
  #rowMeta?: Uint8Array;

  constructor(
    data: any[][],
    columnFacets: FacetData,
    rowFacet?: (string | null)[],
    rowMeta?: Uint8Array,
    options?: GridDataViewModelOptions
  ) {
    super(data, columnFacets);
    this.#rowFacet = rowFacet;
    this.#rowMeta = rowMeta;
    this.init(options);
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

  updateData(
    data: any[][],
    columnFacets: FacetData,
    rowFacet?: (string | null)[],
    rowMeta?: Uint8Array,
    options?: GridDataViewModelOptions
  ): void {
    this.updateBase(data, columnFacets);
    this.#rowFacet = rowFacet;
    this.#rowMeta = rowMeta;
    this.init(options);
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
