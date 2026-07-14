import Grid, { FlattenedDataViewModel } from "grid/dist/renderer";
import type { ColAutoSizeConfig } from "grid/dist/renderer";
import { createGridMount } from "../../runtime/mount";
import { createToolbar, toolbarSelect } from "../../runtime/toolbar";
import type { SampleContext, SampleRow } from "../../types";

// A simple flat table (no pivot, no grouping). `field` reads from the payroll
// rows; `label` is the column header.
const COLUMNS = [
  { field: "agency_name", label: "Agency" },
  { field: "title_description", label: "Title" },
  { field: "base_salary", label: "Base Salary" },
  { field: "regular_gross_paid", label: "Regular Gross Paid" },
  { field: "total_ot_paid", label: "Total OT Paid" },
];

// Each toolbar option resolves a sizing config per column, plus a short hint
// shown beside the dropdown. Most modes size every column the same way; the
// clamp mode picks a different config per field to cap one column and floor
// another.
type ColSize = (field: string) => ColAutoSizeConfig;

const SIZE_MODES: Record<string, { colSize: ColSize; hint: string }> = {
  "Fit to content": {
    colSize: () => ({ strategy: "max-cell" }),
    hint: "Each column widens to fit its widest cell; the fit holds as you scroll.",
  },
  "Clamp min / max": {
    colSize: (field) => {
      if (field === "title_description") return { strategy: "clamped-width", maxWidthInPx: 160 };
      if (field === "base_salary") return { strategy: "clamped-width", minWidthInPx: 240 };
      return { strategy: "max-cell" };
    },
    hint: "Title is capped at 160px, Base Salary is held to at least 240px, the rest fit their content.",
  },
  "Share equally": {
    colSize: () => ({ strategy: "static", width: 1, unit: "fr" }),
    hint: "Columns split the grid width equally - no horizontal scroll.",
  },
  "Static 120px": {
    colSize: () => ({ strategy: "static", width: 120, unit: "px" }),
    hint: "Every column takes a fixed 120px slice of the grid width.",
  },
};

const DEFAULT_MODE = "Fit to content";
const GRID_HEIGHT = 420;

export function mount(el: HTMLElement, ctx: SampleContext): () => void {
  const gridMount = createGridMount(el, GRID_HEIGHT);
  const grid = new Grid({}, gridMount, "flat");
  let disposed = false;
  let rows: SampleRow[] = [];

  // Rebuild the table with the chosen size applied to every column, and update
  // the hint under the dropdown to describe what to expect.
  const render = (mode: string): void => {
    hint.textContent = SIZE_MODES[mode].hint;
    grid.data = new FlattenedDataViewModel({
      data: COLUMNS.map((column) => rows.map((row) => row[column.field] ?? null)),
      columnFacets: [COLUMNS.map((column) => column.label)],
      totalRows: rows.length,
      options: {
        vTrackDefs: COLUMNS.map((column) => ({ colSize: SIZE_MODES[mode].colSize(column.field) })),
        facetDefs: { row: [], col: [{ text: "" }], axis: "col" },
      },
    });
    grid.draw();
  };

  ctx.loadDataset("payroll").then((loaded) => {
    if (disposed) return;
    rows = loaded;
    render(DEFAULT_MODE);
  });

  const toolbar = createToolbar();
  const select = toolbarSelect(Object.keys(SIZE_MODES), DEFAULT_MODE);

  // A one-line, muted description of the selected mode, sitting in the toolbar's
  // empty space to the right of the dropdown.
  const hint = document.createElement("span");
  hint.style.cssText =
    "font-size:12px;align-self:center;color:color-mix(in srgb, currentColor 60%, transparent);";
  hint.textContent = SIZE_MODES[DEFAULT_MODE].hint;

  toolbar.append(select, hint);
  el.append(toolbar, gridMount);

  select.addEventListener("change", () => render(select.value));

  return () => {
    disposed = true;
    el.removeChild(toolbar);
    el.removeChild(gridMount);
  };
}
