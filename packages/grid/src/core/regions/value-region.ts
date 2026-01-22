import {PRegion, RegionRenderContext, RegionRenderData, RegionRenderResult} from "../region-proto";

/**
 * Renders data cells (values).
 * No merging, no sticky positioning.
 */
export class ValueRegion extends PRegion {
  render(ctx: RegionRenderContext, data: RegionRenderData): RegionRenderResult {
    const cells: HTMLElement[] = [];
    const {
      sliceData,
      numRowFacets,
      numColFacets,
      viewportX0,
      viewportY0
    } = data;

    if (!sliceData.data) {
      return { cells };
    }

    const numDataColsVisible = sliceData.data.length;
    const numDataRowsVisible = sliceData.data[0]?.length ?? 0;

    for (let i = 0; i < numDataColsVisible; i++) {
      const colData = sliceData.data[i] ?? [];
      const gridCol = numRowFacets + i + 1;

      for (let j = 0; j < numDataRowsVisible; j++) {
        const key = `data-${viewportX0 + i}-${viewportY0 + j}`;
        const value = colData[j] ?? "";
        const cell = this.acquireCell(ctx, key, String(value));

        cell.style.gridColumn = `${gridCol}`;
        cell.style.gridRow = `${numColFacets + j + 1}`;

        cells.push(cell);
      }
    }

    return { cells };
  }

  private acquireCell(ctx: RegionRenderContext, key: string, content: string): HTMLElement {
    ctx.markKeyUsed(key);
    let cell = ctx.activeCells.get(key);
    if (!cell) {
      cell = ctx.cellPool.acquire();
      ctx.activeCells.set(key, cell);
      ctx.container.appendChild(cell);
    }
    cell.textContent = content;
    cell.className = "cell data";
    ctx.registerCell(key, cell);
    return cell;
  }
}
