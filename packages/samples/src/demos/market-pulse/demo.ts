import { scaleLinear } from "d3-scale";
import Grid, { FlattenedDataViewModel, createRowMeta } from "grid/dist/renderer";
import type {
  CellRenderer,
  ColAutoSizeConfig,
  FacetCellRenderer,
  FacetDataContext,
  ValueCellMetadata,
} from "grid/dist/renderer";
import type { FlattenedDataViewModelParams } from "grid/dist/renderer/flattened-data-viewmodel";
import { createGridMount } from "../../runtime/mount";
import { syncGridTheme } from "../../runtime/theme";

// A sleek realtime trading blotter. ~130 instruments across four asset classes tick
// live: prices random-walk on an interval, driving in-cell sparklines, a signed
// %-change indicator, and a running P&L. The demo groups by instrument type with
// expandable group headers that show aggregated measures, and supports sort (via a
// header context menu), a value-checkbox filter, drag-to-group, and column resize.
//
// The % change wrt the previous tick is carried through the grid's METADATA layer
// (viewModel.metadata.valueCells): the data cell holds the current value, the
// renderer reads its own colIndex/rowIndex out of metadata to draw the arrow + %.
// Self-contained - no DataSource / DataModel, one long-lived viewmodel updated in
// place via updateData().

const ACCENT = "#3b6ef5"; // sparkline / interactive accent (blue, like the reference)
const UP = "#16a34a";
const DOWN = "#e5484d";
const SURFACE = "var(--value-background-color)";
const HEADER_MUTED = "color-mix(in srgb, currentColor 55%, transparent)";
const HAIRLINE = "color-mix(in srgb, currentColor 14%, transparent)";
const GRID_HEIGHT = 560;
const ROW_HEIGHT = 50;
const GROUP_TINT = `color-mix(in srgb, currentColor 3%, ${SURFACE})`;
const CELL_PAD_X = 14;
const HISTORY = 30; // sparkline points per instrument
// Realtime cadence. Every EPOCH_MS a fresh set of m (<= half the visible rows) rows is
// chosen; those m rows then tick every FAST_MS. A value pill flashes on update and fades
// over FLASH_MS.
const EPOCH_MS = 3000;
const FAST_MS = 300;
const FLASH_MS = 620;
const MIN_ACTIVE = 3; // lower bound on rows updated per epoch (upper bound is n/2)

// metaState namespace: which value column a group is sorted/expanded is view-level and
// kept in demo vars; nothing per-row needs to survive here, so metaState is unused.

// Column sizing: never "static" (that kills horizontal scroll). "clamped-width" with
// equal min/max pins a fixed px width while keeping the scrolling code path.
const pin = (px: number): ColAutoSizeConfig => ({ strategy: "clamped-width", minWidthInPx: px, maxWidthInPx: px });

type SortDir = "asc" | "desc";
type Sort = { key: string; dir: SortDir } | null;

interface Instrument {
  id: string;
  symbol: string;
  name: string;
  type: string;
  quantity: number;
  price: number;
  avatar: string; // hex color for the ticker chip
  history: number[];
  pnl: number;
  prevPnl: number;
  totalValue: number;
  prevTotalValue: number;
}

// One display row = a group header or a leaf. The value renderers read these; the
// group header carries aggregated measures over its (filtered) members.
interface DisplayRow {
  kind: "group" | "leaf";
  id: string;
  // group
  groupKey?: string;
  count?: number;
  expanded?: boolean;
  // leaf
  instrument?: Instrument;
  // measures (aggregated for groups, direct for leaves)
  pnl: number;
  prevPnl: number;
  totalValue: number;
  prevTotalValue: number;
  quantity: number;
}

interface ColumnDef {
  key: string;
  label: string;
  size: ColAutoSizeConfig;
  align?: "left" | "right";
  sortValue?: (r: DisplayRow) => number | string;
  filter?: { values: () => string[]; valueOf: (i: Instrument) => string };
  renderer: CellRenderer<DisplayRow>;
}

