import {SliceResult} from "../types";
import {RegionLayout} from "./layout/types";
import {CellPool} from "./renderer-base";

/**
 * Context passed to regions for rendering.
 * Contains everything a region needs to render its cells.
 */
export interface RegionRenderContext {
  container: HTMLElement;
  cellPool: CellPool;
  activeCells: Map<string, HTMLElement>;
  markKeyUsed: (key: string) => void;
  registerCell: (key: string, cell: HTMLElement) => void;
}

/**
 * Data specific to rendering a region.
 */
export interface RegionRenderData {
  sliceData: SliceResult;
  region: RegionLayout;
  numRowFacets: number;
  numColFacets: number;
  viewportX0: number;
  viewportY0: number;
  rowHeight: number;
  // Sticky position helpers
  rowFacetsLeftPositions?: number[];
  colFacetsTopPositions?: number[];
}

/**
 * Result of region rendering.
 */
export interface RegionRenderResult {
  cells: HTMLElement[];
}

/**
 * Protocol for region renderers.
 * Regions are responsible for rendering a specific area of the grid.
 */
export abstract class PRegion {
  /**
   * Render the region's cells into the container.
   * @param ctx - Render context with container and cell management
   * @param data - Data needed to render the region
   * @returns Rendered cells for post-draw operations
   */
  abstract render(ctx: RegionRenderContext, data: RegionRenderData): RegionRenderResult;
}
