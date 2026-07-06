import React, {useEffect, useRef, useState} from "react";
import "grid/dist/grid.css";
import Grid, {
  FlattenedDataViewModel,
  PHorizontalFixture,
  PVerticalFixture,
  BaseFixtureViewModel,
  BaseViewModel,
  BaseSliceResult,
  CellRenderer,
  GridDataViewModelOptions,
  ValueCellDataContext,
  RendererContext,
  registerTheme,
  getTheme,
} from "grid/dist/renderer";
import {
  DuckDBWasmDataSource,
  SqlStandardTableDataModel,
  DataSchema,
  StandardDataFetchAndTransformIR,
  StandardMetadataPlumber,
  StandardMetadataPlumbing,
  StandardColumnMetadata,
  StandardMetadataReshaperInput,
  PageMetadata,
  StandardPageCellMetadata,
  SqlSelectExpression,
} from "grid/dist/index";
import {scaleLinear, scaleLog} from "d3-scale";

// --- Schema & Data Loading ---

const DATA_URL = "http://localhost:8912/Citywide_Payroll_Data_20260306_FY2025_no_fiscalyear_midinit.csv";

const CLEAN_SCHEMA: DataSchema[] = [
  {name: "Payroll Number", type: "dimension"},
  {name: "Agency Name", type: "dimension"},
  {name: "Last Name", type: "dimension"},
  {name: "First Name", type: "dimension"},
  {name: "Agency Start Date", type: "dimension", subtype: "temporal", datetimeFormat: "%m/%d/%Y"},
  {name: "Work Location Borough", type: "dimension"},
  {name: "Title Description", type: "dimension"},
  {name: "Leave Status as of June 30", type: "dimension"},
  {name: "Base Salary", type: "measure", subtype: "decimal"},
  {name: "Pay Basis", type: "dimension"},
  {name: "Regular Hours", type: "measure", subtype: "decimal"},
  {name: "Regular Gross Paid", type: "measure", subtype: "decimal"},
  {name: "OT Hours", type: "measure", subtype: "decimal"},
  {name: "Total OT Paid", type: "measure", subtype: "decimal"},
  {name: "Total Other Pay", type: "measure", subtype: "decimal"},
];

const MONEY_COLUMNS = ["Base Salary", "Regular Gross Paid", "Total OT Paid", "Total Other Pay"];
const NUMERIC_COLUMNS = ["Regular Hours", "OT Hours"];

const NULL_ROW_RATE = 0.01;
const NULL_COL_RATE = 0.30;

function buildReplaceMap(): Map<string, Map<string, string>> {
  const replace = new Map<string, Map<string, string>>();
  const moneyReplace = new Map([["$", ""], [",", ""]]);
  for (const col of MONEY_COLUMNS) replace.set(col, moneyReplace);
  const commaReplace = new Map([[",", ""]]);
  for (const col of NUMERIC_COLUMNS) replace.set(col, commaReplace);
  return replace;
}

function makePreprocess(targetRows: number) {
  return (data: unknown): unknown => {
    const rows = data as unknown[];
    if (rows.length <= targetRows) return rows;
    const step = Math.max(1, Math.floor(rows.length / targetRows));
    const sliced: unknown[] = [];
    for (let i = 0; i < rows.length && sliced.length < targetRows; i += step) {
      sliced.push(rows[i]);
    }
    return sliced;
  };
}

// --- Colors ---

const C = {
  valid: "#03A9F4",
  missing: "#e8636e",
  missingCell: "rgba(232,99,110,0.12)",
  missingDot: "#e8636e",
  validDot: "#03A9F4",
  distBar: "#607D8B",
  muted: "#999",
  text: "#333",
};

registerTheme("data-wrangler", {
  ...getTheme("light")!,
  facetHeaderBackgroundColor: "#e1f5fe",
  verticalBorderColor: "#4fc3f7",
  horizontalBorderColor: "#f1f1f1",
  dataTopBorderColor: "#03A9F4",
});

const DEFAULT_ROW_COUNT = 50000;
const NUM_BINS = 8;
const MINIMAP_BUCKETS = 300;
const HIST_PAD = 4;

// --- Histogram Selection State ---

interface HistogramRange { field: string; valMin: number; valMax: number; }
const histogramSelections = new Map<number, HistogramRange>();
let onHistogramSelectionChange: (() => void) | null = null;
const originalColMeta = new Map<number, Record<string, unknown>>();

function getHistWrap(cell: HTMLElement): HTMLElement {
  return (cell.firstElementChild as HTMLElement) ?? cell;
}

function histXToValue(cell: HTMLElement, clientX: number, min: number, max: number): number {
  const wrap = getHistWrap(cell);
  const rect = wrap.getBoundingClientRect();
  const barW = rect.width - 2 * HIST_PAD;
  const frac = Math.max(0, Math.min(1, (clientX - rect.left - HIST_PAD) / barW));
  return min + frac * (max - min);
}

