import React, { useEffect, useRef, useState, useCallback } from "react";
import { useDataSource } from "../DataSourceProvider";
import { SqlStandardTableDataModel, DuckDBWasmDataSource, DataSchema, StandardDataFetchAndTransformIR, StandardMetadataPlumber, StandardMetadataPlumbing, StandardColumnMetadata, SqlSelectExpression, StandardMetadataReshaperInput, PageMetadata, StandardPageCellMetadata, ScalarFilter } from "grid";
import Grid, { FlattenedDataViewModel, GridDataViewModelOptions, PVerticalFixture, PHorizontalFixture, registerTheme, getTheme } from "grid/dist/renderer";
import type { CellRenderer, ValueCellDataContext, RendererContext, BaseFixtureViewModel, BaseViewModel, BaseSliceResult, FacetCellRenderer, FacetDataContext, FacetRendererContext } from "grid/dist/renderer";
import "grid/dist/grid.css";

registerTheme("data-wrangler", {
  ...getTheme("light")!,
  facetHeaderBackgroundColor: "#e1f5fe",
  verticalBorderColor: "#4fc3f7",
  horizontalBorderColor: "#f1f1f1",
  dataTopBorderColor: "#03A9F4",
});

const TARGET_ROWS = 50000;
const NULL_ROW_RATE = 0.01;
const NULL_COL_RATE = 0.30;

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

const CLEAN_SCHEMA: DataSchema[] = [
  { name: "Payroll Number", type: "dimension" },
  { name: "Agency Name", type: "dimension" },
  { name: "Last Name", type: "dimension" },
  { name: "First Name", type: "dimension" },
  { name: "Agency Start Date", type: "dimension", subtype: "temporal", datetimeFormat: "%m/%d/%Y" },
  { name: "Work Location Borough", type: "dimension" },
  { name: "Title Description", type: "dimension" },
  { name: "Leave Status as of June 30", type: "dimension" },
  { name: "Base Salary", type: "measure", subtype: "decimal", aggregateFn: "avg" },
  { name: "Pay Basis", type: "dimension" },
  { name: "Regular Hours", type: "measure", subtype: "decimal", aggregateFn: "avg" },
  { name: "Regular Gross Paid", type: "measure", subtype: "decimal", aggregateFn: "avg" },
  { name: "OT Hours", type: "measure", subtype: "decimal", aggregateFn: "avg" },
  { name: "Total OT Paid", type: "measure", subtype: "decimal", aggregateFn: "sum" },
  { name: "Total Other Pay", type: "measure", subtype: "decimal", aggregateFn: "sum" },
];

const MONEY_COLUMNS = ["Base Salary", "Regular Gross Paid", "Total OT Paid", "Total Other Pay"];
const NUMERIC_COLUMNS = ["Regular Hours", "OT Hours"];

function buildReplaceMap(): Map<string, Map<string, string>> {
  const replace = new Map<string, Map<string, string>>();
  const moneyReplace = new Map([["$", ""], [",", ""]]);
  for (const col of MONEY_COLUMNS) replace.set(col, moneyReplace);
  const commaReplace = new Map([[",", ""]]);
  for (const col of NUMERIC_COLUMNS) replace.set(col, commaReplace);
  replace.set("Agency Name", new Map([["''", ""]]));
  return replace;
}

const TEMPORAL_COLS = new Set(CLEAN_SCHEMA.filter(s => s.subtype === "temporal").map(s => s.name));
const MONEY_COL_SET = new Set(MONEY_COLUMNS);
const HOUR_COL_SET = new Set(NUMERIC_COLUMNS);
const numberFmt = new Intl.NumberFormat();

function getUnit(field: string): string | undefined {
  if (MONEY_COL_SET.has(field)) return "$";
  if (HOUR_COL_SET.has(field)) return "hrs";
  return undefined;
}

function formatCellValue(data: unknown, schema: DataSchema): string {
  if (TEMPORAL_COLS.has(schema.name)) {
    const d = new Date(data as string);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    }
  }
  if (schema.type === "measure") {
    const n = Number(data);
    if (!isNaN(n)) return numberFmt.format(Math.round(n));
  }
  return String(data);
}

