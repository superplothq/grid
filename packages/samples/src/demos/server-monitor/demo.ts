import { scaleLinear } from "d3-scale";
import { area, curveCatmullRom, line } from "d3-shape";
import Grid, { FlattenedDataViewModel, PVerticalFixture, registerTheme } from "@superplot/grid/renderer";
import type {
  BaseFixtureViewModel,
  BaseSliceResult,
  BaseViewModel,
  CellRenderer,
  ColAutoSizeConfig,
  FacetCellRenderer,
  FacetHeaderContext,
  GridDataViewModel,
  Theme,
  ValueCellDataContext,
} from "@superplot/grid/renderer";
import type { FlattenedDataViewModelParams } from "@superplot/grid/renderer/flattened-data-viewmodel";
import { syncCustomGridTheme } from "../../runtime/theme";
import type { GridThemeName } from "../../runtime/theme";
import { createTickRandom, generateServers, HISTORY_LEN, STATUSES, tickServers } from "./data";
import type { Server, Status } from "./data";

// A realtime infrastructure monitor with a terminal / developer aesthetic. A fleet
// of hosts ticks live once a second: numeric metrics random-walk, a momentum-driven
// d3 area sparkline shifts new CPU points in, and Status re-derives from the fresh
// metrics. A right-hand column panel drives the layout - show/hide, drag-reorder,
// and left/right pinning - and every data-column header carries a filter funnel
// (text / number / status) plus a sort caret on the measures. Left- and
// right-pinned columns are rendered by pinned PVerticalFixtures.
//
// Self-contained: generate data -> build viewmodel params -> one long-lived
// viewmodel updated in place. No DataSource / DataModel. Ships its own light+dark
// Gruvbox theme pair (monospace, compact) that follows the page theme.

const GRID_HEIGHT = 560;
const ROW_HEIGHT = 26;
const SVGNS = "http://www.w3.org/2000/svg";
const SURFACE = "var(--value-background-color)";
const SPARK_W = 118;
const CELL_PAD = 10;
const MONO = "\"SF Mono\", \"JetBrains Mono\", \"Fira Code\", ui-monospace, Menlo, Consolas, \"Liberation Mono\", monospace";

// Column sizing: never "static" (kills horizontal scroll). Fixed "clamped-width"
// (min == max) pins each column to a known px width. Deterministic widths matter
// here because the grid derives its scrollable width from the *measured leaf
// header* of each column (data cells are never measured); pinning both header and
// data to the same width keeps that bookkeeping exact, so the last column stays
// fully reachable when a pinned column is unpinned into the main region.
const pin = (px: number): ColAutoSizeConfig => ({ strategy: "clamped-width", minWidthInPx: px, maxWidthInPx: px });

/* ===================================== theme ===================================== */

// Gruvbox theme pair. Monospace throughout, compact padding, near-invisible column
// (vertical) borders, and prominent gruvbox-blue row (horizontal) borders.
const gruvboxLight: Theme = {
  cellPaddingY: 3,
  cellPaddingX: 10,
  fontFamily: MONO,
  verticalBorderWidth: 1,
  verticalBorderColor: "rgba(60,56,54,0.06)",
  horizontalBorderWidth: 1,
  horizontalBorderColor: "rgba(69,133,136,0.34)",
  fontSize: 12,
  fontWeight: "normal",
  columnFacetBackgroundColor: "#efece3",
  columnFacetFontWeight: 600,
  columnFacetTextColor: "#6a6459",
  rowFacetBackgroundColor: "#efece3",
  valueTextColor: "#3a3733",
  valueBackgroundColor: "#f9f8f4",
  facetHeaderBackgroundColor: "#efece3",
  facetHeaderFontColor: "#8a857a",
  facetHeaderFontSize: 11,
  facetHeaderFontWeight: 600,
  dataLeftBorderWidth: 1,
  dataLeftBorderColor: "rgba(60,56,54,0.11)",
  dataTopBorderWidth: 1,
  dataTopBorderColor: "rgba(69,133,136,0.42)",
  errOverlayBackgroundColor: "rgba(249,248,244,0.92)",
  errOverlayTextColor: "#cc241d",
};

const gruvboxDark: Theme = {
  cellPaddingY: 3,
  cellPaddingX: 10,
  fontFamily: MONO,
  verticalBorderWidth: 1,
  verticalBorderColor: "rgba(235,219,178,0.05)",
  horizontalBorderWidth: 1,
  horizontalBorderColor: "rgba(131,165,152,0.32)",
  fontSize: 12,
  fontWeight: "normal",
  columnFacetBackgroundColor: "#3c3836",
  columnFacetFontWeight: 600,
  columnFacetTextColor: "#bdae93",
  rowFacetBackgroundColor: "#32302f",
  valueTextColor: "#ebdbb2",
  valueBackgroundColor: "#282828",
  facetHeaderBackgroundColor: "#3c3836",
  facetHeaderFontColor: "#928374",
  facetHeaderFontSize: 11,
  facetHeaderFontWeight: 600,
  dataLeftBorderWidth: 1,
  dataLeftBorderColor: "rgba(235,219,178,0.1)",
  dataTopBorderWidth: 1,
  dataTopBorderColor: "rgba(131,165,152,0.4)",
  errOverlayBackgroundColor: "rgba(40,40,40,0.92)",
  errOverlayTextColor: "#fb4934",
};

registerTheme("linear-light", gruvboxLight);
registerTheme("linear-dark", gruvboxDark);

// Semantic heat / status colours (per mode) and the chrome palette. currentMode is
// updated by the theme sync and read live by cell renderers on the next draw.
let currentMode: GridThemeName = "light";

