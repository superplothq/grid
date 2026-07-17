import Grid, { FlattenedDataViewModel } from "grid/dist/renderer";
import type { ValueFormatter } from "grid/dist/renderer";
import { createGridMount } from "../../runtime/mount";
import { syncGridTheme } from "../../runtime/theme";
import type { SampleContext, SampleRow, SampleValue } from "../../types";

// The column that opts out of the inherited group formatter with its own.
const OVERRIDE_FIELD = "base_salary";

const COLUMNS: { field: string; label: string; group: string }[] = [
  { field: "agency_name", label: "Agency", group: "Employee" },
  { field: "title_description", label: "Title", group: "Employee" },
  { field: OVERRIDE_FIELD, label: "Base Salary", group: "Pay" },
  { field: "regular_gross_paid", label: "Regular Gross", group: "Pay" },
  { field: "total_ot_paid", label: "Overtime", group: "Pay" },
];

const GRID_HEIGHT = 420;
const COL_FR = [2, 2, 1, 1, 1];

// The group-level default (same as the previous section): locale grouping for
// numbers, text passed through. Every Pay column inherits it.
const localeNumber: ValueFormatter<SampleValue> = (value) =>
  typeof value === "number" ? value.toLocaleString("en-US") : value == null ? "" : String(value);

// A per-column formatter set on one vTrackDef. Because a track def formatter
// takes precedence over the facet default, only Base Salary renders as currency
// (`$107,789`) while the other Pay columns keep the inherited locale grouping.
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
    grid.data = new FlattenedDataViewModel({
      data: COLUMNS.map((column) => rows.map((row) => row[column.field] ?? null)),
      columnFacets: [COLUMNS.map((column) => column.group), COLUMNS.map((column) => column.label)],
      totalRows: rows.length,
      options: {
        // Base Salary carries its own valueFormatter; it wins over the group
        // default for that column only. The rest carry width alone and inherit.
        vTrackDefs: COLUMNS.map((column, i) => ({
          colSize: { strategy: "static", width: COL_FR[i], unit: "fr" },
          ...(column.field === OVERRIDE_FIELD ? { valueFormatter: currency } : {}),
        })),
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