const qualityCellRenderer: CellRenderer<unknown> = (data: unknown, dataCtx: ValueCellDataContext, ctx: RendererContext) => {
  const colSchema = CLEAN_SCHEMA[dataCtx.colIndex];
  const isMeasure = colSchema.type === "measure";
  const unit = getUnit(colSchema.name);

  ctx.container.style.padding = "8px 6px";
  ctx.container.style.justifyContent = unit ? "space-between" : isMeasure ? "flex-end" : "flex-start";

  if (data == null || data === "") {
    ctx.container.style.backgroundColor = "rgba(232,99,110,0.12)";
    return `<span style="color:#e8636e;font-style:italic;font-size:11px">null</span>`;
  }

  ctx.container.style.backgroundColor = "";
  const formatted = formatCellValue(data, colSchema);

  if (unit) {
    const unitSize = unit === "hrs" ? "9px" : "11px";
    return `<span style="color:#999;font-size:${unitSize}">${unit}</span><span style="font-size:12px">${formatted}</span>`;
  }
  return `<span style="font-size:12px">${formatted}</span>`;
};

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
        extraStyles: { left: fixtureViewModel.offset },
      });

      if (contentDirty) {
        const offsetTop = this.data!.offsetTop;
        cell.textContent = String(offsetTop + rowIndex + 1);
        cell.style.fontSize = "11px";
        cell.style.color = "#999";
        cell.style.textAlign = "right";
        cell.style.paddingRight = "6px";
      }
      if (needAppend) nodesToAppend.push(cell);
    }
    return { nodesToAppend };
  }
}

const C_VALID = "#03A9F4";
const C_MISSING = "#e8636e";
const C_DIST_BAR = "#607D8B";
const NUM_BINS = 8;
const MINIMAP_BUCKETS = 300;

function fmtNum(n: number): string {
  if (n == null || isNaN(n)) return "—";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toFixed(2);
}

const HIST_PAD = 4;

interface HistogramRange { field: string; valMin: number; valMax: number }
const histogramSelections = new Map<number, HistogramRange>();
let onHistogramSelectionChange: (() => void) | null = null;
const originalColMeta = new Map<number, Record<string, unknown>>();
const dimensionSelections = new Map<string, Set<string>>();
let onDimensionSelectionChange: (() => void) | null = null;

const DIMENSION_FIELDS_WITH_HIST = new Set(
  CLEAN_SCHEMA.filter(s => s.type === "dimension" && s.subtype !== "temporal").map(s => s.name)
);

function buildAllFilters(): ScalarFilter[] {
  const filters: ScalarFilter[] = [];
  for (const [, sel] of histogramSelections) {
    filters.push({ type: "scalar", field: sel.field, op: "gte", value: sel.valMin });
    filters.push({ type: "scalar", field: sel.field, op: "lte", value: sel.valMax });
  }
  for (const [field, values] of dimensionSelections) {
    if (values.size > 0) {
      filters.push({ type: "scalar", field, op: "in", value: Array.from(values) });
    }
  }
  return filters;
}

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

  const lf = (sel.valMin - min) / (max - min);
  const rf = (sel.valMax - min) / (max - min);
  const pad2 = 2 * HIST_PAD;

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

  ov.style.left = `calc(${HIST_PAD * (1 - 2 * lf)}px + ${lf * 100}%)`;
  ov.style.width = `calc(${(rf - lf) * 100}% - ${(rf - lf) * pad2}px)`;
  ov.style.minWidth = "6px";
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

      histogramSelections.set(colIndex, { field, valMin: Math.max(min, nMin), valMax: Math.min(max, nMax) });
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