const PALETTES = {
  light: { green: "#98971a", blue: "#458588", amber: "#d79921", red: "#cc241d", gray: "#7c6f64", indigo: "#b16286", spark: "#98971a" },
  dark: { green: "#b8bb26", blue: "#83a598", amber: "#fabd2f", red: "#fb4934", gray: "#928374", indigo: "#d3869b", spark: "#b8bb26" },
} as const;

const CHROME = {
  light: { panel: "#f9f8f4", border: "rgba(60,56,54,0.12)", text: "#3a3733", muted: "#8a857a", accent: "#458588", onAccent: "#f9f8f4", hover: "rgba(60,56,54,0.045)", chip: "rgba(60,56,54,0.06)", rail: "#efece3" },
  dark: { panel: "#282828", border: "rgba(235,219,178,0.12)", text: "#ebdbb2", muted: "#928374", accent: "#83a598", onAccent: "#282828", hover: "rgba(235,219,178,0.05)", chip: "rgba(235,219,178,0.07)", rail: "#32302f" },
} as const;

const palette = (): (typeof PALETTES)[GridThemeName] => PALETTES[currentMode];

function applyChromeVars(host: HTMLElement, mode: GridThemeName): void {
  const c = CHROME[mode];
  for (const [k, v] of Object.entries(c)) host.style.setProperty(`--sm-${k}`, v);
}

/* ===================================== columns ===================================== */

interface ColumnDef {
  key: string;
  label: string;
  group?: string;
  filter: "text" | "number" | "status" | null;
  sortable: boolean;
  width: number; // fixed px width (main track and pinned fixture)
  renderer: CellRenderer<Server>;
  value?: (s: Server) => number;
  text?: (s: Server) => string;
}

const GROUP = "Performance Metrics";

const COLUMNS: ColumnDef[] = [
  { key: "id", label: "Server ID", filter: "text", sortable: false, width: 146, text: (s) => s.id, renderer: textCell((s) => s.id, { mono: true }) },
  { key: "name", label: "Name", filter: "text", sortable: false, width: 210, text: (s) => s.name, renderer: textCell((s) => s.name) },
  { key: "cpuHistory", label: "CPU History", group: GROUP, filter: null, sortable: false, width: 152, renderer: sparkCell() },
  { key: "cpu", label: "CPU %", group: GROUP, filter: "number", sortable: true, width: 108, value: (s) => s.cpu, renderer: numberCell((s) => s.cpu, "pct") },
  { key: "memory", label: "Memory %", group: GROUP, filter: "number", sortable: true, width: 116, value: (s) => s.memory, renderer: numberCell((s) => s.memory, "pct") },
  { key: "disk", label: "Disk %", group: GROUP, filter: "number", sortable: true, width: 104, value: (s) => s.disk, renderer: numberCell((s) => s.disk, "pct") },
  { key: "response", label: "Response (ms)", group: GROUP, filter: "number", sortable: true, width: 128, value: (s) => s.response, renderer: numberCell((s) => s.response, "ms") },
  { key: "status", label: "Status", filter: "status", sortable: false, width: 132, text: (s) => s.status, renderer: statusCell() },
];

const colByKey: Record<string, ColumnDef> = Object.fromEntries(COLUMNS.map((c) => [c.key, c]));

/* ===================================== mount ===================================== */

type SortState = { key: string; dir: "asc" | "desc" } | null;
type Region = "left" | "main" | "right";
type Filter =
  | { type: "text"; op: "contains" | "equals"; value: string }
  | { type: "number"; op: "eq" | "gte" | "lte" | "gt" | "lt"; value: number }
  | { type: "status"; values: Set<Status> };

