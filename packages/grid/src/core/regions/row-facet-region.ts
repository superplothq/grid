import {RegionRenderContext, RegionRenderData, RegionRenderResult} from "../region-proto";
import {MergableFacetRegionBase} from "./mergable-facet-region-base";

/**
 * Renders row facet headers with merged cells.
 * Sticky at left, with transform to handle vertical scroll offset.
 */
export class RowFacetRegion extends MergableFacetRegionBase {
  render(ctx: RegionRenderContext, data: RegionRenderData): RegionRenderResult {
    const cells: HTMLElement[] = [];
    const {
      sliceData,
      numRowFacets,
      numColFacets,
      viewportY0,
      rowFacetsLeftPositions
    } = data;

    if (!sliceData.rowFacets || sliceData.rowFacets.length === 0) {
      return { cells };
    }

    const numDataRowsVisible = sliceData.rowFacets.length;
    const merges = this.computeMerges(numRowFacets, numDataRowsVisible, sliceData.rowFacets);

    for (const merge of merges) {
      const key = `row-h-${merge.level}-${viewportY0 + merge.start}`;
      const cell = this.acquireCell(ctx, key, merge.value, `row-header level-${merge.level}`);

      cell.style.gridColumn = `${merge.level + 1}`;
      cell.style.gridRow = merge.span > 1
        ? `${numColFacets + merge.start + 1} / span ${merge.span}`
        : `${numColFacets + merge.start + 1}`;

      if (rowFacetsLeftPositions) {
        cell.style.left = `${rowFacetsLeftPositions[merge.level]}px`;
      }

      // Transform to handle vertical scroll offset - stops cell flickering
      cell.style.transform = "translate(0, calc(var(--offset-y)))";

      cells.push(cell);
    }

    return { cells };
  }
}
