import { Grid } from "../../grid";
import { RegionRenderer, MergeSpan } from "../region-renderer";
import { GridRenderer } from "../../view";
import { ViewState } from "../../viewstate";
import { GridConfig, Viewport, RegionLayout, SliceResult, RenderContext, CellPlacement } from "../../types";

export class ValueRegion extends RegionRenderer {
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
    const numColFacets = region.gridArea.rowStart - 1;
    const numDataColsVisible = viewport.x1 - viewport.x0;
    const numDataRowsVisible = viewport.y1 - viewport.y0;

    const cells: HTMLElement[] = [];

    for (let i = 0; i < numDataColsVisible; i++) {
      const colData = data.data?.[i] ?? [];
      const gridCol = numRowFacets + i + 1;
      const sizeKey = numRowFacets + viewport.x0 + i;

      for (let j = 0; j < numDataRowsVisible; j++) {
        const placement: CellPlacement = {
          key: `data-${viewport.x0 + i}-${viewport.y0 + j}`,
          sizeKey,
          content: colData[j] || "",
          cls: "data",
          gridRow: numColFacets + j + 1,
          gridCol,
        };
        const cell = renderContext.placeCellInDom(placement);
        cells.push(cell);
      }
    }

    return cells;
  }

  computeMerges(data: SliceResult, config: GridConfig): MergeSpan[] {
    return []; // Values don't merge
  }

  getStyles(): string {
    return "";
  }
}

Grid.register("region", "value", ValueRegion);
