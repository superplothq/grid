import Grid, { FlattenedDataViewModel } from "@superplot/grid/renderer";
import type { CellRenderer, ValueCellDataContext, VTrackDef } from "@superplot/grid/renderer";
import { scaleLinear } from "d3-scale";
import { line, area, curveCatmullRom } from "d3-shape";
import { createGridMount } from "../../runtime/mount";
import { createToolbar, toolbarSelect } from "../../runtime/toolbar";
import { syncGridTheme } from "../../runtime/theme";

type ChartType = "line" | "bar" | "area";
type Status = "Todo" | "In progress" | "Blocked" | "Done";
const STATUSES: Status[] = ["Todo", "In progress", "Blocked", "Done"];

interface Row {
  name: string;
  trend: number[];
  status: Status;
  color: string;
  due: string;
  progress: number;
}

const GRID_HEIGHT = 460;
const ROW_HEIGHT = 46;

export function mount(el: HTMLElement): () => void {
  const rows = generateRows();
  // Read live by the chart renderer; a plain draw() repaints every visible chart.
  let chartType: ChartType = "line";

  // Every renderer stays stateless: it reads the row from `rows` by index and
  // writes edits straight back, then `render()` swaps fresh data into the
  // viewmodel and redraws. The DOM never holds the source of truth.
  const COLUMNS: { label: string; get: (row: Row) => unknown; renderer: CellRenderer<any>; width: number }[] = [
    { label: "Task", width: 1.5, get: (row) => row.name, renderer: nameRenderer },
    { label: "30-day trend", width: 1.2, get: (row) => row.trend, renderer: trendRenderer },
    { label: "Status", width: 1.2, get: (row) => row.status, renderer: statusRenderer },
    { label: "Label color", width: 1.1, get: (row) => row.color, renderer: colorRenderer },
    { label: "Due", width: 1.1, get: (row) => row.due, renderer: dateRenderer },
    { label: "Progress", width: 1.3, get: (row) => row.progress, renderer: progressRenderer },
    { label: "", width: 0.9, get: () => null, renderer: actionRenderer },
  ];

  const toolbar = createToolbar();
  const label = document.createElement("span");
  label.textContent = "Trend chart";
  label.style.cssText = "font-size:12px;opacity:0.7;";
  const chartPicker = toolbarSelect(["line", "bar", "area"], chartType);
  chartPicker.addEventListener("change", () => {
    chartType = chartPicker.value as ChartType;
    grid.draw();
  });
  toolbar.append(label, chartPicker);

  const gridMount = createGridMount(el, GRID_HEIGHT);
  el.append(toolbar, gridMount);
  const grid = new Grid({}, gridMount, "flat");
  const disposeTheme = syncGridTheme(grid);

  const viewModel = new FlattenedDataViewModel({
    data: COLUMNS.map((column) => rows.map((row) => column.get(row))),
    columnFacets: [COLUMNS.map((column) => column.label)],
    totalRows: rows.length,
    options: {
      vTrackDefs: COLUMNS.map((column): Partial<VTrackDef> => ({
        renderer: column.renderer,
        cellHeight: ROW_HEIGHT,
        colSize: { strategy: "static", width: column.width, unit: "fr" },
      })),
      facetDefs: { row: [], col: [{ text: "" }], axis: "col" },
    },
  });
  grid.data = viewModel;
  grid.draw();

  return () => {
    disposeTheme();
    el.removeChild(toolbar);
    el.removeChild(gridMount);
  };

  // Re-derive the column-major data from `rows` and push it into the viewmodel.
  // Called after any in-cell edit so the renderers redraw from the new state.
  function render(): void {
    viewModel.updateData({
      data: COLUMNS.map((column) => rows.map((row) => column.get(row))),
      columnFacets: [COLUMNS.map((column) => column.label)],
      totalRows: rows.length,
    });
    grid.draw();
  }

  // ----- renderers -----

  function nameRenderer(data: string, _dataCtx: ValueCellDataContext, ctx: { container: HTMLElement }): HTMLElement {
    ctx.container.style.justifyContent = "flex-start";
    ctx.container.style.paddingLeft = "10px";
    const span = document.createElement("span");
    span.textContent = data;
    span.style.cssText = "font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    return span;
  }

  // The cell value is a number[]; d3 turns it into an inline SVG sparkline. The
  // chart type is read from scope, so switching it is a pure repaint.
  function trendRenderer(data: number[], dataCtx: ValueCellDataContext): string {
    return trendSvg(data ?? [], chartType, rows[dataCtx.rowIndex].color);
  }

  function statusRenderer(data: string, dataCtx: ValueCellDataContext, ctx: { container: HTMLElement }): HTMLElement {
    ctx.container.style.padding = "0 8px";
    const select = document.createElement("select");
    select.style.cssText = fieldStyle + "cursor:pointer;";
    for (const status of STATUSES) {
      const option = document.createElement("option");
      option.value = status;
      option.textContent = status;
      select.appendChild(option);
    }
    select.value = data;
    select.addEventListener("change", () => {
      rows[dataCtx.rowIndex].status = select.value as Status;
      render();
    });
    return select;
  }

  function colorRenderer(data: string, dataCtx: ValueCellDataContext): HTMLElement {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;gap:8px;align-items:center;";
    const input = document.createElement("input");
    input.type = "color";
    input.value = data;
    input.style.cssText = "width:24px;height:24px;padding:0;border:none;background:none;cursor:pointer;border-radius:6px;";
    input.addEventListener("change", () => {
      rows[dataCtx.rowIndex].color = input.value;
      render();
    });
    const hex = document.createElement("span");
    hex.textContent = data;
    hex.style.cssText = "font-variant-numeric:tabular-nums;font-size:12px;opacity:0.65;";
    wrap.append(input, hex);
    return wrap;
  }

  function dateRenderer(data: string, dataCtx: ValueCellDataContext, ctx: { container: HTMLElement }): HTMLElement {
    ctx.container.style.padding = "0 8px";
    const input = document.createElement("input");
    input.type = "date";
    input.value = data;
    input.style.cssText = fieldStyle + "cursor:text;";
    input.addEventListener("change", () => {
      rows[dataCtx.rowIndex].due = input.value;
      render();
    });
    return input;
  }

  function progressRenderer(data: number, dataCtx: ValueCellDataContext, ctx: { container: HTMLElement }): HTMLElement {
    ctx.container.style.padding = "0 10px";
    const pct = Math.max(0, Math.min(100, data));
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;gap:8px;align-items:center;width:100%;";
    const track = document.createElement("div");
    track.style.cssText = "flex:1;height:6px;border-radius:3px;overflow:hidden;background:color-mix(in srgb, currentColor 14%, transparent);";
    const fill = document.createElement("div");
    fill.style.cssText = `width:${pct}%;height:100%;border-radius:3px;background:${rows[dataCtx.rowIndex].color};`;
    track.appendChild(fill);
    const num = document.createElement("span");
    num.textContent = `${pct}%`;
    num.style.cssText = "font-variant-numeric:tabular-nums;font-size:11px;opacity:0.7;min-width:32px;text-align:right;";
    wrap.append(track, num);
    return wrap;
  }

  // The cell value is unused; the button acts on the whole row and re-renders.
  function actionRenderer(_data: unknown, dataCtx: ValueCellDataContext): HTMLElement {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Advance";
    button.style.cssText = fieldStyle + "cursor:pointer;padding:0 10px;background:color-mix(in srgb, currentColor 8%, transparent);";
    button.addEventListener("click", () => {
      const row = rows[dataCtx.rowIndex];
      row.progress = Math.min(100, row.progress + 15);
      if (row.progress >= 100) row.status = "Done";
      else if (row.status === "Todo") row.status = "In progress";
      render();
    });
    return button;
  }
}

