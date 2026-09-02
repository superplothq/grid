import Grid, { FlattenedDataViewModel, PVerticalFixture } from "@superplot/grid/renderer";
import type {
  BaseFixtureViewModel,
  BaseSliceResult,
  BaseViewModel,
  CellRenderer,
  ColAutoSizeConfig,
  FacetCellRenderer,
  FacetHeaderContext,
} from "@superplot/grid/renderer";
import type { FlattenedDataViewModelParams } from "@superplot/grid/renderer/flattened-data-viewmodel";
import { createGridMount } from "../../runtime/mount";
import { syncGridTheme } from "../../runtime/theme";

// A sleek re-imagining of a B2B sales "signal inbox": one row per prospect, every
// column custom-rendered (avatars, signal chips, a numeric heat score, category
// pills, a pipeline bar, a Fit segmented control). Self-contained - the 800 rows
// are generated deterministically below. Interactions: sort, row selection,
// pagination, per-row Fit toggle, row hover.

const ACCENT = "#f97316";
// Row background tints, mixed against the theme's opaque surface colour (never
// `transparent`). The checkbox column is a pinned fixture that the data columns
// scroll underneath; a translucent tint there would let that scrolling content
// show through, so these must stay fully opaque.
const SURFACE = "var(--value-background-color)";
const ROW_SELECTED_BG = `color-mix(in srgb, ${ACCENT} 12%, ${SURFACE})`;
const ROW_HOVER_BG = `color-mix(in srgb, ${ACCENT} 7%, ${SURFACE})`;
const GRID_HEIGHT = 468;
const ROW_HEIGHT = 66;
const PAGE_SIZES = [25, 50, 100];
// Simulated data-fetch latency: the loader shows for this long on first load and on
// every sort / page change, as if fetching a page from a server.
const LOAD_DELAY_MS = 500;

// Matches the theme's cell padding so custom cells align with the grid's own metrics.
const CELL_PAD_X = 14;

// Column sizing. We never use the "static" strategy: it puts the layout in
// fit-to-container mode (total width clamped to the viewport, no horizontal
// scroll). "max-cell" sizes a column to its widest cell; "clamped-width" with
// equal min/max pins a column to a fixed px width while keeping the scrolling
// code path, so the wide table scrolls horizontally like the reference.
const fit: ColAutoSizeConfig = { strategy: "max-cell" };
const pin = (px: number): ColAutoSizeConfig => ({ strategy: "clamped-width", minWidthInPx: px, maxWidthInPx: px });

type FitVerdict = "yes" | "maybe" | "no";
type SortDir = "asc" | "desc";

// metaState namespaces for interaction state, keyed by contact id. metaState is the
// viewmodel's KV store that persists across updateData(), so this state survives sort
// and pagination on the single long-lived viewmodel.
const NS_SELECTED = "selected";
const NS_CONTACTED = "contacted";
const NS_FIT = "fit";

interface Row {
  id: number;
  first: string;
  last: string;
  title: string;
  company: string;
  linkedin: boolean;
  signal: Signal;
  keyword: string;
  score: number;
  minutesAgo: number;
  list: ListCategory;
  pipeline: number;
  fit: FitVerdict;
}

interface ColumnDef {
  key: string;
  label: string;
  size: ColAutoSizeConfig;
  renderer: CellRenderer<Row>;
  sortValue?: (row: Row) => number | string;
}

