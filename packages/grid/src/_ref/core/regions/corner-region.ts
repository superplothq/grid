import { Grid } from "../../grid";
import { RegionRenderer, MergeSpan } from "../region-renderer";
import { GridRenderer } from "../../view";
import { ViewState } from "../../viewstate";
import { GridConfig, Viewport, RegionLayout, SliceResult, RenderContext, CellPlacement } from "../../types";

export class CornerRegion extends RegionRenderer {
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
    const numColFacets = region.gridArea.rowEnd - 1;
    const { rowFacetsLeftPositions, colFacetsTopPositions } = viewState.getFacetPositions(
      viewport.rowHeight,
      { rowFacetCount: numRowFacets, colFacetCount: numColFacets } as any
    );

    const cells: HTMLElement[] = [];

    for (let hRow = 0; hRow < numColFacets; hRow++) {
      for (let hCol = 0; hCol < numRowFacets; hCol++) {
        const placement: CellPlacement = {
          key: `corner-${hRow}-${hCol}`,
          sizeKey: hCol,
          content: "",
          cls: `corner level-${hRow} ${hCol === numRowFacets - 1 ? "edge-r" : ""} ${hRow === numColFacets - 1 ? "edge-b" : ""}`,
          gridRow: hRow + 1,
          gridCol: hCol + 1,
          top: colFacetsTopPositions[hRow],
          left: rowFacetsLeftPositions[hCol],
        };
        const cell = renderContext.placeCellInDom(placement);
        cells.push(cell);
      }
    }

    return cells;
  }

  computeMerges(data: SliceResult, config: GridConfig): MergeSpan[] {
    return []; // Corner cells don't merge
  }

  getStyles(): string {
    return "";
  }
}

Grid.register("region", "corner", CornerRegion);