function renderSelectionOverlay(cell: HTMLElement, colIndex: number, min: number, max: number) {
  const wrap = getHistWrap(cell);
  const sel = histogramSelections.get(colIndex);
  let ov = wrap.querySelector("[data-hist-overlay]") as HTMLElement | null;
  if (!sel) { ov?.remove(); return; }

  const wrapRect = wrap.getBoundingClientRect();
  const barW = wrapRect.width - 2 * HIST_PAD;
  const lf = (sel.valMin - min) / (max - min);
  const rf = (sel.valMax - min) / (max - min);
  const leftPx = HIST_PAD + lf * barW;
  const widthPx = (rf - lf) * barW;

  if (!ov) {
    ov = document.createElement("div");
    ov.dataset.histOverlay = "1";
    ov.style.cssText = "position:absolute;top:0;z-index:1;box-sizing:border-box;background:rgba(0,0,0,0.08);border:1.5px solid rgba(0,0,0,0.35);border-radius:2px;cursor:move;";

    const lh = document.createElement("div");
    lh.dataset.histResize = "left";
    lh.style.cssText = "position:absolute;left:-1px;top:0;bottom:0;width:5px;cursor:ew-resize;";
    const rh = document.createElement("div");
    rh.dataset.histResize = "right";
    rh.style.cssText = "position:absolute;right:-1px;top:0;bottom:0;width:5px;cursor:ew-resize;";
    const cl = document.createElement("div");
    cl.dataset.histClose = "1";
    cl.style.cssText = "position:absolute;top:2px;right:2px;width:13px;height:13px;background:#555;color:#fff;font-size:10px;line-height:13px;text-align:center;border-radius:2px;cursor:pointer;z-index:2;user-select:none;";
    cl.textContent = "\u00d7";

    ov.appendChild(lh);
    ov.appendChild(rh);
    ov.appendChild(cl);
    wrap.appendChild(ov);
  }

  ov.style.left = `${leftPx}px`;
  ov.style.width = `${Math.max(6, widthPx)}px`;
  ov.style.bottom = "24px";
}

