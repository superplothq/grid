import Grid, { FlattenedDataViewModel } from "grid/dist/renderer";
import type { FacetCellRenderer } from "grid/dist/renderer";
import type { SampleContext, SampleRow } from "../../types";

const COLUMNS = [
  { field: "agency_name", label: "Agency", numeric: false },
  { field: "title_description", label: "Title", numeric: false },
  { field: "base_salary", label: "Base Salary", numeric: true },
  { field: "regular_gross_paid", label: "Regular Gross Paid", numeric: true },
  { field: "total_ot_paid", label: "Total OT Paid", numeric: true },
];

const GRID_HEIGHT = 420;

// A header renderer can place content on three sides of the label: a marker on
// the left, the text in the middle, and a badge on the right. Here the badge
// names the kind of values the column holds.
const headerContent: FacetCellRenderer = (label) => {
  const column = COLUMNS.find((c) => c.label === label);
  return {
    left: marker(),
    content: label,
    right: kindBadge(column?.numeric ? "#" : "Aa"),
  };
};

export function mount(el: HTMLElement, ctx: SampleContext): () => void {
  el.style.cssText = "display:flex;flex-direction:column;gap:12px;";

  const gridMount = document.createElement("div");
  gridMount.style.cssText =
    `position:relative;height:${GRID_HEIGHT}px;overflow:auto;border-radius:8px;` +
    "border:1px solid color-mix(in srgb, currentColor 15%, transparent);";
  const grid = new Grid({}, gridMount, "flat");
  let disposed = false;
  el.append(gridMount);

  ctx.loadDataset("payroll").then((rows: SampleRow[]) => {
    if (disposed) return;
    grid.data = new FlattenedDataViewModel({
      data: COLUMNS.map((column) => rows.map((row) => row[column.field] ?? null)),
      columnFacets: [COLUMNS.map((column) => column.label)],
      totalRows: rows.length,
      options: {
        facetDefs: {
          row: [],
          col: [{ text: "", trackRenderer: headerContent }],
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

/* ===================================== utils ===================================== */

// A small dot that sits to the left of every column label.
function marker(): HTMLElement {
  const dot = document.createElement("span");
  dot.textContent = "●";
  dot.style.cssText = "font-size:8px;color:color-mix(in srgb, currentColor 40%, transparent);";
  return dot;
}

// A subtle pill that sits to the right of the label.
function kindBadge(text: string): HTMLElement {
  const badge = document.createElement("span");
  badge.textContent = text;
  badge.style.cssText =
    "font-size:10px;line-height:1;padding:2px 4px;border-radius:4px;" +
    "border:1px solid color-mix(in srgb, currentColor 20%, transparent);" +
    "color:color-mix(in srgb, currentColor 65%, transparent);";
  return badge;
}
