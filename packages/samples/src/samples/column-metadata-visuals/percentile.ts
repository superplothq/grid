import Grid, { FlattenedDataViewModel } from "@superplot/grid/renderer";
import type { CellRenderer, ValueFormatter, ValueCellMetadata } from "@superplot/grid/renderer";
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

const COL_FR = [1.5, 1.15, 1.15, 1.15, 1.15];
const GRID_HEIGHT = 420;

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
      // Per-cell context computed once: each numeric value's percentile rank
      // within its column. Ranking is a cross-row calculation, so it is precomputed
      // into metadata; the renderer just reads getValueCellMeta and draws a meter.
      metadata: { valueCells: percentiles(rows) },
      options: {
        vTrackDefs: COLUMNS.map((column, i) => ({
          colSize: { strategy: "static", width: COL_FR[i], unit: "fr" },
          ...(column.numeric ? { valueFormatter: numberFmt, renderer: meter } : {}),
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

// Rank every numeric cell within its column and store the 0-100 percentile per
// cell. Sorting ascending, the i-th value sits at i/(n-1) of the way up.
function percentiles(rows: SampleRow[]): ValueCellMetadata[] {
  const out: ValueCellMetadata[] = [];
  COLUMNS.forEach((column, colIndex) => {
    if (!column.numeric) return;
    const entries = rows
      .map((row, rowIndex) => ({ rowIndex, value: row[column.field] }))
      .filter((e): e is { rowIndex: number; value: number } => typeof e.value === "number")
      .sort((a, b) => a.value - b.value);
    entries.forEach((entry, i) => {
      const percentile = entries.length <= 1 ? 100 : Math.round((i / (entries.length - 1)) * 100);
      out.push({ colIndex, rowIndex: entry.rowIndex, meta: { percentile } });
    });
  });
  return out;
}

// Draws each numeric cell as the formatted value, a five-segment meter, and a
// `Pxx` tag. The fill count and colour come from the precomputed percentile in
// the cell's metadata. Container styles are set property-by-property, never via
// `cssText`, which would wipe the cell's grid-area (see QUIRKS.md).
const meter: CellRenderer<SampleValue> = (value, dataCtx, ctx) => {
  const cellMeta = dataCtx.viewModel.metadata?.getValueCellMeta(dataCtx.colIndex, dataCtx.rowIndex);
  const percentile = typeof cellMeta?.percentile === "number" ? cellMeta.percentile : null;

  const style = ctx.container.style;
  style.display = "flex";
  style.alignItems = "center";
  style.gap = "8px";
  style.overflow = "hidden";
  style.padding = CELL_PADDING;

  if (percentile == null) return "";

  const label = document.createElement("span");
  label.style.cssText = "margin-right:auto;font-variant-numeric:tabular-nums;font-size:12px;";
  label.textContent = String(value);

  const tag = document.createElement("span");
  tag.textContent = `P${percentile}`;
  tag.style.cssText = `font-size:11px;font-weight:600;min-width:26px;text-align:right;color:${bandColor(percentile)};`;

  return [label, buildMeter(percentile), tag];
};

function buildMeter(percentile: number): HTMLElement {
  const wrap = document.createElement("div");
  wrap.style.cssText = "display:flex;gap:2px;align-items:center;";
  const filled = Math.round((percentile / 100) * 5);
  const color = bandColor(percentile);
  for (let i = 0; i < 5; i++) {
    const seg = document.createElement("div");
    const on = i < filled;
    seg.style.cssText =
      "width:5px;height:12px;border-radius:1px;" +
      `background:${on ? color : "color-mix(in srgb, currentColor 15%, transparent)"};`;
    wrap.appendChild(seg);
  }
  return wrap;
}

// Muted below the 40th percentile, amber through the 80th, green above it.
function bandColor(percentile: number): string {
  if (percentile >= 80) return "#16a34a";
  if (percentile >= 40) return "#d97706";
  return "#64748b";
}