function setupHistogramDrag(cell: HTMLElement, colIndex: number, field: string, min: number, max: number) {
  if (cell.dataset.histBound) return;
  cell.dataset.histBound = "1";
  cell.style.cursor = "crosshair";

  cell.addEventListener("mousedown", (e: MouseEvent) => {
    const target = e.target as HTMLElement;

    if (target.dataset.histClose) {
      histogramSelections.delete(colIndex);
      const ov = getHistWrap(cell).querySelector("[data-hist-overlay]");
      ov?.remove();
      onHistogramSelectionChange?.();
      return;
    }

    const resizeDir = target.dataset.histResize as "left" | "right" | undefined;
    const onOverlay = !resizeDir && target.closest("[data-hist-overlay]") !== null;
    const mode: "create" | "pan" | "resize-left" | "resize-right" =
      resizeDir === "left" ? "resize-left" :
      resizeDir === "right" ? "resize-right" :
      onOverlay ? "pan" : "create";

    const startX = e.clientX;
    const startVal = histXToValue(cell, startX, min, max);
    const existing = histogramSelections.get(colIndex);
    const sMin = existing?.valMin ?? startVal;
    const sMax = existing?.valMax ?? startVal;
    const range = max - min;

    const onMove = (me: MouseEvent) => {
      const curVal = histXToValue(cell, me.clientX, min, max);
      const dv = curVal - startVal;
      let nMin: number, nMax: number;

      if (mode === "create") {
        nMin = Math.min(startVal, curVal);
        nMax = Math.max(startVal, curVal);
      } else if (mode === "pan") {
        nMin = sMin + dv;
        nMax = sMax + dv;
        if (nMin < min) { nMax += min - nMin; nMin = min; }
        if (nMax > max) { nMin -= nMax - max; nMax = max; }
      } else if (mode === "resize-left") {
        nMin = Math.min(curVal, sMax - range * 0.005);
        nMax = sMax;
      } else {
        nMin = sMin;
        nMax = Math.max(curVal, sMin + range * 0.005);
      }

      histogramSelections.set(colIndex, {field, valMin: Math.max(min, nMin), valMax: Math.min(max, nMax)});
      renderSelectionOverlay(cell, colIndex, min, max);
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      const sel = histogramSelections.get(colIndex);
      if (sel && sel.valMax - sel.valMin < range * 0.005) {
        histogramSelections.delete(colIndex);
        const ov = cell.querySelector("[data-hist-overlay]");
        ov?.remove();
      }
      onHistogramSelectionChange?.();
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    e.preventDefault();
  });
}

// --- Metadata Plumber ---

function createDataQualityPlumber(): StandardMetadataPlumber {
  return (_ir: StandardDataFetchAndTransformIR): StandardMetadataPlumbing => ({
    global: {
      resolver: {
        async resolve(input: any) {
          const ds = input.dataSource as any;
          const table = ds.table as string;
          const project: string[] = input.ir.project;
          const schema: DataSchema[] = input.schema;

          // Total + per-column missing counts in one query
          const missingExprs = project.map(
            f => `COUNT(*) - COUNT("${f}") AS "__missing_${f}__"`
          ).join(", ");
          const [countRow] = await ds.execute(
            `SELECT COUNT(*) AS __total__, ${missingExprs} FROM "${table}"`
          );
          const total = Number(countRow.__total__);

          // Top values for dimension columns
          const topValues: Record<string, Array<{val: string; cnt: number}>> = {};
          for (const field of project) {
            const s = schema.find((x: DataSchema) => x.name === field);
            if (s?.type === "dimension" && s?.subtype !== "temporal") {
              const rows = await ds.execute(
                `SELECT CAST("${field}" AS VARCHAR) AS val, COUNT(*) AS cnt FROM "${table}" WHERE "${field}" IS NOT NULL GROUP BY "${field}" ORDER BY cnt DESC LIMIT ${NUM_BINS}`
              );
              topValues[field] = rows.map((r: any) => ({val: String(r.val), cnt: Number(r.cnt)}));
            }
          }

          // Min/max + histogram bins for measure columns
          const ranges: Record<string, {min: number; max: number}> = {};
          const histBins: Record<string, Array<{bin: number; cnt: number; binMin: number; binMax: number}>> = {};
          for (const field of project) {
            const s = schema.find((x: DataSchema) => x.name === field);
            if (s?.type === "measure") {
              const [rangeRow] = await ds.execute(
                `SELECT MIN("${field}") AS min_val, MAX("${field}") AS max_val FROM "${table}" WHERE "${field}" IS NOT NULL`
              );
              ranges[field] = {min: Number(rangeRow.min_val), max: Number(rangeRow.max_val)};

              const bins = await ds.execute(
                `WITH bounds AS (SELECT MIN("${field}") AS mn, MAX("${field}") - MIN("${field}") AS rng FROM "${table}" WHERE "${field}" IS NOT NULL) ` +
                `SELECT CASE WHEN bounds.rng = 0 THEN 0 ELSE LEAST(CAST(FLOOR(("${field}" - bounds.mn) / bounds.rng * ${NUM_BINS}) AS INTEGER), ${NUM_BINS - 1}) END AS bin, ` +
                `COUNT(*) AS cnt, MIN("${field}") AS bin_min, MAX("${field}") AS bin_max ` +
                `FROM "${table}", bounds WHERE "${field}" IS NOT NULL GROUP BY bin ORDER BY bin`
              );
              histBins[field] = bins.map((r: any) => ({
                bin: Number(r.bin), cnt: Number(r.cnt),
                binMin: Number(r.bin_min), binMax: Number(r.bin_max),
              }));
            }
          }

          // Minimap: bucket all rows, count how many have at least one NULL
          const nullCheck = project.map(f => `"${f}" IS NULL`).join(" OR ");
          const minimapRows = await ds.execute(
            `WITH rowed AS (` +
            `SELECT LEAST(CAST(FLOOR((ROW_NUMBER() OVER () - 1) * ${MINIMAP_BUCKETS}.0 / ${total}) AS INTEGER), ${MINIMAP_BUCKETS - 1}) AS bucket, ` +
            `CASE WHEN ${nullCheck} THEN 1 ELSE 0 END AS has_null ` +
            `FROM "${table}") ` +
            `SELECT bucket, SUM(has_null) AS null_count, COUNT(*) AS total_count FROM rowed GROUP BY bucket ORDER BY bucket`
          );
          const minimap = minimapRows.map((r: any) => ({
            bucket: Number(r.bucket),
            nullCount: Number(r.null_count),
            totalCount: Number(r.total_count),
          }));

          return {total, missing: Object.fromEntries(project.map(f => [f, Number(countRow[`__missing_${f}__`])])), topValues, ranges, histBins, minimap};
        },
      },
      reshaper: {
        reshape(input: any): StandardColumnMetadata[] {
          const raw = input.raw;
          if (!raw) return [];
          const columns: StandardColumnMetadata[] = [];
          for (let i = 0; i < input.ir.project.length; i++) {
            const field = input.ir.project[i];
            const s = input.schema.find((x: DataSchema) => x.name === field);
            const meta: Record<string, unknown> = {
              total: raw.total,
              missing: raw.missing[field] ?? 0,
              topValues: raw.topValues?.[field],
              histBins: raw.histBins?.[field],
              min: raw.ranges?.[field]?.min,
              max: raw.ranges?.[field]?.max,
              schemaType: s?.type ?? "dimension",
              fieldName: field,
            };
            if (i === 0) meta.minimap = raw.minimap;
            columns.push({colIdx: i, meta});
          }
          return columns;
        },
      },
    },
    pageWise: {
      resolver: {
        resolve(input: any): SqlSelectExpression[] {
          return (input.ir.project as string[]).map((field: string) => ({
            alias: `__meta__${field}__null`,
            sql: `CASE WHEN "${field}" IS NULL THEN 1 ELSE 0 END`,
          }));
        },
      },
      reshaper: {
        reshape(input: StandardMetadataReshaperInput): PageMetadata {
          const cells: StandardPageCellMetadata[] = [];
          for (let colIdx = 0; colIdx < input.ir.project.length; colIdx++) {
            const field = input.ir.project[colIdx];
            const nullFlags = input.pageMetadata[`__meta__${field}__null`];
            if (!nullFlags) continue;
            for (let rowIdx = 0; rowIdx < nullFlags.length; rowIdx++) {
              if (nullFlags[rowIdx] === 1) {
                cells.push({rowIdx, colIdx, meta: {quality: "missing"}});
              }
            }
          }
          return {cells};
        },
      },
    },
  });
}

// --- Cell Renderer ---

const TEMPORAL_COLS = new Set(CLEAN_SCHEMA.filter(s => s.subtype === "temporal").map(s => s.name));
const numberFmt = new Intl.NumberFormat();
const COL_UNITS: Record<string, string> = {
  "Base Salary": "$",
  "Regular Gross Paid": "$",
  "Total OT Paid": "$",
  "Total Other Pay": "$",
  "Regular Hours": "hrs",
  "OT Hours": "hrs",
};

function formatCellValue(data: any, colMeta: Record<string, unknown> | undefined): string {
  const schemaType = colMeta?.schemaType as string | undefined;
  const fieldName = colMeta?.fieldName as string | undefined;

  if (TEMPORAL_COLS.has(fieldName ?? "")) {
    const d = new Date(data);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    }
  }

  if (schemaType === "measure") {
    const n = Number(data);
    if (!isNaN(n)) return numberFmt.format(Math.round(n));
  }

  return String(data);
}

