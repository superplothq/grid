import Grid, { FlattenedDataViewModel, PHorizontalFixture } from "grid/dist/renderer";
import type { BaseFixtureViewModel, BaseSliceResult, BaseViewModel, CellRenderer, RendererContext } from "grid/dist/renderer";
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

const BOROUGH_FIELD = "work_location_borough";

// Filtering is glue code: the grid renders whatever rows the viewmodel holds. This
// demo owns two filters and puts each where it belongs. A full-width search bar rides
// the grid as a top fixture, and an Excel-style checklist hangs off the Borough
// header. Both write to `viewModel.metaState`, and the render is a pure function of it.
export function mount(el: HTMLElement, ctx: SampleContext): () => void {
  const gridMount = createGridMount(el, 420);
  let viewModel: FlattenedDataViewModel;
  let allRows: SampleRow[] = [];
  let allBoroughs: string[] = [];
  let disposed = false;

  let popover: HTMLElement | null = null;
  let countEl: HTMLElement | null = null;
  let lastShown = 0;

  // The search bar lives inside the grid as a full-width top fixture. Defined here so
  // it closes over the query state and the render, and reads/writes metaState directly.
  class SearchFixture extends PHorizontalFixture {
    viewModelKey(): string {
      return "search";
    }
    getHeight(): number {
      return 44;
    }
    getCellsToRender(view: BaseViewModel, fixture: BaseFixtureViewModel, slice: BaseSliceResult): { nodesToAppend: HTMLElement[] } {
      const nodesToAppend: HTMLElement[] = [];
      const vm = view as unknown as { fixedLeftVTrackPositions?: number[] };
      const numRowFacetLevels = this.data!.numRowFacetLevels;
      const [cell, needAppend, contentDirty] = this.placeCellInDom({
        key: "search-bar",
        gridRow: fixture.track,
        gridCol: 1,
        hintContentDirty: true,
        cls: `header ${fixture.suggestedCls.join(" ")}`,
        extraStyles: {
          top: fixture.offset,
          left: vm.fixedLeftVTrackPositions?.[0] ?? 0,
          colspan: numRowFacetLevels + slice.sliceNumCols,
        },
      });
      if (contentDirty) {
        cell.style.cssText += "padding:0 12px;";
        cell.replaceChildren(buildSearchBar());
      }
      if (needAppend) nodesToAppend.push(cell);
      return { nodesToAppend };
    }
  }

  const grid = new Grid({ fixtures: { top: [SearchFixture], left: [], bottom: [], right: [] } }, gridMount, "flat");
  const disposeTheme = syncGridTheme(grid);
  el.append(gridMount);

  ctx.loadDataset("payroll").then((rows) => {
    if (disposed) return;
    allRows = rows;
    allBoroughs = [...new Set(rows.map((row) => String(row[BOROUGH_FIELD])))].sort();
    lastShown = rows.length;
    viewModel = new FlattenedDataViewModel(buildParams(rows));
    grid.data = viewModel;
    grid.draw();
    document.addEventListener("pointerdown", onDocPointerDown, true);
    gridMount.addEventListener("scroll", closePopover);
  });

  return () => {
    disposed = true;
    closePopover();
    document.removeEventListener("pointerdown", onDocPointerDown, true);
    gridMount.removeEventListener("scroll", closePopover);
    disposeTheme();
    el.removeChild(gridMount);
  };

  /* ---- filter state on metaState, and the single render ---- */

  function render(): void {
    const query = queryValue();
    const selected = selectedBoroughs();
    const rows = allRows.filter((row) => {
      const matchesQuery = query === "" || `${row.title_description} ${row.agency_name}`.toLowerCase().includes(query);
      const matchesBorough = !selected || selected.includes(String(row[BOROUGH_FIELD]));
      return matchesQuery && matchesBorough;
    });
    viewModel.updateData(buildParams(rows));
    grid.draw();
    updateCount(rows.length);
  }

  function updateCount(shown: number): void {
    lastShown = shown;
    if (countEl) countEl.textContent = `${shown}/${allRows.length} rows`;
  }

  function queryValue(): string {
    return (viewModel.metaState.get("filter") as { query?: string } | undefined)?.query ?? "";
  }

  function setQuery(value: string): void {
    viewModel.metaState.set("filter", "query", value);
    render();
  }

  // undefined means every borough is included (no filter); an array is an explicit set.
  function selectedBoroughs(): string[] | undefined {
    return (viewModel.metaState.get("filter") as { boroughs?: string[] } | undefined)?.boroughs;
  }

  function setBoroughs(next: string[]): void {
    viewModel.metaState.set("filter", "boroughs", next);
    render();
  }

  function boroughFilterActive(): boolean {
    const selected = selectedBoroughs();
    return Boolean(selected && selected.length < allBoroughs.length);
  }

  /* ---- search bar (top fixture content) ---- */

  function buildSearchBar(): HTMLElement {
    const bar = document.createElement("div");
    bar.style.cssText = "display:flex;align-items:center;gap:8px;width:100%;height:100%;font-size:12px;";

    const label = document.createElement("span");
    label.textContent = "Search text in title / agency:";
    label.style.cssText = "opacity:0.7;white-space:nowrap;";

    const input = document.createElement("input");
    input.type = "search";
    input.value = queryValue();
    input.placeholder = "type to filter";
    input.style.cssText =
      "flex:1;min-width:80px;max-width:340px;height:26px;font:inherit;font-size:12px;color:inherit;background:transparent;" +
      "border:1px solid color-mix(in srgb, currentColor 22%, transparent);border-radius:6px;padding:0 8px;outline:none;";
    input.addEventListener("input", () => setQuery(input.value.trim().toLowerCase()));

    countEl = document.createElement("span");
    countEl.style.cssText = "margin-left:auto;font-size:11px;opacity:0.55;white-space:nowrap;";
    countEl.textContent = `${lastShown}/${allRows.length} rows`;

    bar.append(label, input, countEl);
    return bar;
  }

  /* ---- borough filter popover (opened from the header funnel) ---- */

  function onDocPointerDown(event: PointerEvent): void {
    const target = event.target as HTMLElement;
    const funnel = target.closest?.<HTMLElement>("[data-filter-field]");
    if (funnel && gridMount.contains(funnel)) {
      if (popover) closePopover();
      else openBoroughPopover(funnel);
      return;
    }
    if (popover && !popover.contains(target)) closePopover();
  }

  function openBoroughPopover(anchor: HTMLElement): void {
    closePopover();
    popover = buildBoroughPopover();
    document.body.appendChild(popover);
    const rect = anchor.getBoundingClientRect();
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - popover.offsetWidth - 12));
    popover.style.left = `${left}px`;
    popover.style.top = `${rect.bottom + 6}px`;
  }

  function closePopover(): void {
    popover?.remove();
    popover = null;
  }

  function buildBoroughPopover(): HTMLElement {
    const p = palette();
    const selected = selectedBoroughs();
    const checks: HTMLInputElement[] = [];

    const panel = document.createElement("div");
    panel.style.cssText =
      `position:fixed;z-index:9999;min-width:190px;padding:10px;color:${p.text};background:${p.bg};` +
      "backdrop-filter:blur(16px) saturate(1.6);-webkit-backdrop-filter:blur(16px) saturate(1.6);" +
      `border:1px solid ${p.border};border-radius:12px;box-shadow:0 14px 44px rgba(0,0,0,0.3);` +
      "font-family:-apple-system,system-ui,sans-serif;font-size:13px;";

    const title = document.createElement("div");
    title.textContent = "Filter Borough";
    title.style.cssText = "font-size:11px;text-transform:uppercase;letter-spacing:0.06em;opacity:0.55;margin:2px 2px 8px;";
    panel.appendChild(title);

    const quick = document.createElement("div");
    quick.style.cssText = "display:flex;gap:6px;margin-bottom:8px;";
    quick.append(
      quickButton("All boroughs", p, () => setAll(checks, allBoroughs.slice())),
      quickButton("No boroughs", p, () => setAll(checks, [])),
    );
    panel.appendChild(quick);

    const list = document.createElement("div");
    list.style.cssText = "max-height:180px;overflow:auto;display:flex;flex-direction:column;gap:1px;";
    for (const borough of allBoroughs) {
      const row = document.createElement("label");
      row.style.cssText = "display:flex;align-items:center;gap:8px;padding:5px 6px;border-radius:6px;cursor:pointer;";
      hover(row, p.hover, "transparent");

      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = selected ? selected.includes(borough) : true;
      check.dataset.borough = borough;
      check.style.cssText = `margin:0;cursor:pointer;accent-color:${p.accent};`;
      check.addEventListener("change", () => setBoroughs(collect(checks)));
      checks.push(check);

      const name = document.createElement("span");
      name.textContent = borough === "" ? "(Blank)" : borough;

      row.append(check, name);
      list.appendChild(row);
    }
    panel.appendChild(list);

    return panel;
  }

  function setAll(checks: HTMLInputElement[], next: string[]): void {
    for (const check of checks) check.checked = next.includes(check.dataset.borough!);
    setBoroughs(next);
  }

  function collect(checks: HTMLInputElement[]): string[] {
    return checks.filter((check) => check.checked).map((check) => check.dataset.borough!);
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
        facetDefs: { row: [], col: [{ trackRenderer: columnHeader }], axis: "col" as const },
      },
    };
  }

  // The Borough header carries a funnel that opens the popover; every other header is
  // just its label. The funnel reflects whether a subset of boroughs is active.
  function columnHeader(field: string): HTMLElement | string {
    const column = COLUMNS.find((c) => c.field === field);
    if (!column) return "";

    const node = document.createElement("div");
    node.style.cssText =
      "display:flex;align-items:center;gap:6px;width:100%;height:100%;" +
      `padding:0 calc(var(--cell-padding-x) * 1px);${column.kind === "money" ? "justify-content:flex-end;" : ""}`;

    const label = document.createElement("span");
    label.textContent = column.label;
    label.style.cssText = "min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    node.appendChild(label);

    if (column.field === BOROUGH_FIELD) {
      const active = boroughFilterActive();
      const funnel = document.createElement("span");
      funnel.dataset.filterField = column.field;
      funnel.style.cssText = `display:inline-flex;flex-shrink:0;cursor:pointer;opacity:${active ? "1" : "0.5"};`;
      funnel.innerHTML = funnelIcon(active);
      node.appendChild(funnel);
    }
    return node;
  }
}

