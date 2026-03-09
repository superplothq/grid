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
    const result = { ...this.sliceBase(x0, y0, x1, y1), rowFacets: [] as (string | null)[], rowMeta: [] as FlatRowMeta[], numAncestors: 0 };
    if (x0 === x1 && y0 === y1) {
      return { ...result, maxDepth: 0 };
    }
    if (!result.data) {
      return { ...result, maxDepth: 0 };
    }
    if (this.#rowFacet) {
      for (let y = y0; y < y1; y++) {
        result.rowFacets.push(this.#rowFacet[y]);
      }
    }

    let maxDepth = 0;
    if (this.#rowMeta) {
      for (let y = y0; y < y1; y++) {
        const meta = this.unpackMeta(this.#rowMeta[y]);
        result.rowMeta.push(meta);
        maxDepth = Math.max(maxDepth, meta.depth);
      }

      if (this.#rowFacet && y0 > 0) {
        const targetDepth = getDepth(this.#rowMeta[y0]);
        if (targetDepth > 0) {
          const ancestorIndices: number[] = [];
          let currentDepth = targetDepth;
          for (let i = y0 - 1; i >= 0; i--) {
            const d = getDepth(this.#rowMeta[i]);
            if (d < currentDepth) {
              ancestorIndices.push(i);
              currentDepth = d;
              if (d === 0) break;
            }
          }

          for (let a = 0; a < ancestorIndices.length; a++) {
            const idx = ancestorIndices[a];
            result.rowFacets.unshift(this.#rowFacet[idx]);
            result.rowMeta.unshift({ ...this.unpackMeta(this.#rowMeta[idx]), isAncestor: true });
            for (let col = 0; col < result.data.length; col++) {
              result.data[col].unshift(this.data[x0 + col][idx]);
            }
          }

          result.numAncestors = ancestorIndices.length;
          result.sliceNumRows = result.rowFacets.length;
        }
      }
    }

    return { ...result, maxDepth };
  }
}
