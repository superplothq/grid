import Grid, { FlattenedDataViewModel } from "grid/dist/renderer";
import { createToolbar, toolbarSelect } from "../../runtime/toolbar";
import type { SampleContext, SampleRow } from "../../types";

const COLUMNS = [
  { field: "agency_name", label: "Agency" },
  { field: "title_description", label: "Title" },
  { field: "base_salary", label: "Base Salary" },
  { field: "regular_gross_paid", label: "Regular Gross Paid" },
  { field: "total_ot_paid", label: "Total OT Paid" },
];

// Each option is a row height in pixels. Applied to every column so the whole
// table breathes at once.
const HEIGHTS: Record<string, number> = {
  "Compact (19px)": 19,
  "Comfortable (32px)": 32,
  "Spacious (48px)": 48,
};

const DEFAULT_HEIGHT = "Comfortable (32px)";
const GRID_HEIGHT = 420;

export function mount(el: HTMLElement, ctx: SampleContext): () => void {
  el.style.cssText = "display:flex;flex-direction:column;gap:12px;";

  const gridMount = document.createElement("div");
  gridMount.style.cssText =
    `position:relative;height:${GRID_HEIGHT}px;overflow:auto;border-radius:8px;` +
    "border:1px solid color-mix(in srgb, currentColor 15%, transparent);";
  const grid = new Grid({}, gridMount, "flat");
  let disposed = false;
  let rows: SampleRow[] = [];

  const render = (choice: string): void => {
    const cellHeight = HEIGHTS[choice];
    grid.data = new FlattenedDataViewModel({
      data: COLUMNS.map((column) => rows.map((row) => row[column.field] ?? null)),
      columnFacets: [COLUMNS.map((column) => column.label)],
      totalRows: rows.length,
      options: {
        vTrackDefs: COLUMNS.map(() => ({ cellHeight })),
        facetDefs: { row: [], col: [{ text: "" }], axis: "col" },
      },
    });
    grid.draw();
  };

  ctx.loadDataset("payroll").then((loaded) => {
    if (disposed) return;
    rows = loaded;
    render(DEFAULT_HEIGHT);
  });

  const toolbar = createToolbar();
  const select = toolbarSelect(Object.keys(HEIGHTS), DEFAULT_HEIGHT);
  toolbar.append(select);
  el.append(toolbar, gridMount);

  select.addEventListener("change", () => render(select.value));

  return () => {
    disposed = true;
    el.removeChild(toolbar);
    el.removeChild(gridMount);
  };
}