/* ===================================== utils ===================================== */

interface Palette {
  bg: string;
  text: string;
  border: string;
  hover: string;
  accent: string;
}

function palette(): Palette {
  const dark = resolveGridTheme() === "dark";
  return dark
    ? { bg: "rgba(28,28,32,0.72)", text: "#f2f2f5", border: "rgba(255,255,255,0.14)", hover: "rgba(255,255,255,0.08)", accent: "#5b9dff" }
    : { bg: "rgba(255,255,255,0.72)", text: "#1c1c22", border: "rgba(0,0,0,0.1)", hover: "rgba(0,0,0,0.05)", accent: "#2f6fed" };
}

function quickButton(text: string, p: Palette, onClick: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  button.style.cssText =
    "flex:1;padding:5px 8px;border-radius:7px;cursor:pointer;font:inherit;font-size:11.5px;" +
    `color:${p.text};background:transparent;border:1px solid ${p.border};`;
  hover(button, p.hover, "transparent");
  button.addEventListener("click", onClick);
  return button;
}

function hover(node: HTMLElement, on: string, off: string): void {
  node.addEventListener("pointerenter", () => (node.style.background = on));
  node.addEventListener("pointerleave", () => (node.style.background = off));
}

function funnelIcon(active: boolean): string {
  return `<svg width="12" height="12" viewBox="0 0 12 12" style="display:block"><path d="M1 2 H11 L7 6.5 V10 L5 11 V6.5 Z" fill="${active ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/></svg>`;
}

const moneyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function formatMoney(value: unknown): string {
  return typeof value === "number" ? moneyFormatter.format(value) : "";
}

const rightAlignValue: CellRenderer<string> = (data, _dataCtx, ctx: RendererContext) => {
  const cell = ctx.container;
  cell.style.justifyContent = "flex-end";
  cell.style.padding = "calc(var(--cell-padding-y) * 1px) calc(var(--cell-padding-x) * 1px)";
  cell.style.fontVariantNumeric = "tabular-nums";
  return data == null ? "" : String(data);
};
