// Import to trigger class-level registration
import "./core/layouts/pivot-layout";
import "./core/regions/corner-region";
import "./core/regions/row-facet-region";
import "./core/regions/col-facet-region";
import "./core/regions/value-region";
import "./core/cells/text-cell";
import "./core/cells/number-cell";

// Export public API
export { Grid } from "./grid";
export { GridDataViewModel } from "./grid-data-viewmodel";
export { ViewState, ColumnSizes } from "./viewstate";
export { GridRenderer, CellPool } from "./view";

// Export types
export type {
  GridConfig,
  SliceResult,
  Viewport,
  CellPlacement,
  RenderContext,
  GridLayout,
  RegionLayout,
  CellLayout,
  MergeState,
  FacetPositions,
} from "./types";
export { defaultConfig } from "./types";

// Export abstracts for extension
export { LayoutRenderer } from "./core/layout-renderer";
export { RegionRenderer } from "./core/region-renderer";
export { CellType } from "./core/cell-type";

// Backwards compatibility alias
export { GridDataViewModel as GridDataModel } from "./grid-data-viewmodel";

// Default export for existing usage pattern
export { Grid as default } from "./grid";
