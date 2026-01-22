import { GridConfig, Viewport, RegionLayout, SliceResult, RenderContext } from "../types";
import { ViewState } from "../viewstate";
import { GridRenderer } from "../view";

export interface MergeSpan {
  level: number;
  start: number;
  span: number;
  value: string;
}

export abstract class RegionRenderer {
  /**
   * Render cells into the DOM.
   * Handles merging, styling, and positioning within the region.
   */
  abstract render(
    region: RegionLayout,
    view: GridRenderer,
    viewState: ViewState,
    data: SliceResult,
    viewport: Viewport,
    config: GridConfig,
    renderContext: RenderContext
  ): HTMLElement[];

  /**
   * Compute merge spans for this region's cells.
   * Used by facet regions, no-op for value regions.
   */
  abstract computeMerges(data: SliceResult, config: GridConfig): MergeSpan[];

  /**
   * Return styles for this region.
   */
  abstract getStyles(): string;
}
