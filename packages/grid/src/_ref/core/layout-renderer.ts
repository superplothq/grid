import { GridConfig, Viewport, GridLayout } from "../types";
import { ViewState } from "../viewstate";
import { GridDataViewModel } from "../grid-data-viewmodel";

export abstract class LayoutRenderer {
  /**
   * Compute the overall layout given current view state.
   * Returns region definitions with their bounds.
   */
  abstract computeLayout(
    viewState: ViewState,
    viewport: Viewport,
    data: GridDataViewModel,
    config: GridConfig
  ): GridLayout;

  /**
   * Get CSS grid template definitions.
   */
  abstract getGridTemplate(
    numRowFacets: number,
    numColFacets: number,
    numDataCols: number,
    numDataRows: number,
    rowHeight: number
  ): { columns: string; rows: string };

  /**
   * Return styles for this layout.
   */
  abstract getStyles(): string;
}
