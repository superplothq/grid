import {PRegion, RegionRenderContext, RegionRenderData, RegionRenderResult} from "../region-proto";

/**
 * Merge state for tracking adjacent cells with same value.
 */
export interface MergeState {
  value: string | null;
  start: number;
  span: number;
}

/**
 * Result of merge calculation for a single merged cell.
 */
export interface MergeResult {
  level: number;
  value: string;
  start: number;
  span: number;
}

/**
 * Base class for facet regions that support cell merging.
 * Provides common merge calculation logic for row and column facets.
 */
export abstract class MergableFacetRegionBase extends PRegion {
  /**
   * Calculate merged cells from facet data.
   * Adjacent cells with same value at same level are merged.
   *
   * @param facetCount - Number of facet levels
   * @param itemCount - Number of items (rows or cols) visible
   * @param facets - Facet values [item][level]
   * @returns Array of merge results
   */
  protected computeMerges(
    facetCount: number,
    itemCount: number,
    facets: string[][]
  ): MergeResult[] {
    const results: MergeResult[] = [];

    const mergeState: MergeState[] = [];
    for (let level = 0; level < facetCount; level++) {
      mergeState[level] = { value: null, start: 0, span: 0 };
    }

    for (let i = 0; i < itemCount; i++) {
      const facet = facets[i] || [];
      for (let level = 0; level < facetCount; level++) {
        const value = facet[level] || "";
        const state = mergeState[level];

        if (value === state.value && i > 0) {
          state.span++;
        } else {
          if (state.span > 0) {
            results.push({
              level,
              value: state.value as string,
              start: state.start,
              span: state.span
            });
          }
          state.value = value;
          state.start = i;
          state.span = 1;
        }
      }
    }

    // Emit remaining merges
    for (let level = 0; level < facetCount; level++) {
      const state = mergeState[level];
      if (state.span > 0) {
        results.push({
          level,
          value: state.value as string,
          start: state.start,
          span: state.span
        });
      }
    }

    return results;
  }

  /**
   * Acquire and configure a cell from the pool.
   */
  protected acquireCell(
    ctx: RegionRenderContext,
    key: string,
    content: string,
    className: string
  ): HTMLElement {
    ctx.markKeyUsed(key);
    let cell = ctx.activeCells.get(key);
    if (!cell) {
      cell = ctx.cellPool.acquire();
      ctx.activeCells.set(key, cell);
      ctx.container.appendChild(cell);
    }
    cell.textContent = content;
    cell.className = "cell " + className;
    ctx.registerCell(key, cell);
    return cell;
  }

  abstract render(ctx: RegionRenderContext, data: RegionRenderData): RegionRenderResult;
}
