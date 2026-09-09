import Grid, { PivotDataViewModel } from "@superplot/grid/renderer";
import type {
  FacetCellRenderer,
  FacetDataContext,
  FacetRendererContext,
  FacetHeaderRenderer,
  GridDataViewModelOptions,
  FacetCellContent,
  CellRenderer,
  VTrackDef,
  ValueCellDataContext,
  RendererContext,
} from "@superplot/grid/renderer";
import type { PivotDataViewModelParams } from "@superplot/grid/renderer/pivot-data-viewmodel";
import { DuckDBWasmDataSource, SqlPivotTableDataModel, ProjectionState } from "@superplot/grid";
import type {
  AxisExpr,
  DimensionalProjectionPath,
  SortEntry,
  ScalarFilter,
  Filter,
  PivotConfig,
} from "@superplot/grid";
import { createStatsPlumber } from "./stats";
import { syncCustomGridTheme } from "../../runtime/theme";
import type { GridThemeName } from "../../runtime/theme";
import {
  DIMENSION_NAMES,
  FIELDS,
  generateDataset,
  MEASURE_NAMES,
} from "./data";
import { countMeasures, parseExpression } from "./algebra";
import { ExpressionEditor } from "./editor";
import { createPopupLayer, openFilterPopup, openSortPopup } from "./popups";
import { applyChromeVars, registerThemes, THEME_DARK, THEME_LIGHT } from "./theme";

const DEFAULT_ROWS = "hierarchy(region, country, industry)";
const DEFAULT_COLUMNS = "cross(plan, concat(mrr, seats))";
const GRID_HEIGHT = 660;
const SEP = "␟";

interface ProjectionTree {
  [value: string]: ProjectionTree;
}

const FIELD_LABEL = new Map(FIELDS.map(f => [f.name, f.label]));
const NAME_TO_INDEX = new Map(FIELDS.map((f, i) => [f.name, i]));

type Agg = "sum" | "avg" | "count" | "min" | "max";
const AGG_OPTIONS: Agg[] = ["sum", "avg", "count", "min", "max"];

type FormatMode = "na" | "heatmap";
const FORMAT_OPTIONS: { value: FormatMode; label: string }[] = [
  { value: "na", label: "None" },
  { value: "heatmap", label: "Heatmap" },
];

// Resolve a measure facet value (which the model emits as the field name) back to
// the schema field name, tolerating a display-label form just in case.
function resolveMeasureField(value: string): string | undefined {
  if (MEASURE_NAMES.includes(value)) return value;
  const byLabel = FIELDS.find(f => f.kind === "measure" && f.label.toLowerCase() === value.toLowerCase());
  return byLabel?.name;
}