export function mount(el: HTMLElement): () => void {
  const servers = generateServers(64);
  const tickRand = createTickRandom();

  // Layout state. Default shows both a left- and a right-pinned column so the
  // fixture pinning is visible immediately.
  let leftKeys = ["id"];
  let mainKeys = ["name", "cpuHistory", "cpu", "memory", "disk", "response"];
  let rightKeys = ["status"];
  const hidden = new Set<string>();
  let sortState: SortState = null;
  const filters: Record<string, Filter> = {};
  let currentRows: Server[] = [];
  let paused = false;
  let panelOpen = true;

  // Grid handles (rebuilt when a side's pinned count changes).
  let grid: Grid | undefined;
  let vm: FlattenedDataViewModel | undefined;
  let gridMount: HTMLElement | undefined;
  let disposeTheme: (() => void) | undefined;
  let builtLeftCount = -1;
  let builtRightCount = -1;
  let builtColSig = "";

  const visibleMain = (): ColumnDef[] => mainKeys.filter((k) => !hidden.has(k)).map((k) => colByKey[k]);
  const visibleLeft = (): ColumnDef[] => leftKeys.filter((k) => !hidden.has(k)).map((k) => colByKey[k]);
  const visibleRight = (): ColumnDef[] => rightKeys.filter((k) => !hidden.has(k)).map((k) => colByKey[k]);
  const colSig = (): string => visibleMain().map((c) => c.key).join(",");

  /* ---- chrome ---- */
  applyChromeVars(el, currentMode);
  el.style.cssText =
    `display:flex;flex-direction:column;gap:10px;font:12px/1.4 ${MONO};color:var(--sm-text);` +
    "-webkit-font-smoothing:antialiased;";

  const style = document.createElement("style");
  style.textContent = STYLE_TEXT;
  el.appendChild(style);

  const toolbar = document.createElement("div");
  toolbar.style.cssText = "display:flex;align-items:center;gap:12px;flex-wrap:wrap;";
  const heading = document.createElement("div");
  heading.style.cssText = "display:flex;flex-direction:column;gap:2px;";
  const title = document.createElement("div");
  title.textContent = "~/fleet $ watch metrics";
  title.style.cssText = "font-size:13px;font-weight:700;letter-spacing:0;";
  const subtitle = document.createElement("div");
  subtitle.textContent = `${servers.length} hosts · streaming @ 1s`;
  subtitle.style.cssText = "font-size:11px;color:var(--sm-muted);";
  heading.append(title, subtitle);
  const spacer = document.createElement("div");
  spacer.style.flex = "1";
  const liveBtn = document.createElement("button");
  liveBtn.className = "sm-btn";
  const renderLive = (): void => {
    liveBtn.replaceChildren();
    const dot = document.createElement("span");
    dot.style.cssText =
      `width:8px;height:8px;border-radius:50%;background:${paused ? "var(--sm-muted)" : PALETTES[currentMode].green};` +
      (paused ? "" : "animation:sm-pulse 1.4s ease-in-out infinite;");
    const txt = document.createElement("span");
    txt.textContent = paused ? "paused" : "live · 1s";
    liveBtn.append(dot, txt);
  };
  liveBtn.addEventListener("click", () => {
    paused = !paused;
    renderLive();
  });
  renderLive();
  toolbar.append(heading, spacer, liveBtn);
  el.appendChild(toolbar);

  const workarea = document.createElement("div");
  workarea.style.cssText = `display:flex;align-items:stretch;height:${GRID_HEIGHT}px;`;

  const gridWrap = document.createElement("div");
  gridWrap.style.cssText =
    "position:relative;flex:1;min-width:0;border:1px solid var(--sm-border);border-radius:10px;" +
    "overflow:hidden;background:var(--sm-panel);";

  const panelWrap = document.createElement("div");
  panelWrap.style.cssText = "display:flex;align-items:stretch;margin-left:12px;";
  const panelBody = document.createElement("div");
  panelBody.style.cssText =
    "width:208px;display:flex;flex-direction:column;border:1px solid var(--sm-border);border-radius:10px;" +
    "background:var(--sm-panel);overflow:hidden;";
  const rail = document.createElement("button");
  rail.className = "sm-rail";
  rail.innerHTML = "<span>Columns</span>";
  rail.addEventListener("click", () => {
    panelOpen = !panelOpen;
    panelBody.style.display = panelOpen ? "flex" : "none";
  });
  panelWrap.append(panelBody, rail);

  workarea.append(gridWrap, panelWrap);
  el.appendChild(workarea);

  const popups = createPopupLayer(() => grid?.trackSurfaceContainer);

  /* ---- viewmodel params ---- */
  function buildParams(): FlattenedDataViewModelParams {
    const cols = visibleMain();
    // A group band only renders when all of its visible members form a SINGLE
    // contiguous run. If a reorder splits the group (e.g. Name dragged between the
    // metrics), we'd otherwise get two "Performance Metrics" bands whose sticky
    // labels overlap - so in that case those columns render ungrouped instead.
    const groupIndices = new Map<string, number[]>();
    cols.forEach((c, i) => {
      if (c.group) (groupIndices.get(c.group) ?? groupIndices.set(c.group, []).get(c.group)!).push(i);
    });
    const contiguousGroups = new Set<string>();
    for (const [g, idx] of groupIndices) {
      if (idx[idx.length - 1] - idx[0] + 1 === idx.length) contiguousGroups.add(g);
    }
    // Every column carries its real header at the LEAF level (level1) so the grid
    // measures it; non-grouped (or split-group) columns get an empty band cell
    // above (level0 ""). A column whose header lived only at level0 (rowspan) would
    // never be measured -> wrong scroll width.
    const level0 = cols.map((c) => (c.group && contiguousGroups.has(c.group) ? `grp:${c.group}` : ""));
    const level1 = cols.map((c) => c.key);
    return {
      data: cols.map(() => currentRows),
      columnFacets: [level0, level1],
      totalRows: currentRows.length,
      options: {
        vTrackDefs: cols.map((c) => ({ renderer: c.renderer, colSize: pin(c.width), cellHeight: ROW_HEIGHT })),
        facetDefs: { row: [], col: [{ trackRenderer: level0Renderer }, { trackRenderer: level1Renderer }], axis: "col" },
      },
    };
  }

  /* ---- header renderers (shared by main facets and pinned fixtures) ---- */
  const level0Renderer: FacetCellRenderer = (value) => {
    // Top band level: only the "Performance Metrics" group draws here; non-grouped
    // columns (value "") leave this cell blank. Every real header is at the leaf.
    if (!value || !value.startsWith("grp:")) return "";
    const band = document.createElement("div");
    band.textContent = value.slice(4);
    band.style.cssText = "display:flex;align-items:center;width:100%;height:100%;padding:0 12px;font-weight:600;";
    return band;
  };

  const level1Renderer: FacetCellRenderer = (value) => {
    if (!value) return "";
    const col = colByKey[value];
    if (!col) return "";
    return buildHeader(col);
  };

  function buildHeader(col: ColumnDef): HTMLElement {
    const node = document.createElement("div");
    node.style.cssText = `display:flex;align-items:center;gap:6px;width:100%;height:100%;padding:0 ${CELL_PAD}px;box-sizing:border-box;`;
    const label = document.createElement("span");
    label.textContent = col.label;
    label.style.cssText = "flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
    node.appendChild(label);

    if (col.sortable) {
      node.dataset.sortKey = col.key;
      node.style.cursor = "pointer";
      const dir = sortState && sortState.key === col.key ? sortState.dir : null;
      const caret = document.createElement("span");
      caret.textContent = dir === "asc" ? "↑" : dir === "desc" ? "↓" : "↕";
      caret.style.cssText = `font-size:11px;line-height:1;opacity:${dir ? "1" : "0.4"};${dir ? "color:var(--sm-accent);" : ""}`;
      node.appendChild(caret);
    }
    if (col.filter) {
      const active = !!filters[col.key];
      const btn = document.createElement("button");
      btn.dataset.filterKey = col.key;
      btn.setAttribute("aria-label", `Filter ${col.label}`);
      btn.innerHTML = funnelIcon(active);
      btn.style.cssText =
        "display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:none;" +
        `border-radius:5px;background:transparent;cursor:pointer;color:${active ? "var(--sm-accent)" : "currentColor"};opacity:${active ? "1" : "0.5"};`;
      node.appendChild(btn);
    }
    return node;
  }

  /* ---- render a value into a fixture cell using the column's renderer ---- */
  function applyRenderer(cell: HTMLElement, col: ColumnDef, server: Server, rowIndex: number, viewModel: GridDataViewModel): void {
    const dataCtx = { viewModel, rowIndex, colIndex: -1, rawValue: server } as unknown as ValueCellDataContext;
    const out = col.renderer(server, dataCtx, { container: cell, key: cell.dataset.key ?? "" });
    if (out == null) return;
    if (typeof out === "string") cell.appendChild(document.createTextNode(out));
    else if (Array.isArray(out)) cell.append(...out);
    else cell.appendChild(out);
  }

  /* ---- pinned-column fixtures ---- */
  function makeFixture(side: "left" | "right", slot: number): new (...a: ConstructorParameters<typeof PVerticalFixture>) => PVerticalFixture {
    const colsForSide = side === "left" ? visibleLeft : visibleRight;
    // Draw the column vline on the side facing the data, so it continues across the
    // pinned fixture columns (the grid only borders the scrolling cells).
    const vBorderSide = side === "left" ? "border-right" : "border-left";
    return class extends PVerticalFixture {
      viewModelKey(): string {
        return `${side}-${slot}`;
      }
      headerCell(ctx: FacetHeaderContext): HTMLElement {
        const col = colsForSide()[slot];
        ctx.cell.style.minWidth = ctx.cell.style.maxWidth = `${col.width}px`;
        ctx.cell.style.setProperty(vBorderSide, "1px solid var(--vertical-border-color)");
        return buildHeader(col);
      }
      getCellsToRender(viewModel: BaseViewModel, fixtureViewModel: BaseFixtureViewModel, sliceData: BaseSliceResult): { nodesToAppend: HTMLElement[] } {
        const nodesToAppend: HTMLElement[] = [];
        const col = colsForSide()[slot];
        const numColFacetLevels = this.data!.numColFacetLevels;
        const { offset, track, suggestedCls } = fixtureViewModel;
        const n = sliceData.sliceNumRows;
        for (let j = 0; j < n; j++) {
          const server = currentRows[viewModel.y0 + j];
          if (!server) continue;
          const absRow = viewModel.y0 + j;
          const key = `${side}-${slot}-${absRow}`;
          const [cell, needAppend, contentDirty] = this.placeCellInDom({
            key,
            gridRow: numColFacetLevels + j + 1,
            gridCol: track,
            cls: ["data", ...suggestedCls],
            extraStyles: side === "left" ? { left: offset, minWidth: col.width, maxWidth: col.width } : { minWidth: col.width, maxWidth: col.width },
          });
          if (contentDirty) {
            cell.replaceChildren();
            cell.style.background = SURFACE;
            cell.style.minWidth = cell.style.maxWidth = `${col.width}px`;
            cell.style.setProperty(vBorderSide, "1px solid var(--vertical-border-color)");
            // The grid CSS forces `border-top: none` on fixture cells, so the row
            // (horizontal) rule stops at the pinned columns. Re-add it inline (skip
            // the top visible row, matching the .row-first data cells).
            cell.style.setProperty("border-top", j > 0 ? "1px solid var(--horizontal-border-color)" : "none");
            applyRenderer(cell, col, server, viewModel.y0 + j, this.data!);
            cell.dataset.cellType = "value";
            cell.dataset.row = String(absRow);
          }
          needAppend && nodesToAppend.push(cell);
        }
        return { nodesToAppend };
      }
    };
  }

  /* ---- grid lifecycle ---- */
  function onGridPointerDown(e: PointerEvent): void {
    const t = e.target as HTMLElement;
    const filterEl = t.closest?.<HTMLElement>("[data-filter-key]");
    if (filterEl) {
      e.preventDefault();
      openFilterPopup(filterEl.dataset.filterKey!, filterEl);
      return;
    }
    const sortEl = t.closest?.<HTMLElement>("[data-sort-key]");
    if (sortEl) toggleSort(sortEl.dataset.sortKey!);
  }

  function buildGrid(): void {
    disposeTheme?.();
    gridMount?.removeEventListener("pointerdown", onGridPointerDown);
    gridWrap.replaceChildren();

    gridMount = document.createElement("div");
    gridMount.style.cssText = "position:absolute;inset:0;overflow:auto;";
    gridWrap.appendChild(gridMount);

    const leftFx = visibleLeft().map((_, i) => makeFixture("left", i));
    const rightFx = visibleRight().map((_, i) => makeFixture("right", i));
    grid = new Grid(
      { defaultCellHeight: ROW_HEIGHT, enableResizeUI: false, hoverEffect: "none", fixtures: { top: [], left: leftFx, bottom: [], right: rightFx } },
      gridMount,
      "flat",
    );
    disposeTheme = syncCustomGridTheme(grid, "linear-light", "linear-dark", (mode) => {
      currentMode = mode;
      applyChromeVars(el, mode);
      renderLive();
      if (grid?.data) grid.draw();
    });
    gridMount.addEventListener("pointerdown", onGridPointerDown);

    vm = new FlattenedDataViewModel(buildParams());
    grid.data = vm;
    grid.draw();
    builtLeftCount = leftFx.length;
    builtRightCount = rightFx.length;
    builtColSig = colSig();
  }

  // Structural render: rebuild the grid if a pinned side's count changed, else
  // swap the viewmodel (column set changed) or update it in place (rows changed).
  function render(): void {
    currentRows = computeRows();
    // Any change to the column set (pinned counts or main columns/order) rebuilds the
    // grid from scratch, so no stale header cells (e.g. a solo column's rowspan cell)
    // survive to misalign the group band. Row-only changes (sort/filter) update in place.
    if (
      !grid ||
      visibleLeft().length !== builtLeftCount ||
      visibleRight().length !== builtRightCount ||
      colSig() !== builtColSig
    ) {
      buildGrid();
      return;
    }
    vm!.updateData(buildParams());
    grid.data = vm!;
    grid.draw();
  }

  function computeRows(): Server[] {
    let rows = servers.filter(passesFilters);
    if (sortState) {
      const col = colByKey[sortState.key];
      const dir = sortState.dir === "asc" ? 1 : -1;
      rows = rows.slice().sort((a, b) => (col.value!(a) - col.value!(b)) * dir);
    }
    return rows;
  }

  function passesFilters(s: Server): boolean {
    for (const key of Object.keys(filters)) {
      const f = filters[key];
      const col = colByKey[key];
      if (f.type === "text") {
        const v = (col.text?.(s) ?? "").toLowerCase();
        const q = f.value.toLowerCase();
        if (f.op === "contains" ? !v.includes(q) : v !== q) return false;
      } else if (f.type === "number") {
        const v = col.value!(s);
        const ok =
          f.op === "eq" ? Math.abs(v - f.value) < 0.5 :
            f.op === "gte" ? v >= f.value :
              f.op === "lte" ? v <= f.value :
                f.op === "gt" ? v > f.value :
                  v < f.value;
        if (!ok) return false;
      } else if (f.type === "status") {
        if (!f.values.has(s.status)) return false;
      }
    }
    return true;
  }

  function toggleSort(key: string): void {
    if (!sortState || sortState.key !== key) sortState = { key, dir: "asc" };
    else if (sortState.dir === "asc") sortState = { key, dir: "desc" };
    else sortState = null;
    render();
  }

  /* ---- filter popups ---- */
  function openFilterPopup(key: string, anchor: HTMLElement): void {
    const col = colByKey[key];
    const box = document.createElement("div");
    box.style.cssText = popupBoxCss() + "width:230px;padding:10px;display:flex;flex-direction:column;gap:8px;";
    const heading = document.createElement("div");
    heading.textContent = col.label;
    heading.style.cssText = "font-size:12px;font-weight:600;color:var(--sm-muted);";
    box.appendChild(heading);

    if (col.filter === "text") buildTextFilter(box, col);
    else if (col.filter === "number") buildNumberFilter(box, col);
    else if (col.filter === "status") buildStatusFilter(box, col);

    popups.open(box, anchor);
  }

  function filterActions(box: HTMLElement, onApply: () => void, hasExisting: boolean): void {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px;margin-top:2px;";
    const apply = document.createElement("button");
    apply.className = "sm-btn sm-btn-primary";
    apply.textContent = "Apply";
    apply.style.flex = "1";
    apply.addEventListener("click", () => {
      onApply();
      popups.close();
      render();
    });
    row.appendChild(apply);
    if (hasExisting) {
      const clear = document.createElement("button");
      clear.className = "sm-btn";
      clear.textContent = "Clear";
      clear.addEventListener("click", () => {
        popups.close();
        render();
      });
      row.appendChild(clear);
    }
    box.appendChild(row);
  }

  function buildTextFilter(box: HTMLElement, col: ColumnDef): void {
    const existing = filters[col.key];
    const sel = document.createElement("select");
    sel.className = "sm-input";
    for (const [v, t] of [["contains", "Contains"], ["equals", "Equals"]] as const) {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = t;
      sel.appendChild(o);
    }
    if (existing?.type === "text") sel.value = existing.op;
    const input = document.createElement("input");
    input.className = "sm-input";
    input.placeholder = "Filter…";
    input.value = existing?.type === "text" ? existing.value : "";
    box.append(sel, input);
    filterActions(box, () => {
      const value = input.value.trim();
      if (value) filters[col.key] = { type: "text", op: sel.value as "contains" | "equals", value };
      else delete filters[col.key];
    }, !!existing);
    setTimeout(() => input.focus(), 0);
  }

  function buildNumberFilter(box: HTMLElement, col: ColumnDef): void {
    const existing = filters[col.key];
    const sel = document.createElement("select");
    sel.className = "sm-input";
    for (const [v, t] of [["eq", "Equals"], ["gte", "≥"], ["lte", "≤"], ["gt", ">"], ["lt", "<"]] as const) {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = t;
      sel.appendChild(o);
    }
    if (existing?.type === "number") sel.value = existing.op;
    const input = document.createElement("input");
    input.className = "sm-input";
    input.type = "number";
    input.placeholder = "Enter number…";
    input.value = existing?.type === "number" ? String(existing.value) : "";
    box.append(sel, input);
    filterActions(box, () => {
      const value = parseFloat(input.value);
      if (Number.isFinite(value)) filters[col.key] = { type: "number", op: sel.value as "eq" | "gte" | "lte" | "gt" | "lt", value };
      else delete filters[col.key];
    }, !!existing);
    setTimeout(() => input.focus(), 0);
  }

  function buildStatusFilter(box: HTMLElement, col: ColumnDef): void {
    const existing = filters[col.key];
    const selected = new Set<Status>(existing?.type === "status" ? existing.values : STATUSES);
    const boxes: Array<{ status: Status; input: HTMLInputElement }> = [];

    const allRow = statusRow("Select All", selected.size === STATUSES.length, selected.size > 0 && selected.size < STATUSES.length);
    allRow.wrap.style.borderBottom = "1px solid var(--sm-border)";
    allRow.wrap.style.paddingBottom = "6px";
    allRow.input.addEventListener("change", () => {
      for (const b of boxes) {
        b.input.checked = allRow.input.checked;
        if (allRow.input.checked) selected.add(b.status);
        else selected.delete(b.status);
      }
    });
    box.appendChild(allRow.wrap);

    for (const status of STATUSES) {
      const row = statusRow(status, selected.has(status), false);
      row.input.addEventListener("change", () => {
        if (row.input.checked) selected.add(status);
        else selected.delete(status);
        allRow.input.checked = selected.size === STATUSES.length;
        allRow.input.indeterminate = selected.size > 0 && selected.size < STATUSES.length;
      });
      boxes.push({ status, input: row.input });
      box.appendChild(row.wrap);
    }

    filterActions(box, () => {
      if (selected.size === 0 || selected.size === STATUSES.length) delete filters[col.key];
      else filters[col.key] = { type: "status", values: new Set(selected) };
    }, !!existing);
  }

  function statusRow(label: string, checked: boolean, indeterminate: boolean): { wrap: HTMLElement; input: HTMLInputElement } {
    const wrap = document.createElement("label");
    wrap.style.cssText = "display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = checked;
    input.indeterminate = indeterminate;
    input.style.accentColor = "var(--sm-accent)";
    const span = document.createElement("span");
    span.textContent = label;
    wrap.append(input, span);
    return { wrap, input };
  }

  /* ---- column panel ---- */
  const search = document.createElement("input");
  search.className = "sm-input";
  search.placeholder = "Search columns…";
  search.style.margin = "10px 10px 6px";
  let searchTerm = "";
  search.addEventListener("input", () => {
    searchTerm = search.value.trim().toLowerCase();
    renderList();
  });

  const listWrap = document.createElement("div");
  listWrap.style.cssText = "flex:1;overflow:auto;padding:0 6px;";

  const footer = document.createElement("div");
  footer.style.cssText = "padding:8px 10px;border-top:1px solid var(--sm-border);";
  const resetBtn = document.createElement("button");
  resetBtn.className = "sm-btn";
  resetBtn.textContent = "Reset columns";
  resetBtn.style.width = "100%";
  resetBtn.addEventListener("click", () => {
    leftKeys = ["id"];
    mainKeys = ["name", "cpuHistory", "cpu", "memory", "disk", "response"];
    rightKeys = ["status"];
    hidden.clear();
    for (const k of Object.keys(filters)) delete filters[k];
    sortState = null;
    popups.close();
    render();
    renderList();
  });
  footer.appendChild(resetBtn);

  const panelHead = document.createElement("div");
  panelHead.style.cssText = "padding:12px 12px 2px;font-size:13px;font-weight:650;";
  panelHead.textContent = "Layout";
  panelBody.append(panelHead, search, listWrap, footer);

  let dragKey: string | null = null;

  const listFor = (region: Region): string[] => (region === "left" ? leftKeys : region === "right" ? rightKeys : mainKeys);
  function removeFromAll(key: string): void {
    for (const list of [leftKeys, mainKeys, rightKeys]) {
      const i = list.indexOf(key);
      if (i >= 0) list.splice(i, 1);
    }
  }
  function setRegion(key: string, region: Region): void {
    removeFromAll(key);
    listFor(region).push(key);
    render();
    renderList();
  }
  function dropBeforeKey(region: Region, beforeKey: string | null): void {
    if (!dragKey) return;
    removeFromAll(dragKey);
    const list = listFor(region);
    const idx = beforeKey == null ? list.length : Math.max(0, list.indexOf(beforeKey));
    list.splice(idx, 0, dragKey);
    render();
    renderList();
  }

  function renderList(): void {
    listWrap.replaceChildren();
    const sections: Array<{ region: Region; label: string; keys: string[] }> = [
      { region: "left", label: "Pinned left", keys: leftKeys },
      { region: "main", label: "Main", keys: mainKeys },
      { region: "right", label: "Pinned right", keys: rightKeys },
    ];
    for (const section of sections) {
      const shown = section.keys.filter((k) => !searchTerm || colByKey[k].label.toLowerCase().includes(searchTerm));
      if (section.region !== "main" && shown.length === 0) continue;

      const header = document.createElement("div");
      header.textContent = section.label.toUpperCase();
      header.style.cssText = "padding:10px 8px 4px;font-size:10px;font-weight:700;letter-spacing:0.06em;color:var(--sm-muted);";
      listWrap.appendChild(header);

      const listEl = document.createElement("div");
      listEl.dataset.region = section.region;
      listEl.style.cssText = "display:flex;flex-direction:column;gap:2px;min-height:6px;";
      listEl.addEventListener("dragover", (e) => e.preventDefault());
      listEl.addEventListener("drop", (e) => {
        e.preventDefault();
        dropBeforeKey(section.region, dropTarget(listEl, e.clientY));
      });
      for (const key of shown) listEl.appendChild(panelItem(key, section.region));
      listWrap.appendChild(listEl);
    }
  }

  function dropTarget(listEl: HTMLElement, y: number): string | null {
    for (const child of Array.from(listEl.children) as HTMLElement[]) {
      const r = child.getBoundingClientRect();
      if (y < r.top + r.height / 2) return child.dataset.key ?? null;
    }
    return null;
  }

  function panelItem(key: string, region: Region): HTMLElement {
    const col = colByKey[key];
    const row = document.createElement("div");
    row.className = "sm-item";
    row.dataset.key = key;
    row.draggable = true;
    row.addEventListener("dragstart", () => {
      dragKey = key;
      row.classList.add("sm-dragging");
    });
    row.addEventListener("dragend", () => {
      dragKey = null;
      row.classList.remove("sm-dragging");
    });

    const grip = document.createElement("span");
    grip.className = "sm-grip";
    grip.innerHTML = GRIP_ICON;
    grip.style.cursor = "grab";

    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = !hidden.has(key);
    check.style.accentColor = "var(--sm-accent)";
    check.addEventListener("change", () => {
      if (check.checked) hidden.delete(key);
      else hidden.add(key);
      render();
      renderList();
    });

    const label = document.createElement("span");
    label.textContent = col.label;
    label.style.cssText = "flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";

    const pinL = pinBtn("L", region === "left");
    pinL.addEventListener("click", () => setRegion(key, region === "left" ? "main" : "left"));
    const pinR = pinBtn("R", region === "right");
    pinR.addEventListener("click", () => setRegion(key, region === "right" ? "main" : "right"));

    row.append(grip, check, label, pinL, pinR);
    return row;
  }

  /* ---- boot ---- */
  currentRows = computeRows();
  buildGrid();
  renderList();

  const timer = setInterval(() => {
    if (paused) return;
    tickServers(servers, tickRand);
    if (grid?.data) grid.draw();
  }, 1000);

  return () => {
    clearInterval(timer);
    disposeTheme?.();
    popups.dispose();
    gridMount?.removeEventListener("pointerdown", onGridPointerDown);
    el.replaceChildren();
  };
}

