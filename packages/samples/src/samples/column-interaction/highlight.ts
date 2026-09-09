import Grid, { FlattenedDataViewModel } from "@superplot/grid/renderer";
import { createGridMount } from "../../runtime/mount";
import { createToolbar, toolbarButton } from "../../runtime/toolbar";
import { syncGridTheme } from "../../runtime/theme";
import type { SampleContext, SampleRow } from "../../types";

const COLUMNS = [
  { field: "agency_name", label: "Agency" },
  { field: "title_description", label: "Title" },
  { field: "base_salary", label: "Base Salary" },
  { field: "regular_gross_paid", label: "Regular Gross Paid" },
  { field: "total_ot_paid", label: "Total OT Paid" },
];

const COL_FR = [2, 2, 1, 1, 1];
const GRID_HEIGHT = 420;

export function mount(el: HTMLElement, ctx: SampleContext): () => void {
  const gridMount = createGridMount(el, GRID_HEIGHT);
  // Resize UI off so a header click always highlights the column rather than
  // catching the resize handle on the cell's edge.
  const grid = new Grid({ enableResizeUI: false }, gridMount, "flat");
  const disposeTheme = syncGridTheme(grid);
  let disposed = false;

  ctx.loadDataset("payroll").then((rows: SampleRow[]) => {
    if (disposed) return;
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
  });

  // The highlight API is programmatic: it maps data indices to a blue overlay and
  // redraws on its own. Here pointer events drive it - a header click highlights the
  // whole column (columns accumulate), a plain cell click highlights one cell, and a
  // drag highlights a range (which clears any previous highlight).
  let anchor: { row: number; col: number } | null = null;
  let dragged = false;

  const onMouseDown = (event: MouseEvent): void => {
    const header = closestOfType(event.target, "column-facet");
    if (header) {
      grid.highlightColumnByDataIndex(parseInt(header.dataset.col!, 10));
      return;
    }
    const cell = closestOfType(event.target, "value");
    if (!cell) return;
    anchor = cellIndex(cell);
    dragged = false;
    event.preventDefault();
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const onMouseMove = (event: MouseEvent): void => {
    if (!anchor) return;
    const cell = closestOfType(document.elementFromPoint(event.clientX, event.clientY), "value");
    if (!cell) return;
    const here = cellIndex(cell);
    if (!dragged && here.row === anchor.row && here.col === anchor.col) return;
    dragged = true;
    grid.highlightRangeByDataIndex(anchor.row, anchor.col, here.row, here.col);
  };

  const onMouseUp = (): void => {
    if (anchor && !dragged) grid.highlightCellByDataIndex(anchor.row, anchor.col);
    anchor = null;
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  };

  gridMount.addEventListener("mousedown", onMouseDown);

  const toolbar = createToolbar();
  const hint = document.createElement("span");
  hint.style.cssText = "font-size:12px;opacity:0.75;";
  hint.textContent = "Click a header to select a column, click a cell, or drag across cells for a range.";
  const clear = toolbarButton("Clear");
  toolbar.append(hint, clear);
  el.append(toolbar, gridMount);

  clear.addEventListener("click", () => grid.clearAllHighlights());

  return () => {
    disposed = true;
    disposeTheme();
    onMouseUp();
    gridMount.removeEventListener("mousedown", onMouseDown);
    el.removeChild(toolbar);
    el.removeChild(gridMount);
  };
}

/* ===================================== utils ===================================== */

// The layout tags every cell with its type; data cells also carry their data
// row/column index (`data-row`/`data-col`) and column facet cells their leaf column
// index (`data-col`). Reading those turns a DOM target into a highlight call.
function closestOfType(target: EventTarget | null, type: "value" | "column-facet"): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>(`[data-cell-type="${type}"]`) : null;
}

function cellIndex(cell: HTMLElement): { row: number; col: number } {
  return { row: parseInt(cell.dataset.row!, 10), col: parseInt(cell.dataset.col!, 10) };
}