const qualityCellRenderer: CellRenderer<any> = (data: any, dataCtx: ValueCellDataContext, ctx: RendererContext) => {
  const meta = dataCtx.viewModel.metadata.getValueCellMeta(dataCtx.colIndex, dataCtx.rowIndex);
  const colMeta = dataCtx.viewModel.metadata.getValueColumnMeta(dataCtx.colIndex);
  const schemaType = (colMeta?.schemaType as string) ?? "dimension";
  const fieldName = (colMeta?.fieldName as string) ?? "";
  const unit = COL_UNITS[fieldName];
  ctx.container.style.backgroundColor = meta?.quality === "missing" ? C.missingCell : "";
  ctx.container.style.padding = "8px 6px";
  ctx.container.style.justifyContent = unit ? "space-between" : schemaType === "measure" ? "flex-end" : "flex-start";
  if (data == null || data === "") {
    return `<span style="color:${C.missing};font-style:italic;font-size:11px">null</span>`;
  }
  const formatted = formatCellValue(data, colMeta);
  if (unit) {
    const unitSize = unit === "hrs" ? "9px" : "11px";
    return `<span style="color:${C.muted};font-size:${unitSize}">${unit}</span><span style="font-size:12px">${formatted}</span>`;
  }
  return `<span style="font-size:12px">${formatted}</span>`;
};

// --- Utility ---

function fmtNum(n: number): string {
  if (n == null || isNaN(n)) return "—";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toFixed(2);
}

// --- Fixtures ---

class QualityBarFixture extends PHorizontalFixture {
  viewModelKey(): string { return "quality-bar"; }
  getHeight(): number { return 12; }

  headerCell(): HTMLElement {
    const el = document.createElement("div");
    el.style.cssText = "display:flex;gap:6px;align-items:center;font-size:9px;white-space:nowrap;padding:0 4px;";
    el.innerHTML =
      `<span style="display:inline-block;width:8px;height:8px;background:${C.valid};border-radius:1px"></span><span style="color:${C.muted}">valid</span>` +
      `<span style="display:inline-block;width:8px;height:8px;background:${C.missing};border-radius:1px;margin-left:2px"></span><span style="color:${C.muted}">missing</span>`;
    return el;
  }

  getCellsToRender(viewModel: BaseViewModel, fixtureViewModel: BaseFixtureViewModel, sliceData: BaseSliceResult) {
    const nodesToAppend: HTMLElement[] = [];
    const vm = viewModel as any;
    const numRowFacetLevels = this.data!.numRowFacetLevels;
    const leftFixtureCount = vm.fixtures?.left?.length ?? 0;

    for (let i = 0; i < sliceData.sliceNumCols; i++) {
      const colIndex = viewModel.x0 + i;
      const key = `qbar-${colIndex}`;
      const gridCol = leftFixtureCount + numRowFacetLevels + i + 1;
      const [cell, needAppend, contentDirty] = this.placeCellInDom({
        key,
        gridRow: fixtureViewModel.track,
        gridCol,
        hintContentDirty: true,
        cls: `header ${fixtureViewModel.suggestedCls.join(" ")}`,
        extraStyles: {top: fixtureViewModel.offset},
      });

      if (contentDirty) {
        const meta = this.data!.metadata.getValueColumnMeta(colIndex);
        const total = (meta?.total as number) || 1;
        const missing = (meta?.missing as number) || 0;
        const missingPct = (missing / total) * 100;

        cell.style.padding = "0";
        cell.style.overflow = "hidden";
        cell.style.borderRight = "1px solid var(--vertical-border-color)";
        cell.style.alignItems = "stretch";
        cell.title = `Valid records: ${(total - missing).toLocaleString()}\nNull records: ${missing.toLocaleString()}`;

        const minMissingPx = missing > 0 ? 4 : 0;
        cell.innerHTML =
          `<div style="display:flex;flex:1;overflow:hidden">` +
          `<div style="flex:1;background:${C.valid}"></div>` +
          (missing > 0 ? `<div style="width:${missingPct}%;min-width:${minMissingPx}px;background:${C.missing}"></div>` : "") +
          `</div>`;
      }
      if (needAppend) nodesToAppend.push(cell);
    }
    return {nodesToAppend};
  }
}

class HistogramFixture extends PHorizontalFixture {
  viewModelKey(): string { return "histogram"; }
  getHeight(): number { return 130; }
  headerCell(): null { return null; }

  getCellsToRender(viewModel: BaseViewModel, fixtureViewModel: BaseFixtureViewModel, sliceData: BaseSliceResult) {
    const nodesToAppend: HTMLElement[] = [];
    const vm = viewModel as any;
    const numRowFacetLevels = this.data!.numRowFacetLevels;
    const leftFixtureCount = vm.fixtures?.left?.length ?? 0;

    for (let i = 0; i < sliceData.sliceNumCols; i++) {
      const colIndex = viewModel.x0 + i;
      const key = `hist-${colIndex}`;
      const gridCol = leftFixtureCount + numRowFacetLevels + i + 1;
      const [cell, needAppend, contentDirty] = this.placeCellInDom({
        key,
        gridRow: fixtureViewModel.track,
        gridCol,
        hintContentDirty: true,
        cls: `header ${fixtureViewModel.suggestedCls.join(" ")}`,
        extraStyles: {top: fixtureViewModel.offset},
      });

      if (contentDirty) {
        cell.style.padding = "0";
        cell.style.overflow = "hidden";
        cell.style.fontSize = "10px";
        cell.style.borderRight = "1px solid var(--vertical-border-color)";

        const meta = originalColMeta.get(colIndex) ?? this.data!.metadata.getValueColumnMeta(colIndex);
        if (meta?.topValues) {
          this.renderDimensionBars(cell, meta.topValues as Array<{val: string; cnt: number}>);
        } else if (meta?.histBins) {
          this.renderMeasureBars(cell, colIndex, meta);
        } else {
          cell.textContent = "";
        }
      }
      if (needAppend) nodesToAppend.push(cell);
    }
    return {nodesToAppend};
  }