/* ===================================== utils ===================================== */

// Smooth (Catmull-Rom spline) area + line paths for the CPU sparkline. Drawn in a
// fixed SPARK_W x h coordinate space; the SVG stretches to the column width. The x
// domain is fixed to the full window (not values.length), so while the buffer is
// still filling the points keep a stable spacing instead of rescaling every tick.
function sparkPaths(values: number[], h: number): { area: string; line: string } {
  if (values.length < 2) return { area: "", line: "" };
  const x = scaleLinear().domain([0, HISTORY_LEN - 1]).range([0, SPARK_W]);
  const y = scaleLinear().domain([0, 100]).range([h - 2, 2]);
  const curve = curveCatmullRom.alpha(0.5);
  const areaGen = area<number>().x((_d, i) => x(i)).y0(h).y1((d) => y(d)).curve(curve);
  const lineGen = line<number>().x((_d, i) => x(i)).y((d) => y(d)).curve(curve);
  return { area: areaGen(values) ?? "", line: lineGen(values) ?? "" };
}

function textCell(get: (s: Server) => string, opts: { mono?: boolean } = {}): CellRenderer<Server> {
  return (s, _d, ctx) => {
    ctx.container.style.justifyContent = "flex-start";
    ctx.container.style.padding = `0 ${CELL_PAD}px`;
    ctx.container.style.overflow = "hidden";
    const span = document.createElement("span");
    span.textContent = get(s);
    span.style.cssText =
      "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" +
      (opts.mono ? "font-variant-numeric:tabular-nums;letter-spacing:0.01em;color:var(--sm-muted);" : "");
    return span;
  };
}