function createQualityPlumber(): StandardMetadataPlumber {
  return (_ir: StandardDataFetchAndTransformIR): StandardMetadataPlumbing => ({
    global: {
      resolver: {
        async resolve(input: any) {
          const ds = input.dataSource as any;
          const table = ds.table as string;
          const project: string[] = input.ir.project;
          const schema: DataSchema[] = input.schema;

          const missingExprs = project.map(
            f => `COUNT(*) - COUNT("${f}") AS "__missing_${f}__"`
          ).join(", ");
          const [countRow] = await ds.execute(
            `SELECT COUNT(*) AS __total__, ${missingExprs} FROM "${table}"`
          );
          const total = Number(countRow.__total__);

          const topValues: Record<string, Array<{ val: string; cnt: number }>> = {};
          for (const field of project) {
            const s = schema.find((x: DataSchema) => x.name === field);
            if (s?.type === "dimension" && s?.subtype !== "temporal") {
              const rows = await ds.execute(
                `SELECT CAST("${field}" AS VARCHAR) AS val, COUNT(*) AS cnt FROM "${table}" WHERE "${field}" IS NOT NULL GROUP BY "${field}" ORDER BY cnt DESC LIMIT ${NUM_BINS}`
              );
              topValues[field] = rows.map((r: any) => ({ val: String(r.val), cnt: Number(r.cnt) }));
            }
          }

          const ranges: Record<string, { min: number; max: number }> = {};
          const histBins: Record<string, Array<{ bin: number; cnt: number; binMin: number; binMax: number }>> = {};
          for (const field of project) {
            const s = schema.find((x: DataSchema) => x.name === field);
            if (s?.type === "measure") {
              const [rangeRow] = await ds.execute(
                `SELECT MIN("${field}") AS min_val, MAX("${field}") AS max_val FROM "${table}" WHERE "${field}" IS NOT NULL`
              );
              ranges[field] = { min: Number(rangeRow.min_val), max: Number(rangeRow.max_val) };

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

          return { total, missing: Object.fromEntries(project.map(f => [f, Number(countRow[`__missing_${f}__`])])), topValues, ranges, histBins, minimap };
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
            columns.push({ colIdx: i, meta });
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
                cells.push({ rowIdx, colIdx, meta: { quality: "missing" } });
              }
            }
          }
          return { cells };
        },
      },
    },
  });
}

class QualityBarFixture extends PHorizontalFixture {
  viewModelKey(): string { return "quality-bar"; }
  getHeight(): number { return 12; }

  headerCell(): HTMLElement {
    const el = document.createElement("div");
    el.style.cssText = "display:flex;gap:6px;align-items:center;font-size:9px;white-space:nowrap;padding:0 4px;";
    el.innerHTML =
      `<span style="display:inline-block;width:8px;height:8px;background:${C_VALID}"></span><span style="color:#999">valid</span>` +
      `<span style="display:inline-block;width:8px;height:8px;background:${C_MISSING};margin-left:2px"></span><span style="color:#999">missing</span>`;
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
        extraStyles: { top: fixtureViewModel.offset },
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
        cell.title = `Valid: ${(total - missing).toLocaleString()}\nMissing: ${missing.toLocaleString()}`;

        const minMissingPx = missing > 0 ? 4 : 0;
        cell.innerHTML =
          `<div style="display:flex;flex:1;overflow:hidden">` +
          `<div style="flex:1;background:${C_VALID}"></div>` +
          (missing > 0 ? `<div style="width:${missingPct}%;min-width:${minMissingPx}px;background:${C_MISSING}"></div>` : "") +
          `</div>`;
      }
      if (needAppend) nodesToAppend.push(cell);
    }
    return { nodesToAppend };
  }
}

function applyDimensionBarStyles(wrap: HTMLElement, fieldName: string) {
  const selected = dimensionSelections.get(fieldName);
  const hasSelection = selected && selected.size > 0;
  const rows = wrap.querySelectorAll<HTMLElement>("[data-dim-val]");
  for (const row of rows) {
    const val = row.dataset.dimVal!;
    const isSelected = hasSelection && selected!.has(val);
    const isDimmed = hasSelection && !isSelected;
    row.style.opacity = isDimmed ? "0.35" : "1";
    const bar = row.querySelector<HTMLElement>("[data-dim-bar]");
    if (bar) {
      bar.style.background = isSelected ? "#42A5F5" : C_DIST_BAR;
      bar.style.border = isSelected ? "1px solid #0288D1" : "none";
    }
    const label = row.querySelector<HTMLElement>("[data-dim-label]");
    if (label) {
      label.style.color = isSelected ? "#0288D1" : "#616161";
      label.style.fontWeight = isSelected ? "600" : "";
    }
  }
}

