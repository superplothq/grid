import { Grid } from "../../grid";
import { RegionRenderer, MergeSpan } from "../region-renderer";
import { GridRenderer } from "../../view";
import { ViewState } from "../../viewstate";
import { GridConfig, Viewport, RegionLayout, SliceResult, RenderContext, CellPlacement } from "../../types";

export class ColFacetRegion extends RegionRenderer {
  render(
    region: RegionLayout,
    view: GridRenderer,
    viewState: ViewState,
    data: SliceResult,
    viewport: Viewport,
    config: GridConfig,
    renderContext: RenderContext
  ): HTMLElement[] {
    const numRowFacets = region.gridArea.colStart - 1;
    const numColFacets = region.gridArea.rowEnd - 1;
    const numDataColsVisible = viewport.x1 - viewport.x0;

    const { colFacetsTopPositions } = viewState.getFacetPositions(
      viewport.rowHeight,
      { rowFacetCount: numRowFacets, colFacetCount: numColFacets } as any
    );

    const cells: HTMLElement[] = [];

    if (!data.columnFacets || data.columnFacets.length === 0) {
      return cells;
    }

    const merges = viewState.computeMerges({
      facetCount: numColFacets,
      itemCount: numDataColsVisible,
      facets: data.columnFacets,
    });

    for (const { level, state } of merges) {
      const placement: CellPlacement = {
        key: `col-h-${level}-${viewport.x0 + state.start}`,
        sizeKey: numRowFacets + viewport.x0 + state.start,
        content: state.value as string,
        cls: `col-header level-${level}`,
        gridRow: level + 1,
        gridCol: numRowFacets + state.start + 1,
        colspan: state.span,
        top: colFacetsTopPositions[level],
      };
      const cell = renderContext.placeCellInDom(placement);
      cells.push(cell);
    }

    return cells;
  }

  computeMerges(data: SliceResult, config: GridConfig): MergeSpan[] {
    return [];
  }

  getStyles(): string {
    return "";
  }
}

Grid.register("region", "col-facet", ColFacetRegion);