// Numbers: a severity dot pinned to the LEFT edge, the value bold on the RIGHT.
// The dot always carries the heat colour, but the value text only takes the colour
// when it's warning/critical - healthy values stay the normal text colour so the
// grid isn't a wall of green.
function numberCell(get: (s: Server) => number, kind: "pct" | "ms"): CellRenderer<Server> {
  return (s, _d, ctx) => {
    ctx.container.style.justifyContent = "space-between";
    ctx.container.style.padding = `0 ${CELL_PAD}px`;
    const v = get(s);
    const p = palette();
    const crit = kind === "pct" ? v >= 85 : v >= 400;
    const warn = kind === "pct" ? v >= 70 : v >= 200;
    const color = crit ? p.red : warn ? p.amber : p.green;
    const dot = document.createElement("span");
    dot.style.cssText = `width:6px;height:6px;border-radius:50%;background:${color};flex:none;`;
    const text = document.createElement("span");
    text.textContent = kind === "pct" ? `${v.toFixed(1)}%` : v.toFixed(1);
    text.style.cssText = `font-weight:700;font-variant-numeric:tabular-nums;${crit || warn ? `color:${color};` : ""}`;
    return [dot, text];
  };
}

// Status: a solid rounded-rect swatch + the label in that colour, bold.
function statusCell(): CellRenderer<Server> {
  return (s, _d, ctx) => {
    ctx.container.style.justifyContent = "flex-start";
    ctx.container.style.paddingLeft = `${CELL_PAD}px`;
    const color = statusColor(s.status);
    const wrap = document.createElement("span");
    wrap.style.cssText = "display:inline-flex;align-items:center;gap:7px;";
    const swatch = document.createElement("span");
    swatch.style.cssText = `width:9px;height:9px;border-radius:3px;background:${color};flex:none;`;
    const text = document.createElement("span");
    text.textContent = s.status;
    text.style.cssText = `color:${color};font-weight:700;`;
    wrap.append(swatch, text);
    return wrap;
  };
}