export function mount(el: HTMLElement): () => void {
  registerThemes();
  const dataset = generateDataset();

  // ----- demo state -----
  let ds: DuckDBWasmDataSource | null = null;
  let dataPromise: Promise<SqlPivotTableDataModel> | null = null;
  let model: SqlPivotTableDataModel | null = null;
  let vm: PivotDataViewModel | null = null;
  let grid: Grid | null = null;
  let disposeTheme: (() => void) | undefined;
  let destroyed = false;

  let rowExpr: AxisExpr = (parseExpression(DEFAULT_ROWS) as { expr: AxisExpr }).expr;
  let colExpr: AxisExpr = (parseExpression(DEFAULT_COLUMNS) as { expr: AxisExpr }).expr;
  let rowDimFields = dimFieldsOf(rowExpr);
  let colDimFields = dimFieldsOf(colExpr);
  let groupRows = true;
  let format: FormatMode = "na";
  let lastResult: PivotDataViewModelParams | null = null;
  const collapsedRows = new Set<string>();
  let sortEntries: SortEntry[] = [];
  const filterMap = new Map<string, ScalarFilter>();
  const measureAgg = new Map<string, Agg>(MEASURE_NAMES.map(m => [m, "sum"] as [string, Agg]));
  let lastFocused: ExpressionEditor | null = null;
  let chain: Promise<void> = Promise.resolve();

  // ----- DOM shell -----
  const root = document.createElement("div");
  root.className = "ps-root";
  root.append(makeStyle());

  const header = document.createElement("div");
  header.className = "ps-header";
  const titleWrap = document.createElement("div");
  const title = document.createElement("div");
  title.className = "ps-title";
  title.textContent = "Pivot Studio";
  const sub = document.createElement("div");
  sub.className = "ps-sub";
  sub.textContent = "Compose table-algebra expressions · live aggregation over 5,000 subscriptions";
  titleWrap.append(title, sub);
  const controls = document.createElement("div");
  controls.className = "ps-controls";
  const groupToggle = makeToggle("Group Rows", groupRows, checked => {
    groupRows = checked;
    if (!groupRows) collapsedRows.clear();
    scheduleRebuild();
  });
  const formatControl = makeFormatControl(format, mode => {
    format = mode;
    applyResult();
  });
  controls.append(groupToggle.el, formatControl.el);
  header.append(titleWrap, controls);

  const exprBar = document.createElement("div");
  exprBar.className = "ps-exprbar";
  const rowsEditor = new ExpressionEditor({
    label: "Rows",
    initial: DEFAULT_ROWS,
    onFocus: () => { lastFocused = rowsEditor; },
    onCommit: expr => { rowExpr = expr; rowDimFields = dimFieldsOf(expr); collapsedRows.clear(); refreshCrossAxis(); scheduleRebuild(); },
  });
  const colsEditor = new ExpressionEditor({
    label: "Columns",
    initial: DEFAULT_COLUMNS,
    onFocus: () => { lastFocused = colsEditor; },
    onCommit: expr => { colExpr = expr; colDimFields = dimFieldsOf(expr); refreshCrossAxis(); scheduleRebuild(); },
  });
  lastFocused = rowsEditor;
  exprBar.append(rowsEditor.el, colsEditor.el);

  const body = document.createElement("div");
  body.className = "ps-body";
  const fieldsPanel = makeFieldsPanel(token => (lastFocused ?? rowsEditor).insertToken(token), {
    get: field => measureAgg.get(field) ?? "sum",
    set: (field, agg) => { measureAgg.set(field, agg); scheduleRebuild(); },
  });
  const gridWrap = document.createElement("div");
  gridWrap.className = "ps-grid-wrap";
  let gridMount = document.createElement("div");
  gridMount.className = "ps-grid";
  const overlay = document.createElement("div");
  overlay.className = "ps-overlay";
  overlay.style.display = "none";
  gridWrap.append(gridMount, overlay);
  body.append(fieldsPanel, gridWrap);

  root.append(header, exprBar, body);
  el.append(root);

  const popupLayer = createPopupLayer(root);

  const chromeMedia = matchMedia("(prefers-color-scheme: dark)");
  const chromeObserver = new MutationObserver(() => applyChromeVars(root, resolveMode()));
  chromeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  chromeMedia.addEventListener("change", () => applyChromeVars(root, resolveMode()));
  applyChromeVars(root, resolveMode());

  // ----- data + rendering pipeline -----

  function resolveMode(): GridThemeName {
    const attr = document.documentElement.dataset.theme;
    if (attr === "dark" || attr === "light") return attr;
    return chromeMedia.matches ? "dark" : "light";
  }

  function ensureData(): Promise<SqlPivotTableDataModel> {
    if (!dataPromise) {
      dataPromise = (async () => {
        const source = await DuckDBWasmDataSource.create();
        await source.loadData({ schema: dataset.schema, data: dataset.data });
        ds = source;
        model = new SqlPivotTableDataModel(dataset.schema, source, createStatsPlumber());
        return model;
      })();
    }
    return dataPromise;
  }

  function buildConfig(): PivotConfig {
    const filters: Filter[] = Array.from(filterMap.values());
    return {
      rows: { expr: rowExpr, projection: projectionFor(rowDimFields, collapsedRows) },
      columns: { expr: colExpr, projection: projectionFor(colDimFields, new Set()) },
      sort: sortEntries.length > 0 ? sortEntries : undefined,
      filter: filters.length > 0 ? filters : undefined,
    };
  }

  function projectionFor(dimFields: string[], collapsed: Set<string>): DimensionalProjectionPath[] {
    return treeToPaths(buildOpenTree(dimFields, collapsed));
  }

  function buildOpenTree(dimFields: string[], collapsed: Set<string>): ProjectionTree {
    const tree: ProjectionTree = {};
    const levels = dimFields.length;
    if (levels <= 1) return tree;
    const cols = dimFields.map(f => dataset.data[NAME_TO_INDEX.get(f)!]);
    const n = cols[0].length;
    for (let i = 0; i < n; i++) {
      let node = tree;
      const parts: string[] = [];
      for (let lv = 0; lv < levels - 1; lv++) {
        const value = String(cols[lv][i]);
        const key = [...parts, value].join(SEP);
        if (collapsed.has(key)) break;
        parts.push(value);
        node[value] = node[value] || {};
        node = node[value];
      }
    }
    return tree;
  }

  function scheduleRebuild(): Promise<void> {
    chain = chain.then(() => rebuild()).catch(err => {
      if (!destroyed) setOverlay("error", String(err));
      // eslint-disable-next-line no-console
      console.error(err);
    });
    return chain;
  }

  async function rebuild(): Promise<void> {
    if (destroyed) return;
    // The model reads aggregation straight off the schema objects (by reference),
    // so pushing the current per-measure choice re-runs the SQL with it.
    for (const s of dataset.schema) {
      if (s.type === "measure") s.aggregateFn = measureAgg.get(s.name) ?? "sum";
    }
    const active = await ensureData();
    const result = await active.getViewModelData(buildConfig());
    if (destroyed) return;
    lastResult = result;
    applyResult();
  }

  // Rebuild the viewmodel options from the last query result and redraw. Kept
  // separate so a format-mode change can re-skin cells without a new query - the
  // value renderer reads `format` live, so that path is just a redraw.
  function applyResult(): void {
    if (!lastResult) return;
    const result = lastResult;
    const params: PivotDataViewModelParams = {
      data: result.data,
      columnFacets: result.columnFacets,
      rowFacets: result.rowFacets,
      options: injectRenderers(result.options, result.columnFacets, result.data.length),
      metadata: result.metadata,
    };
    if (!vm) vm = new PivotDataViewModel(params);
    else vm.updateData(params);
    if (grid) {
      grid.data = vm;
      grid.draw();
    }
  }

  function injectRenderers(
    options: GridDataViewModelOptions | undefined,
    columnFacets: (string | null)[][],
    numCols: number,
  ): GridDataViewModelOptions {
    const opts: GridDataViewModelOptions = { ...(options ?? {}) };
    const facetDefs = opts.facetDefs;
    if (!facetDefs) return opts;

    const rowRenderer = makeRowFacetRenderer();
    const measureByCol = measureColumnMap(columnFacets);

    opts.facetDefs = {
      axis: facetDefs.axis,
      row: (facetDefs.row ?? []).map((d, i) => ({
        ...d,
        text: rowDimFields[i] ? FIELD_LABEL.get(rowDimFields[i])! : d.text,
        trackRenderer: rowRenderer,
        headerRenderer: makeRowHeaderRenderer(rowDimFields[i]),
      })),
      col: (facetDefs.col ?? []).map((d, i, arr) => ({
        ...d,
        text: colDimFields[i] ? FIELD_LABEL.get(colDimFields[i])! : d.text,
        headerRenderer: makeColHeaderRenderer(),
        ...(i === arr.length - 1 && measureByCol
          ? {
            valueFormatter: (val: unknown, ctx: { colIndex: number }) => {
              const measure = measureByCol[ctx.colIndex];
              const field = measure != null ? resolveMeasureField(measure) : undefined;
              return formatMeasure(measure, val, field ? measureAgg.get(field) : undefined);
            },
          }
          : {}),
      })),
    };

    // One value renderer for every data column. It reads `format` live, so a
    // format switch is a plain redraw - no new query, no viewmodel rebuild.
    const valueRenderer = makeValueRenderer();
    opts.vTrackDefs = Array.from({ length: numCols }, (): Partial<VTrackDef> => ({ renderer: valueRenderer }));
    return opts;
  }

  // Heatmap conditional formatting for value cells: colours each leaf cell by how
  // far its value sits above (up) or below (down) its measure's average.
  // Aggregated (collapsed-group subtotal) rows are left plain.
  function makeValueRenderer(): CellRenderer<string> {
    const renderer: CellRenderer<string> = (data, dataCtx: ValueCellDataContext, ctx: RendererContext) => {
      const container = ctx.container;
      container.style.background = "";
      // Alignment and padding are set explicitly: flush right, theme padding on
      // three sides and a tighter 3px on the right.
      container.style.justifyContent = "flex-end";
      container.style.fontFamily = "\"SF Mono\", ui-monospace, Menlo, Consolas, monospace";
      container.style.fontVariantNumeric = "tabular-nums";
      container.style.paddingTop = "calc(var(--cell-padding-y) * 1px)";
      container.style.paddingBottom = "calc(var(--cell-padding-y) * 1px)";
      container.style.paddingLeft = "calc(var(--cell-padding-x) * 1px)";
      container.style.paddingRight = "3px";
      const text = data == null ? "" : String(data);
      if (format === "na") return text;

      const meta = dataCtx.viewModel.metadata;
      if (meta?.getValueRowMeta(dataCtx.rowIndex)?.["aggregated"]) return text;

      const colMeta = meta?.getValueColumnMeta(dataCtx.colIndex);
      const avg = Number(colMeta?.["avg"]);
      const raw = Number(dataCtx.rawValue);
      if (!colMeta || !Number.isFinite(avg) || avg === 0 || Number.isNaN(raw)) return text;

      const pct = (raw - avg) / Math.abs(avg);
      const intensity = Math.min(Math.abs(pct), 1);
      const color = pct >= 0 ? "var(--ps-up)" : "var(--ps-down)";
      const mix = Math.round(10 + intensity * 48);
      container.style.background = `color-mix(in srgb, ${color} ${mix}%, var(--value-background-color))`;
      return text;
    };
    return renderer;
  }

  // ----- facet renderers -----

  function makeRowFacetRenderer(): FacetCellRenderer {
    return (data: string, dataCtx: FacetDataContext, rCtx: FacetRendererContext): FacetCellContent | string => {
      const level = dataCtx.level;
      const ns = `row-${level}-${dataCtx.index}`;
      if (dataCtx.viewModel.metaState.get(ns)?.["loading"] === true) {
        return { left: icon("loader"), content: String(data ?? "") };
      }
      const isLeaf = level >= rowDimFields.length - 1;
      if (!groupRows || isLeaf || data == null) return String(data ?? "");

      const facetDef = dataCtx.viewModel.facetDefs.row[level];
      let open = false;
      const meta = facetDef?.meta;
      if (meta) {
        if (meta.projectionState === ProjectionState.PROJECTED) open = true;
        else if (meta.projectionState === ProjectionState.SOME_PROJECTED) open = meta.projectedValues.has(String(data));
      }

      const chevron = icon(open ? "chevron-down" : "chevron-right");
      chevron.classList.add("ps-chevron");
      const ancestors = dataCtx.path.slice(0, level).map(v => String(v));
      const key = [...ancestors, String(data)].join(SEP);
      chevron.addEventListener("click", async e => {
        e.stopPropagation();
        dataCtx.viewModel.metaState.set(ns, "loading", true);
        rCtx.render(dataCtx.viewModel);
        if (open) collapsedRows.add(key);
        else collapsedRows.delete(key);
        await scheduleRebuild();
        if (destroyed) return;
        dataCtx.viewModel.metaState.clear(ns);
        if (grid) grid.draw();
      });
      return { left: chevron, content: String(data) };
    };
  }

  // The field is bound per level here, not read from ctx.level: for a pivot the
  // row-facet corner cells all render in the same column-facet header row, so
  // ctx.level is identical across them and cannot identify the dimension.
  function makeRowHeaderRenderer(field: string | undefined): FacetHeaderRenderer {
    const renderer: FacetHeaderRenderer = text => {
      if (!field) return text || "";
      return { left: sortIconEl(field), content: text || FIELD_LABEL.get(field) || field, right: filterIconEl(field) };
    };
    return renderer;
  }

  function makeColHeaderRenderer(): FacetHeaderRenderer {
    const renderer: FacetHeaderRenderer = (text, ctx) => {
      const field = colDimFields[ctx.level];
      if (!field) return text || "";
      return { content: text || FIELD_LABEL.get(field) || field, right: filterIconEl(field) };
    };
    return renderer;
  }

  function sortIconEl(field: string): HTMLElement {
    const btn = icon("sort");
    btn.classList.add("ps-icon-btn");
    if (sortEntries.some(e => e.field === field)) btn.classList.add("active");
    btn.title = `Sort ${FIELD_LABEL.get(field) ?? field}`;
    btn.addEventListener("click", e => {
      e.stopPropagation();
      openSortPopup(popupLayer, btn, field, sortEntries.find(en => en.field === field), entry => {
        sortEntries = entry ? [entry] : [];
        scheduleRebuild();
      });
    });
    return btn;
  }

  function filterIconEl(field: string): HTMLElement {
    const btn = icon("filter");
    btn.classList.add("ps-icon-btn");
    if (filterMap.has(field)) btn.classList.add("active");
    btn.title = `Filter ${FIELD_LABEL.get(field) ?? field}`;
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      const current = filterMap.get(field);
      openFilterPopup(popupLayer, btn, field, null, current, apply);
      const active = await ensureData();
      const values = await active.resolveFacetValues({ type: "facet", fields: [field], mode: "distinct" });
      if (destroyed) return;
      openFilterPopup(popupLayer, btn, field, values[0] ?? [], current, apply);

      function apply(filter: ScalarFilter | null): void {
        if (filter) filterMap.set(field, filter);
        else filterMap.delete(field);
        scheduleRebuild();
      }
    });
    return btn;
  }

  function refreshCrossAxis(): void {
    const measures = countMeasures(rowExpr) + countMeasures(colExpr);
    const msg = measures === 0 ? "Add at least one measure on either Rows or Columns" : null;
    rowsEditor.setExternalError(msg);
    colsEditor.setExternalError(msg);
  }

  // ----- grid lifecycle driven by IntersectionObserver -----

  function showGrid(): void {
    if (grid || destroyed) return;
    grid = new Grid({}, gridMount, "pivot");
    disposeTheme = syncCustomGridTheme(grid, THEME_LIGHT, THEME_DARK);
    if (vm) {
      grid.data = vm;
      grid.draw();
    } else {
      setOverlay("loading");
      scheduleRebuild().then(() => { if (!destroyed) setOverlay(null); });
    }
  }

  function destroyGrid(): void {
    if (!grid) return;
    disposeTheme?.();
    disposeTheme = undefined;
    grid = null;
    // Removing the mount element drops every listener the grid attached to it;
    // the datasource, model and viewmodel are deliberately kept alive.
    const fresh = document.createElement("div");
    fresh.className = "ps-grid";
    gridMount.replaceWith(fresh);
    gridMount = fresh;
  }

  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) showGrid();
      else destroyGrid();
    }
  }, { threshold: 0.01 });
  observer.observe(gridWrap);

  refreshCrossAxis();

  function setOverlay(kind: "loading" | "error" | null, message?: string): void {
    if (kind === null) {
      overlay.style.display = "none";
      return;
    }
    overlay.style.display = "flex";
    overlay.dataset.kind = kind;
    overlay.textContent = kind === "loading" ? "Running query…" : `Error: ${message ?? ""}`;
  }

  // ----- cleanup -----
  return () => {
    destroyed = true;
    observer.disconnect();
    chromeObserver.disconnect();
    disposeTheme?.();
    popupLayer.dispose();
    rowsEditor.dispose();
    colsEditor.dispose();
    groupToggle.dispose();
    void ds?.release();
    root.remove();
  };

  /* ===== utils ===== */

  function measureColumnMap(columnFacets: (string | null)[][]): (string | null)[] | null {
    if (countMeasures(colExpr) === 0) return null;
    return columnFacets[columnFacets.length - 1] ?? null;
  }
}

