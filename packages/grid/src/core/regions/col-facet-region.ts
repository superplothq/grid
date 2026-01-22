import {RegionRenderContext, RegionRenderData, RegionRenderResult} from "../region-proto";
import {MergableFacetRegionBase} from "./mergable-facet-region-base";

/**
 * Renders column facet headers with merged cells.
 * Sticky at top.
 */
export class ColFacetRegion extends MergableFacetRegionBase {
  render(ctx: RegionRenderContext, data: RegionRenderData): RegionRenderResult {
    const cells: HTMLElement[] = [];
    const {
      sliceData,
      numRowFacets,
      numColFacets,
      viewportX0,
      colFacetsTopPositions
    } = data;

    if (!sliceData.columnFacets || sliceData.columnFacets.length === 0) {
      return { cells };
    }

    const numDataColsVisible = sliceData.columnFacets.length;
    const merges = this.computeMerges(numColFacets, numDataColsVisible, sliceData.columnFacets);

    for (const merge of merges) {
      const key = `col-h-${merge.level}-${viewportX0 + merge.start}`;
      const cell = this.acquireCell(ctx, key, merge.value, `col-header level-${merge.level}`);

      cell.style.gridRow = `${merge.level + 1}`;
      cell.style.gridColumn = merge.span > 1
        ? `${numRowFacets + merge.start + 1} / span ${merge.span}`
        : `${numRowFacets + merge.start + 1}`;

      if (colFacetsTopPositions) {
        cell.style.top = `${colFacetsTopPositions[merge.level]}px`;
      }

      cells.push(cell);
    }

    return { cells };
  }
}