function syncAllDimensionBarStyles() {
  const wraps = document.querySelectorAll<HTMLElement>("[data-dim-field]");
  for (const wrap of wraps) {
    applyDimensionBarStyles(wrap, wrap.dataset.dimField!);
  }
}

class HistogramFixture extends PHorizontalFixture {
  viewModelKey(): string { return "histogram"; }
  getHeight(): number { return 138; }
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
        extraStyles: { top: fixtureViewModel.offset },
      });

      if (contentDirty) {
        cell.style.padding = "0";
        cell.style.overflow = "hidden";
        cell.style.fontSize = "10px";
        cell.style.borderRight = "1px solid var(--vertical-border-color)";

        const meta = originalColMeta.get(colIndex) ?? this.data!.metadata.getValueColumnMeta(colIndex);
        if (meta?.topValues) {
          this.renderDimensionBars(cell, meta.fieldName as string, meta.topValues as Array<{ val: string; cnt: number }>);
        } else if (meta?.histBins) {
          this.renderMeasureBars(cell, colIndex, meta);
        } else {
          cell.textContent = "";
        }
      }
      if (needAppend) nodesToAppend.push(cell);
    }
    return { nodesToAppend };
  }

  private renderDimensionBars(cell: HTMLElement, fieldName: string, topValues: Array<{ val: string; cnt: number }>) {
    if (topValues.length === 0) { cell.textContent = ""; return; }
    const maxCnt = topValues[0].cnt;

    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;flex-direction:column;gap:1px;flex:1;height:100%;justify-content:flex-start;padding:2px 4px 8px;box-sizing:border-box;min-width:0;";
    wrap.dataset.dimField = fieldName;

    const header = document.createElement("div");
    header.style.cssText = "font-size:8px;color:#616161;margin-bottom:2px;";
    header.textContent = `Top ${topValues.length} values`;
    wrap.appendChild(header);

    for (const entry of topValues) {
      const row = document.createElement("div");
      row.dataset.dimVal = entry.val;
      row.style.cssText = "display:flex;align-items:center;gap:3px;height:14px;width:100%;cursor:pointer;";
      row.title = `Count: ${entry.cnt.toLocaleString()}\nValue: ${entry.val}`;

      const bar = document.createElement("div");
      const w = Math.max(2, (entry.cnt / maxCnt) * 100);
      bar.style.cssText = `height:10px;width:${w}%;max-width:45%;background:${C_DIST_BAR};flex-shrink:0;box-sizing:border-box;`;
      bar.dataset.dimBar = "1";

      const label = document.createElement("span");
      label.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:9px;color:#616161;flex:1;min-width:0;";
      label.textContent = entry.val;
      label.dataset.dimLabel = "1";

      row.addEventListener("click", () => {
        let sel = dimensionSelections.get(fieldName);
        if (!sel) {
          sel = new Set();
          dimensionSelections.set(fieldName, sel);
        }
        if (sel.has(entry.val)) {
          sel.delete(entry.val);
          if (sel.size === 0) dimensionSelections.delete(fieldName);
        } else {
          sel.add(entry.val);
        }
        applyDimensionBarStyles(wrap, fieldName);
        onDimensionSelectionChange?.();
      });

      row.appendChild(bar);
      row.appendChild(label);
      wrap.appendChild(row);
    }
    cell.style.alignItems = "flex-start";
    cell.replaceChildren(wrap);
    applyDimensionBarStyles(wrap, fieldName);
  }

  private renderMeasureBars(cell: HTMLElement, colIndex: number, meta: Record<string, unknown>) {
    const bins = meta.histBins as Array<{ bin: number; cnt: number; binMin: number; binMax: number }>;
    if (!bins || bins.length === 0) { cell.textContent = ""; return; }

    const maxCnt = Math.max(...bins.map(b => b.cnt));
    const minCnt = Math.min(...bins.map(b => b.cnt));
    const useLog = minCnt > 0 && maxCnt / minCnt > 10;
    const logMax = Math.log(maxCnt);
    const logMin = useLog ? Math.log(Math.max(1, minCnt)) : 0;
    const logRange = logMax - logMin;
    const min = meta.min as number;
    const max = meta.max as number;
    const binStep = (max - min) / bins.length;

    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;flex-direction:column;height:100%;width:100%;justify-content:flex-end;gap:0;padding:2px 4px;box-sizing:border-box;";

    const barsRow = document.createElement("div");
    barsRow.style.cssText = "display:flex;align-items:flex-end;gap:2px;flex:1 1 0;min-height:0;overflow:hidden;";

    const labelRow = document.createElement("div");
    labelRow.style.cssText = "display:flex;gap:2px;height:24px;flex-shrink:0;";

    for (let i = 0; i < bins.length; i++) {
      const entry = bins[i];

      const col = document.createElement("div");
      let h: number;
      if (useLog && logRange > 0) {
        h = Math.max(2, ((Math.log(Math.max(1, entry.cnt)) - logMin) / logRange) * 100);
      } else {
        h = Math.max(2, (entry.cnt / maxCnt) * 100);
      }
      col.style.cssText = `flex:1;height:${h}%;background:${C_DIST_BAR};min-width:0;`;
      col.title = `Count: ${entry.cnt.toLocaleString()}\nValue: ${fmtNum(entry.binMin)} – ${fmtNum(entry.binMax)}`;
      barsRow.appendChild(col);

      const tick = document.createElement("div");
      tick.style.cssText = "flex:1;min-width:0;overflow:visible;position:relative;height:100%;";
      if (i % 2 === 0 || i === bins.length - 1) {
        const lbl = document.createElement("span");
        lbl.style.cssText = "position:absolute;top:0;left:0;font-size:7px;color:#616161;white-space:nowrap;transform:rotate(45deg);transform-origin:top left;";
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

class QualityDotFixture extends PVerticalFixture {
  viewModelKey(): string { return "quality-dot"; }

  headerCell(): HTMLElement {
    const el = document.createElement("span");
    el.style.cssText = "font-size:9px;color:#999;white-space:nowrap;";
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
        extraStyles: { right: fixtureViewModel.offset },
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
        const hasNull = nullCols.length > 0;
        const color = hasNull ? C_MISSING : C_VALID;
        cell.style.display = "flex";
        cell.style.alignItems = "center";
        cell.style.justifyContent = "center";
        cell.title = hasNull ? `${nullCols.length} null value${nullCols.length > 1 ? "s" : ""}\n${nullCols.join("\n")}` : "";
        cell.innerHTML = `<div style="width:6px;height:10px;border-radius:1px;background:${color}"></div>`;
      }
      if (needAppend) nodesToAppend.push(cell);
    }
    return { nodesToAppend };
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

  get colSize() { return { strategy: "fixed-width" as const, widthInPx: 8, minWidthInPx: 8 }; }

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
      extraStyles: { right: fixtureViewModel.offset, rowspan: sliceData.sliceNumRows },
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
      Array<{ bucket: number; nullCount: number; totalCount: number }> | undefined;
    if (!minimap || minimap.length === 0) {
      if (needAppend) nodesToAppend.push(cell);
      return { nodesToAppend };
    }

    let minDensity = 1;
    let maxDensity = 0;
    const densities = new Float64Array(minimap.length);
    for (let i = 0; i < minimap.length; i++) {
      const d = minimap[i].totalCount > 0 ? minimap[i].nullCount / minimap[i].totalCount : 0;
      densities[i] = d;
      if (d > 0 && d < minDensity) minDensity = d;
      if (d > maxDensity) maxDensity = d;
    }
    const densityRange = maxDensity - minDensity;

    const bandH = height / minimap.length;
    for (let i = 0; i < minimap.length; i++) {
      const y = Math.round(i * bandH);
      const nextY = Math.round((i + 1) * bandH);
      const d = densities[i];
      if (d > 0) {
        const normalized = densityRange > 0 ? (d - minDensity) / densityRange : 1;
        const alpha = 0.2 + normalized * 0.8;
        ctx.fillStyle = `rgba(232,99,110,${alpha.toFixed(2)})`;
      } else {
        ctx.fillStyle = C_VALID;
      }
      ctx.fillRect(0, y, width, nextY - y);
    }

    if (needAppend) nodesToAppend.push(cell);
    return { nodesToAppend };
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
        `<span style="color:#999;font-size:11px">valid</span>` +
        `<span style="margin-left:8px;font-weight:700;font-size:14px">${missingPct}%</span>` +
        `<span style="color:#999;font-size:11px">missing</span>` +
        `<span style="margin-left:16px;font-weight:600">${numCols}</span>` +
        `<span style="color:#999;font-size:11px">columns</span>` +
        `<span style="margin-left:8px;font-weight:600">${totalRows.toLocaleString()}</span>` +
        `<span style="color:#999;font-size:11px">rows</span>` +
        `</div>`;
    }
    const offsetX = (vm as any).offsetX ?? 0;
    (cell.firstElementChild as HTMLElement).style.transform = offsetX !== 0 ? `translateX(${offsetX}px)` : "";
    if (needAppend) {
      cell.dataset.bottomFixtureNodeType = "h-sticky";
      nodesToAppend.push(cell);
    }
    return { nodesToAppend };
  }
}