/* ===== module-level utils ===== */

function dimFieldsOf(expr: AxisExpr): string[] {
  if (typeof expr === "string") return DIMENSION_NAMES.includes(expr) ? [expr] : [];
  if (expr.type === "hierarchy") return [...expr.fields];
  return expr.children.flatMap(dimFieldsOf);
}

function treeToPaths(tree: ProjectionTree): DimensionalProjectionPath[] {
  const keys = Object.keys(tree);
  if (keys.length === 0) return [];
  const paths: DimensionalProjectionPath[] = [];
  for (const key of keys) {
    const childPaths = treeToPaths(tree[key]);
    if (childPaths.length > 0) {
      for (const child of childPaths) paths.push({ open: [key], next: child });
    } else {
      paths.push({ open: [key] });
    }
  }
  return paths;
}

const INT_FMT = new Intl.NumberFormat("en-US");
const NUM_FMT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

function formatMeasure(measure: string | null | undefined, val: unknown, agg?: Agg): string {
  if (val === null || val === undefined) return "";
  const num = Number(val);
  if (Number.isNaN(num)) return String(val);
  // MRR reads as dollars for every aggregation except count (which is a row tally).
  const isCurrency = measure != null && measure.toLowerCase() === "mrr" && agg !== "count";
  // Currency rounds to whole dollars; other measures keep one decimal so
  // averages read correctly while sums/counts stay integer.
  return isCurrency ? `$${INT_FMT.format(Math.round(num))}` : NUM_FMT.format(num);
}