/* ===================================== utils ===================================== */

const fieldStyle =
  "font:inherit;font-size:12px;line-height:1;height:26px;box-sizing:border-box;color:inherit;" +
  "border-radius:6px;border:1px solid color-mix(in srgb, currentColor 22%, transparent);" +
  "background:transparent;padding:0 6px;width:100%;";

function trendSvg(data: number[], type: ChartType, color: string): string {
  if (data.length === 0) return "";
  const w = 120;
  const h = 32;
  const pad = 3;
  const x = scaleLinear().domain([0, data.length - 1]).range([pad, w - pad]);
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const y = scaleLinear().domain([min - range * 0.15, max + range * 0.15]).range([h - pad, pad]);

  if (type === "bar") {
    const bandWidth = ((w - pad * 2) / data.length) * 0.7;
    const bars = data
      .map((value, i) => {
        const bx = x(i) - bandWidth / 2;
        const by = y(value);
        const bh = Math.max(1, h - pad - by);
        return `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bandWidth.toFixed(1)}" height="${bh.toFixed(1)}" rx="1" fill="${color}" />`;
      })
      .join("");
    return svgWrap(w, h, bars);
  }

  const lineGen = line<number>().x((_, i) => x(i)).y((value) => y(value)).curve(curveCatmullRom);
  if (type === "area") {
    const areaGen = area<number>().x((_, i) => x(i)).y0(h - pad).y1((value) => y(value)).curve(curveCatmullRom);
    return svgWrap(
      w,
      h,
      `<path d="${areaGen(data) ?? ""}" fill="${color}" fill-opacity="0.16" />` +
        `<path d="${lineGen(data) ?? ""}" fill="none" stroke="${color}" stroke-width="1.5" />`,
    );
  }
  return svgWrap(w, h, `<path d="${lineGen(data) ?? ""}" fill="none" stroke="${color}" stroke-width="1.5" />`);
}

function svgWrap(w: number, h: number, inner: string): string {
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block">${inner}</svg>`;
}

const TASKS = [
  "Onboarding flow", "Billing webhook", "Search reindex", "Dark mode", "CSV export",
  "Rate limiter", "Audit log", "SSO login", "Image CDN", "Push notifications",
  "Draft autosave", "Team invites", "API pagination", "Webhooks v2", "Usage metering", "Locale switch",
];
const COLORS = ["#2563eb", "#16a34a", "#db2777", "#f59e0b", "#7c3aed", "#0891b2", "#dc2626", "#4f46e5"];

// Deterministic so the demo renders identically on every load.
function generateRows(): Row[] {
  const rand = mulberry32(0x2f6a13);
  return TASKS.map((name, i) => ({
    name,
    trend: Array.from({ length: 16 }, () => Math.round(20 + rand() * 80)),
    status: STATUSES[Math.floor(rand() * STATUSES.length)],
    color: COLORS[i % COLORS.length],
    due: `2026-${String(1 + Math.floor(rand() * 12)).padStart(2, "0")}-${String(1 + Math.floor(rand() * 28)).padStart(2, "0")}`,
    progress: Math.round(rand() * 100),
  }));
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
