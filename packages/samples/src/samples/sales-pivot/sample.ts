import { PivotDataViewModel } from "grid/dist/renderer";
import { createGrid } from "../../runtime/mount";
import { rowsToPivotParams } from "../../runtime/shaping";
import type { SampleContext } from "../../types";

export function mount(el: HTMLElement, ctx: SampleContext): () => void {
  const { grid, cleanup } = createGrid(el, "pivot");
  let disposed = false;

  ctx.loadDataset("sales").then((rows) => {
    if (disposed) return;
    grid.data = new PivotDataViewModel(
      rowsToPivotParams(rows, {
        rowDims: [
          { field: "region", text: "Region" },
          { field: "city", text: "City" },
        ],
        colDim: { field: "department", text: "Department" },
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
