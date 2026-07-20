import Grid, { FlattenedDataViewModel } from "@superplot/grid/renderer";
import type { ValueFormatter } from "@superplot/grid/renderer";
import { createGridMount } from "../../runtime/mount";
import { syncGridTheme } from "../../runtime/theme";
import type { SampleContext, SampleRow, SampleValue } from "../../types";

// Two column-facet levels: a group banner on top, the per-column label below.
// Columns that share a `group` merge into one spanning banner on the top row.
const COLUMNS: { field: string; label: string; group: string }[] = [
  { field: "agency_name", label: "Agency", group: "Employee" },
  { field: "title_description", label: "Title", group: "Employee" },
  { field: "base_salary", label: "Base Salary", group: "Pay" },
  { field: "regular_gross_paid", label: "Regular Gross", group: "Pay" },
  { field: "total_ot_paid", label: "Overtime", group: "Pay" },
];

const GRID_HEIGHT = 420;

// Static fractional track widths: the two Employee columns take twice the share
// of the three Pay columns, so the table fills the grid width with no scroll.
const COL_FR = [2, 2, 1, 1, 1];

// A single higher-order formatter, placed on the TOP column-facet level. Because
// the label level below it defines no formatter, every data cell inherits this
// one: numbers get locale grouping (107789 -> "107,789") and text passes straight
// through, so Agency and Title are left untouched.
const localeNumber: ValueFormatter<SampleValue> = (value) =>
  typeof value === "number" ? value.toLocaleString("en-US") : value == null ? "" : String(value);

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
      // Top level is the group banner, bottom is the column label.
      columnFacets: [COLUMNS.map((column) => column.group), COLUMNS.map((column) => column.label)],
      totalRows: rows.length,
      options: {
        vTrackDefs: COLUMNS.map((_, i) => ({ colSize: { strategy: "static", width: COL_FR[i], unit: "fr" } })),
        // The formatter lives on the top (group) facet def; the label level below
        // defines none, so the group's formatter is the default for every column.
        facetDefs: {
          row: [],
          col: [{ text: "", valueFormatter: localeNumber }, { text: "" }],
          axis: "col",
        },
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