function sparkCell(): CellRenderer<Server> {
  return (s, _d, ctx) => {
    ctx.container.style.justifyContent = "center";
    ctx.container.style.padding = "3px 10px";
    const stroke = palette().spark;
    const h = ROW_HEIGHT - 8;
    const { area: areaD, line: lineD } = sparkPaths(s.cpuHistory, h);
    const svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("height", String(h));
    svg.setAttribute("viewBox", `0 0 ${SPARK_W} ${h}`);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.style.cssText = "display:block;width:100%;height:100%;overflow:visible;";
    const fill = document.createElementNS(SVGNS, "path");
    fill.setAttribute("d", areaD);
    fill.setAttribute("fill", `color-mix(in srgb, ${stroke} 16%, transparent)`);
    fill.setAttribute("stroke", "none");
    const stroked = document.createElementNS(SVGNS, "path");
    stroked.setAttribute("d", lineD);
    stroked.setAttribute("fill", "none");
    stroked.setAttribute("stroke", stroke);
    stroked.setAttribute("stroke-width", "1.5");
    stroked.setAttribute("vector-effect", "non-scaling-stroke");
    stroked.setAttribute("stroke-linejoin", "round");
    stroked.setAttribute("stroke-linecap", "round");
    svg.append(fill, stroked);
    // replaceChildren, not appendChild: this renderer returns void (the grid won't
    // clear the cell for us), so appending would stack a new SVG over the old one
    // every redraw - the "old array + new array" overlap.
    ctx.container.replaceChildren(svg);
  };
}

