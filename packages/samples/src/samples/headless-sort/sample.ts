import Grid, { FlattenedDataViewModel } from "grid/dist/renderer";
import type { CellRenderer, RendererContext } from "grid/dist/renderer";
import type { FlattenedDataViewModelParams } from "grid/dist/renderer/flattened-data-viewmodel";
import { createGridMount } from "../../runtime/mount";
import { resolveGridTheme, syncGridTheme } from "../../runtime/theme";
import type { SampleContext, SampleRow } from "../../types";

interface Column {
  field: string;
  label: string;
  kind: "text" | "money";
}

const COLUMNS: Column[] = [
  { field: "title_description", label: "Title", kind: "text" },
  { field: "agency_name", label: "Agency", kind: "text" },
  { field: "work_location_borough", label: "Borough", kind: "text" },
  { field: "base_salary", label: "Base Salary", kind: "money" },
  { field: "total_ot_paid", label: "OT Paid", kind: "money" },
];

type Dir = "asc" | "desc";

// The grid never sorts for you; it renders whatever order the viewmodel holds. This
// demo owns the whole interaction: clicking a header opens a translucent popover to
// pick ascending, descending, or reset, and each direction can record a keyboard
// shortcut that fires the sort directly. Both the active sort and the recorded
// shortcuts live on `viewModel.metaState`, a passive store the render reads back.
export function mount(el: HTMLElement, ctx: SampleContext): () => void {
  const gridMount = createGridMount(el, 440);
  const grid = new Grid({}, gridMount, "flat");
  const disposeTheme = syncGridTheme(grid);
  el.append(gridMount);

  let viewModel: FlattenedDataViewModel;
  let allRows: SampleRow[] = [];
  let disposed = false;

  let popover: HTMLElement | null = null;
  let popoverPos = { left: "0px", top: "0px" };
  let recording: { field: string; dir: Dir } | null = null;

  ctx.loadDataset("payroll").then((rows) => {
    if (disposed) return;
    allRows = rows;
    viewModel = new FlattenedDataViewModel(buildParams(rows));
    grid.data = viewModel;
    grid.draw();
    document.addEventListener("pointerdown", onDocPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    gridMount.addEventListener("scroll", closePopover);
  });

  return () => {
    disposed = true;
    closePopover();
    document.removeEventListener("pointerdown", onDocPointerDown, true);
    document.removeEventListener("keydown", onKeyDown, true);
    gridMount.removeEventListener("scroll", closePopover);
    disposeTheme();
    el.removeChild(gridMount);
  };

  /* ---- sort, held on metaState ---- */

  // The render is a pure function of the sort on metaState: read it, reorder a copy
  // of the rows, and hand them back. metaState is a dumb store with no reactivity, so
  // grid.draw() is what actually re-runs the renderers against the new state.
  function render(): void {
    const sort = activeSort();
    let rows = allRows;
    if (sort) {
      const col = COLUMNS.find((c) => c.field === sort.field)!;
      const factor = sort.dir === "asc" ? 1 : -1;
      rows = rows.slice().sort((a, b) => compare(a[col.field], b[col.field], col.kind) * factor);
    }
    viewModel.updateData(buildParams(rows));
    grid.draw();
  }

  function activeSort(): { field: string; dir: Dir } | undefined {
    return viewModel.metaState.get("sort") as { field: string; dir: Dir } | undefined;
  }

  function applySort(field: string, dir: Dir): void {
    viewModel.metaState.set("sort", "field", field);
    viewModel.metaState.set("sort", "dir", dir);
    render();
  }

  function resetSort(): void {
    viewModel.metaState.clear("sort");
    render();
  }

  /* ---- keyboard shortcuts, also on metaState ---- */

  // Bindings are keyed by keystroke (e.g. "⇧S") and point at an action ("field:dir").
  function bindings(): Record<string, string> {
    return (viewModel.metaState.get("shortcut") as Record<string, string>) ?? {};
  }

  function keyForAction(field: string, dir: Dir): string | null {
    const target = `${field}:${dir}`;
    for (const [key, action] of Object.entries(bindings())) if (action === target) return key;
    return null;
  }

  function recordShortcut(field: string, dir: Dir, combo: string): void {
    const previous = keyForAction(field, dir);
    if (previous) viewModel.metaState.clear("shortcut", previous);
    viewModel.metaState.set("shortcut", combo, `${field}:${dir}`);
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (recording) {
      if (event.key === "Escape") return void ((recording = null), refreshPopover());
      if (isModifierKey(event.key)) return;
      event.preventDefault();
      recordShortcut(recording.field, recording.dir, comboFromEvent(event));
      recording = null;
      refreshPopover();
      return;
    }
    if (isTypingTarget()) return;
    const action = bindings()[comboFromEvent(event)];
    if (!action) return;
    event.preventDefault();
    const [field, dir] = action.split(":");
    applySort(field, dir as Dir);
  }

  /* ---- popover ---- */

  function onDocPointerDown(event: PointerEvent): void {
    const target = event.target as HTMLElement;
    const header = target.closest?.<HTMLElement>("[data-sort-field]");
    if (header && gridMount.contains(header)) {
      const field = header.dataset.sortField!;
      if (popover?.dataset.field === field) closePopover();
      else openPopover(field, header);
      return;
    }
    if (popover && !popover.contains(target)) closePopover();
  }

  function openPopover(field: string, anchor: HTMLElement): void {
    closePopover();
    popover = buildPopover(field);
    document.body.appendChild(popover);
    const rect = anchor.getBoundingClientRect();
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - popover.offsetWidth - 12));
    popoverPos = { left: `${left}px`, top: `${rect.bottom + 6}px` };
    Object.assign(popover.style, popoverPos);
  }

  // Rebuild in place after a state change so chips and the active row stay in sync.
  function refreshPopover(): void {
    if (!popover) return;
    const field = popover.dataset.field!;
    const rebuilt = buildPopover(field);
    Object.assign(rebuilt.style, popoverPos);
    popover.replaceWith(rebuilt);
    popover = rebuilt;
  }

  function closePopover(): void {
    popover?.remove();
    popover = null;
    recording = null;
  }

  function buildPopover(field: string): HTMLElement {
    const column = COLUMNS.find((c) => c.field === field)!;
    const active = activeSort();
    const p = palette();

    const panel = document.createElement("div");
    panel.dataset.field = field;
    panel.style.cssText =
      `position:fixed;z-index:9999;min-width:196px;padding:10px;color:${p.text};background:${p.bg};` +
      "backdrop-filter:blur(16px) saturate(1.6);-webkit-backdrop-filter:blur(16px) saturate(1.6);" +
      `border:1px solid ${p.border};border-radius:12px;box-shadow:0 14px 44px rgba(0,0,0,0.3);` +
      "font-family:-apple-system,system-ui,sans-serif;font-size:13px;";

    const title = document.createElement("div");
    title.textContent = `Sort ${column.label}`;
    title.style.cssText = "font-size:11px;text-transform:uppercase;letter-spacing:0.06em;opacity:0.55;margin:2px 2px 8px;";
    panel.appendChild(title);

    for (const dir of ["asc", "desc"] as Dir[]) {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:8px;margin:4px 0;";

      const isActive = active?.field === field && active.dir === dir;
      const action = document.createElement("button");
      action.type = "button";
      action.innerHTML = `<span style="display:inline-flex">${dirGlyph(dir, isActive ? p.accent : p.text)}</span><span style="flex:1;text-align:left">${dir === "asc" ? "Ascending" : "Descending"}</span>`;
      action.style.cssText =
        "display:flex;align-items:center;gap:8px;flex:1;padding:6px 8px;border-radius:8px;cursor:pointer;" +
        `font:inherit;font-size:13px;border:1px solid transparent;background:${isActive ? p.hover : "transparent"};` +
        `color:${isActive ? p.accent : p.text};`;
      hover(action, p.hover, isActive ? p.hover : "transparent");
      action.addEventListener("click", () => (applySort(field, dir), closePopover()));

      row.append(action, buildRecorderChip(field, dir, p));
      panel.appendChild(row);
    }

    const reset = document.createElement("button");
    reset.type = "button";
    reset.textContent = "Reset";
    reset.style.cssText =
      "width:100%;margin-top:6px;padding:6px 8px;border-radius:8px;cursor:pointer;font:inherit;font-size:12px;" +
      `color:${p.text};background:transparent;border:1px solid ${p.border};`;
    hover(reset, p.hover, "transparent");
    reset.addEventListener("click", () => (resetSort(), closePopover()));
    panel.appendChild(reset);

    const hint = document.createElement("div");
    hint.innerHTML = "Click Record to bind a key.<br>Close this, then press that key to sort.";
    hint.style.cssText = `margin:9px 2px 1px;font-size:10.5px;line-height:1.4;color:${p.muted};`;
    panel.appendChild(hint);

    return panel;
  }

  // The macOS-style shortcut recorder: click to arm, press a keystroke to bind it,
  // and the bound key then triggers this exact sort from anywhere.
  function buildRecorderChip(field: string, dir: Dir, p: Palette): HTMLElement {
    const isRecording = recording?.field === field && recording.dir === dir;
    const bound = keyForAction(field, dir);

    const chip = document.createElement("button");
    chip.type = "button";
    chip.textContent = isRecording ? "Press keys" : bound ?? "Record";
    chip.style.cssText =
      "font:inherit;font-size:11px;min-width:56px;padding:4px 8px;border-radius:6px;cursor:pointer;text-align:center;" +
      `color:${isRecording ? p.accent : bound ? p.text : p.muted};background:${isRecording ? "transparent" : p.chip};` +
      `border:1px ${isRecording ? "dashed" : "solid"} ${isRecording ? p.accent : p.border};`;
    chip.addEventListener("click", (event) => {
      event.stopPropagation();
      recording = isRecording ? null : { field, dir };
      refreshPopover();
    });
    return chip;
  }

  /* ---- viewmodel params ---- */

  function buildParams(rows: SampleRow[]): FlattenedDataViewModelParams {
    return {
      data: COLUMNS.map((column) => rows.map((row) => row[column.field] ?? null)),
      columnFacets: [COLUMNS.map((column) => column.field)],
      totalRows: rows.length,
      options: {
        vTrackDefs: COLUMNS.map((column) => ({
          colSize: { strategy: "static" as const, width: 1, unit: "fr" as const },
          valueFormatter: column.kind === "money" ? formatMoney : undefined,
          renderer: column.kind === "money" ? rightAlignValue : undefined,
        })),
        facetDefs: { row: [], col: [{ trackRenderer: sortHeader }], axis: "col" as const },
      },
    };
  }

  // The column facet renderer draws each header from its field id, tags it for the
  // delegated click that opens the popover, and shows an icon for the current sort.
  function sortHeader(field: string): HTMLElement | string {
    // The layout calls this with a synthetic sample string while measuring row
    // height, before any real field id flows through - ignore that pass.
    const column = COLUMNS.find((c) => c.field === field);
    if (!column) return "";
    const active = activeSort();
    const dir = active?.field === field ? active.dir : null;

    const node = document.createElement("div");
    node.dataset.sortField = field;
    node.style.cssText =
      "display:flex;align-items:center;gap:6px;width:100%;height:100%;cursor:pointer;user-select:none;" +
      `padding:0 calc(var(--cell-padding-x) * 1px);${column.kind === "money" ? "justify-content:flex-end;" : ""}`;

    const label = document.createElement("span");
    label.textContent = column.label;
    label.style.cssText = "min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";

    const icon = document.createElement("span");
    icon.style.cssText = "display:inline-flex;flex-shrink:0;";
    icon.innerHTML = sortIcon(dir);

    node.append(label, icon);
    return node;
  }
}