export function mount(el: HTMLElement): () => void {
  const allRows = generateRows(800);

  // One long-lived viewmodel, updated in place via updateData(). Interaction state
  // lives in its metaState (keyed by contact id) - the house pattern (cf. Sort.tsx /
  // Filter.tsx) - so it persists across sort and pagination for free.
  let vm: FlattenedDataViewModel | undefined;
  let sort: { key: string; dir: SortDir } = { key: "imported", dir: "desc" };
  let pageSize = 100;
  let page = 0;
  let hoverKey: string | null = null;
  // The rows on the current page - the pinned checkbox fixture reads these to map a
  // visible row back to its record.
  let currentRows: Row[] = [];
  // Loader state. rebuild() simulates an async fetch; loadToken guards against
  // overlapping loads from rapid pager clicks (only the latest one applies).
  let loadTimer: ReturnType<typeof setTimeout> | null = null;
  let loadToken = 0;

  const isSelected = (id: number): boolean => Boolean(vm!.metaState.get(NS_SELECTED)?.[id]);
  const setSelected = (id: number, on: boolean): void =>
    on ? vm!.metaState.set(NS_SELECTED, String(id), true) : vm!.metaState.clear(NS_SELECTED, String(id));
  const selectedCount = (): number => Object.keys(vm!.metaState.get(NS_SELECTED) ?? {}).length;

  /* ---- chrome scaffolding ---- */
  el.style.cssText = "display:flex;flex-direction:column;gap:12px;font:inherit;";
  const toolbar = buildToolbar();
  const gridMount = createGridMount(el, GRID_HEIGHT);
  gridMount.style.borderRadius = "12px";
  // Wrap the grid so the loading overlay covers its viewport - a child of the scroll
  // container would scroll away with the content instead of staying put.
  const gridWrap = document.createElement("div");
  gridWrap.style.cssText = "position:relative;";
  gridWrap.appendChild(gridMount);
  const loader = buildLoader();
  gridWrap.appendChild(loader.el);
  const footer = document.createElement("div");
  el.append(toolbar.bar, gridWrap, footer);

  const columns = buildColumns({
    isSelected: (row) => isSelected(row.id),
    fitOf: (row) => (vm!.metaState.get(NS_FIT)?.[row.id] as FitVerdict) ?? row.fit,
    onSetFit: (row, verdict) => {
      vm!.metaState.set(NS_FIT, String(row.id), verdict);
      refresh();
    },
  });

  function toggleRow(id: number): void {
    setSelected(id, !isSelected(id));
    refresh();
  }

  function setAllOnPage(checked: boolean): void {
    for (const row of currentRows) setSelected(row.id, checked);
    refresh();
  }

  const isContacted = (id: number): boolean => Boolean(vm!.metaState.get(NS_CONTACTED)?.[id]);
  function toggleContact(id: number): void {
    if (isContacted(id)) vm!.metaState.clear(NS_CONTACTED, String(id));
    else vm!.metaState.set(NS_CONTACTED, String(id), true);
    refresh();
  }

  // The pinned checkbox gutter. A left vertical fixture stays parked at the left
  // edge while the data columns scroll under it (unlike an ordinary column). It owns
  // its header cell (the select-all box) and one checkbox per visible row; the grid
  // manages its sticky position and vertical scroll sync. Defined here so it closes
  // over the demo's selection state and the current page's rows.
  const SELECT_WIDTH = 46;
  class SelectFixture extends PVerticalFixture {
    constructor(...args: ConstructorParameters<typeof PVerticalFixture>) {
      super(...args);
      this.colSize = { strategy: "clamped-width", minWidthInPx: SELECT_WIDTH, maxWidthInPx: SELECT_WIDTH };
    }

    viewModelKey(): string {
      return "select";
    }

    headerCell(_ctx: FacetHeaderContext): HTMLElement {
      const all = currentRows.length > 0 && currentRows.every((r) => isSelected(r.id));
      const some = currentRows.some((r) => isSelected(r.id));
      const box = checkbox(all, some && !all);
      box.addEventListener("change", () => setAllOnPage(box.checked));
      const wrap = document.createElement("div");
      wrap.style.cssText = "display:flex;align-items:center;justify-content:center;width:100%;";
      wrap.appendChild(box);
      return wrap;
    }

    getCellsToRender(
      viewModel: BaseViewModel,
      fixtureViewModel: BaseFixtureViewModel,
      sliceData: BaseSliceResult
    ): { nodesToAppend: HTMLElement[] } {
      const nodesToAppend: HTMLElement[] = [];
      const numColFacetLevels = this.data!.numColFacetLevels;
      const { offset, track, suggestedCls } = fixtureViewModel;
      const n = sliceData.sliceNumRows;
      for (let j = 0; j < n; j++) {
        const row = currentRows[viewModel.y0 + j];
        if (!row) continue;
        const absoluteRowIndex = numColFacetLevels + viewModel.y0 + j;
        const key = `select-${absoluteRowIndex}`;
        const [cell, needAppend, contentDirty] = this.placeCellInDom({
          key,
          gridRow: numColFacetLevels + j + 1,
          gridCol: track,
          cls: ["data", "custom-rendered", ...suggestedCls, j === n - 1 && "last", j === 0 && "first"],
          extraStyles: { left: offset },
        });
        if (contentDirty) {
          const sel = isSelected(row.id);
          cell.style.justifyContent = "center";
          cell.style.background = sel ? ROW_SELECTED_BG : SURFACE;
          const box = checkbox(sel, false);
          box.addEventListener("change", () => toggleRow(row.id));
          cell.replaceChildren(box);
          cell.dataset.cellType = "value";
          cell.dataset.croix = String(absoluteRowIndex);
        }
        needAppend && nodesToAppend.push(cell);
      }
      return { nodesToAppend };
    }
  }

  // The pinned action button. A right vertical fixture: like the checkbox gutter it is
  // grid-managed UI (not data), so it stays parked at the right edge while the data
  // columns scroll under it. Reads/toggles the per-row "contacted" flag in metaState.
  // Fixture width comes from the measured header cell, so we pin that cell's width and
  // the per-row cells to the same value.
  const CONTACT_WIDTH = 64;
  class ContactFixture extends PVerticalFixture {
    viewModelKey(): string {
      return "action";
    }

    headerCell(ctx: FacetHeaderContext): string {
      ctx.cell.style.minWidth = `${CONTACT_WIDTH}px`;
      ctx.cell.style.maxWidth = `${CONTACT_WIDTH}px`;
      return "";
    }

    getCellsToRender(
      viewModel: BaseViewModel,
      fixtureViewModel: BaseFixtureViewModel,
      sliceData: BaseSliceResult
    ): { nodesToAppend: HTMLElement[] } {
      const nodesToAppend: HTMLElement[] = [];
      const numColFacetLevels = this.data!.numColFacetLevels;
      const { track, suggestedCls } = fixtureViewModel;
      const n = sliceData.sliceNumRows;
      for (let j = 0; j < n; j++) {
        const row = currentRows[viewModel.y0 + j];
        if (!row) continue;
        const absoluteRowIndex = numColFacetLevels + viewModel.y0 + j;
        const key = `action-${absoluteRowIndex}`;
        const [cell, needAppend, contentDirty] = this.placeCellInDom({
          key,
          gridRow: numColFacetLevels + j + 1,
          gridCol: track,
          cls: ["data", "custom-rendered", ...suggestedCls, j === n - 1 && "last", j === 0 && "first"],
          extraStyles: { minWidth: CONTACT_WIDTH, maxWidth: CONTACT_WIDTH },
        });
        if (contentDirty) {
          cell.style.justifyContent = "center";
          cell.style.background = isSelected(row.id) ? ROW_SELECTED_BG : SURFACE;
          cell.replaceChildren(contactButton(isContacted(row.id), () => toggleContact(row.id)));
          cell.dataset.cellType = "value";
          cell.dataset.croix = String(absoluteRowIndex);
        }
        needAppend && nodesToAppend.push(cell);
      }
      return { nodesToAppend };
    }
  }

  const grid = new Grid(
    {
      defaultCellHeight: ROW_HEIGHT,
      enableResizeUI: true,
      fixtures: { top: [], left: [SelectFixture], bottom: [], right: [ContactFixture] },
    },
    gridMount,
    "flat"
  );
  const disposeTheme = syncGridTheme(grid);

  /* ---- derived data ---- */
  function sortedRows(): Row[] {
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return allRows;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...allRows].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return (a.id - b.id) * dir;
    });
  }

  function view(): Row[] {
    return sortedRows().slice(page * pageSize, page * pageSize + pageSize);
  }

  /* ---- render ---- */
  // Options (renderers, sizing, the header) are set once here and reused: updateData()
  // only swaps data, so it never re-applies options - which is why metaState and the
  // measured column widths survive a sort. Facet value per column is its stable key
  // (not the label): the header renderer maps it back, and it travels with the column
  // under horizontal virtualization where a slice index would desync.
  function buildParams(rows: Row[]): FlattenedDataViewModelParams {
    return {
      data: columns.map(() => rows),
      columnFacets: [columns.map((c) => c.key)],
      totalRows: rows.length,
      options: {
        vTrackDefs: columns.map((c) => ({ renderer: c.renderer, colSize: c.size })),
        facetDefs: { row: [], col: [{ text: "", trackRenderer: header }], axis: "col" },
      },
    };
  }

  // Sort / page / page-size trigger a (simulated) async fetch: show the loader, wait
  // LOAD_DELAY_MS, then push the new page into the persistent viewmodel via
  // updateData() and reassign grid.data so the layout reinitialises. loadToken makes
  // a superseded load (rapid clicks) a no-op.
  function rebuild(): void {
    const token = ++loadToken;
    loader.show();
    if (loadTimer !== null) clearTimeout(loadTimer);
    loadTimer = setTimeout(() => {
      loadTimer = null;
      if (token !== loadToken) return;
      const rows = view();
      currentRows = rows;
      const params = buildParams(rows);
      if (!vm) vm = new FlattenedDataViewModel(params);
      else vm.updateData(params);
      grid.data = vm;
      grid.draw();
      updateChrome();
      loader.hide();
    }, LOAD_DELAY_MS);
  }

  // Matching / fit / contacted only mutate metaState (already written by the handler,
  // keyed by id) - no new data, so just redraw and let the renderers read it back.
  function refresh(): void {
    grid.draw();
    updateChrome();
  }

  function updateChrome(): void {
    toolbar.setCount(selectedCount());
    renderFooter();
  }

  /* ---- header renderer (labels + sort caret); select-all lives in the fixture ---- */
  const header: FacetCellRenderer = (key, _dataCtx, ctx) => {
    // The trackRenderer is also called for the facet header cell (value ""), which
    // maps to no data column - render nothing for it.
    const col = columns.find((c) => c.key === key);
    if (!col) return "";
    const node = document.createElement("div");
    node.style.cssText =
      `display:flex;align-items:center;gap:6px;height:100%;padding:0 ${CELL_PAD_X}px;` +
      "font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;" +
      "color:color-mix(in srgb, currentColor 55%, transparent);white-space:nowrap;";

    node.appendChild(document.createTextNode(col.label));
    if (col.sortValue) {
      ctx.cell.style.cursor = "pointer";
      const active = sort.key === col.key;
      const caret = document.createElement("span");
      caret.textContent = active ? (sort.dir === "asc" ? "↑" : "↓") : "↕";
      caret.style.cssText =
        "font-size:11px;line-height:1;" +
        (active ? `color:${ACCENT};` : "color:color-mix(in srgb, currentColor 35%, transparent);");
      node.appendChild(caret);
      ctx.cell.onclick = () => {
        if (sort.key === col.key) sort = { key: col.key, dir: sort.dir === "asc" ? "desc" : "asc" };
        else sort = { key: col.key, dir: "desc" };
        page = 0;
        rebuild();
      };
    }
    return node;
  };

  /* ---- footer (results + page size + pager) ---- */
  function renderFooter(): void {
    footer.replaceChildren();
    footer.style.cssText =
      "display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;" +
      "font-size:13px;color:color-mix(in srgb, currentColor 65%, transparent);";

    const total = allRows.length;
    const from = page * pageSize + 1;
    const to = Math.min(total, (page + 1) * pageSize);
    const info = document.createElement("span");
    info.innerHTML =
      `Showing <strong style="color:inherit;font-weight:650;">${from.toLocaleString()}</strong>` +
      `–<strong style="color:inherit;font-weight:650;">${to.toLocaleString()}</strong>` +
      ` of <strong style="color:inherit;font-weight:650;">${total.toLocaleString()}</strong> contacts`;

    const right = document.createElement("div");
    right.style.cssText = "display:flex;align-items:center;gap:14px;";

    const sizeWrap = document.createElement("label");
    sizeWrap.style.cssText = "display:flex;align-items:center;gap:8px;";
    sizeWrap.append(document.createTextNode("Rows"));
    const select = document.createElement("select");
    select.style.cssText =
      "font:inherit;font-size:13px;height:30px;padding:0 8px;border-radius:8px;cursor:pointer;color:inherit;" +
      "background:color-mix(in srgb, currentColor 5%, transparent);" +
      "border:1px solid color-mix(in srgb, currentColor 16%, transparent);";
    for (const size of PAGE_SIZES) {
      const opt = document.createElement("option");
      opt.value = String(size);
      opt.textContent = String(size);
      select.appendChild(opt);
    }
    select.value = String(pageSize);
    select.addEventListener("change", () => {
      pageSize = Number(select.value);
      page = 0;
      rebuild();
    });
    sizeWrap.appendChild(select);

    right.append(sizeWrap, buildPager());
    footer.append(info, right);
  }

  function buildPager(): HTMLElement {
    const totalPages = Math.ceil(allRows.length / pageSize);
    const pager = document.createElement("div");
    pager.style.cssText = "display:flex;align-items:center;gap:4px;";

    const go = (p: number): void => {
      page = Math.max(0, Math.min(totalPages - 1, p));
      rebuild();
    };

    pager.appendChild(pagerButton("‹", page > 0, false, () => go(page - 1)));
    for (const p of pageWindow(page, totalPages)) {
      pager.appendChild(pagerButton(String(p + 1), true, p === page, () => go(p)));
    }
    pager.appendChild(pagerButton("›", page < totalPages - 1, false, () => go(page + 1)));
    return pager;
  }

  /* ---- row hover: delegate over the data cells, toggle a class, no redraw ---- */
  const style = document.createElement("style");
  const scope = "si-" + allRows.length;
  gridMount.classList.add(scope);
  style.textContent =
    `.${scope} [data-croix].si-hovered{background:${ROW_HOVER_BG} !important;}` +
    "@keyframes si-spin{to{transform:rotate(360deg);}}" +
    ".si-spinner{width:18px;height:18px;border-radius:50%;" +
    `border:2.5px solid color-mix(in srgb, currentColor 18%, transparent);border-top-color:${ACCENT};` +
    "animation:si-spin 0.7s linear infinite;}";
  document.head.appendChild(style);

  const onPointerMove = (event: PointerEvent): void => {
    const cell = (event.target as HTMLElement)?.closest?.<HTMLElement>("[data-croix]");
    const key = cell ? cell.dataset.croix! : null;
    if (key === hoverKey) return;
    setHover(key);
  };
  const onPointerLeave = (): void => setHover(null);
  function setHover(key: string | null): void {
    if (hoverKey !== null) {
      gridMount.querySelectorAll(`[data-croix="${hoverKey}"]`).forEach((c) => c.classList.remove("si-hovered"));
    }
    hoverKey = key;
    if (key !== null) {
      gridMount.querySelectorAll(`[data-croix="${key}"]`).forEach((c) => c.classList.add("si-hovered"));
    }
  }
  gridMount.addEventListener("pointermove", onPointerMove);
  gridMount.addEventListener("pointerleave", onPointerLeave);

  rebuild();

  return () => {
    if (loadTimer !== null) clearTimeout(loadTimer);
    disposeTheme();
    gridMount.removeEventListener("pointermove", onPointerMove);
    gridMount.removeEventListener("pointerleave", onPointerLeave);
    style.remove();
    el.replaceChildren();
  };
}