function svgFilterIcon(size = 11): HTMLElement {
  const wrapper = document.createElement("span");
  wrapper.style.display = "inline-flex";
  wrapper.style.alignItems = "center";
  wrapper.style.cursor = "pointer";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2.5");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  polygon.setAttribute("points", "22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3");
  svg.appendChild(polygon);
  wrapper.appendChild(svg);
  return wrapper;
}

interface FilterPopoverState {
  field: string;
  anchorEl: HTMLElement;
}

const DimensionFilterPopover: React.FC<{
  field: string;
  anchorRect: DOMRect;
  values: string[];
  onApply: (field: string, values: string[]) => void;
  onClear: (field: string) => void;
  onClose: () => void;
}> = ({ field, anchorRect, values: initialValues, onApply, onClear, onClose }) => {
  const [values, setValues] = useState(initialValues);

  const handleRemove = (val: string) => {
    setValues(prev => prev.filter(v => v !== val));
  };

  return (
    <>
      <div
        style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }}
        onClick={onClose}
      />
      <div style={{
        position: "fixed",
        top: anchorRect.bottom + 4,
        left: anchorRect.left,
        zIndex: 1000,
        border: "1px solid #0288D1",
        borderRadius: 4,
        width: 240,
        fontSize: 12,
        background: "#42A5F5",
        color: "white",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        display: "flex",
        flexDirection: "column",
      }}>
        <div style={{ padding: "8px 12px", borderBottom: "1px solid #0288D1", fontWeight: 500, fontSize: 12 }}>
          Filter: {field}
        </div>
        <div style={{ padding: "8px 12px", maxHeight: 200, overflowY: "auto" }}>
          {values.length === 0 ? (
            <div style={{ fontSize: 11, opacity: 0.8 }}>No active filters</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {values.map(val => (
                <div key={val} style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "3px 8px",
                  background: "rgba(255,255,255,0.15)",
                  borderRadius: 12,
                  fontSize: 11,
                }}>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{val}</span>
                  <span
                    style={{ cursor: "pointer", fontWeight: 700, fontSize: 13, lineHeight: 1 }}
                    onClick={() => handleRemove(val)}
                  >
                    &times;
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, padding: "8px 12px", borderTop: "1px solid #0288D1" }}>
          <button
            onClick={() => onClear(field)}
            style={{ border: "none", borderRadius: 3, padding: "4px 10px", fontSize: 11, color: "#42A5F5", background: "rgba(255,255,255,0.9)", cursor: "pointer", fontWeight: 500 }}
          >
            Clear
          </button>
          <button
            onClick={onClose}
            style={{ border: "none", borderRadius: 3, padding: "4px 10px", fontSize: 11, color: "#42A5F5", background: "rgba(255,255,255,0.9)", cursor: "pointer", fontWeight: 500 }}
          >
            Cancel
          </button>
          <button
            onClick={() => onApply(field, values)}
            style={{ border: "none", borderRadius: 3, padding: "4px 10px", fontSize: 11, color: "#42A5F5", background: "white", cursor: "pointer", fontWeight: 600 }}
          >
            Apply
          </button>
        </div>
      </div>
    </>
  );
};