  private renderDimensionBars(cell: HTMLElement, topValues: Array<{val: string; cnt: number}>) {
    if (topValues.length === 0) { cell.textContent = ""; return; }
    const maxCnt = topValues[0].cnt;
    const minCnt = topValues[topValues.length - 1].cnt;
    const scale = minCnt > 0 && maxCnt / minCnt > 10
      ? scaleLog().domain([Math.max(1, minCnt), maxCnt]).range([8, 100]).clamp(true)
      : scaleLinear().domain([0, maxCnt]).range([0, 100]);

    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;flex-direction:column;gap:1px;flex:1;height:100%;justify-content:flex-start;padding:2px 4px;box-sizing:border-box;min-width:0;";

    const header = document.createElement("div");
    header.style.cssText = `font-size:8px;color:#616161;margin-bottom:2px;`;
    header.textContent = `Top ${topValues.length} values`;
    wrap.appendChild(header);

    for (const entry of topValues) {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:3px;height:14px;width:100%;";
      row.title = `Count: ${entry.cnt.toLocaleString()}\nValue: ${entry.val}`;

      const bar = document.createElement("div");
      const w = Math.max(2, scale(entry.cnt));
      bar.style.cssText = `height:10px;width:${w}%;max-width:45%;background:${C.distBar};border-radius:1px;flex-shrink:0;`;

      const label = document.createElement("span");
      label.style.cssText = `overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:9px;color:#616161;flex:1;min-width:0;`;
      label.textContent = entry.val;

      row.appendChild(bar);
      row.appendChild(label);
      wrap.appendChild(row);
    }
    cell.replaceChildren(wrap);
  }

  private renderMeasureBars(cell: HTMLElement, colIndex: number, meta: Record<string, unknown>) {
    const bins = meta.histBins as Array<{bin: number; cnt: number; binMin: number; binMax: number}>;
    if (!bins || bins.length === 0) { cell.textContent = ""; return; }

    const maxCnt = Math.max(...bins.map(b => b.cnt));
    const minCnt = Math.min(...bins.map(b => b.cnt));
    const scale = minCnt > 0 && maxCnt / minCnt > 10
      ? scaleLog().domain([Math.max(1, minCnt), maxCnt]).range([8, 100]).clamp(true)
      : scaleLinear().domain([0, maxCnt]).range([0, 100]);
    const min = meta.min as number;
    const max = meta.max as number;
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;flex-direction:column;height:100%;width:100%;justify-content:flex-end;gap:0;padding:2px 4px;box-sizing:border-box;position:relative;";

    const barsRow = document.createElement("div");
    barsRow.style.cssText = "display:flex;align-items:flex-end;gap:2px;flex:1 1 0;min-height:0;overflow:hidden;";

    const labelRow = document.createElement("div");
    labelRow.style.cssText = "display:flex;gap:2px;height:24px;flex-shrink:0;";

    const binStep = (max - min) / bins.length;
    for (let i = 0; i < bins.length; i++) {
      const entry = bins[i];

      const col = document.createElement("div");
      const h = Math.max(2, scale(entry.cnt));
      col.style.cssText = `flex:1;height:${h}%;background:${C.distBar};min-width:0;`;
      col.title = `Count: ${entry.cnt.toLocaleString()}\nValue: ${fmtNum(entry.binMin)} – ${fmtNum(entry.binMax)}`;
      barsRow.appendChild(col);

      const tick = document.createElement("div");
      tick.style.cssText = "flex:1;min-width:0;overflow:visible;position:relative;height:100%;";
      if (i % 2 === 0 || i === bins.length - 1) {
        const lbl = document.createElement("span");
        lbl.style.cssText = `position:absolute;top:0;left:0;font-size:7px;color:#616161;white-space:nowrap;transform:rotate(45deg);transform-origin:top left;`;
        lbl.textContent = fmtNum(min + binStep * i);
        tick.appendChild(lbl);
      }
      labelRow.appendChild(tick);
    }

    wrap.appendChild(barsRow);
    wrap.appendChild(labelRow);
    cell.replaceChildren(wrap);

    setupHistogramDrag(cell, colIndex, meta.fieldName as string, min, max);
    renderSelectionOverlay(cell, colIndex, min, max);
  }
}

class RowNumberFixture extends PVerticalFixture {
  viewModelKey(): string { return "row-num"; }

  headerCell(): HTMLElement {
    const el = document.createElement("span");
    el.textContent = "#";
    el.style.fontWeight = "bold";
    return el;
  }

  getCellsToRender(viewModel: BaseViewModel, fixtureViewModel: BaseFixtureViewModel, sliceData: BaseSliceResult) {
    const nodesToAppend: HTMLElement[] = [];
    const numColFacetLevels = this.data!.numColFacetLevels;
    const fixturesTopLen = (viewModel as any).fixtures?.top?.length ?? 0;

    for (let j = 0; j < sliceData.sliceNumRows; j++) {
      const rowIndex = viewModel.y0 + j;
      const key = `rn-${rowIndex}`;
      const startEndCellCls = `${j === 0 ? " first" : ""}${j === sliceData.sliceNumRows - 1 ? " last" : ""}`;

      const [cell, needAppend, contentDirty] = this.placeCellInDom({
        key,
        gridRow: fixturesTopLen + numColFacetLevels + j + 1,
        gridCol: fixtureViewModel.track,
        hintContentDirty: true,
        cls: `${fixtureViewModel.suggestedCls.join(" ")} data${startEndCellCls}`,
        extraStyles: {left: fixtureViewModel.offset},
      });

      if (contentDirty) {
        const offsetTop = this.data!.offsetTop;
        cell.textContent = String(offsetTop + rowIndex + 1);
        cell.style.fontSize = "11px";
        cell.style.color = C.muted;
        cell.style.textAlign = "right";
        cell.style.paddingRight = "6px";
      }
      if (needAppend) nodesToAppend.push(cell);
    }
    return {nodesToAppend};
  }
}

class QualityDotFixture extends PVerticalFixture {
  viewModelKey(): string { return "quality-dot"; }