/* ===================================== columns ===================================== */

interface ColumnHandlers {
  // Every column renderer reads isSelected to paint the selected-row wash; the fit
  // column also reads/writes its verdict. Checkbox and action are fixtures, not
  // columns, so their handlers live in the fixtures.
  isSelected: (row: Row) => boolean;
  fitOf: (row: Row) => FitVerdict;
  onSetFit: (row: Row, verdict: FitVerdict) => void;
}

function buildColumns(h: ColumnHandlers): ColumnDef[] {
  return [
    {
      key: "contact",
      label: "Contact",
      size: pin(256),
      sortValue: (row) => row.last.toLowerCase(),
      renderer: (row, _ctx, ctx) => {
        base(ctx.container, h.isSelected(row));
        ctx.container.style.gap = "11px";

        const av = document.createElement("div");
        av.textContent = row.first[0] + row.last[0];
        av.style.cssText =
          "flex:0 0 auto;width:34px;height:34px;border-radius:11px;display:flex;align-items:center;" +
          "justify-content:center;font-size:12px;font-weight:650;color:#fff;letter-spacing:0.02em;" +
          "background:linear-gradient(135deg,#fdba74,#f97316);box-shadow:0 2px 6px rgba(249,115,22,0.35);";

        const col = document.createElement("div");
        col.style.cssText = "min-width:0;display:flex;flex-direction:column;";

        const nameRow = document.createElement("div");
        nameRow.style.cssText = "display:flex;align-items:center;gap:6px;min-width:0;";
        const name = document.createElement("span");
        name.textContent = `${row.first} ${row.last}`;
        name.style.cssText =
          `font-size:13.5px;font-weight:600;color:${ACCENT};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`;
        nameRow.appendChild(name);
        if (row.linkedin) nameRow.appendChild(linkedinGlyph());

        const sub = document.createElement("div");
        sub.style.cssText =
          "font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1;" +
          "color:color-mix(in srgb, currentColor 62%, transparent);";
        sub.textContent = `${row.title} · ${row.company}`;

        col.append(nameRow, sub);
        return [av, col];
      },
    },
    {
      key: "signal",
      label: "Signal",
      size: pin(258),
      renderer: (row, _ctx, ctx) => {
        base(ctx.container, h.isSelected(row));
        const col = document.createElement("div");
        col.style.cssText = "min-width:0;display:flex;flex-direction:column;";

        const top = document.createElement("div");
        top.style.cssText = "display:flex;align-items:center;gap:7px;min-width:0;";
        const dot = document.createElement("span");
        dot.style.cssText =
          `flex:0 0 auto;width:7px;height:7px;border-radius:50%;background:${row.signal.color};` +
          `box-shadow:0 0 0 3px color-mix(in srgb, ${row.signal.color} 18%, transparent);`;
        const label = document.createElement("span");
        label.textContent = row.signal.label;
        label.style.cssText =
          "font-size:13px;font-weight:550;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" +
          "color:color-mix(in srgb, currentColor 90%, transparent);";
        top.append(dot, label);

        const kw = document.createElement("div");
        kw.textContent = row.keyword;
        kw.style.cssText =
          "font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1;" +
          "color:color-mix(in srgb, currentColor 52%, transparent);";

        col.append(top, kw);
        return col;
      },
    },
    {
      key: "score",
      label: "AI Score",
      size: fit,
      sortValue: (row) => row.score,
      renderer: (row, _ctx, ctx) => {
        base(ctx.container, h.isSelected(row), "left");
        return scoreChip(row.score);
      },
    },
    {
      key: "fit",
      label: "Fit",
      size: fit,
      renderer: (row, _ctx, ctx) => {
        base(ctx.container, h.isSelected(row));
        return fitControl(h.fitOf(row), (verdict) => h.onSetFit(row, verdict));
      },
    },
    {
      key: "imported",
      label: "Imported",
      size: fit,
      sortValue: (row) => -row.minutesAgo,
      renderer: (row, _ctx, ctx) => {
        base(ctx.container, h.isSelected(row));
        const span = document.createElement("span");
        span.textContent = relativeTime(row.minutesAgo);
        span.style.cssText =
          "font-size:12.5px;color:color-mix(in srgb, currentColor 60%, transparent);white-space:nowrap;";
        return span;
      },
    },
    {
      key: "list",
      label: "List",
      size: fit,
      sortValue: (row) => LIST_ORDER.indexOf(row.list),
      renderer: (row, _ctx, ctx) => {
        base(ctx.container, h.isSelected(row));
        return listTag(row.list, LIST_COLORS[row.list]);
      },
    },
    {
      key: "pipeline",
      label: "Pipeline",
      size: fit,
      sortValue: (row) => row.pipeline,
      renderer: (row, _ctx, ctx) => {
        base(ctx.container, h.isSelected(row));
        const col = document.createElement("div");
        col.style.cssText = "flex:1;min-width:0;display:flex;flex-direction:column;gap:5px;";
        const track = document.createElement("div");
        track.style.cssText =
          "height:6px;border-radius:3px;overflow:hidden;background:color-mix(in srgb, currentColor 12%, transparent);";
        const fill = document.createElement("div");
        fill.style.cssText =
          `height:100%;width:${row.pipeline}%;border-radius:3px;background:linear-gradient(90deg,#fb923c,${ACCENT});`;
        track.appendChild(fill);
        const cap = document.createElement("span");
        cap.textContent = `${row.pipeline}% qualified`;
        cap.style.cssText =
          "font-size:11px;color:color-mix(in srgb, currentColor 55%, transparent);white-space:nowrap;";
        col.append(track, cap);
        return col;
      },
    },
    // The action button (Contact / Contacted) is not a data column - it's rendered by a
    // right-pinned fixture, so it lives outside `columns`.
  ];
}

