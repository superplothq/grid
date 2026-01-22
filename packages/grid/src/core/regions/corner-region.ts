import {PRegion, RegionRenderContext, RegionRenderData, RegionRenderResult} from "../region-proto";

/**
 * Renders the corner region (intersection of row and column facets).
 * These cells are sticky in both directions.
 */
export class CornerRegion extends PRegion {
  render(ctx: RegionRenderContext, data: RegionRenderData): RegionRenderResult {
    const cells: HTMLElement[] = [];
    const { numRowFacets, numColFacets, rowFacetsLeftPositions, colFacetsTopPositions } = data;

    for (let hRow = 0; hRow < numColFacets; hRow++) {
      for (let hCol = 0; hCol < numRowFacets; hCol++) {
        const key = `corner-${hRow}-${hCol}`;
        const cell = this.acquireCell(ctx, key);

        cell.textContent = "";
        cell.className = `cell corner level-${hRow}` +
          (hCol === numRowFacets - 1 ? " edge-r" : "") +
          (hRow === numColFacets - 1 ? " edge-b" : "");

        cell.style.gridRow = `${hRow + 1}`;
        cell.style.gridColumn = `${hCol + 1}`;

        if (colFacetsTopPositions) {
          cell.style.top = `${colFacetsTopPositions[hRow]}px`;
        }
        if (rowFacetsLeftPositions) {
          cell.style.left = `${rowFacetsLeftPositions[hCol]}px`;
        }

        cells.push(cell);
      }
    }

    return { cells };
  }

  private acquireCell(ctx: RegionRenderContext, key: string): HTMLElement {
    ctx.markKeyUsed(key);
    let cell = ctx.activeCells.get(key);
    if (!cell) {
      cell = ctx.cellPool.acquire();
      ctx.activeCells.set(key, cell);
      ctx.container.appendChild(cell);
    }
    ctx.registerCell(key, cell);
    return cell;
  }
}