export function mount(el: HTMLElement): () => void {
  const instruments = generateInstruments();
  const typeOrder = ["Bond", "ETF", "Crypto", "Stock"];

  /* ---- view state (view-level, plain demo vars) ---- */
  let grouped = true;
  let sort: Sort = null;
  const collapsed = new Set<string>();
  // filters[colKey] = allowed value set; absent = all allowed.
  const filters = new Map<string, Set<string>>();

  let vm: FlattenedDataViewModel | undefined;
  let builtColKeys = ""; // column set the current vm was constructed with
  let displayRows: DisplayRow[] = [];
  let columns: ColumnDef[] = [];

  const byId = new Map(instruments.map((i) => [i.id, i]));
  // The instrument ids currently ticking (a fresh subset of the visible rows each epoch).
  const active = new Set<string>();
  // Per value-cell flash state, keyed `${rowId}|${field}`: when the cell last changed and
  // its direction. The renderer fades a tinted pill out over FLASH_MS from `t`.
  const flash = new Map<string, { t: number; up: boolean }>();

  /* ---- chrome ---- */
  el.style.cssText = "display:flex;flex-direction:column;gap:10px;font:inherit;";
  const groupBar = document.createElement("div");
  const gridMount = createGridMount(el, GRID_HEIGHT);
  gridMount.style.borderRadius = "12px";
  el.append(groupBar, gridMount);

  const grid = new Grid(
    { defaultCellHeight: ROW_HEIGHT, enableResizeUI: true },
    gridMount,
    "flat"
  );
  const disposeTheme = syncGridTheme(grid);

  /* ---- popups (context menu + filter dropdown), body-mounted so grid draws never touch them ---- */
  const popups = createPopupLayer(() => grid.trackSurfaceContainer);

  /* ===== data derivation ===== */

  function distinctTickers(): string[] {
    return [...new Set(instruments.map((i) => i.symbol))].sort();
  }

  function buildColumns(): ColumnDef[] {
    const cols: ColumnDef[] = [];
    cols.push({
      key: "ticker",
      label: "Ticker",
      size: pin(268),
      sortValue: (r) => r.instrument?.symbol ?? "",
      filter: { values: distinctTickers, valueOf: (i) => i.symbol },
      renderer: tickerRenderer,
    });
    cols.push({ key: "timeline", label: "Timeline", size: pin(196), renderer: timelineRenderer });
    if (!grouped) {
      cols.push({
        key: "instrument",
        label: "Instrument",
        size: pin(128),
        sortValue: (r) => r.instrument?.type ?? "",
        filter: { values: () => typeOrder, valueOf: (i) => i.type },
        renderer: instrumentRenderer,
      });
    }
    cols.push({
      key: "pnl",
      label: "P&L",
      size: pin(184),
      align: "right",
      sortValue: (r) => r.pnl,
      renderer: makeDeltaRenderer("pnl", (r) => r.pnl),
    });
    cols.push({
      key: "totalValue",
      label: "Total Value",
      size: pin(200),
      align: "right",
      sortValue: (r) => r.totalValue,
      renderer: makeDeltaRenderer("totalValue", (r) => r.totalValue),
    });
    cols.push({
      key: "quantity",
      label: "Quantity",
      size: pin(120),
      align: "right",
      sortValue: (r) => r.quantity,
      renderer: quantityRenderer,
    });
    return cols;
  }

  function filteredLeaves(pool: Instrument[]): Instrument[] {
    let out = pool;
    for (const [key, allowed] of filters) {
      const col = columns.find((c) => c.key === key);
      if (!col?.filter) continue;
      out = out.filter((i) => allowed.has(col.filter!.valueOf(i)));
    }
    return out;
  }

  function leafRow(i: Instrument): DisplayRow {
    return {
      kind: "leaf",
      id: i.id,
      instrument: i,
      pnl: i.pnl,
      prevPnl: i.prevPnl,
      totalValue: i.totalValue,
      prevTotalValue: i.prevTotalValue,
      quantity: i.quantity,
    };
  }

  function sortLeaves(rows: Instrument[]): Instrument[] {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort!.key);
    if (!col?.sortValue) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = col.sortValue!(leafRow(a));
      const bv = col.sortValue!(leafRow(b));
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return a.symbol < b.symbol ? -dir : dir;
    });
  }

  // Structure (row order) is decided here - on sort / filter / group / expand. Realtime
  // ticks keep this order fixed and only refresh values, so rows never jump under a live
  // feed.
  function buildDisplayRows(): DisplayRow[] {
    const leaves = filteredLeaves(instruments);
    if (!grouped) return sortLeaves(leaves).map(leafRow);

    const rows: DisplayRow[] = [];
    for (const type of typeOrder) {
      const members = leaves.filter((i) => i.type === type);
      if (members.length === 0) continue;
      const isExpanded = !collapsed.has(type);
      rows.push({
        kind: "group",
        id: `grp:${type}`,
        groupKey: type,
        count: members.length,
        expanded: isExpanded,
        pnl: sum(members, (i) => i.pnl),
        prevPnl: sum(members, (i) => i.prevPnl),
        totalValue: sum(members, (i) => i.totalValue),
        prevTotalValue: sum(members, (i) => i.prevTotalValue),
        quantity: sum(members, (i) => i.quantity),
      });
      if (isExpanded) for (const i of sortLeaves(members)) rows.push(leafRow(i));
    }
    return rows;
  }

  // Rebuild the per-row measures from the live instruments while preserving the current
  // row order (used by ticks). Group aggregates are recomputed from their members, so they
  // move whenever any member ticks - hence they update far faster than any single row, and
  // flash on every change (expected: aggregation churns).
  function refreshMeasures(now: number): void {
    for (const r of displayRows) {
      if (r.kind === "leaf") {
        const i = byId.get(r.id)!;
        r.pnl = i.pnl;
        r.prevPnl = i.prevPnl;
        r.totalValue = i.totalValue;
        r.prevTotalValue = i.prevTotalValue;
      } else {
        const members = filteredLeaves(instruments).filter((i) => i.type === r.groupKey);
        r.pnl = sum(members, (i) => i.pnl);
        r.prevPnl = sum(members, (i) => i.prevPnl);
        r.totalValue = sum(members, (i) => i.totalValue);
        r.prevTotalValue = sum(members, (i) => i.prevTotalValue);
        if (Math.abs(r.pnl - r.prevPnl) > 1e-6) flash.set(`${r.id}|pnl`, { t: now, up: r.pnl >= r.prevPnl });
        if (Math.abs(r.totalValue - r.prevTotalValue) > 1e-6)
          flash.set(`${r.id}|totalValue`, { t: now, up: r.totalValue >= r.prevTotalValue });
      }
    }
  }

  // Per-cell % change lives in the metadata layer: for the P&L and Total Value columns,
  // one entry per row keyed by (colIndex,rowIndex). Renderers read it back rather than
  // recomputing, so "% wrt previous value" is a data-derived fact on the viewmodel.
  function buildMetadata(): ValueCellMetadata[] {
    const cells: ValueCellMetadata[] = [];
    const pnlCol = columns.findIndex((c) => c.key === "pnl");
    const tvCol = columns.findIndex((c) => c.key === "totalValue");
    displayRows.forEach((r, rowIndex) => {
      cells.push({ colIndex: pnlCol, rowIndex, meta: { pct: pctChange(r.prevPnl, r.pnl) } });
      cells.push({ colIndex: tvCol, rowIndex, meta: { pct: pctChange(r.prevTotalValue, r.totalValue) } });
    });
    return cells;
  }

  function buildParams(): FlattenedDataViewModelParams {
    const rowFacet: (string | null)[] = displayRows.map((r) => (r.kind === "group" ? r.groupKey! : null));
    const rowMeta = new Uint8Array(
      displayRows.map((r) =>
        r.kind === "group" ? createRowMeta(0, false, r.expanded!) : createRowMeta(1, true, false)
      )
    );
    return {
      data: columns.map(() => displayRows),
      columnFacets: [columns.map((c) => c.key)],
      rowFacet: grouped ? rowFacet : undefined,
      rowMeta: grouped ? rowMeta : undefined,
      totalRows: displayRows.length,
      metadata: { valueCells: buildMetadata() },
      options: {
        vTrackDefs: columns.map((c) => ({ renderer: c.renderer, colSize: c.size, cellHeight: ROW_HEIGHT })),
        facetDefs: {
          row: [{ text: "Group", facetField: "type", trackRenderer: groupFacet, colSize: pin(232) }],
          col: [{ text: "", trackRenderer: header }],
          axis: "col",
        },
      },
    };
  }

  /* ===== render orchestration ===== */

  // Structural change (sort / filter / group toggle / expand): recompute row order, then
  // push into the viewmodel. The viewmodel is reconstructed ONLY when the column set
  // changes (grouped <-> flat swaps the Group facet for the Instrument column, and column
  // options can't be re-applied via updateData); everything else reuses the instance.
  function renderStructure(): void {
    columns = buildColumns();
    displayRows = buildDisplayRows();
    const colKeys = columns.map((c) => c.key).join(",") + (grouped ? "|g" : "|f");
    const params = buildParams();
    if (!vm || colKeys !== builtColKeys) {
      vm = new FlattenedDataViewModel(params);
      builtColKeys = colKeys;
    } else {
      vm.updateData(params);
    }
    grid.data = vm;
    grid.draw();
    renderChrome();
  }

  // Epoch (every EPOCH_MS): choose a fresh active set - m of the currently VISIBLE update
  // units, m in [MIN_ACTIVE, n/2], reselected each epoch. A unit is a visible leaf row OR a
  // visible COLLAPSED group header (a collapsed group's members aren't rows, so include the
  // header as a unit - when picked, a member is ticked each fast tick so the aggregate keeps
  // moving instead of freezing).
  function pickActive(): void {
    const vp = vm?.viewport;
    const units: string[] = [];
    if (vp) {
      for (let y = vp.y0; y < vp.y1 && y < displayRows.length; y++) {
        const r = displayRows[y];
        if (r?.kind === "leaf") units.push(r.id);
        else if (r?.kind === "group" && !r.expanded) units.push(r.id); // grp:<Type>
      }
    }
    active.clear();
    const n = units.length;
    if (n === 0) return;
    const hi = Math.floor(n / 2);
    const m = hi <= MIN_ACTIVE ? Math.min(n, MIN_ACTIVE) : MIN_ACTIVE + Math.floor(Math.random() * (hi - MIN_ACTIVE + 1));
    const shuffled = shuffle(units);
    for (let k = 0; k < m; k++) active.add(shuffled[k]);
  }

  // Fast tick (every FAST_MS): snapshot every row's previous value (so non-active rows read
  // as unchanged), step the active units, refresh measures + aggregates, then push new data
  // + metadata through updateData (no reconstruction, no reorder). Redrawing on every fast
  // tick also animates the flash fade for rows that just went quiet.
  function fastTick(): void {
    const now = Date.now();
    for (const i of instruments) {
      i.prevPnl = i.pnl;
      i.prevTotalValue = i.totalValue;
    }
    for (const key of active) {
      if (key.startsWith("grp:")) {
        // Collapsed group: tick a random (filtered) member so its aggregate keeps moving.
        const type = key.slice(4);
        const members = filteredLeaves(instruments).filter((i) => i.type === type);
        const pick = members[Math.floor(Math.random() * members.length)];
        if (pick) stepInstrument(pick); // group flash is set in refreshMeasures on aggregate change
        continue;
      }
      const i = byId.get(key);
      if (!i) continue;
      stepInstrument(i);
      flash.set(`${key}|pnl`, { t: now, up: i.pnl >= i.prevPnl });
      flash.set(`${key}|totalValue`, { t: now, up: i.totalValue >= i.prevTotalValue });
    }
    refreshMeasures(now);
    vm!.updateData(buildParams());
    grid.draw();
    renderChrome();
  }

  /* ===== header renderer (label + funnel + kebab) ===== */
  const header: FacetCellRenderer = (key) => {
    const col = columns.find((c) => c.key === key);
    if (!col) return ""; // the empty facet-header cell
    const node = document.createElement("div");
    node.style.cssText =
      `display:flex;align-items:center;gap:8px;width:100%;height:100%;padding:0 ${CELL_PAD_X}px;` +
      "font-size:11px;font-weight:650;letter-spacing:0.05em;text-transform:uppercase;white-space:nowrap;" +
      `color:${HEADER_MUTED};` +
      (col.align === "right" ? "flex-direction:row-reverse;" : "");

    const label = document.createElement("span");
    label.textContent = col.label;
    label.draggable = col.key === "instrument";
    if (label.draggable) {
      label.style.cursor = "grab";
      label.addEventListener("dragstart", (e) => {
        e.dataTransfer?.setData("text/plain", "group:type");
      });
    }
    node.appendChild(label);

    const tools = document.createElement("div");
    tools.style.cssText = "display:flex;align-items:center;gap:2px;margin-left:auto;";
    if (col.align === "right") tools.style.margin = "0 auto 0 0";

    if (col.filter) {
      const active = filters.has(col.key);
      tools.appendChild(
        iconButton(FUNNEL_ICON, active, (btn) => openFilter(col, btn))
      );
    }
    if (col.sortValue) {
      const active = sort?.key === col.key;
      const kebab = iconButton(active ? (sort!.dir === "asc" ? UP_ICON : DOWN_ICON) : KEBAB_ICON, active, (btn) =>
        openSortMenu(col, btn)
      );
      tools.appendChild(kebab);
    }
    node.appendChild(tools);
    return node;
  };

  /* ===== group facet renderer (chevron + label + count) ===== */
  const groupFacet: FacetCellRenderer = (label, dataCtx: FacetDataContext, ctx) => {
    if (label == null) {
      // Leaf-row facet cell (recycled node may have been a group header before): clear the
      // toggle marker so a click here doesn't fold the wrong group.
      delete ctx.cell.dataset.mpGroup;
      return "";
    }
    const row = displayRows[dataCtx.index];
    const expanded = dataCtx.flatMeta?.isExpanded ?? true;
    const node = document.createElement("div");
    node.style.cssText =
      `display:flex;align-items:center;gap:9px;height:100%;padding:0 ${CELL_PAD_X}px;` +
      "font-size:13.5px;font-weight:650;white-space:nowrap;";

    const chevron = document.createElement("span");
    chevron.innerHTML = CHEVRON_ICON;
    chevron.style.cssText =
      "display:inline-flex;transition:transform 120ms ease;color:" +
      HEADER_MUTED +
      (expanded ? ";transform:rotate(90deg);" : ";");
    const name = document.createElement("span");
    name.textContent = label as string;
    const count = document.createElement("span");
    count.textContent = row?.count != null ? `${row.count}` : "";
    count.style.cssText =
      "font-size:11px;font-weight:600;padding:1px 7px;border-radius:999px;" +
      `color:${HEADER_MUTED};background:color-mix(in srgb, currentColor 9%, ${SURFACE});`;

    node.append(chevron, name, count);
    ctx.cell.style.cursor = "pointer";
    ctx.cell.style.background = `color-mix(in srgb, currentColor 3%, ${SURFACE})`;
    // Toggling is handled by a delegated pointerdown on the grid mount (see below), keyed by
    // this attribute - NOT an onclick, which the fast redraw can detach mid-click.
    ctx.cell.dataset.mpGroup = label as string;
    return node;
  };

  // Expand/collapse via delegation on the stable grid mount. pointerdown is a single event
  // (unlike click, which needs a matching mouseup on the same node) so a redraw landing
  // between press and release can't swallow it. The target group is read from data-mp-group.
  function onFacetPointerDown(e: PointerEvent): void {
    const cell = (e.target as HTMLElement)?.closest?.<HTMLElement>("[data-mp-group]");
    const group = cell?.dataset.mpGroup;
    if (!group) return;
    if (collapsed.has(group)) collapsed.delete(group);
    else collapsed.add(group);
    renderStructure();
  }
  gridMount.addEventListener("pointerdown", onFacetPointerDown);

  /* ===== cell renderers ===== */
  function tickerRenderer(row: DisplayRow, _ctx: unknown, ctx: RCtx): HTMLElement[] | string {
    base(ctx.container, "left", row.kind === "group");
    if (row.kind === "group") return ""; // group header: clear the recycled cell (void keeps stale content)
    const i = row.instrument!;
    ctx.container.style.gap = "11px";

    const av = document.createElement("div");
    av.textContent = i.symbol.replace(/[^A-Z0-9]/gi, "").slice(0, 4).toUpperCase();
    av.style.cssText =
      "flex:0 0 auto;width:34px;height:34px;border-radius:10px;display:flex;align-items:center;" +
      "justify-content:center;font-size:9px;font-weight:800;letter-spacing:0.02em;color:#fff;" +
      `background:linear-gradient(140deg, ${i.avatar}, color-mix(in srgb, ${i.avatar} 62%, #000));` +
      `box-shadow:0 2px 6px color-mix(in srgb, ${i.avatar} 45%, transparent);`;

    const col = document.createElement("div");
    col.style.cssText = "min-width:0;display:flex;flex-direction:column;gap:1px;";
    const sym = document.createElement("span");
    sym.textContent = i.symbol;
    sym.style.cssText = "font-size:13px;font-weight:700;white-space:nowrap;letter-spacing:0.01em;";
    const name = document.createElement("span");
    name.textContent = i.name;
    name.style.cssText =
      "font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.1;" +
      "color:color-mix(in srgb, currentColor 58%, transparent);";
    col.append(sym, name);
    return [av, col];
  }

  function timelineRenderer(row: DisplayRow, _ctx: unknown, ctx: RCtx): HTMLElement | string {
    base(ctx.container, "left", row.kind === "group");
    if (row.kind === "group") return "";
    const h = row.instrument!.history;
    const rising = h[h.length - 1] >= h[0];
    const wrap = document.createElement("div");
    wrap.style.cssText = "width:100%;height:26px;";
    wrap.appendChild(barSparkline(h, rising ? ACCENT : `color-mix(in srgb, ${ACCENT} 55%, ${DOWN})`));
    return wrap;
  }

  function instrumentRenderer(row: DisplayRow, _ctx: unknown, ctx: RCtx): HTMLElement | string {
    base(ctx.container, "left", row.kind === "group");
    if (row.kind === "group") return "";
    const badge = document.createElement("span");
    badge.textContent = row.instrument!.type;
    const c = TYPE_COLORS[row.instrument!.type] ?? ACCENT;
    badge.style.cssText =
      "font-size:12px;font-weight:600;padding:3px 10px;border-radius:7px;white-space:nowrap;" +
      `color:${c};background:color-mix(in srgb, ${c} 13%, ${SURFACE});` +
      `border:1px solid color-mix(in srgb, ${c} 26%, transparent);`;
    return badge;
  }

  // The signed %-change + the value. The % comes from the METADATA layer (getValueCellMeta),
  // the absolute value from the cell data. The value sits in a pill-shaped slot that is
  // transparent at rest and flashes a tinted (green up / red down) background on update,
  // fading out over FLASH_MS - so the pill signals "just changed", not a permanent chip.
  function makeDeltaRenderer(field: "pnl" | "totalValue", valueOf: (r: DisplayRow) => number): CellRenderer<DisplayRow> {
    return (row, dataCtx, ctx) => {
      base(ctx.container, "right", row.kind === "group");
      ctx.container.style.gap = "9px";
      const meta = dataCtx.viewModel.metadata?.getValueCellMeta(dataCtx.colIndex, dataCtx.rowIndex);
      const pct = typeof meta?.pct === "number" ? (meta.pct as number) : 0;
      const up = pct >= 0;

      const delta = document.createElement("span");
      delta.style.cssText =
        `display:inline-flex;align-items:center;gap:2px;font-size:12px;font-weight:600;color:${up ? UP : DOWN};` +
        "font-variant-numeric:tabular-nums;white-space:nowrap;";
      if (Math.abs(pct) >= 0.005) {
        delta.textContent = `${up ? "▲" : "▼"} ${Math.abs(pct).toFixed(2)}%`;
      }

      // Pill: transparent by default; a recent flash tints + colours it, fading to 0 by age.
      const pill = document.createElement("span");
      pill.textContent = fmtMoney(valueOf(row));
      pill.style.cssText =
        "font-size:12.5px;font-weight:650;padding:3px 10px;border-radius:999px;white-space:nowrap;" +
        "font-variant-numeric:tabular-nums;min-width:56px;text-align:center;background:transparent;color:inherit;";
      const fl = flash.get(`${row.id}|${field}`);
      if (fl) {
        const age = Date.now() - fl.t;
        if (age >= FLASH_MS) {
          flash.delete(`${row.id}|${field}`);
        } else {
          const k = 1 - age / FLASH_MS; // 1 -> 0
          const c = fl.up ? UP : DOWN;
          pill.style.background = `color-mix(in srgb, ${c} ${Math.round(26 * k)}%, ${SURFACE})`;
          pill.style.color = `color-mix(in srgb, ${c} ${Math.round(70 * k)}%, currentColor)`;
        }
      }

      return [delta, pill];
    };
  }

  function quantityRenderer(row: DisplayRow, _ctx: unknown, ctx: RCtx): HTMLElement | void {
    base(ctx.container, "right", row.kind === "group");
    const span = document.createElement("span");
    span.textContent = fmtInt(row.quantity);
    span.style.cssText = "font-size:13px;font-variant-numeric:tabular-nums;white-space:nowrap;";
    if (row.kind === "group") span.style.fontWeight = "700";
    return span;
  }

  /* ===== sort menu + filter dropdown ===== */
  function openSortMenu(col: ColumnDef, anchor: HTMLElement): void {
    const menu = document.createElement("div");
    menu.style.cssText = popupBoxCss() + "min-width:186px;padding:6px;";
    const mk = (label: string, dir: SortDir, icon: string): HTMLElement => {
      const item = menuItem(icon, label, sort?.key === col.key && sort.dir === dir);
      item.onclick = () => {
        sort = { key: col.key, dir };
        popups.close();
        renderStructure();
      };
      return item;
    };
    menu.append(mk("Sort Ascending", "asc", UP_ICON), mk("Sort Descending", "desc", DOWN_ICON));
    popups.open(menu, anchor);
  }

  function openFilter(col: ColumnDef, anchor: HTMLElement): void {
    const all = col.filter!.values();
    const current = filters.get(col.key) ?? new Set(all);
    const working = new Set(current);

    const box = document.createElement("div");
    box.style.cssText = popupBoxCss() + "width:230px;padding:8px;display:flex;flex-direction:column;gap:6px;";

    const search = document.createElement("input");
    search.placeholder = "Search…";
    search.style.cssText =
      "font:inherit;font-size:13px;height:32px;padding:0 10px;border-radius:8px;color:inherit;outline:none;" +
      `background:color-mix(in srgb, currentColor 5%, ${SURFACE});border:1px solid ${HAIRLINE};`;

    const list = document.createElement("div");
    list.style.cssText = "max-height:220px;overflow:auto;display:flex;flex-direction:column;";

    const commit = (): void => {
      if (working.size === all.length) filters.delete(col.key);
      else filters.set(col.key, new Set(working));
      renderStructure();
    };

    const renderList = (): void => {
      list.replaceChildren();
      const q = search.value.trim().toLowerCase();
      const shown = all.filter((v) => v.toLowerCase().includes(q));
      list.appendChild(
        checkRow("(Select All)", shown.length > 0 && shown.every((v) => working.has(v)), (on) => {
          for (const v of shown) on ? working.add(v) : working.delete(v);
          commit();
          renderList();
        })
      );
      for (const v of shown) {
        list.appendChild(
          checkRow(v, working.has(v), (on) => {
            on ? working.add(v) : working.delete(v);
            commit();
          })
        );
      }
    };
    search.addEventListener("input", renderList);
    renderList();
    box.append(search, list);
    popups.open(box, anchor);
    search.focus();
  }

  /* ===== chrome (group bar) ===== */
  function renderChrome(): void {
    /* group bar */
    groupBar.replaceChildren();
    groupBar.style.cssText =
      "display:flex;align-items:center;gap:10px;min-height:42px;padding:0 12px;border-radius:10px;" +
      `border:1px dashed ${HAIRLINE};background:color-mix(in srgb, currentColor 2.5%, ${SURFACE});`;

    const live = document.createElement("span");
    live.style.cssText = "display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:600;color:" + UP + ";";
    const dot = document.createElement("span");
    dot.className = "mp-live-dot";
    dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${UP};`;
    live.append(dot, document.createTextNode("LIVE"));

    const sep = document.createElement("span");
    sep.style.cssText = `width:1px;height:18px;background:${HAIRLINE};`;

    if (grouped) {
      const chip = document.createElement("span");
      chip.style.cssText =
        "display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:600;" +
        "padding:5px 8px 5px 11px;border-radius:8px;" +
        `color:${ACCENT};background:color-mix(in srgb, ${ACCENT} 12%, ${SURFACE});` +
        `border:1px solid color-mix(in srgb, ${ACCENT} 28%, transparent);`;
      chip.appendChild(document.createTextNode("Instrument"));
      const x = document.createElement("button");
      x.type = "button";
      x.innerHTML = CLOSE_ICON;
      x.title = "Remove grouping";
      x.style.cssText =
        "display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;padding:0;" +
        "border:0;background:transparent;color:inherit;cursor:pointer;opacity:0.75;";
      x.onclick = () => {
        grouped = false;
        renderStructure();
      };
      chip.appendChild(x);
      groupBar.append(live, sep, chip);
    } else {
      const hint = document.createElement("span");
      hint.textContent = "Drag the Instrument column here to group";
      hint.style.cssText = `font-size:12.5px;color:${HEADER_MUTED};`;
      groupBar.append(live, sep, hint);
    }
  }

  /* group-bar drop target (drag Instrument header here) */
  const onDragOver = (e: DragEvent): void => {
    if (!grouped) {
      e.preventDefault();
      groupBar.style.borderColor = `color-mix(in srgb, ${ACCENT} 55%, transparent)`;
    }
  };
  const onDragLeave = (): void => {
    groupBar.style.borderColor = HAIRLINE;
  };
  const onDrop = (e: DragEvent): void => {
    e.preventDefault();
    groupBar.style.borderColor = HAIRLINE;
    if (e.dataTransfer?.getData("text/plain") === "group:type") {
      grouped = true;
      renderStructure();
    }
  };
  groupBar.addEventListener("dragover", onDragOver);
  groupBar.addEventListener("dragleave", onDragLeave);
  groupBar.addEventListener("drop", onDrop);

  /* live-dot pulse keyframes */
  const style = document.createElement("style");
  style.textContent =
    "@keyframes mp-pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:0.35;transform:scale(0.7);}}" +
    ".mp-live-dot{animation:mp-pulse 1.4s ease-in-out infinite;}";
  document.head.appendChild(style);

  renderStructure();
  pickActive(); // seed the first active set so updates start immediately
  const fastTimer = setInterval(fastTick, FAST_MS);
  const epochTimer = setInterval(pickActive, EPOCH_MS);

  return () => {
    clearInterval(fastTimer);
    clearInterval(epochTimer);
    disposeTheme();
    popups.dispose();
    style.remove();
    gridMount.removeEventListener("pointerdown", onFacetPointerDown);
    groupBar.removeEventListener("dragover", onDragOver);
    groupBar.removeEventListener("dragleave", onDragLeave);
    groupBar.removeEventListener("drop", onDrop);
    el.replaceChildren();
  };
}

/* ===================================== utils ===================================== */

interface RCtx {
  container: HTMLElement;
  key: string;
}

// Custom cells lose the grid's padding/alignment; set container styles property by
// property (never cssText - that wipes the cell's grid-area). Backgrounds stay opaque
// (mixed onto SURFACE) so nothing bleeds through on scroll.
function base(container: HTMLElement, align: "left" | "right", isGroup = false): void {
  container.style.display = "flex";
  container.style.alignItems = "center";
  container.style.justifyContent = align === "right" ? "flex-end" : "flex-start";
  container.style.height = "100%";
  container.style.boxSizing = "border-box";
  container.style.overflow = "hidden";
  container.style.padding = `0 ${CELL_PAD_X}px`;
  container.style.background = isGroup ? GROUP_TINT : SURFACE;
}

function sum(rows: Instrument[], f: (i: Instrument) => number): number {
  let t = 0;
  for (const r of rows) t += f(r);
  return t;
}

// Fisher-Yates over a copy; used to pick a random subset of the visible rows each epoch.
function shuffle<T>(items: T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const SPARK_H = 26;

// Bar sparkline drawn as a SINGLE <path>: d3 scaleLinear maps index->x and value->y,
// and every bar is one rectangle subpath (M..L..L..L..Z) concatenated into the same
// `d`, so the whole series is one fill (one DOM node) instead of N rects/divs. The
// viewBox is index-space; preserveAspectRatio="none" stretches it to the cell width.
function barSparkline(values: number[], color: string): SVGSVGElement {
  const n = values.length;
  const W = n;
  const H = SPARK_H;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = scaleLinear().domain([0, n]).range([0, W]);
  const y = scaleLinear().domain([min, max]).range([H - 1, 3]);
  const slot = W / n;
  const bw = slot * 0.66;
  const gap = (slot - bw) / 2;

  let d = "";
  for (let i = 0; i < n; i++) {
    const bx = x(i) + gap;
    const top = max === min ? H - 3 : y(values[i]);
    d += `M${f2(bx)} ${H}L${f2(bx)} ${f2(top)}L${f2(bx + bw)} ${f2(top)}L${f2(bx + bw)} ${H}Z`;
  }

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", String(H));
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("preserveAspectRatio", "none");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", d);
  path.style.fill = color; // style (not attribute) so a color-mix() value resolves
  svg.appendChild(path);
  return svg;
}

function f2(v: number): string {
  return v.toFixed(2);
}

function pctChange(prev: number, cur: number): number {
  if (!prev) return 0;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

const moneyFmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const intFmt = new Intl.NumberFormat("en-US");
function fmtMoney(n: number): string {
  return moneyFmt.format(n);
}
function fmtInt(n: number): string {
  return intFmt.format(Math.round(n));
}

/* ---- icon buttons / menu rows / checkboxes ---- */
function iconButton(svg: string, active: boolean, onClick: (btn: HTMLElement) => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.innerHTML = svg;
  btn.style.cssText =
    "display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;padding:0;cursor:pointer;" +
    "border:0;border-radius:6px;background:transparent;transition:background 120ms ease,color 120ms ease;" +
    (active ? `color:${ACCENT};` : "color:color-mix(in srgb, currentColor 45%, transparent);");
  btn.addEventListener("mouseenter", () => {
    btn.style.background = "color-mix(in srgb, currentColor 12%, transparent)";
    if (!active) btn.style.color = "color-mix(in srgb, currentColor 80%, transparent)";
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.background = "transparent";
    if (!active) btn.style.color = "color-mix(in srgb, currentColor 45%, transparent)";
  });
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick(btn);
  });
  return btn;
}

function menuItem(icon: string, label: string, active: boolean): HTMLButtonElement {
  const item = document.createElement("button");
  item.type = "button";
  const wrap = document.createElement("span");
  wrap.innerHTML = icon;
  wrap.style.cssText = "display:inline-flex;width:16px;height:16px;color:color-mix(in srgb, currentColor 65%, transparent);";
  const text = document.createElement("span");
  text.textContent = label;
  item.append(wrap, text);
  item.style.cssText =
    "display:flex;align-items:center;gap:10px;width:100%;padding:8px 10px;border:0;border-radius:8px;cursor:pointer;" +
    "font:inherit;font-size:13px;text-align:left;color:inherit;background:" +
    (active ? "color-mix(in srgb, currentColor 8%, transparent);" : "transparent;");
  item.addEventListener("mouseenter", () => {
    item.style.background = "color-mix(in srgb, currentColor 8%, transparent)";
  });
  item.addEventListener("mouseleave", () => {
    item.style.background = active ? "color-mix(in srgb, currentColor 8%, transparent)" : "transparent";
  });
  return item;
}

function checkRow(label: string, checked: boolean, onChange: (on: boolean) => void): HTMLElement {
  const row = document.createElement("label");
  row.style.cssText =
    "display:flex;align-items:center;gap:9px;padding:6px 8px;border-radius:7px;cursor:pointer;font-size:13px;";
  row.addEventListener("mouseenter", () => {
    row.style.background = "color-mix(in srgb, currentColor 7%, transparent)";
  });
  row.addEventListener("mouseleave", () => {
    row.style.background = "transparent";
  });
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = checked;
  box.style.cssText = `width:15px;height:15px;cursor:pointer;accent-color:${ACCENT};margin:0;flex:0 0 auto;`;
  box.addEventListener("change", () => onChange(box.checked));
  const text = document.createElement("span");
  text.textContent = label;
  text.style.cssText = "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
  row.append(box, text);
  return row;
}

// One body-mounted popup at a time, anchored under a button, closing on outside click
// / scroll / resize. Body-mounted so grid redraws (which recycle header cells) never
// remove an open menu.
function createPopupLayer(themeSource: () => HTMLElement | undefined): {
  open: (node: HTMLElement, anchor: HTMLElement) => void;
  close: () => void;
  dispose: () => void;
} {
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
    // Body-mounted: the grid's --value-background-color CSS var isn't in scope here, so
    // every var()/color-mix that references it would collapse to transparent. Resolve the
    // grid's live surface colour and republish the var on the popup root so nested styles
    // (and the theme) work in both light and dark. currentColor is inherited from the page.
    const src = themeSource();
    const surface = src ? getComputedStyle(src).getPropertyValue("--value-background-color").trim() : "";
    node.style.setProperty("--value-background-color", surface || getComputedStyle(document.body).backgroundColor);
    node.style.color = getComputedStyle(document.body).color;
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
    "font:inherit;color:inherit;border-radius:12px;" +
    `background:${SURFACE};border:1px solid ${HAIRLINE};` +
    "box-shadow:0 12px 34px rgba(0,0,0,0.18),0 2px 8px rgba(0,0,0,0.12);"
  );
}

/* ---- inline icons (currentColor) ---- */
const KEBAB_ICON =
  "<svg width=\"15\" height=\"15\" viewBox=\"0 0 24 24\" fill=\"currentColor\"><circle cx=\"12\" cy=\"5\" r=\"1.6\"/><circle cx=\"12\" cy=\"12\" r=\"1.6\"/><circle cx=\"12\" cy=\"19\" r=\"1.6\"/></svg>";
const FUNNEL_ICON =
  "<svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 4h18l-7 8v6l-4 2v-8z\"/></svg>";
const UP_ICON =
  "<svg width=\"15\" height=\"15\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 19V5M5 12l7-7 7 7\"/></svg>";
const DOWN_ICON =
  "<svg width=\"15\" height=\"15\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 5v14M5 12l7 7 7-7\"/></svg>";
const CHEVRON_ICON =
  "<svg width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M9 6l6 6-6 6\"/></svg>";
const CLOSE_ICON =
  "<svg width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M6 6l12 12M18 6L6 18\"/></svg>";

/* ===================================== data ===================================== */

const TYPE_COLORS: Record<string, string> = {
  Bond: "#2563eb",
  ETF: "#7c3aed",
  Crypto: "#f59e0b",
  Stock: "#0891b2",
};

interface Seed {
  symbol: string;
  name: string;
  type: string;
  color: string;
  base: number; // typical price magnitude
}

const SEEDS: Seed[] = [
  // Bonds
  { symbol: "US10Y", name: "U.S. Treasury 10-Year Bond", type: "Bond", color: "#2f5fd0", base: 98 },
  { symbol: "CAD30Y", name: "Canada 30-Year Government Bond", type: "Bond", color: "#d1603a", base: 92 },
  { symbol: "FRN2027", name: "France Government Bond 2027", type: "Bond", color: "#2f6fd0", base: 101 },
  { symbol: "EUBOND", name: "Eurozone 20-Year Government Bond", type: "Bond", color: "#e0932f", base: 88 },
  { symbol: "CORPBOND", name: "Corporate Bond Generic", type: "Bond", color: "#7a7a2f", base: 96 },
  { symbol: "GER30Y", name: "Germany 30-Year Government Bond", type: "Bond", color: "#374151", base: 103 },
  { symbol: "CSCO35", name: "Cisco Systems 2035 Corporate Bond", type: "Bond", color: "#c9a72f", base: 94 },
  { symbol: "TSLABOND", name: "Tesla 2028 Corporate Bond", type: "Bond", color: "#d1603a", base: 90 },
  { symbol: "GE35C", name: "General Electric 2035 Corporate Bond", type: "Bond", color: "#2f8f6f", base: 97 },
  { symbol: "JPM30", name: "JP Morgan 2030 Corporate Bond", type: "Bond", color: "#c9a72f", base: 99 },
  { symbol: "DE10YT", name: "Germany 10-Year Government Bond", type: "Bond", color: "#374151", base: 100 },
  { symbol: "UK25G", name: "UK 2025 Gilt", type: "Bond", color: "#2f5fd0", base: 95 },
  { symbol: "JP20Y", name: "Japan 20-Year Government Bond", type: "Bond", color: "#d13a4a", base: 89 },
  { symbol: "AAPL30", name: "Apple 2030 Corporate Bond", type: "Bond", color: "#6b7280", base: 98 },
  // ETFs
  { symbol: "MUB", name: "iShares National Muni Bond ETF", type: "ETF", color: "#22a06b", base: 27 },
  { symbol: "VGT", name: "Vanguard Information Tech ETF", type: "ETF", color: "#8b2f8f", base: 512 },
  { symbol: "SPY", name: "SPDR S&P 500 ETF Trust", type: "ETF", color: "#2f6fd0", base: 498 },
  { symbol: "QQQ", name: "Invesco QQQ Trust", type: "ETF", color: "#5b3fd0", base: 438 },
  { symbol: "VTI", name: "Vanguard Total Stock Market ETF", type: "ETF", color: "#b02f4a", base: 254 },
  { symbol: "IWM", name: "iShares Russell 2000 ETF", type: "ETF", color: "#2f8f8f", base: 201 },
  { symbol: "GLD", name: "SPDR Gold Shares", type: "ETF", color: "#c9a72f", base: 214 },
  { symbol: "ARKK", name: "ARK Innovation ETF", type: "ETF", color: "#2f9f6f", base: 48 },
  { symbol: "XLE", name: "Energy Select Sector SPDR", type: "ETF", color: "#d1603a", base: 91 },
  { symbol: "EEM", name: "iShares MSCI Emerging Markets ETF", type: "ETF", color: "#5b7fd0", base: 42 },
  { symbol: "VNQ", name: "Vanguard Real Estate ETF", type: "ETF", color: "#8f6f2f", base: 88 },
  { symbol: "SCHD", name: "Schwab US Dividend Equity ETF", type: "ETF", color: "#2f6f9f", base: 79 },
  // Crypto
  { symbol: "BTC-USD", name: "Bitcoin", type: "Crypto", color: "#f7931a", base: 61000 },
  { symbol: "ETH-USD", name: "Ethereum", type: "Crypto", color: "#3c3c3d", base: 3400 },
  { symbol: "LTC-USD", name: "Litecoin", type: "Crypto", color: "#345d9d", base: 84 },
  { symbol: "SOL-USD", name: "Solana", type: "Crypto", color: "#8f4fd0", base: 148 },
  { symbol: "XMR-USD", name: "Monero", type: "Crypto", color: "#f26822", base: 168 },
  { symbol: "BCH-USD", name: "Bitcoin Cash", type: "Crypto", color: "#0ac18e", base: 412 },
  { symbol: "ADA-USD", name: "Cardano", type: "Crypto", color: "#2f6fd0", base: 0.62 },
  { symbol: "DOT-USD", name: "Polkadot", type: "Crypto", color: "#e6007a", base: 7.1 },
  { symbol: "AVAX-USD", name: "Avalanche", type: "Crypto", color: "#e84142", base: 38 },
  { symbol: "LINK-USD", name: "Chainlink", type: "Crypto", color: "#2a5ada", base: 18 },
  // Stocks
  { symbol: "T", name: "AT&T Inc.", type: "Stock", color: "#00a8e0", base: 19 },
  { symbol: "ADI", name: "Analog Devices, Inc.", type: "Stock", color: "#1f4fd0", base: 231 },
  { symbol: "AIG", name: "American International Group", type: "Stock", color: "#1a2f5f", base: 78 },
  { symbol: "DAL", name: "Delta Air Lines Inc", type: "Stock", color: "#9b1b3a", base: 51 },
  { symbol: "BP", name: "BP plc", type: "Stock", color: "#2f8f4f", base: 37 },
  { symbol: "MA", name: "Mastercard Inc", type: "Stock", color: "#eb6c1f", base: 468 },
  { symbol: "AAPL", name: "Apple Inc.", type: "Stock", color: "#555555", base: 224 },
  { symbol: "MSFT", name: "Microsoft Corporation", type: "Stock", color: "#2f8f6f", base: 428 },
  { symbol: "NVDA", name: "NVIDIA Corporation", type: "Stock", color: "#3f8f2f", base: 122 },
  { symbol: "AMZN", name: "Amazon.com, Inc.", type: "Stock", color: "#e0932f", base: 184 },
  { symbol: "GOOGL", name: "Alphabet Inc.", type: "Stock", color: "#4285f4", base: 172 },
  { symbol: "META", name: "Meta Platforms, Inc.", type: "Stock", color: "#2f6fd0", base: 512 },
  { symbol: "TSLA", name: "Tesla, Inc.", type: "Stock", color: "#cc0000", base: 248 },
  { symbol: "JPM", name: "JPMorgan Chase & Co.", type: "Stock", color: "#5b4a2f", base: 214 },
  { symbol: "ABBV", name: "AbbVie Inc.", type: "Stock", color: "#0f3f7f", base: 178 },
  { symbol: "ADBE", name: "Adobe Inc.", type: "Stock", color: "#d1303a", base: 512 },
  { symbol: "KO", name: "The Coca-Cola Company", type: "Stock", color: "#c8102e", base: 63 },
  { symbol: "DIS", name: "The Walt Disney Company", type: "Stock", color: "#2f4f9f", base: 96 },
  { symbol: "NKE", name: "Nike, Inc.", type: "Stock", color: "#374151", base: 78 },
  { symbol: "PFE", name: "Pfizer Inc.", type: "Stock", color: "#2f6fd0", base: 28 },
  { symbol: "XOM", name: "Exxon Mobil Corporation", type: "Stock", color: "#b02f3a", base: 118 },
  { symbol: "WMT", name: "Walmart Inc.", type: "Stock", color: "#2f7fd0", base: 68 },
  { symbol: "V", name: "Visa Inc.", type: "Stock", color: "#1a3f8f", base: 278 },
  { symbol: "INTC", name: "Intel Corporation", type: "Stock", color: "#2f7fd0", base: 31 },
  { symbol: "CSCO", name: "Cisco Systems, Inc.", type: "Stock", color: "#2f8f9f", base: 49 },
  { symbol: "ORCL", name: "Oracle Corporation", type: "Stock", color: "#c8102e", base: 142 },
  { symbol: "CRM", name: "Salesforce, Inc.", type: "Stock", color: "#2f9fd0", base: 268 },
  { symbol: "BAC", name: "Bank of America Corp", type: "Stock", color: "#b02f3a", base: 39 },
];

// Deterministic PRNG so the demo starts identically each load; ticks then diverge.
let RAND = mulberry32(0x9e3d71);

function generateInstruments(): Instrument[] {
  RAND = mulberry32(0x9e3d71);
  const out: Instrument[] = [];
  for (const s of SEEDS) {
    const qtyChoices = [15, 25, 30, 50, 70, 75, 80, 100, 120, 150, 200, 250, 400, 450, 500, 550, 600, 700, 1000];
    const quantity = qtyChoices[Math.floor(RAND() * qtyChoices.length)];
    const price = s.base * (0.9 + RAND() * 0.2);
    const history: number[] = [];
    let p = price * (0.85 + RAND() * 0.1);
    for (let k = 0; k < HISTORY; k++) {
      p = Math.max(0.01, p * (1 + (RAND() - 0.48) * 0.06));
      history.push(p);
    }
    history[HISTORY - 1] = price;
    const totalValue = price * quantity * (s.type === "Crypto" ? 0.001 : s.base > 200 ? 0.02 : 0.2);
    const pnl = totalValue * (RAND() - 0.42) * 0.12;
    out.push({
      id: s.symbol,
      symbol: s.symbol,
      name: s.name,
      type: s.type,
      quantity,
      price,
      avatar: s.color,
      history,
      pnl: Math.abs(pnl) + 0.3,
      prevPnl: Math.abs(pnl) + 0.3,
      totalValue,
      prevTotalValue: totalValue,
    });
  }
  return out;
}

// One realtime step: random-walk the price, roll the sparkline window, and recompute
// P&L / total value. `prev*` is snapshotted by the caller (fastTick) before stepping, so
// the metadata layer's % change reflects exactly this tick. Per-tick drift is small since
// active rows step every FAST_MS (32ms).
function stepInstrument(i: Instrument): void {
  const drift = (RAND() - 0.5) * 0.014;
  i.price = Math.max(0.01, i.price * (1 + drift));
  i.history.push(i.price);
  if (i.history.length > HISTORY) i.history.shift();

  const scale = i.type === "Crypto" ? 0.001 : i.price > 200 ? 0.02 : 0.2;
  i.totalValue = i.price * i.quantity * scale;
  i.pnl = Math.max(0.05, i.pnl * (1 + drift * 1.4) + (RAND() - 0.5) * 0.12);
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