/* ===================================== cell widgets ===================================== */

// Custom cells lose the grid's padding/alignment. Set container styles property by
// property (never cssText - that would wipe the cell's inline grid-area). Selected
// rows get an accent wash here so the whole row reads as picked.
function base(container: HTMLElement, selected: boolean, align: "left" | "right" = "left"): void {
  container.style.display = "flex";
  container.style.alignItems = "center";
  container.style.justifyContent = align === "right" ? "flex-end" : "flex-start";
  container.style.height = "100%";
  container.style.boxSizing = "border-box";
  container.style.overflow = "hidden";
  container.style.padding = `6px ${CELL_PAD_X/2}px 6px ${CELL_PAD_X}px`;
  container.style.background = selected ? ROW_SELECTED_BG : SURFACE;
}

function checkbox(checked: boolean, indeterminate: boolean): HTMLInputElement {
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = checked;
  box.indeterminate = indeterminate;
  box.style.cssText = `width:15px;height:15px;cursor:pointer;accent-color:${ACCENT};margin:0;`;
  return box;
}

function linkedinGlyph(): HTMLElement {
  const el = document.createElement("span");
  el.textContent = "in";
  el.style.cssText =
    "flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;" +
    "border-radius:4px;background:#0a66c2;color:#fff;font-size:9px;font-weight:700;line-height:1;";
  return el;
}