  headerCell(): HTMLElement {
    const el = document.createElement("span");
    el.style.cssText = `font-size:9px;color:${C.muted};white-space:nowrap;`;
    el.textContent = "Q";
    el.title = "Row data quality";
    return el;
  }

  getCellsToRender(viewModel: BaseViewModel, fixtureViewModel: BaseFixtureViewModel, sliceData: BaseSliceResult) {
    const nodesToAppend: HTMLElement[] = [];
    const numColFacetLevels = this.data!.numColFacetLevels;
    const fixturesTopLen = (viewModel as any).fixtures?.top?.length ?? 0;
    const numCols = this.data!.numCols;

    for (let j = 0; j < sliceData.sliceNumRows; j++) {
      const rowIndex = viewModel.y0 + j;
      const key = `qdot-${rowIndex}`;
      const startEndCellCls = `${j === 0 ? " first" : ""}${j === sliceData.sliceNumRows - 1 ? " last" : ""}`;

      const [cell, needAppend, contentDirty] = this.placeCellInDom({
        key,
        gridRow: fixturesTopLen + numColFacetLevels + j + 1,
        gridCol: fixtureViewModel.track,
        hintContentDirty: true,
        cls: `${fixtureViewModel.suggestedCls.join(" ")} data${startEndCellCls}`,
        extraStyles: {right: fixtureViewModel.offset},
      });

      if (contentDirty) {
        const nullCols: string[] = [];
        for (let c = 0; c < numCols; c++) {
          const cellMeta = this.data!.metadata.getValueCellMeta(c, rowIndex);
          if (cellMeta?.quality === "missing") {
            const colMeta = this.data!.metadata.getValueColumnMeta(c);
            nullCols.push((colMeta?.fieldName as string) ?? `col ${c}`);
          }
        }
        const color = nullCols.length > 0 ? C.missingDot : C.validDot;
        cell.style.display = "flex";
        cell.style.alignItems = "center";
        cell.style.justifyContent = "center";
        cell.title = nullCols.length > 0 ? `${nullCols.length} null value${nullCols.length > 1 ? "s" : ""}\n${nullCols.join("\n")}` : "";
        cell.innerHTML = `<div style="width:6px;height:10px;border-radius:1px;background:${color}"></div>`;
      }
      if (needAppend) nodesToAppend.push(cell);
    }
    return {nodesToAppend};
  }
}

let minimapGridRef: Grid | null = null;

class MinimapFixture extends PVerticalFixture {
  viewModelKey(): string { return "minimap"; }

  headerCell(): HTMLElement {
    const el = document.createElement("span");
    el.style.cssText = "display:block;width:8px;";
    return el;
  }

  get colSize() { return {strategy: "fixed-width" as const, widthInPx: 8, minWidthInPx: 8}; }

  getCellsToRender(viewModel: BaseViewModel, fixtureViewModel: BaseFixtureViewModel, sliceData: BaseSliceResult) {
    const nodesToAppend: HTMLElement[] = [];
    const numColFacetLevels = this.data!.numColFacetLevels;
    const fixturesTopLen = (viewModel as any).fixtures?.top?.length ?? 0;

    const [cell, needAppend] = this.placeCellInDom({
      key: "mm-canvas",
      gridRow: fixturesTopLen + numColFacetLevels + 1,
      gridCol: fixtureViewModel.track,
      hintContentDirty: true,
      cls: `${fixtureViewModel.suggestedCls.join(" ")} data first last`,
      extraStyles: {right: fixtureViewModel.offset, rowspan: sliceData.sliceNumRows},
    });

    cell.style.padding = "0";
    cell.style.overflow = "hidden";

    const totalRows = this.data!.totalRows;
    const height = sliceData.sliceNumRows * 28;
    const width = 8;
    const markerH = 3;

    let canvas = cell.querySelector("canvas") as HTMLCanvasElement | null;
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.style.cssText = "display:block;width:100%;height:100%;cursor:pointer;";
      canvas.addEventListener("click", (e: MouseEvent) => {
        const rect = canvas!.getBoundingClientRect();
        const clickY = e.clientY - rect.top;
        const clickFrac = clickY / rect.height;
        const targetRow = Math.floor(clickFrac * totalRows);
        minimapGridRef?.scrollTo("row", targetRow);
      });
      cell.replaceChildren(canvas);
    }

    const offsetY = (viewModel as any).offsetY ?? 0;
    canvas.style.transform = offsetY !== 0 ? `translateY(${offsetY}px)` : "";

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, width, height);

    const minimap = this.data!.metadata.getValueColumnMeta(0)?.minimap as
      Array<{bucket: number; nullCount: number; totalCount: number}> | undefined;
    if (!minimap || minimap.length === 0) {
      if (needAppend) nodesToAppend.push(cell);
      return {nodesToAppend};
    }

    const pxPerRow = height / totalRows;
    const rowsPerBlock = Math.max(1, Math.ceil(markerH / pxPerRow));
    const numBlocks = Math.ceil(totalRows / rowsPerBlock);
    const rowsPerBucket = totalRows / minimap.length;

    // First pass: compute per-block densities
    const blockDensities = new Float64Array(numBlocks);
    let minDensity = 1;
    let maxDensity = 0;
    for (let b = 0; b < numBlocks; b++) {
      const blockStartRow = b * rowsPerBlock;
      const blockEndRow = Math.min(totalRows, blockStartRow + rowsPerBlock);
      let nullCount = 0;
      let totalCount = 0;
      const bucketStart = Math.floor(blockStartRow / rowsPerBucket);
      const bucketEnd = Math.min(minimap.length - 1, Math.floor((blockEndRow - 1) / rowsPerBucket));
      for (let bi = bucketStart; bi <= bucketEnd; bi++) {
        nullCount += minimap[bi].nullCount;
        totalCount += minimap[bi].totalCount;
      }
      const d = totalCount > 0 ? nullCount / totalCount : 0;
      blockDensities[b] = d;
      if (d > 0 && d < minDensity) minDensity = d;
      if (d > maxDensity) maxDensity = d;
    }
    const densityRange = maxDensity - minDensity;

    // Second pass: render with normalized intensity
    for (let b = 0; b < numBlocks; b++) {
      const y = Math.round(b * markerH);
      const d = blockDensities[b];
      if (d > 0) {
        const normalized = densityRange > 0 ? (d - minDensity) / densityRange : 1;
        const alpha = 0.2 + normalized * 0.8;
        ctx.fillStyle = `rgba(232,99,110,${alpha.toFixed(2)})`;
      } else {
        ctx.fillStyle = C.validDot;
      }
      ctx.fillRect(0, y, width, markerH);
    }

    if (needAppend) nodesToAppend.push(cell);
    return {nodesToAppend};
  }
}