function statusColor(status: Status): string {
  const p = palette();
  const map: Record<Status, string> = { Online: p.green, Warning: p.amber, Critical: p.red, Maintenance: p.blue, Offline: p.gray };
  return map[status];
}

function pinBtn(text: string, active: boolean): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = "sm-pin" + (active ? " sm-pin-on" : "");
  btn.textContent = text;
  btn.title = active ? "Unpin" : text === "L" ? "Pin left" : "Pin right";
  return btn;
}

// Body-mounted popup layer (one at a time), so grid redraws that recycle header
// cells never remove an open popup.
function createPopupLayer(themeSource: () => HTMLElement | undefined): { open: (n: HTMLElement, a: HTMLElement) => void; close: () => void; dispose: () => void } {
  let current: HTMLElement | null = null;
  const close = (): void => {
    if (current) {
      current.remove();
      current = null;
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      document.removeEventListener("pointerdown", onOutside, true);
    }
  };
  const onOutside = (e: PointerEvent): void => {
    if (current && !current.contains(e.target as Node)) close();
  };
  const open = (node: HTMLElement, anchor: HTMLElement): void => {
    close();
    const r = anchor.getBoundingClientRect();
    node.style.position = "fixed";
    node.style.zIndex = "9999";
    node.style.top = `${Math.round(r.bottom + 6)}px`;
    node.style.left = `${Math.round(Math.min(r.left, window.innerWidth - 250))}px`;
    const src = themeSource();
    const surface = src ? getComputedStyle(src).getPropertyValue("--value-background-color").trim() : "";
    node.style.setProperty("--value-background-color", surface || getComputedStyle(document.body).backgroundColor);
    // Body-mounted: the demo's --sm-* chrome vars live on the host element, out of
    // scope here, so republish them on the popup root for both theme modes.
    applyChromeVars(node, currentMode);
    document.body.appendChild(node);
    current = node;
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    setTimeout(() => document.addEventListener("pointerdown", onOutside, true), 0);
  };
  return { open, close, dispose: close };
}