// Numeric heat chip: the score in a chip tinted by its heat hue, plus a 3-pip meter.
function scoreChip(score: number): HTMLElement {
  const frac = score / 100;
  const hue = 30 - frac * 18;
  const color = `hsl(${hue},85%,${45 - frac * 6}%)`;
  const wrap = document.createElement("div");
  wrap.style.cssText = "display:flex;align-items:center;gap:8px;";

  const chip = document.createElement("span");
  chip.textContent = String(score);
  chip.style.cssText =
    "min-width:30px;text-align:center;font-size:13px;font-weight:700;padding:3px 8px;border-radius:8px;" +
    `color:${color};background:color-mix(in srgb, ${color} 14%, transparent);` +
    `border:1px solid color-mix(in srgb, ${color} 26%, transparent);font-variant-numeric:tabular-nums;`;

  const meter = document.createElement("div");
  meter.style.cssText = "display:flex;gap:2px;";
  const lit = score >= 80 ? 3 : score >= 55 ? 2 : 1;
  for (let i = 0; i < 3; i++) {
    const pip = document.createElement("span");
    pip.style.cssText =
      "width:4px;height:12px;border-radius:2px;" +
      (i < lit ? `background:${color};` : "background:color-mix(in srgb, currentColor 15%, transparent);");
    meter.appendChild(pip);
  }
  wrap.append(chip, meter);
  return wrap;
}

