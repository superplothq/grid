import { Grid } from "../../grid";
import { RegionRenderer, MergeSpan } from "../region-renderer";
import { GridRenderer } from "../../view";
import { ViewState } from "../../viewstate";
import { GridConfig, Viewport, RegionLayout, SliceResult, RenderContext, CellPlacement } from "../../types";

export class RowFacetRegion extends RegionRenderer {
  render(
    region: RegionLayout,
    view: GridRenderer,
    viewState: ViewState,
    data: SliceResult,
    viewport: Viewport,
    config: GridConfig,
    renderContext: RenderContext
  ): HTMLElement[] {
    const numRowFacets = region.gridArea.colEnd - 1;
    const numColFacets = region.gridArea.rowStart - 1;
    const numDataRowsVisible = viewport.y1 - viewport.y0;

    const { rowFacetsLeftPositions } = viewState.getFacetPositions(
      viewport.rowHeight,
      { rowFacetCount: numRowFacets, colFacetCount: numColFacets } as any
    );

    const cells: HTMLElement[] = [];

    if (!data.rowFacets || data.rowFacets.length === 0) {
      return cells;
    }

    const merges = viewState.computeMerges({
      facetCount: numRowFacets,
      itemCount: numDataRowsVisible,
      facets: data.rowFacets,
    });

    for (const { level, state } of merges) {
      const placement: CellPlacement = {
        key: `row-h-${level}-${viewport.y0 + state.start}`,
        sizeKey: level,
        content: state.value as string,
        cls: `row-header level-${level}`,
        gridRow: numColFacets + state.start + 1,
        gridCol: level + 1,
        rowspan: state.span,
        left: rowFacetsLeftPositions[level],
        // stops cell flickering of row facets when vertically scrolled
        transform: "translate(0, calc(var(--offset-y)))",
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

Grid.register("region", "row-facet", RowFacetRegion);