class SummaryFixture extends PHorizontalFixture {
  viewModelKey(): string { return "summary"; }
  getHeight(): number { return 32; }
  headerCell(): null { return null; }

  getCellsToRender(viewModel: BaseViewModel, fixtureViewModel: BaseFixtureViewModel, sliceData: BaseSliceResult) {
    const nodesToAppend: HTMLElement[] = [];
    const vm = viewModel as any;
    const numRowFacetLevels = this.data!.numRowFacetLevels;
    const leftFixtureCount = vm.fixtures?.left?.length ?? 0;
    const fixedLeftPositions: number[] = vm.fixedLeftVTrackPositions ?? [];

    let totalRows = 0;
    let totalMissing = 0;
    const numCols = this.data!.numCols;
    for (let i = 0; i < numCols; i++) {
      const meta = this.data!.metadata.getValueColumnMeta(i);
      if (meta) {
        totalRows = (meta.total as number) || totalRows;
        totalMissing += (meta.missing as number) || 0;
      }
    }
    const totalCells = totalRows * numCols;
    const validPct = totalCells > 0 ? (((totalCells - totalMissing) / totalCells) * 100).toFixed(1) : "0";
    const missingPct = totalCells > 0 ? ((totalMissing / totalCells) * 100).toFixed(1) : "0";

    const key = "summary-bar";
    const [cell, needAppend, contentDirty] = this.placeCellInDom({
      key,
      gridRow: fixtureViewModel.track,
      gridCol: leftFixtureCount + 1,
      cls: `header ${fixtureViewModel.suggestedCls.join(" ")} h-fixed`,
      hintContentDirty: true,
      extraStyles: {
        bottom: fixtureViewModel.offset,
        left: fixedLeftPositions[leftFixtureCount] ?? 0,
        colspan: numRowFacetLevels + sliceData.sliceNumCols,
      },
    });

    if (contentDirty) {
      cell.style.fontSize = "12px";
      cell.style.padding = "4px 12px";
      cell.style.whiteSpace = "nowrap";
      cell.innerHTML =
        `<div style="display:flex;gap:8px;align-items:center">` +
        `<span style="font-weight:700;font-size:14px">${validPct}%</span>` +
        `<span style="color:${C.muted};font-size:11px">valid</span>` +
        `<span style="margin-left:8px;font-weight:700;font-size:14px">${missingPct}%</span>` +
        `<span style="color:${C.muted};font-size:11px">missing</span>` +
        `<span style="margin-left:16px;font-weight:600">${numCols}</span>` +
        `<span style="color:${C.muted};font-size:11px">columns</span>` +
        `<span style="margin-left:8px;font-weight:600">${totalRows.toLocaleString()}</span>` +
        `<span style="color:${C.muted};font-size:11px">rows</span>` +
        `</div>`;
    }
    const offsetX = (vm as any).offsetX ?? 0;
    (cell.firstElementChild as HTMLElement).style.transform = offsetX !== 0 ? `translateX(${offsetX}px)` : "";
    if (needAppend) {
      cell.dataset.bottomFixtureNodeType = "h-sticky";
      nodesToAppend.push(cell);
    }
    return {nodesToAppend};
  }
}

// --- Component ---