function popupBoxCss(): string {
  return (
    "font:inherit;color:var(--sm-text);border-radius:12px;background:var(--sm-panel);border:1px solid var(--sm-border);" +
    "box-shadow:0 12px 34px rgba(0,0,0,0.22),0 2px 8px rgba(0,0,0,0.12);"
  );
}

function funnelIcon(active: boolean): string {
  return `<svg width="13" height="13" viewBox="0 0 24 24" fill="${active ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h18l-7 8v6l-4 2v-8z"/></svg>`;
}

const GRIP_ICON =
  "<svg width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"currentColor\"><circle cx=\"9\" cy=\"6\" r=\"1.6\"/><circle cx=\"15\" cy=\"6\" r=\"1.6\"/><circle cx=\"9\" cy=\"12\" r=\"1.6\"/><circle cx=\"15\" cy=\"12\" r=\"1.6\"/><circle cx=\"9\" cy=\"18\" r=\"1.6\"/><circle cx=\"15\" cy=\"18\" r=\"1.6\"/></svg>";

const STYLE_TEXT = `
@keyframes sm-pulse { 0%{opacity:1;transform:scale(1)} 50%{opacity:.3;transform:scale(.7)} 100%{opacity:1;transform:scale(1)} }
.sm-btn { display:inline-flex;align-items:center;gap:7px;padding:6px 12px;font:inherit;font-size:12px;font-weight:550;
  color:var(--sm-text);background:var(--sm-panel);border:1px solid var(--sm-border);border-radius:8px;cursor:pointer; }
.sm-btn:hover { background:var(--sm-hover); }
.sm-btn-primary { color:var(--sm-onAccent);background:var(--sm-accent);border-color:transparent; }
.sm-btn-primary:hover { filter:brightness(1.06); }
.sm-input { width:100%;box-sizing:border-box;padding:7px 9px;font:inherit;font-size:13px;color:var(--sm-text);
  background:var(--sm-panel);border:1px solid var(--sm-border);border-radius:7px;outline:none; }
.sm-input:focus { border-color:var(--sm-accent); }
.sm-rail { display:flex;align-items:center;justify-content:center;width:34px;margin-left:8px;padding:0;
  color:var(--sm-muted);background:var(--sm-rail);border:1px solid var(--sm-border);border-radius:10px;cursor:pointer;font:inherit; }
.sm-rail:hover { color:var(--sm-text);background:var(--sm-hover); }
.sm-rail span { writing-mode:vertical-rl;transform:rotate(180deg);font-size:12px;font-weight:600;letter-spacing:0.04em; }
.sm-item { display:flex;align-items:center;gap:7px;padding:5px 6px;border-radius:7px;cursor:default;font-size:12px; }
.sm-item:hover { background:var(--sm-hover); }
.sm-item.sm-dragging { opacity:.4; }
.sm-grip { display:inline-flex;color:var(--sm-muted); }
.sm-pin { width:19px;height:19px;padding:0;font:inherit;font-size:10px;font-weight:600;color:var(--sm-muted);
  background:var(--sm-chip);border:1px solid transparent;border-radius:5px;cursor:pointer; }
.sm-pin:hover { color:var(--sm-text);border-color:var(--sm-border); }
.sm-pin-on { color:var(--sm-onAccent);background:var(--sm-accent); }
`;
