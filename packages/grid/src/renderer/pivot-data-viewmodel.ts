import { PivotSliceResult, GridDataViewModelOptions, FacetData } from "./types";
import { GridDataViewModel } from "./grid-data-viewmodel";

export class PivotDataViewModel extends GridDataViewModel {
  #rowFacets?: FacetData;

  constructor(data: any[][], columnFacets: FacetData, rowFacets?: FacetData, options?: GridDataViewModelOptions) {
    super(data, columnFacets);
    this.#rowFacets = rowFacets;
    this.init(options);
  }

  get numRowFacetLevels() {
    return this.#rowFacets?.length ?? 0;
  }

  get rowFacets(): FacetData {
    return this.#rowFacets || [];
  }

  updateData(
    data: any[][],
    columnFacets: (string | null)[][],
    rowFacets?: (string | null)[][],
    options?: GridDataViewModelOptions
  ): void {
    this.updateBase(data, columnFacets);
    this.#rowFacets = rowFacets;
    this.init(options);
  }

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
