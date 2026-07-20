import Grid, { FlattenedDataViewModel } from "@superplot/grid/renderer";
import { createGridMount } from "../../runtime/mount";
import { createToolbar, toolbarSelect } from "../../runtime/toolbar";
import { syncGridTheme } from "../../runtime/theme";
import type { SampleContext, SampleRow } from "../../types";

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

// With no custom renderer the grid measures each row from its rendered text
// plus cell padding, so row height is driven by the `--cell-padding-y` theme
// token. Each option is a vertical padding in pixels; dialing it up or down
// makes the whole table breathe.
const DENSITIES: Record<string, number> = {
  Compact: 3,
  Comfortable: 7,
  Spacious: 16,
};

const DEFAULT_DENSITY = "Comfortable";
const GRID_HEIGHT = 420;

export function mount(el: HTMLElement, ctx: SampleContext): () => void {
  const gridMount = createGridMount(el, GRID_HEIGHT);
  const grid = new Grid({}, gridMount, "flat");
  const disposeTheme = syncGridTheme(grid);
  let disposed = false;
  let rows: SampleRow[] = [];

  const render = (choice: string): void => {
    // Override the theme's vertical padding on the container the tracks render
    // onto. The grid re-measures row height on the next draw, so the table
    // tightens or relaxes to match.
    grid.trackSurfaceContainer.style.setProperty("--cell-padding-y", String(DENSITIES[choice]));
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

  ctx.loadDataset("payroll").then((loaded) => {
    if (disposed) return;
    rows = loaded;
    render(DEFAULT_DENSITY);
  });

  const toolbar = createToolbar();
  const select = toolbarSelect(Object.keys(DENSITIES), DEFAULT_DENSITY);
  toolbar.append(select);
  el.append(toolbar, gridMount);

  select.addEventListener("change", () => render(select.value));

  return () => {
    disposed = true;
    disposeTheme();
    el.removeChild(toolbar);
    el.removeChild(gridMount);
  };
}
