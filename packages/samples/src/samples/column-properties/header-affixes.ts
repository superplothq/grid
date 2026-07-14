import Grid, { FlattenedDataViewModel } from "grid/dist/renderer";
import type { FacetCellRenderer } from "grid/dist/renderer";
import { createGridMount } from "../../runtime/mount";
import type { SampleContext, SampleRow } from "../../types";

// `note` is a short, header-specific blurb shown in the hover tooltip that the
// left dot anchors.
const COLUMNS = [
  { field: "agency_name", label: "Agency", numeric: false, note: "The City agency that employs the worker - every row is payroll under one of these." },
  { field: "title_description", label: "Title", numeric: false, note: "Civil-service title describing the role the worker is paid for." },
  { field: "base_salary", label: "Base Salary", numeric: true, note: "Annual base pay set for the title, before any overtime or other extras." },
  { field: "regular_gross_paid", label: "Regular Gross Paid", numeric: true, note: "Regular wages actually paid out across the fiscal year." },
  { field: "total_ot_paid", label: "Total OT Paid", numeric: true, note: "Overtime compensation paid on top of the regular wages." },
];

const GRID_HEIGHT = 420;

// Static fractional track widths: the first two columns take twice the share of
// the remaining three, so the table fills the grid width with no horizontal scroll.
const COL_FR = [2, 2, 1, 1, 1];

// A header renderer can place content on three sides of the label: a marker on
// the left, the text in the middle, and a badge on the right. The left dot is
// also the tooltip anchor - hovering it opens a custom-HTML card below the dot.
function headerContent(tooltip: Tooltip): FacetCellRenderer {
  return (label, _dataCtx, ctx) => {
    const column = COLUMNS.find((c) => c.label === label);
    const dot = marker(tooltip, label, column?.note ?? "");
    // Grow the dot whenever the pointer is anywhere over its header cell, not
    // only when it is directly over the dot.
    ctx.cell.addEventListener("mouseenter", () => (dot.style.transform = "scale(1.6)"));
    ctx.cell.addEventListener("mouseleave", () => (dot.style.transform = "scale(1)"));
    return {
      left: dot,
      content: label,
      right: kindBadge(column?.numeric ? "#" : "Aa"),
    };
  };
}

export function mount(el: HTMLElement, ctx: SampleContext): () => void {
  const gridMount = createGridMount(el, GRID_HEIGHT);
  const grid = new Grid({}, gridMount, "flat");
  const tooltip = createTooltip();
  let disposed = false;
  el.append(gridMount);

  ctx.loadDataset("payroll").then((rows: SampleRow[]) => {
    if (disposed) return;
    grid.data = new FlattenedDataViewModel({
      data: COLUMNS.map((column) => rows.map((row) => row[column.field] ?? null)),
      columnFacets: [COLUMNS.map((column) => column.label)],
      totalRows: rows.length,
      options: {
        vTrackDefs: COLUMNS.map((_, i) => ({ colSize: { strategy: "static", width: COL_FR[i], unit: "fr" } })),
        facetDefs: {
          row: [],
          col: [{ text: "", trackRenderer: headerContent(tooltip) }],
          axis: "col",
        },
      },
    });
    grid.draw();
  });

  return () => {
    disposed = true;
    tooltip.destroy();
    el.removeChild(gridMount);
  };
}

/* ===================================== utils ===================================== */

interface Tooltip {
  attach(anchor: HTMLElement, html: string): void;
  destroy(): void;
}

// A single floating tooltip reused across every dot. It is appended to the body
// so the grid's scroll container can never crop it, and positioned with fixed
// coordinates just below whichever dot is hovered.
function createTooltip(): Tooltip {
  let tip: HTMLElement | null = null;

  const hide = (): void => {
    tip?.remove();
    tip = null;
  };

  const show = (anchor: HTMLElement, html: string): void => {
    hide();
    tip = document.createElement("div");
    tip.innerHTML = html;
    tip.style.cssText =
      "position:fixed;z-index:1000;max-width:240px;padding:8px 10px;border-radius:8px;" +
      "font-size:12px;line-height:1.45;pointer-events:none;" +
      "color:color-mix(in srgb, currentColor 88%, transparent);" +
      "background:color-mix(in srgb, currentColor 12%, transparent);" +
      "border:1px solid color-mix(in srgb, currentColor 22%, transparent);" +
      "box-shadow:0 8px 24px color-mix(in srgb, currentColor 22%, transparent);" +
      "backdrop-filter:blur(10px);";

    // A little caret near the card's left edge, pointing up at the dot.
    const caret = document.createElement("div");
    caret.style.cssText =
      "position:absolute;top:-5px;left:12px;width:9px;height:9px;transform:rotate(45deg);" +
      "background:color-mix(in srgb, currentColor 12%, transparent);" +
      "border-top:1px solid color-mix(in srgb, currentColor 22%, transparent);" +
      "border-left:1px solid color-mix(in srgb, currentColor 22%, transparent);";
    tip.appendChild(caret);
    document.body.appendChild(tip);

    // Open downward, with the caret (12px in from the card's left) landing under
    // the centre of the dot.
    const r = anchor.getBoundingClientRect();
    tip.style.top = `${r.bottom + 8}px`;
    tip.style.left = `${r.left + r.width / 2 - 16}px`;
  };

  return {
    attach(anchor, html) {
      anchor.addEventListener("mouseenter", () => show(anchor, html));
      anchor.addEventListener("mouseleave", hide);
    },
    destroy: hide,
  };
}

// A small dot that sits to the left of every column label and anchors the hover
// tooltip built from the column's header name and note.
function marker(tooltip: Tooltip, label: string, note: string): HTMLElement {
  const dot = document.createElement("span");
  dot.textContent = "●";
  dot.style.cssText =
    "display:inline-block;font-size:8px;cursor:help;transition:transform 120ms ease;" +
    "color:color-mix(in srgb, currentColor 40%, transparent);";
  tooltip.attach(dot, tooltipHtml(label, note));
  return dot;
}

// Custom HTML for the tooltip body: the header name in bold over its description.
function tooltipHtml(label: string, note: string): string {
  return (
    `<div style="font-weight:600;margin-bottom:3px;">${label}</div>` +
    `<div style="opacity:0.75;">${note}</div>`
  );
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