const ICONS: Record<string, string> = {
  "chevron-right": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M9 6l6 6-6 6\"/></svg>",
  "chevron-down": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M6 9l6 6 6-6\"/></svg>",
  sort: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M7 4v16M7 4L4 7M7 4l3 3M17 20V4M17 20l-3-3M17 20l3-3\"/></svg>",
  filter: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.1\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M4 5h16l-6 7v6l-4 2v-8z\"/></svg>",
  loader: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.4\" stroke-linecap=\"round\" class=\"ps-spin\"><path d=\"M12 3a9 9 0 1 0 9 9\"/></svg>",
};

function icon(name: string): HTMLElement {
  const span = document.createElement("span");
  span.className = "ps-icon";
  span.innerHTML = ICONS[name];
  return span;
}

function makeToggle(label: string, initial: boolean, onChange: (checked: boolean) => void): { el: HTMLElement; dispose: () => void } {
  const wrap = document.createElement("label");
  wrap.className = "ps-toggle";
  const text = document.createElement("span");
  text.textContent = label;
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = initial;
  const track = document.createElement("span");
  track.className = "ps-toggle-track";
  const handler = (): void => onChange(input.checked);
  input.addEventListener("change", handler);
  wrap.append(text, input, track);
  return { el: wrap, dispose: () => input.removeEventListener("change", handler) };
}