type DirtyDsState =
  | { status: "loading" }
  | { status: "ready"; ds: DuckDBWasmDataSource; schema: DataSchema[] }
  | { status: "error"; error: string };

function useDirtyDataSource(): DirtyDsState {
  const parentData = useDataSource();
  const [state, setState] = useState<DirtyDsState>({ status: "loading" });

  useEffect(() => {
    if (parentData.status !== "ready") return;

    let cancelled = false;
    (async () => {
      const ds = await DuckDBWasmDataSource.create();
      await ds.loadDataFromURL({
        url: "/Citywide_Payroll_Data_FY2025_filtered.csv",
        type: "csv",
        schema: CLEAN_SCHEMA,
        replace: buildReplaceMap(),
        preprocess: makePreprocess(TARGET_ROWS),
      });
      await ds.execute(
        `DELETE FROM "${ds.table}" WHERE "Work Location Borough" IS NULL OR TRIM("Work Location Borough") = ''`
      );

      await ds.execute(`ALTER TABLE "${ds.table}" ADD COLUMN __dirty__ BOOLEAN DEFAULT FALSE`);
      await ds.execute(`UPDATE "${ds.table}" SET __dirty__ = random() < ${NULL_ROW_RATE}`);
      const nullableCols = CLEAN_SCHEMA.map(s => s.name).filter(n => n !== "Payroll Number" && n !== "Agency Name");
      for (const col of nullableCols) {
        await ds.execute(`UPDATE "${ds.table}" SET "${col}" = NULL WHERE __dirty__ AND random() < ${NULL_COL_RATE}`);
      }
      await ds.execute(`ALTER TABLE "${ds.table}" DROP COLUMN __dirty__`);

      if (!cancelled) setState({ status: "ready", ds, schema: CLEAN_SCHEMA });
    })().catch((err) => {
      if (!cancelled) setState({ status: "error", error: String(err) });
    });
    return () => { cancelled = true; };
  }, [parentData.status]);

  return state;
}

