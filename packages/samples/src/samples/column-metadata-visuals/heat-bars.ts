import Grid, { FlattenedDataViewModel } from "@superplot/grid/renderer";
import type { CellRenderer, ValueFormatter } from "@superplot/grid/renderer";
import { createGridMount } from "../../runtime/mount";
import { syncGridTheme } from "../../runtime/theme";
import type { SampleContext, SampleRow, SampleValue } from "../../types";

const COLUMNS = [
  { field: "agency_name", label: "Agency", numeric: false },
  { field: "base_salary", label: "Base Salary", numeric: true },
  { field: "regular_gross_paid", label: "Regular Gross", numeric: true },
  { field: "total_ot_paid", label: "Total OT", numeric: true },
  { field: "total_other_pay", label: "Other Pay", numeric: true },
];

const COL_FR = [1.6, 1.1, 1.1, 1.1, 1.1];
const GRID_HEIGHT = 420;

// The heat bar renderer sets the cell padding itself from the theme variables so
// its track and label line up with the built-in text cells.
const CELL_PADDING = "calc(var(--cell-padding-y) * 1px) calc(var(--cell-padding-x) * 1px)";

const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const numberFmt: ValueFormatter<SampleValue> = (value) => (typeof value === "number" ? number.format(value) : "");

export function mount(el: HTMLElement, ctx: SampleContext): () => void {
  const gridMount = createGridMount(el, GRID_HEIGHT);
  const grid = new Grid({}, gridMount, "flat");
  const disposeTheme = syncGridTheme(grid);
  let disposed = false;
  el.append(gridMount);

  ctx.loadDataset("payroll").then((rows: SampleRow[]) => {
    if (disposed) return;
    grid.data = new FlattenedDataViewModel({
      data: COLUMNS.map((column) => rows.map((row) => row[column.field] ?? null)),
      columnFacets: [COLUMNS.map((column) => column.label)],
      totalRows: rows.length,
      // Per-column context computed once: the min and max of each numeric column.
      // The renderer reads it back with getValueColumnMeta to normalize each cell
      // against its own column, so a bar means "where in this column's range".
      metadata: {
        valueColumns: COLUMNS.flatMap((column, colIndex) => {
          if (!column.numeric) return [];
          const nums = rows.map((row) => row[column.field]).filter((v): v is number => typeof v === "number");
          return [{ colIndex, meta: { min: Math.min(...nums), max: Math.max(...nums) } }];
        }),
      },
      options: {
        vTrackDefs: COLUMNS.map((column, i) => ({
          colSize: { strategy: "static", width: COL_FR[i], unit: "fr" },
          ...(column.numeric ? { valueFormatter: numberFmt, renderer: heatBar } : {}),
        })),
        facetDefs: { row: [], col: [{ text: "" }], axis: "col" },
      },
    });
    grid.draw();
  });

  return () => {
    disposed = true;
    disposeTheme();
    el.removeChild(gridMount);
  };
}

/* ===================================== utils ===================================== */

// Draws each numeric cell as a heat bar. The fraction along the column's range
// comes from the per-column metadata (min/max), not the cell alone: the bar width
// is that fraction and its colour runs cool (low) to warm (high). Container styles
// are set property-by-property, never via `cssText`, which would wipe the cell's
// grid-area (see QUIRKS.md).
const heatBar: CellRenderer<SampleValue> = (value, dataCtx, ctx) => {
  const col = dataCtx.viewModel.metadata?.getValueColumnMeta(dataCtx.colIndex);
  const min = Number(col?.min);
  const max = Number(col?.max);
  const raw = typeof dataCtx.rawValue === "number" ? dataCtx.rawValue : null;
  const frac = raw == null || !(max > min) ? 0 : (raw - min) / (max - min);

  const style = ctx.container.style;
  style.display = "flex";
  style.alignItems = "center";
  style.gap = "8px";
  style.overflow = "hidden";
  style.padding = CELL_PADDING;
  style.background = `color-mix(in srgb, ${heatColor(frac)} 12%, transparent)`;

  const track = document.createElement("div");
  track.style.cssText =
    "flex:1;height:8px;border-radius:4px;overflow:hidden;" +
    "background:color-mix(in srgb, currentColor 12%, transparent);";
  const fill = document.createElement("div");
  fill.style.cssText = `height:100%;width:${Math.round(frac * 100)}%;background:${heatColor(frac)};`;
  track.appendChild(fill);

  const label = document.createElement("span");
  label.style.cssText = "min-width:56px;text-align:right;font-variant-numeric:tabular-nums;font-size:12px;";
  label.textContent = raw == null ? "" : String(value);

  return [track, label];
};

// Cool (blue) at the bottom of a column's range to warm (red) at the top.
function heatColor(frac: number): string {
  const f = Math.max(0, Math.min(1, frac));
  return `hsl(${210 - f * 198}, 75%, 55%)`;
}
