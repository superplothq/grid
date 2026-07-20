import Grid, { FlattenedDataViewModel } from "@superplot/grid/renderer";
import { createToolbar, toolbarButton } from "../../runtime/toolbar";
import { syncGridTheme } from "../../runtime/theme";
import type { SampleContext, SampleRow } from "../../types";

const COLUMNS = [
  { field: "agency_name", label: "Agency" },
  { field: "title_description", label: "Title" },
  { field: "base_salary", label: "Base Salary" },
  { field: "regular_gross_paid", label: "Regular Gross Paid" },
  { field: "total_ot_paid", label: "Total OT Paid" },
];

// Static fractional widths: the two text columns take twice the share of the
// three numeric ones, so the table fills the grid before any manual resize.
const COL_FR = [2, 2, 1, 1, 1];
const GRID_HEIGHT = 420;

export function mount(el: HTMLElement, ctx: SampleContext): () => void {
  el.style.cssText = "display:flex;flex-direction:column;gap:12px;";

  const toolbar = createToolbar();
  const hint = document.createElement("span");
  hint.style.cssText = "font-size:12px;opacity:0.75;";
  hint.textContent = "Drag a column's right edge to resize; double-click the edge to auto-fit.";
  const toggle = toolbarButton("Resize handles: on");
  const reset = toolbarButton("Reset widths");
  toolbar.append(hint, toggle, reset);

  const gridSlot = document.createElement("div");
  el.append(toolbar, gridSlot);

  let rows: SampleRow[] = [];
  let disposed = false;

  // `enableResizeUI` is a construction-time flag and manual widths live on the
  // layout, so both flipping the handles and resetting to the configured widths
  // are done by rebuilding the grid onto a fresh mount.
  let resizeEnabled = true;
  let disposeTheme: () => void = () => {};

  const build = (): void => {
    disposeTheme();
    const mountEl = document.createElement("div");
    mountEl.style.cssText =
      `position:relative;height:${GRID_HEIGHT}px;overflow:auto;border-radius:8px;` +
      "border:1px solid color-mix(in srgb, currentColor 15%, transparent);";
    gridSlot.replaceChildren(mountEl);

    // With enableResizeUI on, every column facet cell grows a drag handle on its
    // right edge; the grid wires the drag and the double-click auto-fit itself.
    const grid = new Grid({ enableResizeUI: resizeEnabled }, mountEl, "flat");
    disposeTheme = syncGridTheme(grid);
    grid.data = new FlattenedDataViewModel({
      data: COLUMNS.map((column) => rows.map((row) => row[column.field] ?? null)),
      columnFacets: [COLUMNS.map((column) => column.label)],
      totalRows: rows.length,
      options: {
        vTrackDefs: COLUMNS.map((_, i) => ({ colSize: { strategy: "static", width: COL_FR[i], unit: "fr" } })),
        facetDefs: { row: [], col: [{ text: "" }], axis: "col" },
      },
    });
    grid.draw();
  };

  toggle.addEventListener("click", () => {
    resizeEnabled = !resizeEnabled;
    toggle.textContent = resizeEnabled ? "Resize handles: on" : "Resize handles: off";
    build();
  });
  reset.addEventListener("click", build);

  ctx.loadDataset("payroll").then((loaded: SampleRow[]) => {
    if (disposed) return;
    rows = loaded;
    build();
  });

  return () => {
    disposed = true;
    disposeTheme();
    el.replaceChildren();
  };
}
