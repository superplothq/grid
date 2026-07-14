import Grid, { FlattenedDataViewModel } from "grid/dist/renderer";
import type { CellRenderer } from "grid/dist/renderer";
import type { SampleContext, SampleRow, SampleValue } from "../../types";

const COLUMNS = [
  { field: "agency_name", label: "Agency" },
  { field: "title_description", label: "Title" },
  { field: "base_salary", label: "Base Salary" },
  { field: "regular_gross_paid", label: "Regular Gross Paid" },
  { field: "total_ot_paid", label: "Total OT Paid" },
];

// The one column that draws its own visual instead of plain text.
const BAR_FIELD = "base_salary";
const GRID_HEIGHT = 420;

export function mount(el: HTMLElement, ctx: SampleContext): () => void {
  el.style.cssText = "display:flex;flex-direction:column;gap:12px;";

  const gridMount = document.createElement("div");
  gridMount.style.cssText =
    `position:relative;height:${GRID_HEIGHT}px;overflow:auto;border-radius:8px;` +
    "border:1px solid color-mix(in srgb, currentColor 15%, transparent);";
  const grid = new Grid({}, gridMount, "flat");
  let disposed = false;
  el.append(gridMount);

  ctx.loadDataset("payroll").then((rows: SampleRow[]) => {
    if (disposed) return;
    const max = Math.max(...rows.map((row) => Number(row[BAR_FIELD]) || 0));
    const bar = salaryBar(max);
    grid.data = new FlattenedDataViewModel({
      data: COLUMNS.map((column) => rows.map((row) => row[column.field] ?? null)),
      columnFacets: [COLUMNS.map((column) => column.label)],
      totalRows: rows.length,
      options: {
        // Only the salary column gets a custom renderer; the rest fall back to
        // the built-in text rendering.
        vTrackDefs: COLUMNS.map((column) => (column.field === BAR_FIELD ? { renderer: bar } : {})),
        facetDefs: { row: [], col: [{ text: "" }], axis: "col" },
      },
    });
    grid.draw();
  });

  return () => {
    disposed = true;
    el.removeChild(gridMount);
  };
}

/* ===================================== utils ===================================== */

// A cell renderer draws a single cell. It hands back DOM (or a string); unlike a
// header renderer it has no left/right slots, so this one lays out its own bar
// and amount inside the cell.
function salaryBar(max: number): CellRenderer<SampleValue> {
  return (value, _dataCtx, ctx) => {
    ctx.container.style.cssText = "display:flex;align-items:center;gap:8px;overflow:hidden;";
    const amount = typeof value === "number" ? value : 0;
    const pct = max > 0 ? Math.round((amount / max) * 100) : 0;

    const track = document.createElement("div");
    track.style.cssText =
      "flex:1;height:8px;border-radius:4px;overflow:hidden;" +
      "background:color-mix(in srgb, currentColor 12%, transparent);";
    const fill = document.createElement("div");
    fill.style.cssText = `height:100%;width:${pct}%;background:#6366f1;`;
    track.appendChild(fill);

    const label = document.createElement("span");
    label.style.cssText = "min-width:72px;text-align:right;font-variant-numeric:tabular-nums;";
    label.textContent = amount ? amount.toLocaleString() : "";

    return [track, label];
  };
}
