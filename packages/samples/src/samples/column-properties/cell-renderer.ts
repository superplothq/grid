import Grid, { FlattenedDataViewModel } from "grid/dist/renderer";
import type { CellRenderer, ValueFormatter } from "grid/dist/renderer";
import { createGridMount } from "../../runtime/mount";
import { syncGridTheme } from "../../runtime/theme";
import type { SampleContext, SampleRow, SampleValue } from "../../types";

const COLUMNS = [
  { field: "agency_name", label: "Agency", numeric: false },
  { field: "title_description", label: "Title", numeric: false },
  { field: "base_salary", label: "Base Salary", numeric: true },
  { field: "regular_gross_paid", label: "Regular Gross Paid", numeric: true },
  { field: "total_ot_paid", label: "Total OT Paid", numeric: true },
];

// The one column that draws its own visual instead of plain text.
const BAR_FIELD = "base_salary";

// Static fractional track widths: the first two columns take twice the share of
// the remaining three, so the table fills the grid width with no horizontal scroll.
const COL_FR = [2, 2, 1, 1, 1];
const GRID_HEIGHT = 420;

// Match the theme's cell padding so custom-rendered cells (which the grid strips
// padding from) line up with the built-in text cells.
const CELL_PADDING = "calc(var(--cell-padding-y) * 1px) calc(var(--cell-padding-x) * 1px)";

// Locale-aware currency: turns a raw number into e.g. `$107,789`. Shared by every
// numeric column as its valueFormatter.
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const currency: ValueFormatter<SampleValue> = (value) => (typeof value === "number" ? money.format(value) : "");

export function mount(el: HTMLElement, ctx: SampleContext): () => void {
  const gridMount = createGridMount(el, GRID_HEIGHT);
  const grid = new Grid({}, gridMount, "flat");
  const disposeTheme = syncGridTheme(grid);
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
        // Every numeric column formats its value as currency; Base Salary draws a
        // proportional bar, the other numbers render as right-aligned text. The
        // text columns fall back to the built-in left-aligned rendering.
        vTrackDefs: COLUMNS.map((column, i) => ({
          colSize: { strategy: "static", width: COL_FR[i], unit: "fr" },
          ...(column.numeric
            ? { valueFormatter: currency, renderer: column.field === BAR_FIELD ? bar : numberCell }
            : {}),
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

// A cell renderer draws a single cell. It hands back DOM (or a string); unlike a
// header renderer it has no left/right slots, so this one lays out its own bar
// and amount inside the cell. The bar width comes from the raw value, while the
// label shows the value already run through the currency valueFormatter.
// Set container styles property-by-property, never via `cssText` - the grid puts
// the cell's grid-area inline on this same element and `cssText` would wipe it
// (see QUIRKS.md).
function salaryBar(max: number): CellRenderer<SampleValue> {
  return (value, dataCtx, ctx) => {
    const style = ctx.container.style;
    style.display = "flex";
    style.alignItems = "center";
    style.gap = "8px";
    style.overflow = "hidden";
    style.padding = CELL_PADDING;
    const amount = typeof dataCtx.rawValue === "number" ? dataCtx.rawValue : 0;
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
    label.textContent = amount ? String(value) : "";

    return [track, label];
  };
}

// Right-aligns a number cell. Custom-rendered cells lose the grid's default
// padding and alignment, so this restores both around the formatted value. Styles
// are set property-by-property, never via `cssText` - that would wipe the cell's
// grid-area (see QUIRKS.md).
const numberCell: CellRenderer<SampleValue> = (value, _dataCtx, ctx) => {
  const style = ctx.container.style;
  style.display = "flex";
  style.justifyContent = "flex-end";
  style.alignItems = "center";
  style.overflow = "hidden";
  style.padding = CELL_PADDING;
  style.fontVariantNumeric = "tabular-nums";
  return value == null ? "" : String(value);
};