const DataWrangler: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<Grid | null>(null);
  const modelRef = useRef<SqlStandardTableDataModel | null>(null);
  const viewModelRef = useRef<FlattenedDataViewModel | null>(null);
  const lastIRRef = useRef<StandardDataFetchAndTransformIR | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rowCount, setRowCount] = useState(DEFAULT_ROW_COUNT);
  const [rowCountInput, setRowCountInput] = useState(String(DEFAULT_ROW_COUNT));

  useEffect(() => {
    let cancelled = false;
    gridRef.current = null;

    const init = async () => {
      setLoading(true);
      setError(null);

      const ds = await DuckDBWasmDataSource.create();
      await ds.loadDataFromURL({
        url: DATA_URL,
        type: "csv",
        preprocess: makePreprocess(rowCount),
        schema: CLEAN_SCHEMA,
        replace: buildReplaceMap(),
      });
      if (cancelled) return;

      // Mark 10% of rows as dirty, then null out 30% of columns in those rows
      await ds.execute(`ALTER TABLE "${ds.table}" ADD COLUMN __dirty__ BOOLEAN DEFAULT FALSE`);
      await ds.execute(`UPDATE "${ds.table}" SET __dirty__ = random() < ${NULL_ROW_RATE}`);
      const nullableCols = CLEAN_SCHEMA.map(s => s.name).filter(n => n !== "Payroll Number" && n !== "Agency Name");
      for (const col of nullableCols) {
        await ds.execute(`UPDATE "${ds.table}" SET "${col}" = NULL WHERE __dirty__ AND random() < ${NULL_COL_RATE}`);
      }
      await ds.execute(`ALTER TABLE "${ds.table}" DROP COLUMN __dirty__`);

      const plumber = createDataQualityPlumber();
      const model = new SqlStandardTableDataModel(CLEAN_SCHEMA, ds, {
        pageSize: 10000,
        maxNumPageBeforeEviction: 20,
      }, plumber);
      modelRef.current = model;

      const projectCols = CLEAN_SCHEMA.map(s => s.name);
      const ir: StandardDataFetchAndTransformIR = {
        startRow: 0,
        endRow: 10000,
        groupPath: [],
        groupBy: [],
        project: projectCols,
        sort: [],
        filter: [],
        metadata: {quality: true},
      };
      lastIRRef.current = ir;

      const result = await model.getViewModelData(ir);
      if (cancelled) return;

      // Cache original (unfiltered) column metadata so histograms stay stable when filters change
      originalColMeta.clear();
      histogramSelections.clear();
      for (let i = 0; i < projectCols.length; i++) {
        const m = result.metadata?.valueColumns?.find(c => c.colIndex === i);
        if (m) originalColMeta.set(i, {...m.meta});
      }

      const options: GridDataViewModelOptions = {
        ...result.options,
        vTrackDefs: projectCols.map(() => ({
          renderer: qualityCellRenderer,
        })),
        facetDefs: {
          row: [],
          col: [],
          axis: "col",
        },
      };

      const viewModel = new FlattenedDataViewModel({
        data: result.data,
        columnFacets: result.columnFacets,
        options,
        totalRows: result.totalRows,
        offsetTop: result.offsetTop,
        metadata: result.metadata,
      });
      viewModelRef.current = viewModel;

      if (!containerRef.current) return;

      const grid = new Grid({
        theme: "data-wrangler",
        fixtures: {
          top: [HistogramFixture, QualityBarFixture],
          left: [RowNumberFixture],
          bottom: [SummaryFixture],
          right: [QualityDotFixture, MinimapFixture],
        },
      }, containerRef.current, "flat");
      gridRef.current = grid;
      minimapGridRef = grid;
      grid.data = viewModel;
      grid.draw();

      // Histogram range selection → filter data
      onHistogramSelectionChange = async () => {
        const filters: Array<{type: "scalar"; field: string; op: "gte" | "lte"; value: number}> = [];
        for (const [, sel] of histogramSelections) {
          filters.push({type: "scalar", field: sel.field, op: "gte", value: sel.valMin});
          filters.push({type: "scalar", field: sel.field, op: "lte", value: sel.valMax});
        }
        const newIR: StandardDataFetchAndTransformIR = {
          ...ir,
          startRow: 0,
          endRow: 10000,
          filter: filters,
        };
        lastIRRef.current = newIR;
        const fetchResult = await model.getViewModelData(newIR);
        viewModel.updateData({
          data: fetchResult.data,
          columnFacets: fetchResult.columnFacets,
          totalRows: fetchResult.totalRows,
          offsetTop: fetchResult.offsetTop,
          metadata: fetchResult.metadata,
        });
        grid.draw();
      };

      let throttleTimer: ReturnType<typeof setTimeout> | null = null;
      let pendingVP: {startRow: number; endRow: number} | null = null;
      grid.on("viewDataEmpty", (vp) => {
        pendingVP = vp;
        if (throttleTimer) return;
        throttleTimer = setTimeout(async () => {
          throttleTimer = null;
          const currentVP = pendingVP;
          pendingVP = null;
          if (!currentVP) return;

          const newIR: StandardDataFetchAndTransformIR = {
            ...lastIRRef.current!,
            startRow: currentVP.startRow,
            endRow: currentVP.endRow,
          };
          lastIRRef.current = newIR;

          const fetchResult = await model.getViewModelData(newIR);
          viewModel.updateData({
            data: fetchResult.data,
            columnFacets: fetchResult.columnFacets,
            totalRows: fetchResult.totalRows,
            offsetTop: fetchResult.offsetTop,
            metadata: fetchResult.metadata,
          });
          grid.draw();
        }, 150);
      });

      setLoading(false);
    };

    init().catch((err) => {
      if (!cancelled) {
        console.error("DataWrangler init error:", err);
        setError(String(err));
        setLoading(false);
      }
    });

    return () => { cancelled = true; onHistogramSelectionChange = null; minimapGridRef = null; };
  }, [rowCount]);

  return (
    <>
      <div style={{marginBottom: 8, display: "flex", alignItems: "center", gap: 12}}>
        <span style={{fontWeight: 600, fontSize: 15}}>Data Wrangler</span>
        <label style={{fontSize: 12}}>
          Rows:{" "}
          <input
            type="text"
            value={rowCountInput}
            onChange={(e) => setRowCountInput(e.target.value)}
            style={{width: 70, fontSize: 12}}
          />
        </label>
        <button
          style={{fontSize: 12}}
          onClick={() => setRowCount(parseInt(rowCountInput, 10) || DEFAULT_ROW_COUNT)}
        >
          Reload
        </button>
        <span style={{fontSize: 11, color: C.muted}}>
          NYC Payroll data ({CLEAN_SCHEMA.length} cols) — metadata via SQL resolver + reshaper
        </span>
      </div>
      {loading && <p style={{fontSize: 13}}>Loading data into DuckDB-WASM...</p>}
      {error && <p style={{color: "red", fontSize: 13}}>Error: {error}</p>}
      <div style={{
        position: "relative",
        background: "white",
        height: "calc(100vh - 150px)",
        width: "calc(100vw - 80px)",
        border: "1px solid #eaeaea",
        contain: "layout style",
      }} ref={containerRef} />
    </>
  );
};

export default DataWrangler;
