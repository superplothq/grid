import Grid, { PivotDataViewModel } from "@superplot/grid/renderer";
import type {
  CellRenderer,
  GridDataViewModelOptions,
  RendererContext,
  ValueCellDataContext,
  VTrackDef,
} from "@superplot/grid/renderer";
import type { PivotDataViewModelParams } from "@superplot/grid/renderer/pivot-data-viewmodel";
import { DuckDBWasmDataSource, SqlPivotTableDataModel } from "@superplot/grid";
import type {
  AxisExpr,
  DimensionalProjectionPath,
  PivotConfig,
} from "@superplot/grid";
import { syncCustomGridTheme } from "../../runtime/theme";
import type { GridThemeName } from "../../runtime/theme";
import {
  DIMENSION_NAMES,
  FIELDS,
  generateDataset,
  type Dataset,
} from "../../demos/pivot-studio/data";
import { parseExpression } from "../../demos/pivot-studio/algebra";
import { ExpressionEditor } from "../../demos/pivot-studio/editor";
import {
  applyChromeVars,
  registerThemes,
  THEME_DARK,
  THEME_LIGHT,
} from "../../demos/pivot-studio/theme";

// A trimmed pivot widget for the docs: just the two table-algebra editors (Rows /
// Columns) over a live pivot grid. No studio chrome, no drill-down chevrons, no
// sort/filter — every dimension is rendered fully expanded so the shape of an
// expression reads straight off the grid. Editors keep their autocomplete and
// live validation; a committed expression re-runs the query and redraws.

export interface PivotExample {
  rows: string;
  columns: string;
}

const FIELD_LABEL = new Map(FIELDS.map(f => [f.name, f.label]));
const MEASURE_NAMES = new Set(FIELDS.filter(f => f.kind === "measure").map(f => f.name));
const GRID_HEIGHT = 460;

// One DuckDB datasource for the whole page: created once on first mount, loaded
// with the shared dataset, then reused by every pivot widget. It is deliberately
// never released — it lives for the page's lifetime so scrolling between examples
// costs nothing.
let sharedPromise: Promise<{ ds: DuckDBWasmDataSource; dataset: Dataset }> | null = null;

function sharedData(): Promise<{ ds: DuckDBWasmDataSource; dataset: Dataset }> {
  if (!sharedPromise) {
    sharedPromise = (async () => {
      const dataset = generateDataset();
      const ds = await DuckDBWasmDataSource.create();
      await ds.loadData({ schema: dataset.schema, data: dataset.data });
      return { ds, dataset };
    })();
  }
  return sharedPromise;
}

export function mountPivot(el: HTMLElement, example: PivotExample): () => void {
  registerThemes();

  let model: SqlPivotTableDataModel | null = null;
  let vm: PivotDataViewModel | null = null;
  let grid: Grid | null = null;
  let disposeTheme: (() => void) | undefined;
  let destroyed = false;
  let lastResult: PivotDataViewModelParams | null = null;
  let chain: Promise<void> = Promise.resolve();

  let rowExpr: AxisExpr = exprFrom(example.rows);
  let colExpr: AxisExpr = exprFrom(example.columns);

  // ----- DOM shell -----
  const root = document.createElement("div");
  root.className = "pt-root";
  root.append(makeStyle());

  const exprBar = document.createElement("div");
  exprBar.className = "pt-exprbar";
  const rowsEditor = new ExpressionEditor({
    label: "Rows",
    initial: example.rows,
    onFocus: () => {},
    onCommit: expr => { rowExpr = expr; scheduleRebuild(); },
  });
  const colsEditor = new ExpressionEditor({
    label: "Columns",
    initial: example.columns,
    onFocus: () => {},
    onCommit: expr => { colExpr = expr; scheduleRebuild(); },
  });
  exprBar.append(rowsEditor.el, colsEditor.el);

  const gridWrap = document.createElement("div");
  gridWrap.className = "pt-grid-wrap";
  let gridMount = document.createElement("div");
  gridMount.className = "pt-grid";
  const overlay = document.createElement("div");
  overlay.className = "pt-overlay";
  overlay.style.display = "none";
  gridWrap.append(gridMount, overlay);

  root.append(exprBar, gridWrap);
  el.append(root);

  const chromeMedia = matchMedia("(prefers-color-scheme: dark)");
  const chromeObserver = new MutationObserver(() => applyChromeVars(root, resolveMode()));
  chromeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  chromeMedia.addEventListener("change", () => applyChromeVars(root, resolveMode()));
  applyChromeVars(root, resolveMode());

  function resolveMode(): GridThemeName {
    const attr = document.documentElement.dataset.theme;
    if (attr === "dark" || attr === "light") return attr;
    return chromeMedia.matches ? "dark" : "light";
  }

  // ----- pipeline -----

  async function ensureModel(): Promise<SqlPivotTableDataModel> {
    if (model) return model;
    const { ds, dataset } = await sharedData();
    model = new SqlPivotTableDataModel(dataset.schema, ds);
    return model;
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
    const active = await ensureModel();
    const result = await active.getViewModelData(buildConfig(rowExpr, colExpr));
    if (destroyed) return;
    lastResult = result;
    applyResult();
  }

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
    const rowDims = dimFieldsOf(rowExpr);
    const colDims = dimFieldsOf(colExpr);
    const measureByCol = columnFacets[columnFacets.length - 1] ?? null;

    if (facetDefs) {
      opts.facetDefs = {
        axis: facetDefs.axis,
        row: (facetDefs.row ?? []).map((d, i) => ({
          ...d,
          text: rowDims[i] ? FIELD_LABEL.get(rowDims[i])! : d.text,
        })),
        col: (facetDefs.col ?? []).map((d, i, arr) => ({
          ...d,
          text: colDims[i] ? FIELD_LABEL.get(colDims[i])! : d.text,
          ...(i === arr.length - 1 && measureByCol
            ? {
              valueFormatter: (val: unknown, ctx: { colIndex: number }) =>
                formatMeasure(measureByCol[ctx.colIndex], val),
            }
            : {}),
        })),
      };
    }

    const valueRenderer = makeValueRenderer();
    opts.vTrackDefs = Array.from({ length: numCols }, (): Partial<VTrackDef> => ({ renderer: valueRenderer }));
    return opts;
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
    // Dropping the mount element releases every listener the grid attached; the
    // shared datasource, this widget's model and its viewmodel are kept alive.
    const fresh = document.createElement("div");
    fresh.className = "pt-grid";
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
    rowsEditor.dispose();
    colsEditor.dispose();
    root.remove();
    // The shared datasource is intentionally not released; it serves every widget
    // on the page and is torn down only when the page itself unloads.
  };
}