// A subtle category tag: a small solid colour chip plus the label in a neutral tone.
// Confining the colour to the chip keeps the list calm even with several categories
// on screen at once.
function listTag(text: string, color: string): HTMLElement {
  const el = document.createElement("span");
  el.style.cssText =
    "display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:500;white-space:nowrap;" +
    "color:color-mix(in srgb, currentColor 78%, transparent);";
  const chip = document.createElement("span");
  chip.style.cssText = `flex:0 0 auto;width:9px;height:9px;border-radius:3px;background:${color};`;
  el.append(chip, document.createTextNode(text));
  return el;
}

const FIT_META: { key: FitVerdict; glyph: string; color: string }[] = [
  { key: "yes", glyph: "✓", color: "#16a34a" },
  { key: "maybe", glyph: "?", color: "#a1a1aa" },
  { key: "no", glyph: "✕", color: "#dc2626" },
];

// A segmented ✓ / ? / X control. The active segment fills with its verdict colour;
// clicking a segment reports the new verdict up (state lives outside the viewmodel).
function fitControl(active: FitVerdict, onSet: (verdict: FitVerdict) => void): HTMLElement {
  const group = document.createElement("div");
  group.style.cssText =
    "display:inline-flex;border-radius:8px;overflow:hidden;" +
    "border:1px solid color-mix(in srgb, currentColor 16%, transparent);";
  FIT_META.forEach((seg, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = seg.glyph;
    const on = seg.key === active;
    btn.style.cssText =
      "font:inherit;font-size:12px;font-weight:700;width:28px;height:26px;cursor:pointer;border:0;line-height:1;" +
      (i > 0 ? "border-left:1px solid color-mix(in srgb, currentColor 16%, transparent);" : "") +
      (on
        ? `color:#fff;background:color-mix(in srgb, ${seg.color} 80%, #64748b);`
        : `color:color-mix(in srgb, ${seg.color} 75%, currentColor);background:transparent;`);
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      onSet(seg.key);
    });
    group.appendChild(btn);
  });
  return group;
}