function makeFormatControl(initial: FormatMode, onChange: (mode: FormatMode) => void): { el: HTMLElement; dispose: () => void } {
  const wrap = document.createElement("label");
  wrap.className = "ps-format";
  const text = document.createElement("span");
  text.textContent = "Format";
  const select = document.createElement("select");
  select.className = "ps-format-select";
  for (const opt of FORMAT_OPTIONS) {
    const o = document.createElement("option");
    o.value = opt.value;
    o.textContent = opt.label;
    if (opt.value === initial) o.selected = true;
    select.append(o);
  }
  const handler = (): void => onChange(select.value as FormatMode);
  select.addEventListener("change", handler);
  wrap.append(text, select);
  return { el: wrap, dispose: () => select.removeEventListener("change", handler) };
}

interface AggApi {
  get: (field: string) => Agg;
  set: (field: string, agg: Agg) => void;
}

function makeFieldsPanel(onInsert: (token: string) => void, aggApi: AggApi): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "ps-fields";

  const groups: { title: string; kind: "dimension" | "measure" }[] = [
    { title: "Dimensions", kind: "dimension" },
    { title: "Measures", kind: "measure" },
  ];
  for (const group of groups) {
    const head = document.createElement("div");
    head.className = "ps-fields-head";
    head.textContent = group.title;
    panel.append(head);
    for (const field of FIELDS.filter(f => f.kind === group.kind)) {
      const chip = document.createElement("div");
      chip.className = "ps-chip";

      const insert = document.createElement("button");
      insert.className = "ps-chip-insert";
      insert.title = `Insert ${field.name}`;
      const badge = document.createElement("span");
      badge.className = `ps-chip-badge ${field.kind}`;
      badge.textContent = field.kind === "measure" ? "#" : "Abc";
      const name = document.createElement("span");
      name.className = "ps-chip-name";
      name.textContent = field.label;
      insert.append(badge, name);
      insert.addEventListener("click", () => onInsert(field.name));
      chip.append(insert);

      if (field.kind === "measure") {
        const select = document.createElement("select");
        select.className = "ps-agg-select";
        select.title = "Aggregation";
        for (const opt of AGG_OPTIONS) {
          const o = document.createElement("option");
          o.value = opt;
          o.textContent = opt;
          if (opt === aggApi.get(field.name)) o.selected = true;
          select.append(o);
        }
        select.addEventListener("click", e => e.stopPropagation());
        select.addEventListener("change", () => aggApi.set(field.name, select.value as Agg));
        chip.append(select);
      }
      panel.append(chip);
    }
  }
  const hint = document.createElement("div");
  hint.className = "ps-fields-hint";
  hint.textContent = `${MEASURE_NAMES.length} measures · ${DIMENSION_NAMES.length} dimensions · click name to insert, pick each measure's aggregation`;
  panel.append(hint);
  return panel;
}

