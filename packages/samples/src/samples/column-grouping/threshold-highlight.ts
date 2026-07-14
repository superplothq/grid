import Grid, { FlattenedDataViewModel, Selection } from "grid/dist/renderer";
import { createGridMount } from "../../runtime/mount";
import { createToolbar, toolbarSelect } from "../../runtime/toolbar";
import { syncGridTheme } from "../../runtime/theme";
import type { SampleContext, SampleRow } from "../../types";

// The same grouped table as the grouping demo. Here the Extra expense group -
// Regular Gross Paid and Total OT Paid - is the target: its cells turn red when
// their value crosses the chosen threshold.
const COLUMNS: { field: string; label: string; group?: string }[] = [
  { field: "agency_name", label: "Agency", group: "Employment details" },
  { field: "title_description", label: "Title", group: "Employment details" },
  { field: "base_salary", label: "Base Salary" },
  { field: "regular_gross_paid", label: "Regular Gross Paid", group: "Extra expense" },
  { field: "total_ot_paid", label: "Total OT Paid", group: "Extra expense" },
];

const EXTRA_EXPENSE = "Extra expense";
const GRID_HEIGHT = 420;
const COL_FR = [2, 2, 1, 1, 1];

// The thresholds the toolbar offers; an Extra expense cell turns red when its
// value is above the selected one.
const THRESHOLDS = [10000, 25000, 50000, 100000];
const DEFAULT_THRESHOLD = 25000;

export function mount(el: HTMLElement, ctx: SampleContext): () => void {
  const gridMount = createGridMount(el, GRID_HEIGHT);
  const grid = new Grid({}, gridMount, "flat");
  const disposeTheme = syncGridTheme(grid);
  let disposed = false;

  // Paint the Extra expense cells above the threshold red. `selectAll` matches the
  // group's header, `selectAllCell` narrows the selection to the data cells whose
  // value crosses the threshold, and `style` colours them. `undo` drops the
  // previous flagging so a new threshold does not stack on the old one.
  let active: Selection | null = null;
  const highlight = (threshold: number): void => {
    active?.undo();
    active = grid.selectAll((_dim, value) => value === EXTRA_EXPENSE);
    active
      .selectAllCell((value) => typeof value === "number" && value > threshold)
      .style((cell) => {
        cell.style.color = "#ef4444";
        cell.style.fontWeight = "600";
      });
    grid.draw();
  };

  ctx.loadDataset("payroll").then((rows: SampleRow[]) => {
    if (disposed) return;
    grid.data = new FlattenedDataViewModel({
      data: COLUMNS.map((column) => rows.map((row) => row[column.field] ?? null)),
      // Two column facet levels: the group banner on top, the label row below -
      // see the grouping demo above for how the merging works.
      columnFacets: [
        COLUMNS.map((column) => column.group ?? column.label),
        COLUMNS.map((column) => (column.group ? column.label : null)),
      ],
      totalRows: rows.length,
      options: {
        vTrackDefs: COLUMNS.map((_, i) => ({ colSize: { strategy: "static", width: COL_FR[i], unit: "fr" } })),
        facetDefs: {
          row: [],
          col: [{ text: "" }, { text: "" }],
          axis: "col",
        },
      },
    });
    grid.draw();
    highlight(DEFAULT_THRESHOLD);
  });

  const toolbar = createToolbar();
  const caption = document.createElement("span");
  caption.textContent = "Flag Extra expense over";
  caption.style.cssText = "font-size:12px;opacity:0.75;";
  const select = toolbarSelect(THRESHOLDS.map(formatUsd), formatUsd(DEFAULT_THRESHOLD));
  toolbar.append(caption, select);
  el.append(toolbar, gridMount);

  select.addEventListener("change", () => highlight(THRESHOLDS[select.selectedIndex]));

  return () => {
    disposed = true;
    disposeTheme();
    active?.undo();
    el.removeChild(toolbar);
    el.removeChild(gridMount);
  };
}

/* ===================================== utils ===================================== */

function formatUsd(amount: number): string {
  return `$${amount.toLocaleString("en-US")}`;
}
