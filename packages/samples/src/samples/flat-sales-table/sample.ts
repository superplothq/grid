import { FlattenedDataViewModel } from "grid/dist/renderer";
import { createGrid } from "../../runtime/mount";
import { rowsToGroupedFlatParams } from "../../runtime/shaping";
import type { SampleContext } from "../../types";

export function mount(el: HTMLElement, ctx: SampleContext): () => void {
  const { grid, cleanup } = createGrid(el, "flat");
  let disposed = false;

  ctx.loadDataset("sales").then((rows) => {
    if (disposed) return;
    grid.data = new FlattenedDataViewModel(
      rowsToGroupedFlatParams(rows, {
        groupBy: { field: "region", text: "Region" },
        leaf: { field: "city", text: "City" },
        measures: [
          { field: "revenue", text: "Revenue" },
          { field: "cost", text: "Cost" },
        ],
      })
    );
    grid.draw();
  });

  return () => {
    disposed = true;
    cleanup();
  };
}