// currentColor-stroked icons so they follow the button's text colour on hover/state.
const MAIL_ICON =
  "<svg width=\"15\" height=\"15\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" " +
  "stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2\"/><path d=\"m3 7 9 6 9-6\"/></svg>";
const CHECK_ICON =
  "<svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"3\" " +
  "stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"m5 12 5 5L20 7\"/></svg>";

// The row action, icon-only to keep the pinned column narrow: an outlined envelope
// (not yet contacted) that fills to a solid check once contacted. Clicking toggles
// the row's "contacted" state; the redraw rebuilds the button in its new state.
function contactButton(contactedRow: boolean, onToggle: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.title = contactedRow ? "Contacted" : "Contact";
  btn.innerHTML = contactedRow ? CHECK_ICON : MAIL_ICON;
  const shape =
    "display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;cursor:pointer;" +
    "border-radius:9px;transition:background 120ms ease,color 120ms ease;";
  if (contactedRow) {
    btn.style.cssText = shape + `color:#fff;border:1px solid ${ACCENT};background:${ACCENT};`;
  } else {
    btn.style.cssText =
      shape +
      `color:${ACCENT};border:1px solid color-mix(in srgb, ${ACCENT} 32%, transparent);` +
      `background:color-mix(in srgb, ${ACCENT} 9%, transparent);`;
    btn.addEventListener("mouseenter", () => {
      btn.style.background = ACCENT;
      btn.style.color = "#fff";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.background = `color-mix(in srgb, ${ACCENT} 9%, transparent)`;
      btn.style.color = ACCENT;
    });
  }
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    onToggle();
  });
  return btn;
}

function pagerButton(label: string, enabled: boolean, active: boolean, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = label;
  btn.disabled = !enabled;
  btn.style.cssText =
    "font:inherit;font-size:13px;min-width:30px;height:30px;padding:0 8px;border-radius:8px;line-height:1;" +
    (enabled ? "cursor:pointer;" : "cursor:default;opacity:0.4;") +
    (active
      ? `color:${ACCENT};font-weight:650;border:1px solid color-mix(in srgb, ${ACCENT} 45%, transparent);` +
        `background:color-mix(in srgb, ${ACCENT} 12%, transparent);`
      : "color:inherit;border:1px solid color-mix(in srgb, currentColor 14%, transparent);background:transparent;");
  if (enabled) btn.addEventListener("click", onClick);
  return btn;
}

// A loading overlay for the grid. It sits outside the grid's themed surface, so it
// can't read --value-background-color; instead it frosts whatever is behind it via a
// faint currentColor tint + backdrop blur, which reads correctly in light and dark.
function buildLoader(): { el: HTMLElement; show: () => void; hide: () => void } {
  const el = document.createElement("div");
  el.style.cssText =
    "position:absolute;inset:0;z-index:6;display:flex;align-items:center;justify-content:center;gap:10px;" +
    "border-radius:12px;opacity:0;pointer-events:none;transition:opacity 140ms ease;" +
    "background:color-mix(in srgb, currentColor 6%, transparent);" +
    "-webkit-backdrop-filter:blur(2.5px);backdrop-filter:blur(2.5px);";
  const spinner = document.createElement("div");
  spinner.className = "si-spinner";
  const label = document.createElement("span");
  label.textContent = "Loading contacts…";
  label.style.cssText = "font-size:15px;font-weight:500;color:color-mix(in srgb, currentColor 85%, transparent);";
  el.append(spinner, label);
  return {
    el,
    show: () => {
      el.style.opacity = "1";
      el.style.pointerEvents = "auto";
    },
    hide: () => {
      el.style.opacity = "0";
      el.style.pointerEvents = "none";
    },
  };
}

function buildToolbar(): { bar: HTMLElement; setCount: (n: number) => void } {
  const bar = document.createElement("div");
  bar.style.cssText = "display:flex;align-items:center;gap:10px;min-height:26px;";
  const status = document.createElement("span");
  status.style.cssText = "font-size:13px;color:color-mix(in srgb, currentColor 65%, transparent);";
  bar.appendChild(status);
  return {
    bar,
    setCount: (n) => {
      if (n === 0) {
        status.innerHTML = "<strong style=\"color:inherit;font-weight:650;\">800</strong> contacts with fresh signals";
      } else {
        status.innerHTML =
          `<strong style="color:${ACCENT};font-weight:650;">${n}</strong> selected` +
          " · ready to enrich or add to a sequence";
      }
    },
  };
}