/* ===================================== utils ===================================== */

interface Palette {
  bg: string;
  text: string;
  muted: string;
  border: string;
  hover: string;
  chip: string;
  accent: string;
}

function palette(): Palette {
  const dark = resolveGridTheme() === "dark";
  return dark
    ? { bg: "rgba(28,28,32,0.72)", text: "#f2f2f5", muted: "rgba(242,242,245,0.5)", border: "rgba(255,255,255,0.14)", hover: "rgba(255,255,255,0.08)", chip: "rgba(255,255,255,0.1)", accent: "#5b9dff" }
    : { bg: "rgba(255,255,255,0.72)", text: "#1c1c22", muted: "rgba(28,28,34,0.45)", border: "rgba(0,0,0,0.1)", hover: "rgba(0,0,0,0.05)", chip: "rgba(0,0,0,0.06)", accent: "#2f6fed" };
}

function hover(node: HTMLElement, on: string, off: string): void {
  node.addEventListener("pointerenter", () => (node.style.background = on));
  node.addEventListener("pointerleave", () => (node.style.background = off));
}

// Two stacked triangles; the active direction is solid, the other dimmed.
function sortIcon(dir: Dir | null): string {
  const up = dir === "asc" ? 1 : 0.32;
  const down = dir === "desc" ? 1 : 0.32;
  return `<svg width="9" height="13" viewBox="0 0 9 13" style="display:block"><path d="M4.5 0 L8 4.2 L1 4.2 Z" fill="currentColor" opacity="${up}"/><path d="M4.5 13 L1 8.8 L8 8.8 Z" fill="currentColor" opacity="${down}"/></svg>`;
}

