import { LayoutFixtureClasses } from "./types";
import { blankGridLoadingRenderer, LoadingRenderer } from "./loading-renderers";
import { defaultHoverStyleRenderer, HoverEffect, HoverStyleRenderer } from "./cell-events";

/**
 * Configuration for the grid renderer. Pass a partial `GridConfig` to the `Grid` constructor; missing fields use [defaultConfig](/docs/renderer#gridconfig).
 */
export interface GridConfig {
  /** Height in pixels used for data rows when no `VTrackDef.cellHeight` override is set. Default: `19`. */
  defaultCellHeight: number;
  /** Width in pixels used as the initial column width before auto-sizing measures actual content. Default: `50`. */
  defaultCellWidth: number;
  /** Number of extra rows and columns rendered beyond the visible viewport in each direction. Higher values reduce blank flashes during fast scrolling but increase DOM node count. Default: `2`. */
  overscan: number;
  /** When `true`, column facet cells render a drag handle on the right edge for interactive column resizing. Double-click the handle to auto-fit to content width. Default: `true`. */
  enableResizeUI: boolean;
  /** Fixture classes to instantiate on each edge of the grid. The layout creates one instance per class and positions them in array order. See [Fixtures](/docs/renderer/fixtures). */
  fixtures: LayoutFixtureClasses;
  /** Name of the theme to apply. The layout resolves the theme via `getTheme(name)` and sets CSS custom properties on the grid container. Default: `"light"`. */
  theme: string;
  /** Controls how column widths update on scroll. `"max-seen"` keeps the widest measurement seen so far (columns only grow). `"dynamic"` re-measures every frame (columns can shrink when wide content scrolls out). Default: `"max-seen"`. */
  columnAutosizingStrategyOnScroll: "dynamic" | "max-seen";
  /** Debounce interval in milliseconds for the `viewDataEmpty` event. Prevents flooding the data source with fetch requests during fast scrolling. Default: `150`. */
  dataFetchDebounceMs: number;
  /** Draws the surface shown while the viewmodel holds no data. Called once when the grid enters that state, with a container that fills the mount point. Default: [`blankGridLoadingRenderer`](/docs/renderer/loading). */
  loadingRenderer: LoadingRenderer;
  /** Built-in hover effect driven by the grid's own `cellMouseOver` / `cellMouseOut` events. `"row"` tints the hovered row, `"column"` the column, `"cross"` both, `"cell"` the single cell. Hovering a facet cell tints its full span in every mode. `"none"` disables it; call `setHover()` from your own listeners instead. Default: `"cross"`. */
  hoverEffect: HoverEffect;
  /** Generates the CSS applied while a hover target is set. The default tints matching cells by mixing the theme's `highlightBaseColor` into each surface's background. Selectors are matched against the cell data attributes (`data-cell-type`, `data-row`, `data-col`, `data-level`) and must be scoped by `[data-grid-id]`. */
  hoverStyleRenderer: HoverStyleRenderer;
}

export const defaultConfig: GridConfig = {
  defaultCellHeight: 19,
  defaultCellWidth: 50,
  overscan: 2,
  enableResizeUI: true,
  theme: "light",
  columnAutosizingStrategyOnScroll: "max-seen",
  dataFetchDebounceMs: 150,
  loadingRenderer: blankGridLoadingRenderer,
  hoverEffect: "row",
  hoverStyleRenderer: defaultHoverStyleRenderer,
  fixtures: {
    top: [],
    left: [],
    bottom: [],
    right: [],
  },
};