/* ===================================== data ===================================== */

interface Signal {
  label: string;
  color: string;
}

type ListCategory = "Enterprise" | "Warm Leads" | "SMB" | "Cold Leads";

const LIST_ORDER: ListCategory[] = ["Cold Leads", "SMB", "Warm Leads", "Enterprise"];
const LIST_COLORS: Record<ListCategory, string> = {
  Enterprise: "#7c3aed",
  "Warm Leads": "#d97706",
  SMB: "#16a34a",
  "Cold Leads": "#2563eb",
};

const FIRST = ["Daniel", "Gloria", "Sandra", "Laura", "Sharon", "Marcus", "Elena", "Priya", "Andre", "Nina", "Omar", "Chloe", "Victor", "Amara", "Ravi", "Sofia", "Liam", "Yuki", "Diego", "Hannah", "Isabel", "Noah", "Fatima", "Ethan", "Mei", "Jonas", "Aisha", "Carlos", "Leah", "Tariq", "Grace", "Sven", "Deepa", "Owen"];
const LAST = ["Lopez", "Newell", "Martinez", "Wilson", "Oppong", "Chen", "Rossi", "Nair", "Dubois", "Petrov", "Haddad", "Walsh", "Ibrahim", "Okonkwo", "Tanaka", "Silva", "Bauer", "Reyes", "Novak", "Flynn", "Adeyemi", "Kowalski", "Fernandez", "Bianchi", "Nakamura", "Delgado", "Sharma", "OBrien", "Sorensen", "Volkov", "Mensah", "Ricci", "Castillo", "Andersen", "Khan", "Moreau", "Park", "Weber", "Costa", "Larsen"];
const TITLES = ["Senior Director of Engineering", "VP of Engineering", "Director of Sales", "VP of Customer Success", "Head of Growth", "Chief Technology Officer", "VP of Marketing", "Director of Product", "Senior Product Manager", "VP of Sales", "Head of RevOps", "Director of Data"];
const COMPANIES = ["OptimalFlow", "OmniSource", "Quantum Solutions", "Talent IP", "Nimbus Labs", "BrightPath", "Vertex Dynamics", "CoreStack", "Northwind", "DataBridge", "Apex Systems", "Lumen Works"];

const SIGNALS: Signal[] = [
  { label: "Engaged with a post", color: "#6366f1" },
  { label: "Viewed pricing page", color: "#f97316" },
  { label: "Raised new funding", color: "#16a34a" },
  { label: "Hiring surge detected", color: "#7c3aed" },
  { label: "Returned to your site", color: "#0ea5e9" },
];
const KEYWORDS = [
  "Downloaded whitepaper on your topic",
  "Following your company page",
  "Recently raised funding ($2M Series A)",
  "Engaged with your demo video",
  "Company expanding to a new market",
  "Viewed pricing three times this week",
  "Hiring for roles your product enables",
  "Mentioned a competitor on LinkedIn",
];

// Deterministic generator (seeded PRNG over realistic pools) so the demo renders
// identically on every load, with values correlated the way real data would be.
function generateRows(count: number): Row[] {
  const rand = mulberry32(0x51ed3a);
  const rows: Row[] = [];
  const usedNames = new Set<string>();
  for (let i = 0; i < count; i++) {
    const score = 22 + Math.floor(rand() * 77);
    const list: ListCategory =
      score >= 78 ? "Warm Leads" : score >= 55 ? "SMB" : score >= 38 ? "Enterprise" : "Cold Leads";
    const fit: FitVerdict = score >= 72 ? "yes" : score >= 45 ? "maybe" : "no";
    // Distinct people: re-draw until the full name is unused so no two rows share an
    // identity (re-picking the surname first, then the forename if it stays stuck).
    let first = pick(FIRST, rand);
    let last = pick(LAST, rand);
    for (let guard = 0; usedNames.has(`${first} ${last}`) && guard < 20; guard++) {
      last = pick(LAST, rand);
      if (guard % 3 === 2) first = pick(FIRST, rand);
    }
    usedNames.add(`${first} ${last}`);
    rows.push({
      id: i,
      first,
      last,
      title: pick(TITLES, rand),
      company: pick(COMPANIES, rand),
      linkedin: rand() > 0.28,
      signal: pick(SIGNALS, rand),
      keyword: pick(KEYWORDS, rand),
      score,
      minutesAgo: 4 + Math.floor(rand() * 4300),
      list,
      pipeline: 10 + Math.floor(rand() * 9) * 10,
      fit,
    });
  }
  return rows;
}

/* ===================================== utils ===================================== */

function relativeTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

// A compact window of page indices centred on the current page (max 5 shown).
function pageWindow(current: number, total: number): number[] {
  const span = Math.min(5, total);
  let start = Math.max(0, current - 2);
  start = Math.min(start, Math.max(0, total - span));
  return Array.from({ length: span }, (_, i) => start + i);
}

function pick<T>(values: T[], rand: () => number): T {
  return values[Math.floor(rand() * values.length)];
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