/* ===== helpers ===== */

function exprFrom(text: string): AxisExpr {
  const parsed = parseExpression(text);
  if ("expr" in parsed) return parsed.expr;
  throw new Error(`Invalid pivot expression: ${text}`);
}

function dimFieldsOf(expr: AxisExpr): string[] {
  if (typeof expr === "string") return DIMENSION_NAMES.includes(expr) ? [expr] : [];
  if (expr.type === "hierarchy") return [...expr.fields];
  return expr.children.flatMap(dimFieldsOf);
}

// A projection that expands every value at every level (`"*"`), so the grid shows
// the fully drilled-down shape with no chevrons to click.
function fullOpen(depth: number): DimensionalProjectionPath[] | undefined {
  if (depth <= 1) return undefined;
  let node: DimensionalProjectionPath = { open: "*" };
  for (let i = 0; i < depth - 2; i++) node = { open: "*", next: node };
  return [node];
}

function buildConfig(rowExpr: AxisExpr, colExpr: AxisExpr): PivotConfig {
  return {
    rows: { expr: rowExpr, projection: fullOpen(dimFieldsOf(rowExpr).length) },
    columns: { expr: colExpr, projection: fullOpen(dimFieldsOf(colExpr).length) },
  };
}

const INT_FMT = new Intl.NumberFormat("en-US");
const NUM_FMT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

function formatMeasure(measure: string | null | undefined, val: unknown): string {
  if (val === null || val === undefined) return "";
  const num = Number(val);
  if (Number.isNaN(num)) return String(val);
  const isCurrency = measure != null && measure.toLowerCase() === "mrr";
  return isCurrency ? `$${INT_FMT.format(Math.round(num))}` : NUM_FMT.format(num);
}

function makeValueRenderer(): CellRenderer<string> {
  return (data, _dataCtx: ValueCellDataContext, ctx: RendererContext) => {
    const container = ctx.container;
    container.style.justifyContent = "flex-end";
    container.style.fontFamily = "\"SF Mono\", ui-monospace, Menlo, Consolas, monospace";
    container.style.fontVariantNumeric = "tabular-nums";
    container.style.paddingTop = "calc(var(--cell-padding-y) * 1px)";
    container.style.paddingBottom = "calc(var(--cell-padding-y) * 1px)";
    container.style.paddingLeft = "calc(var(--cell-padding-x) * 1px)";
    container.style.paddingRight = "3px";
    return data == null ? "" : String(data);
  };
}

function makeStyle(): HTMLStyleElement {
  const style = document.createElement("style");
  style.textContent = CSS;
  return style;
}

// Container styles plus the editor / autocomplete-popup rules the ExpressionEditor
// expects (it renders `.ps-editor` / `.ps-input` / `.ps-pop` and reads `--ps-*`
// chrome vars set by applyChromeVars).
const CSS = `
.pt-root {
  display: flex; flex-direction: column;
  height: ${GRID_HEIGHT}px; position: relative;
  border: 1px solid var(--ps-border); border-radius: 12px; overflow: hidden;
  background: var(--ps-surface); color: var(--ps-text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 13px;
}
.pt-exprbar { display: flex; flex-direction: column; gap: 7px; padding: 12px 16px; border-bottom: 1px solid var(--ps-border); background: var(--ps-panel); }
.pt-grid-wrap { flex: 1; position: relative; min-width: 0; }
.pt-grid { position: absolute; inset: 0; overflow: auto; }
.pt-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 5;
  background: var(--ps-accent-soft); color: var(--ps-text-muted); font-size: 12.5px; font-weight: 600; backdrop-filter: blur(1px); }
.pt-overlay[data-kind="error"] { color: var(--ps-error); }

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
`;