export function StandardGrid() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<Grid | null>(null);
  const viewModelRef = useRef<FlattenedDataViewModel | null>(null);
  const modelRef = useRef<SqlStandardTableDataModel | null>(null);
  const irRef = useRef<StandardDataFetchAndTransformIR | null>(null);
  const dirtyData = useDirtyDataSource();

  const [filterPopover, setFilterPopover] = useState<FilterPopoverState | null>(null);
  const setFilterPopoverRef = useRef(setFilterPopover);
  setFilterPopoverRef.current = setFilterPopover;

  const refetchAndDraw = useCallback(async () => {
    const model = modelRef.current;
    const viewModel = viewModelRef.current;
    const grid = gridRef.current;
    const ir = irRef.current;
    if (!model || !viewModel || !grid || !ir) return;

    const filters = buildAllFilters();
    const newIR: StandardDataFetchAndTransformIR = {
      ...ir,
      startRow: 0,
      endRow: 10000,
      filter: filters,
    };
    const fetchResult = await model.getViewModelData(newIR);
    viewModel.updateData({
      data: fetchResult.data,
      columnFacets: fetchResult.columnFacets,
      totalRows: fetchResult.totalRows,
      offsetTop: fetchResult.offsetTop,
      metadata: fetchResult.metadata,
    });
    grid.draw();
    syncAllDimensionBarStyles();
  }, []);

  const handleFilterApply = useCallback((field: string, values: string[]) => {
    if (values.length > 0) {
      dimensionSelections.set(field, new Set(values));
    } else {
      dimensionSelections.delete(field);
    }
    setFilterPopover(null);
    refetchAndDraw();
  }, [refetchAndDraw]);

  const handleFilterClear = useCallback((field: string) => {
    dimensionSelections.delete(field);
    setFilterPopover(null);
    refetchAndDraw();
  }, [refetchAndDraw]);

  useEffect(() => {
    if (dirtyData.status !== "ready" || !containerRef.current) return;

    const { ds, schema } = dirtyData;
    const plumber = createQualityPlumber();
    const model = new SqlStandardTableDataModel(schema, ds, undefined, plumber);
    modelRef.current = model;

    let cancelled = false;
    (async () => {
      const projectCols = schema.map(s => s.name);
      const ir: StandardDataFetchAndTransformIR = {
        startRow: 0,
        endRow: 10000,
        groupPath: [],
        groupBy: [],
        project: projectCols,
        sort: [],
        filter: [],
      };
      irRef.current = ir;

      const result = await model.getViewModelData(ir);
      if (cancelled) return;

      originalColMeta.clear();
      histogramSelections.clear();
      dimensionSelections.clear();
      for (let i = 0; i < projectCols.length; i++) {
        const m = result.metadata?.valueColumns?.find(c => c.colIndex === i);
        if (m) originalColMeta.set(i, { ...m.meta });
      }

      const colTrackRenderer: FacetCellRenderer = (data: string, dataCtx: FacetDataContext, ctx: FacetRendererContext) => {
        if (!DIMENSION_FIELDS_WITH_HIST.has(data)) return data;

        const sel = dimensionSelections.get(data);
        const hasFilter = sel && sel.size > 0;

        if (!hasFilter) return data;

        const icon = svgFilterIcon(11);
        icon.style.background = "rgba(66,165,245,0.2)";
        icon.style.borderRadius = "3px";
        icon.style.padding = "1px";
        icon.addEventListener("click", (e) => {
          e.stopPropagation();
          setFilterPopoverRef.current({ field: data, anchorEl: icon });
        });

        return {
          content: data,
          right: icon,
        };
      };

      const options: GridDataViewModelOptions = {
        ...result.options,
        vTrackDefs: projectCols.map(() => ({
          renderer: qualityCellRenderer,
        })),
        facetDefs: {
          row: [],
          col: [{ trackRenderer: colTrackRenderer }],
          axis: "col",
        },
      };

      const viewModel = new FlattenedDataViewModel({
        data: result.data,
        columnFacets: result.columnFacets,
        totalRows: result.totalRows,
        offsetTop: result.offsetTop,
        options,
        metadata: result.metadata,
      });
      viewModelRef.current = viewModel;

      const grid = new Grid({
        theme: "data-wrangler",
        fixtures: {
          top: [HistogramFixture, QualityBarFixture],
          left: [RowNumberFixture],
          bottom: [SummaryFixture],
          right: [QualityDotFixture, MinimapFixture],
        },
      }, containerRef.current!, "flat");
      gridRef.current = grid;
      minimapGridRef = grid;
      grid.data = viewModel;
      grid.draw();

      onHistogramSelectionChange = async () => {
        await refetchAndDraw();
      };

      onDimensionSelectionChange = async () => {
        await refetchAndDraw();
      };

      grid.on("viewDataEmpty", async (vp) => {
        const filters = buildAllFilters();
        const fetchIR: StandardDataFetchAndTransformIR = {
          ...ir,
          startRow: vp.startRow,
          endRow: vp.endRow,
          filter: filters,
        };
        const fetchResult = await model.getViewModelData(fetchIR);
        viewModel.updateData({
          data: fetchResult.data,
          columnFacets: fetchResult.columnFacets,
          totalRows: fetchResult.totalRows,
          offsetTop: fetchResult.offsetTop,
          metadata: fetchResult.metadata,
        });
        grid.draw();
      });
    })();

    return () => {
      cancelled = true;
      onHistogramSelectionChange = null;
      onDimensionSelectionChange = null;
      minimapGridRef = null;
    };
  }, [dirtyData, refetchAndDraw]);

  const filterAnchorRect = filterPopover?.anchorEl.getBoundingClientRect();
  const filterValues = filterPopover ? Array.from(dimensionSelections.get(filterPopover.field) ?? []) : [];

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex items-center justify-center min-h-0">
        {dirtyData.status === "loading" && <span style={{ fontSize: 13, color: "#6b7280" }}>Loading data...</span>}
        {dirtyData.status === "error" && <span style={{ fontSize: 13, color: "#dc2626" }}>{dirtyData.error}</span>}
        <div ref={containerRef} style={{ width: 800, height: 480, position: "relative", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.08)", boxSizing: "border-box", contain: "layout style", display: dirtyData.status === "ready" ? "block" : "none" }} />
      </div>

      {filterPopover && filterAnchorRect && (
        <DimensionFilterPopover
          field={filterPopover.field}
          anchorRect={filterAnchorRect}
          values={filterValues}
          onApply={handleFilterApply}
          onClear={handleFilterClear}
          onClose={() => setFilterPopover(null)}
        />
      )}
    </div>
  );
}

