import Grid, { FlattenedDataViewModel, Selection } from "grid/dist/renderer";
import { createGridMount } from "../../runtime/mount";
import { createToolbar, toolbarButton, toolbarColorInput, toolbarSelect } from "../../runtime/toolbar";
import { syncGridTheme } from "../../runtime/theme";
import type { SampleContext } from "../../types";

// The columns of the simple flat table. `field` reads from the payroll rows;
// `label` is both the column header and the value the highlight predicate
// matches on, so it is what the dropdown lists.
const COLUMNS = [
  { field: "agency_name", label: "Agency" },
  { field: "title_description", label: "Title" },
  { field: "base_salary", label: "Base Salary" },
  { field: "regular_gross_paid", label: "Regular Gross Paid" },
  { field: "total_ot_paid", label: "Total OT Paid" },
];

// Static fractional track widths: the first two columns take twice the share of
// the remaining three, so the table fills the grid width with no horizontal scroll.
const COL_FR = [2, 2, 1, 1, 1];

// The column highlighted (and the swatch shown) when the sample first renders.
const DEFAULT_COLUMN = "Base Salary";
const DEFAULT_COLOR = "#6366f1";

// Fixed pixel height for the scrollable grid area.
const GRID_HEIGHT = 420;

export function mount(el: HTMLElement, ctx: SampleContext): () => void {
  // The toolbar and grid are separate blocks; the flex gap between them shows
  // through to the page background, so they read as distinct components.
  // ---- The grid: a "flat" layout renders a simple table - no pivot, no row grouping.
  const gridMount = createGridMount(el, GRID_HEIGHT);
  const grid = new Grid({}, gridMount, "flat");
  const disposeTheme = syncGridTheme(grid);
  let disposed = false;

  ctx.loadDataset("payroll").then((rows) => {
    if (disposed) return;
    // Shape the rows into a single-level flat table: one column-major data array
    // per column, and one header-label row.
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
    // Highlight a column out of the box so the effect is visible on first render.
    applyHighlight(DEFAULT_COLUMN, DEFAULT_COLOR);
  });

  // ---- The highlight: select a column by name, then tint its cells.
  // `selectAll` matches the column's header (its "track" header) by header text;
  // `selectAllCell` extends the same selection onto the column's data cells.
  // Holds the active selection so it can be undone before the next one is applied.
  let active: Selection | null = null;

  const applyHighlight = (columnLabel: string, color: string): void => {
    active?.undo();
    active = grid.selectAll((_dim, value) => value === columnLabel);
    active.style((cell) => {
      cell.style.background = headerCellBackground(color);
    });
    active.selectAllCell(() => true).style((cell) => {
      cell.style.background = dataCellBackground(color);
    });
  };

  const clearHighlight = (): void => {
    active?.undo();
    active = null;
  };

  // ---- The controls: a shared, minimalistic toolbar above the grid.
  const toolbar = createToolbar();
  const select = toolbarSelect(COLUMNS.map((column) => column.label), DEFAULT_COLUMN);
  const color = toolbarColorInput(DEFAULT_COLOR);
  const apply = toolbarButton("Apply");
  const reset = toolbarButton("Reset");
  toolbar.append(select, color, apply, reset);
  el.append(toolbar, gridMount);

  apply.addEventListener("click", () => applyHighlight(select.value, color.value));
  reset.addEventListener("click", () => {
    clearHighlight();
    select.value = DEFAULT_COLUMN;
    color.value = DEFAULT_COLOR;
  });

  return () => {
    disposed = true;
    disposeTheme();
    clearHighlight();
    el.removeChild(toolbar);
    el.removeChild(gridMount);
  };
}

/* ===================================== utils ===================================== */

// A column's data cells get a solid-ish tint of the chosen color, mixed over
// the theme's value-cell background so the text stays legible in light or dark.
function dataCellBackground(color: string): string {
  return `color-mix(in srgb, ${color} 28%, var(--value-background-color))`;
}

// The header (the column "track" header) gets a milder mix, blended over the
// theme's column-facet background token. Because that token differs between the
// light and dark themes, the resulting header tint adapts to the active theme.
function headerCellBackground(color: string): string {
  return `color-mix(in srgb, ${color} 14%, var(--column-facet-background-color))`;
}