function dirGlyph(dir: Dir, color: string): string {
  const path = dir === "asc" ? "M5 1 L9 6 L1 6 Z" : "M5 11 L1 6 L9 6 Z";
  return `<svg width="10" height="12" viewBox="0 0 10 12" style="display:block"><path d="${path}" fill="${color}"/></svg>`;
}

function comboFromEvent(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.metaKey) parts.push("⌘");
  if (event.ctrlKey) parts.push("⌃");
  if (event.altKey) parts.push("⌥");
  if (event.shiftKey) parts.push("⇧");
  parts.push(event.key.length === 1 ? event.key.toUpperCase() : event.key);
  return parts.join("");
}

function isModifierKey(key: string): boolean {
  return key === "Shift" || key === "Meta" || key === "Control" || key === "Alt" || key === "CapsLock";
}

function isTypingTarget(): boolean {
  const tag = document.activeElement?.tagName;
  return tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA";
}

const moneyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function formatMoney(value: unknown): string {
  return typeof value === "number" ? moneyFormatter.format(value) : "";
}

function compare(a: unknown, b: unknown, kind: "text" | "money"): number {
  if (kind === "money") return (Number(a) || 0) - (Number(b) || 0);
  return String(a ?? "").localeCompare(String(b ?? ""));
}

// A custom renderer flips the cell to `.custom-rendered`, which centres content and
// zeroes padding - restore the theme padding and push the formatted value flush
// right with tabular figures.
const rightAlignValue: CellRenderer<string> = (data, _dataCtx, ctx: RendererContext) => {
  const cell = ctx.container;
  cell.style.justifyContent = "flex-end";
  cell.style.padding = "calc(var(--cell-padding-y) * 1px) calc(var(--cell-padding-x) * 1px)";
  cell.style.fontVariantNumeric = "tabular-nums";
  return data == null ? "" : String(data);
};
