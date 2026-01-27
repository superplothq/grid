import {GridConfig, REG_NAME_COLUMN_FACETS, REG_TYPE_FIXTURE} from "../config";
import {addToRegistry} from "../registry";
import {SliceResult} from "../types";
import CellManager from "./cell-manager";
import {BaseVFixtureViewModel, PVerticalFixture, CellToMeasure} from "./fixture-proto";
import {BaseLayoutViewModel} from "./layout-proto";
import {WithCellPlacement} from "./mixins";

// TODO move to mixin
interface MergeState {
  value: string | null;
  start: number;
  span: number;
}

export interface ColumnFacetsViewModel extends BaseVFixtureViewModel {
  colFacetsTopPositionsOffset: number[];
}

export default class ColumnFacetsFixture extends WithCellPlacement(PVerticalFixture ){
  private static VIEW_MODEL_KEY = "columnFacets";

  #heightPerFacetRow = 0;

  constructor(config: GridConfig, con: HTMLElement, cellManager: CellManager) {
    super(config, con, cellManager);
    this.#heightPerFacetRow = this.#measureRowHeight();
  }

  // TODO move to mixin
  #measureRowHeight(): number {
    const sample = document.createElement("div");
    sample.className = "cell";
    sample.style.visibility = "hidden";
    sample.textContent = "Mgy$123,456";
    this.con.appendChild(sample);
    const rect = sample.getBoundingClientRect();
    const height = rect.height;
    this.con.removeChild(sample);
    return height;
  }

  viewModelKey(): string {
    return ColumnFacetsFixture.VIEW_MODEL_KEY;
  }

  viewModel(): ColumnFacetsViewModel {
    const colFacetsHeight = this.data!.numColFacetLevels * this.#heightPerFacetRow;
    const colFacetsTopPositionsOffset: number[] = [];
    for (let i = 0; i < this.data!.numColFacetLevels; i++) {
      colFacetsTopPositionsOffset.push(i * this.#heightPerFacetRow);
    }

    return {
      height: colFacetsHeight,
      colFacetsTopPositionsOffset
    }
  }

  // TODO move to mixin
  #computeMerges(
    facetCount: number,
    itemCount: number,
    facets: string[][]
  ): Array<{ level: number; value: string; start: number; span: number }> {
    const results: Array<{ level: number; value: string; start: number; span: number }> = [];
    const mergeState: MergeState[] = [];

    for (let level = 0; level < facetCount; level++) {
      mergeState[level] = { value: null, start: 0, span: 0 };
    }

    for (let i = 0; i < itemCount; i++) {
      const facet = facets[i] || [];
      for (let level = 0; level < facetCount; level++) {
        const value = facet[level] || "";
        const state = mergeState[level];

        if (value === state.value && i > 0) {
          state.span++;
        } else {
          if (state.span > 0) {
            results.push({
              level,
              value: state.value as string,
              start: state.start,
              span: state.span
            });
          }
          state.value = value;
          state.start = i;
          state.span = 1;
        }
      }
    }

    for (let level = 0; level < facetCount; level++) {
      const state = mergeState[level];
      if (state.span > 0) {
        results.push({
          level,
          value: state.value as string,
          start: state.start,
          span: state.span
        });
      }
    }

    return results;
  }


  getCellsToRender(viewModel: BaseLayoutViewModel, sliceData: SliceResult): {
    nodesToAppend: HTMLElement[];
    cellsToMeasure: CellToMeasure[];
  } {
    const cellsToMeasure: CellToMeasure[] = [];
    const numDataColsVisible = viewModel.x1 - viewModel.x0;
    let nodesToAppend: HTMLElement[] = [];

    let merges = this.#computeMerges(this.data!.numColFacetLevels, numDataColsVisible, sliceData.columnFacets!);
    for (const merge of merges) {
      const key = `col-h-${merge.level}-${viewModel.x0 + merge.start}`;
      const sizeKey = this.data!.numRowFacetLevels + viewModel.x0 + merge.start;
      const colspan = merge.span;
      // console.log(viewModel.y1 - viewModel.y0);
      const [cell, needAppend] = this.placeCellInDom({
        key,
        gridRow: (viewModel.y1 - viewModel.y0) - (merge.level - 1) + this.config.overscan,
        // gridRow: merge.level + 1,
        gridCol: this.data!.numRowFacetLevels + merge.start + 1,
        content: merge.value,
        cls: `col-header level-${merge.level}`,
        extraStyles: {
          colspan,
          top: (viewModel.fixtures[this.viewModelKey()] as ColumnFacetsViewModel).colFacetsTopPositionsOffset[merge.level],
        },
      });
      needAppend && nodesToAppend.push(cell);
      if (!(colspan && colspan > 1)) {
        cellsToMeasure.push({ cell, sizeKey });
      }
    }
    return {
      nodesToAppend,
      cellsToMeasure
    };
  }
}

addToRegistry(REG_TYPE_FIXTURE, REG_NAME_COLUMN_FACETS, ColumnFacetsFixture);