function makeStyle(): HTMLStyleElement {
  const style = document.createElement("style");
  style.textContent = CSS;
  return style;
}

const CSS = `
.ps-root {
  display: flex; flex-direction: column;
  height: ${GRID_HEIGHT}px; position: relative;
  border: 1px solid var(--ps-border); border-radius: 12px; overflow: hidden;
  background: var(--ps-surface); color: var(--ps-text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 13px;
}
.ps-header { display: flex; align-items: center; gap: 16px; padding: 14px 18px; border-bottom: 1px solid var(--ps-border); background: var(--ps-panel); }
.ps-title { font-size: 15px; font-weight: 700; letter-spacing: -0.01em; }
.ps-sub { font-size: 12px; color: var(--ps-text-muted); margin-top: 2px; }
.ps-header > :first-child { flex: 1; }

.ps-controls { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
.ps-toggle { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; user-select: none; font-size: 12.5px; font-weight: 600; }
.ps-toggle input { position: absolute; opacity: 0; pointer-events: none; }
.ps-format { display: inline-flex; align-items: center; gap: 8px; user-select: none; font-size: 12.5px; font-weight: 600; }
.ps-format-select { font: inherit; font-size: 12px; font-weight: 600; color: var(--ps-text); background: var(--ps-raised);
  border: 1px solid var(--ps-border-strong); border-radius: 6px; padding: 3px 6px; cursor: pointer; outline: none; }
.ps-format-select:hover { border-color: var(--ps-accent); }
.ps-toggle-track { width: 34px; height: 18px; border-radius: 999px; background: var(--ps-border-strong); position: relative; transition: background .15s; }
.ps-toggle-track::after { content: ""; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fff; transition: transform .15s; box-shadow: 0 1px 2px rgba(0,0,0,.25); }
.ps-toggle input:checked + .ps-toggle-track { background: var(--ps-accent); }
.ps-toggle input:checked + .ps-toggle-track::after { transform: translateX(16px); }

.ps-exprbar { display: flex; flex-direction: column; gap: 7px; padding: 10px 18px; border-bottom: 1px solid var(--ps-border); background: var(--ps-surface); }
.ps-editor { display: grid; grid-template-columns: 70px 1fr; align-items: center; gap: 10px; }
.ps-editor-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--ps-text-muted); }
.ps-editor-field { position: relative; display: flex; }
.ps-input { width: 100%; box-sizing: border-box; padding: 7px 32px 7px 10px; border: 1px solid var(--ps-border-strong); border-radius: 7px;
  background: var(--ps-input-bg); color: var(--ps-text); font-family: "SF Mono", ui-monospace, Menlo, Consolas, monospace; font-size: 12.5px; outline: none; }
.ps-input:focus { border-color: var(--ps-accent); box-shadow: 0 0 0 3px var(--ps-accent-soft); }
.ps-input-mirror { position: absolute; visibility: hidden; white-space: pre; left: 10px; top: 0; font-family: "SF Mono", ui-monospace, Menlo, Consolas, monospace; font-size: 12.5px; }
.ps-valid { position: absolute; right: 9px; top: 50%; transform: translateY(-50%); display: inline-flex; width: 15px; height: 15px; cursor: help; }
.ps-valid svg { width: 15px; height: 15px; display: block; }
.ps-valid[data-state="ok"] { color: var(--ps-ok); }
.ps-valid[data-state="error"] { color: var(--ps-error); }

.ps-pop { position: absolute; top: calc(100% + 3px); z-index: 40; min-width: 240px; max-width: 340px; max-height: 220px; overflow-y: auto;
  background: var(--ps-popup-bg); border: 1px solid var(--ps-border-strong); border-radius: 8px; box-shadow: var(--ps-popup-shadow); padding: 4px; }
.ps-pop-item { display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-radius: 6px; cursor: pointer; }
.ps-pop-item.sel { background: var(--ps-accent-soft); }
.ps-pop-glyph { width: 16px; text-align: center; font-size: 11px; opacity: .9; }
.ps-pop-glyph.kind-operator { color: var(--ps-accent); }
.ps-pop-glyph.kind-dimension { color: var(--ps-dim-badge-text); }
.ps-pop-glyph.kind-measure { color: var(--ps-meas-badge-text); }
.ps-pop-label { font-family: "SF Mono", ui-monospace, Menlo, Consolas, monospace; font-size: 12px; font-weight: 600; }
.ps-pop-detail { margin-left: auto; font-size: 10.5px; color: var(--ps-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 160px; }

.ps-body { flex: 1; display: flex; min-height: 0; }
.ps-fields { width: 172px; flex-shrink: 0; border-right: 1px solid var(--ps-border); background: var(--ps-panel); overflow-y: auto; padding: 8px; }
.ps-fields-head { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; color: var(--ps-text-muted); margin: 8px 3px 4px; }
.ps-fields-head:first-child { margin-top: 1px; }
.ps-chip { display: flex; align-items: center; gap: 6px; width: 100%; box-sizing: border-box; padding: 2px 5px 2px 6px; margin-bottom: 2px; border: 1px solid var(--ps-border); border-radius: 6px;
  background: var(--ps-surface); color: var(--ps-text); transition: border-color .12s, background .12s; }
.ps-chip:hover { border-color: var(--ps-accent); background: var(--ps-hover); }
.ps-chip-insert { flex: 1; min-width: 0; display: flex; align-items: center; gap: 7px; border: none; background: transparent; color: inherit; cursor: pointer; text-align: left; font: inherit; padding: 3px 0; }
.ps-chip-name { font-size: 12px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ps-chip-badge { flex-shrink: 0; font-size: 8.5px; font-weight: 700; padding: 1px 4px; border-radius: 3px; letter-spacing: .02em; }
.ps-agg-select { flex-shrink: 0; font-family: "SF Mono", ui-monospace, Menlo, Consolas, monospace; font-size: 10px; font-weight: 600; text-transform: uppercase;
  color: var(--ps-text-muted); background: var(--ps-raised); border: 1px solid var(--ps-border-strong); border-radius: 4px; padding: 2px 3px; cursor: pointer; outline: none; }
.ps-agg-select:hover { color: var(--ps-accent); border-color: var(--ps-accent); }
.ps-chip-badge.dimension { background: var(--ps-dim-badge-bg); color: var(--ps-dim-badge-text); }
.ps-chip-badge.measure { background: var(--ps-meas-badge-bg); color: var(--ps-meas-badge-text); }
.ps-fields-hint { font-size: 10.5px; color: var(--ps-text-muted); margin: 12px 4px 4px; line-height: 1.5; }

.ps-grid-wrap { flex: 1; position: relative; min-width: 0; }
.ps-grid { position: absolute; inset: 0; overflow: auto; }
.ps-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 5;
  background: var(--ps-accent-soft); color: var(--ps-text-muted); font-size: 12.5px; font-weight: 600; backdrop-filter: blur(1px); }
.ps-overlay[data-kind="error"] { color: var(--ps-error); }

.ps-icon { display: inline-flex; align-items: center; justify-content: center; }
.ps-icon svg { width: 12px; height: 12px; display: block; }
.ps-chevron { cursor: pointer; opacity: .78; }
.ps-chevron:hover { opacity: 1; }
.ps-icon-btn { cursor: pointer; opacity: .6; padding: 2px; border-radius: 4px; }
.ps-icon-btn:hover { opacity: 1; background: var(--ps-hover); }
.ps-icon-btn.active { opacity: 1; color: var(--ps-accent); background: var(--ps-accent-soft); }
.ps-spin { animation: ps-spin 0.8s linear infinite; transform-origin: center; }
@keyframes ps-spin { to { transform: rotate(360deg); } }

.ps-popup-overlay { position: fixed; inset: 0; z-index: 60; }
.ps-popup { position: fixed; min-width: 210px; max-width: 280px; background: var(--ps-popup-bg); border: 1px solid var(--ps-border-strong);
  border-radius: 9px; box-shadow: var(--ps-popup-shadow); padding: 8px; color: var(--ps-text); }
.ps-popup-title { font-size: 12px; font-weight: 700; margin: 2px 4px 8px; }
.ps-popup-option { display: block; width: 100%; box-sizing: border-box; text-align: left; padding: 6px 8px; border: none; border-radius: 6px;
  background: transparent; color: var(--ps-text); cursor: pointer; font: inherit; font-size: 12px; }
.ps-popup-option:hover { background: var(--ps-hover); }
.ps-popup-option.active { background: var(--ps-accent-soft); color: var(--ps-accent); font-weight: 600; }
.ps-popup-divider { height: 1px; background: var(--ps-border); margin: 6px 2px; }
.ps-popup-search { width: 100%; box-sizing: border-box; padding: 6px 8px; margin-bottom: 6px; border: 1px solid var(--ps-border-strong); border-radius: 6px; background: var(--ps-input-bg); color: var(--ps-text); font: inherit; font-size: 12px; outline: none; }
.ps-popup-list { max-height: 180px; overflow-y: auto; }
.ps-popup-check { display: flex; align-items: center; gap: 8px; padding: 4px 6px; border-radius: 5px; cursor: pointer; font-size: 12px; }
.ps-popup-check:hover { background: var(--ps-hover); }
.ps-popup-actions { display: flex; align-items: center; gap: 6px; margin-top: 8px; }
.ps-popup-link { border: none; background: transparent; color: var(--ps-accent); cursor: pointer; font: inherit; font-size: 11.5px; font-weight: 600; padding: 4px 6px; }
.ps-popup-apply { margin-left: auto; border: none; background: var(--ps-accent); color: #fff; cursor: pointer; font: inherit; font-size: 12px; font-weight: 600; padding: 5px 14px; border-radius: 6px; }
.ps-popup-loading { padding: 12px 8px; font-size: 12px; color: var(--ps-text-muted); }
`;
