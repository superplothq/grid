import Grid, { FlattenedDataViewModel } from "grid/dist/renderer";
import { createGridMount } from "../../runtime/mount";
import type { SampleContext, SampleRow } from "../../types";

// A flat table (no pivot). Each column reads from `field`; `label` is the column
// header and `group` is the shared header drawn above it. Columns that share a
// group name merge into one spanning cell on the top facet row. A column with no
// `group` has its label span both header rows vertically instead.
const COLUMNS: { field: string; label: string; group?: string }[] = [
  { field: "agency_name", label: "Agency", group: "Employment details" },
  { field: "title_description", label: "Title", group: "Employment details" },
  { field: "base_salary", label: "Base Salary" },
  { field: "regular_gross_paid", label: "Regular Gross Paid", group: "Extra expense" },
  { field: "total_ot_paid", label: "Total OT Paid", group: "Extra expense" },
];

const GRID_HEIGHT = 420;

// Static fractional track widths: the two Employment details columns take twice
// the share of the three expense columns, so the table fills the grid width with
// no horizontal scroll.
const COL_FR = [2, 2, 1, 1, 1];

export function mount(el: HTMLElement, ctx: SampleContext): () => void {
  const gridMount = createGridMount(el, GRID_HEIGHT);
  const grid = new Grid({}, gridMount, "flat");
  let disposed = false;
  el.append(gridMount);

  ctx.loadDataset("payroll").then((rows: SampleRow[]) => {
    if (disposed) return;
    grid.data = new FlattenedDataViewModel({
      data: COLUMNS.map((column) => rows.map((row) => row[column.field] ?? null)),
      // Two column facet levels stacked top-to-bottom: the group row, then the
      // per-column label row. Repeating a group value across adjacent columns
      // merges them into one spanning header on the group row. A column with no
      // group puts its label on the top level and `null` below it, so a `null`
      // on the lower level makes the label span both rows vertically.
      columnFacets: [
        COLUMNS.map((column) => column.group ?? column.label),
        COLUMNS.map((column) => (column.group ? column.label : null)),
      ],
      totalRows: rows.length,
      options: {
        vTrackDefs: COLUMNS.map((_, i) => ({ colSize: { strategy: "static", width: COL_FR[i], unit: "fr" } })),
        // One facet def per level: the group row on top, the label row below.
        facetDefs: {
          row: [],
          col: [{ text: "" }, { text: "" }],
          axis: "col",
        },
      },
    });
    grid.draw();
  });

  return () => {
    disposed = true;
    el.removeChild(gridMount);
  };
}
