import { Grid } from "../../grid";
import { LayoutRenderer } from "../layout-renderer";
import { ViewState } from "../../viewstate";
import { GridConfig, Viewport, GridLayout, RegionLayout } from "../../types";
import { GridDataViewModel } from "../../grid-data-viewmodel";

export class PivotLayout extends LayoutRenderer {
  computeLayout(
    viewState: ViewState,
    viewport: Viewport,
    data: GridDataViewModel,
    config: GridConfig
  ): GridLayout {
    const numRowFacets = data.rowFacetCount;
    const numColFacets = data.colFacetCount;
    const numDataColsVisible = viewport.x1 - viewport.x0;
    const numDataRowsVisible = viewport.y1 - viewport.y0;

    const regions: RegionLayout[] = [];

    // Corner region (if facets exist)
    if (numRowFacets > 0 && numColFacets > 0) {
      regions.push({
        type: "corner",
        gridArea: {
          rowStart: 1,
          rowEnd: numColFacets + 1,
          colStart: 1,
          colEnd: numRowFacets + 1,
        },
        cells: [],
      });
    }

    // Column facet region
    if (numColFacets > 0) {
      regions.push({
        type: "colFacet",
        gridArea: {
          rowStart: 1,
          rowEnd: numColFacets + 1,
          colStart: numRowFacets + 1,
          colEnd: numRowFacets + numDataColsVisible + 1,
        },
        cells: [],
      });
    }

    // Row facet region
    if (numRowFacets > 0) {
      regions.push({
        type: "rowFacet",
        gridArea: {
          rowStart: numColFacets + 1,
          rowEnd: numColFacets + numDataRowsVisible + 1,
          colStart: 1,
          colEnd: numRowFacets + 1,
        },
        cells: [],
      });
    }

    // Value region (always present)
    regions.push({
      type: "values",
      gridArea: {
        rowStart: numColFacets + 1,
        rowEnd: numColFacets + numDataRowsVisible + 1,
        colStart: numRowFacets + 1,
        colEnd: numRowFacets + numDataColsVisible + 1,
      },
      cells: [],
    });

    return {
      regions,
      totalWidth: viewport.totalWidth,
      totalHeight: viewport.totalHeight,
    };
  }

  getGridTemplate(
    numRowFacets: number,
    numColFacets: number,
    numDataCols: number,
    numDataRows: number,
    rowHeight: number
  ): { columns: string; rows: string } {
    return {
      columns: `repeat(${numRowFacets + numDataCols}, max-content)`,
      rows: `repeat(${numColFacets + numDataRows}, ${rowHeight}px)`,
    };
  }

  getStyles(): string {
    return "";
  }
}

// Auto-register at load time
Grid.register("layout", "pivot", PivotLayout);
