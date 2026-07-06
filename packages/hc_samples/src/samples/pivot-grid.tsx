import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useDataSource } from "../DataSourceProvider";
import { SqlPivotTableDataModel, cross, concat, hierarchy, ProjectionState, DimensionalProjectionPath, SortEntry, AxisConfig, AxisExpr, ScalarFilter, Filter, PivotMetadataPlumber, SqlPivotMetadataResolver, PivotMetadataReshaper } from "grid";
import Grid, { PivotDataViewModel, FacetCellRenderer, FacetDataContext, FacetRendererContext, FacetHeaderRenderer, FacetHeaderContext, GridDataViewModelOptions, PHorizontalFixture } from "grid/dist/renderer";
import type { BaseFixtureViewModel, BaseViewModel, BaseSliceResult, CellRenderer, ValueCellDataContext, RendererContext } from "grid/dist/renderer";
import "grid/dist/grid.css";
import { formatDecimals } from "../lib/format";

const ROW_FIELDS = ["Work Location Borough", "Leave Status as of June 30"];
const ROW_HEADER_LABELS = ["Work Location Borough", "Leave Status"];
const COL_HEADER_FIELDS = ["Agency Name"];
const FILTER_FIELDS = ["Work Location Borough", "Agency Name"];
const MEASURE_NAMES = ["Base Salary", "Regular Hours", "Regular Gross Paid", "OT Hours", "Total OT Paid", "Total Other Pay"];

// #region projection-tree

interface ProjectionTree {
  [value: string]: ProjectionTree;
}

function toggleProjection(tree: ProjectionTree, path: (string | null)[], level: number): ProjectionTree {
  const value = path[level]!;

  if (level === 0) {
    const newTree = { ...tree };
    if (value in newTree) {
      delete newTree[value];
    } else {
      newTree[value] = {};
    }
    return newTree;
  }

  const ancestor = path[0]!;
  if (!(ancestor in tree)) return tree;
  const newTree = { ...tree };
  newTree[ancestor] = toggleProjectionAt(tree[ancestor], path, 1, level);
  return newTree;
}

function toggleProjectionAt(subtree: ProjectionTree, path: (string | null)[], currentLevel: number, targetLevel: number): ProjectionTree {
  const value = path[currentLevel]!;
  if (currentLevel === targetLevel) {
    const newSubtree = { ...subtree };
    if (value in newSubtree) {
      delete newSubtree[value];
    } else {
      newSubtree[value] = {};
    }
    return newSubtree;
  }

  if (!(value in subtree)) return subtree;
  const newSubtree = { ...subtree };
  newSubtree[value] = toggleProjectionAt(subtree[value], path, currentLevel + 1, targetLevel);
  return newSubtree;
}

function treeToPaths(tree: ProjectionTree): DimensionalProjectionPath[] | undefined {
  const keys = Object.keys(tree);
  if (keys.length === 0) return [];

  const paths: DimensionalProjectionPath[] = [];
  for (const key of keys) {
    const subtree = tree[key];
    const childPaths = treeToPaths(subtree);
    if (childPaths && childPaths.length > 0) {
      for (const childPath of childPaths) {
        paths.push({ open: [key], next: childPath });
      }
    } else {
      paths.push({ open: [key] });
    }
  }
  return paths;
}

// #endregion projection-tree

// #region svg-icons

function svgSpinner(size = 11): HTMLElement {
  const wrapper = document.createElement("span");
  wrapper.style.display = "inline-flex";
  wrapper.style.alignItems = "center";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2.5");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  const line1 = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line1.setAttribute("x1", "12"); line1.setAttribute("y1", "2");
  line1.setAttribute("x2", "12"); line1.setAttribute("y2", "6");
  const line2 = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line2.setAttribute("x1", "12"); line2.setAttribute("y1", "18");
  line2.setAttribute("x2", "12"); line2.setAttribute("y2", "22");
  const line3 = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line3.setAttribute("x1", "4.93"); line3.setAttribute("y1", "4.93");
  line3.setAttribute("x2", "7.76"); line3.setAttribute("y2", "7.76");
  const line4 = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line4.setAttribute("x1", "16.24"); line4.setAttribute("y1", "16.24");
  line4.setAttribute("x2", "19.07"); line4.setAttribute("y2", "19.07");
  const line5 = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line5.setAttribute("x1", "2"); line5.setAttribute("y1", "12");
  line5.setAttribute("x2", "6"); line5.setAttribute("y2", "12");
  const line6 = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line6.setAttribute("x1", "18"); line6.setAttribute("y1", "12");
  line6.setAttribute("x2", "22"); line6.setAttribute("y2", "12");
  const line7 = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line7.setAttribute("x1", "4.93"); line7.setAttribute("y1", "19.07");
  line7.setAttribute("x2", "7.76"); line7.setAttribute("y2", "16.24");
  const line8 = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line8.setAttribute("x1", "16.24"); line8.setAttribute("y1", "7.76");
  line8.setAttribute("x2", "19.07"); line8.setAttribute("y2", "4.93");
  svg.append(line1, line2, line3, line4, line5, line6, line7, line8);
  svg.style.animation = "spin 1s linear infinite";
  wrapper.appendChild(svg);
  return wrapper;
}

function svgChevron(direction: "right" | "down", size = 11): HTMLElement {
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
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", direction === "right" ? "M9 18l6-6-6-6" : "M6 9l6 6 6-6");
  svg.appendChild(path);
  wrapper.appendChild(svg);
  return wrapper;
}

function svgDash(size = 11): HTMLElement {
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
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", "5"); line.setAttribute("y1", "12");
  line.setAttribute("x2", "19"); line.setAttribute("y2", "12");
  svg.appendChild(line);
  wrapper.appendChild(svg);
  return wrapper;
}

function svgSortIcon(size = 11): HTMLElement {
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
  const line1 = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line1.setAttribute("x1", "18"); line1.setAttribute("y1", "20");
  line1.setAttribute("x2", "18"); line1.setAttribute("y2", "10");
  const line2 = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line2.setAttribute("x1", "12"); line2.setAttribute("y1", "20");
  line2.setAttribute("x2", "12"); line2.setAttribute("y2", "4");
  const line3 = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line3.setAttribute("x1", "6"); line3.setAttribute("y1", "20");
  line3.setAttribute("x2", "6"); line3.setAttribute("y2", "14");
  svg.append(line1, line2, line3);
  wrapper.appendChild(svg);
  return wrapper;
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

// #endregion svg-icons

// #region cell-renderer

function formatInt(val: number): string {
  return Math.round(val).toLocaleString();
}

function toTitleCase(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

const baseSalaryCellRenderer: CellRenderer<unknown> = (data, dataCtx, ctx) => {
  if (data == null) return "";

  ctx.container.replaceChildren();
  ctx.container.style.display = "flex";
  ctx.container.style.alignItems = "center";
  ctx.container.style.justifyContent = "space-between";
  ctx.container.style.gap = "6px";
  ctx.container.style.padding = "0 4px";
  ctx.container.title = "";

  const colMeta = dataCtx.viewModel.metadata?.getValueColumnMeta(dataCtx.colIndex);
  const avg = colMeta?.avg as number | undefined;
  const value = Number(data);
  const formatted = formatInt(value);

  const pctSpan = document.createElement("span");
  pctSpan.style.cssText = "font-size:9px;font-weight:600;white-space:nowrap;";
  if (avg != null && !isNaN(value) && avg > 0 && value > avg) {
    const pctAbove = Math.round(((value - avg) / avg) * 100);
    if (pctAbove > 0) {
      const intensity = Math.min(pctAbove / 100, 1);
      const green = Math.round(120 + intensity * 60);
      pctSpan.style.color = `rgb(22,${green},44)`;
      pctSpan.textContent = `${pctAbove}%`;
      ctx.container.title = `Value: ${formatted} $\nColumn avg: ${formatInt(avg)} $\n${pctAbove}% above average`;
    }
  }
  ctx.container.appendChild(pctSpan);

  const valueRow = document.createElement("span");
  const numSpan = document.createElement("span");
  numSpan.textContent = formatted;
  const dollarSpan = document.createElement("span");
  dollarSpan.style.cssText = "font-size:9px;color:#9ca3af;margin-left:3px;";
  dollarSpan.textContent = "$";
  valueRow.appendChild(numSpan);
  valueRow.appendChild(dollarSpan);
  ctx.container.appendChild(valueRow);

  return;
};

const regularHoursCellRenderer: CellRenderer<unknown> = (data, _dataCtx, ctx) => {
  if (data == null) return "";
  ctx.container.replaceChildren();
  ctx.container.style.display = "flex";
  ctx.container.style.alignItems = "center";
  ctx.container.style.justifyContent = "flex-end";
  ctx.container.style.gap = "6px";
  ctx.container.style.padding = "0 4px";

  const valueRow = document.createElement("span");
  const numSpan = document.createElement("span");
  numSpan.textContent = formatInt(Number(data));
  const hrsSpan = document.createElement("span");
  hrsSpan.style.cssText = "font-size:9px;color:#9ca3af;margin-left:3px;";
  hrsSpan.textContent = "hrs";
  valueRow.appendChild(numSpan);
  valueRow.appendChild(hrsSpan);
  ctx.container.appendChild(valueRow);

  return;
};

function buildVTrackDefs(columnFacets: (string | null)[][], frLayout = false): GridDataViewModelOptions["vTrackDefs"] {
  const measureLevel = columnFacets[columnFacets.length - 1];
  if (!measureLevel) return undefined;
  const colSize = frLayout ? { strategy: "static" as const, width: 1, unit: "fr" as const } : undefined;
  return measureLevel.map(measure => {
    if (measure === "Base Salary") {
      return { renderer: baseSalaryCellRenderer, cellHeight: 40, colSize };
    }
    if (measure === "Regular Hours") {
      return { renderer: regularHoursCellRenderer, cellHeight: 40, colSize };
    }
    return { cellHeight: 40, colSize };
  });
}

// #endregion cell-renderer

// #region shared-ui

const BORDER = "#ccd0da";
const TEXT = "#4c4f69";
const TEXT_SECONDARY = "#5c5f77";
const TEXT_MUTED = "#8c8fa1";
const BG = "#eff1f5";
const BG_HEADER = "#e6e9ef";

const SvgArrow: React.FC<{ direction: "asc" | "desc"; size?: number }> = ({ direction, size = 11 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    {direction === "asc" ? (
      <><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></>
    ) : (
      <><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></>
    )}
  </svg>
);

const SvgX: React.FC<{ size?: number; onClick?: () => void }> = ({ size = 14, onClick }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ cursor: "pointer" }} onClick={onClick}>
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

// #endregion shared-ui

// #region sort-dropdown

type SortDirection = "asc" | "desc";
type SortMode = "alphabetical" | "measure";

interface SortEntryConfig {
  field: string;
  direction: SortDirection;
  by?: string;
}

const SORT_NS = "sort";
const SORT_HEADER_NS = (level: number) => `sort-header-${level}`;

function describeSortEntry(entry: SortEntryConfig): string {
  if (entry.by) {
    return `${entry.field} by ${entry.by}`;
  }
  return `${entry.field} alphabetically`;
}

const MIN_MULTI_SORT_HEIGHT = 60;

const SortDropdown: React.FC<{
  field: string;
  measures: string[];
  initialMode: SortMode;
  initialDirection: SortDirection;
  initialMeasure: string;
  multiSortEntries: SortEntryConfig[];
  onApply: (entries: SortEntryConfig[]) => void;
  onMultiSortChange: (entries: SortEntryConfig[]) => void;
  onClose: () => void;
}> = ({ field, measures, initialMode, initialDirection, initialMeasure, multiSortEntries, onApply, onMultiSortChange, onClose }) => {
  const [mode, setMode] = useState<SortMode>(initialMode);
  const [direction, setDirection] = useState<SortDirection>(initialDirection);
  const [selectedMeasure, setSelectedMeasure] = useState(initialMeasure);
  const [entries, setEntries] = useState<SortEntryConfig[]>(multiSortEntries);

  const buildCurrentEntry = (): SortEntryConfig => ({
    field,
    direction,
    ...(mode === "measure" ? { by: selectedMeasure } : {}),
  });

  const upsertEntry = (list: SortEntryConfig[], entry: SortEntryConfig): SortEntryConfig[] => {
    const idx = list.findIndex(e => e.field === entry.field);
    if (idx >= 0) {
      const existing = list[idx];
      if (existing.direction === entry.direction && existing.by === entry.by) return list;
      const updated = [...list];
      updated[idx] = entry;
      return updated;
    }
    return [...list, entry];
  };

  const handleAddToMultiSort = () => {
    const entry = buildCurrentEntry();
    const newEntries = upsertEntry(entries, entry);
    setEntries(newEntries);
    onMultiSortChange(newEntries);
  };

  const handleRemoveEntry = (index: number) => {
    const newEntries = entries.filter((_, i) => i !== index);
    setEntries(newEntries);
    onMultiSortChange(newEntries);
  };

  const handleApply = () => {
    const entry = buildCurrentEntry();
    const newEntries = upsertEntry(entries, entry);
    setEntries(newEntries);
    onApply(newEntries);
  };

  const toggleDirection = () => {
    setDirection(d => d === "asc" ? "desc" : "asc");
  };

  return (
    <div style={{
      border: `1px solid ${BORDER}`,
      borderRadius: 4,
      width: 280,
      fontSize: 12,
      fontWeight: "normal",
      color: TEXT,
      background: BG,
      boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
      display: "flex",
      flexDirection: "column",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: BG_HEADER, borderBottom: `1px solid ${BORDER}`, borderRadius: "4px 4px 0 0" }}>
        <span style={{ fontWeight: 500, fontSize: 12, color: TEXT_SECONDARY }}>Sort {field}</span>
        <SvgX size={14} onClick={onClose} />
      </div>

      <div style={{ padding: "12px" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, cursor: "pointer" }}>
          <input type="radio" checked={mode === "alphabetical"} onChange={() => setMode("alphabetical")} style={{ accentColor: TEXT_SECONDARY, width: 14, height: 14, margin: 0 }} />
          <span>Alphabetically</span>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, cursor: "pointer" }}>
          <input type="radio" checked={mode === "measure"} onChange={() => setMode("measure")} style={{ accentColor: TEXT_SECONDARY, width: 14, height: 14, margin: 0 }} />
          <span>by</span>
          <select
            value={selectedMeasure}
            onChange={e => { setSelectedMeasure(e.target.value); setMode("measure"); }}
            disabled={mode !== "measure"}
            style={{
              border: `1px solid ${BORDER}`,
              borderRadius: 3,
              padding: "2px 6px",
              fontSize: 12,
              color: mode === "measure" ? TEXT : TEXT_MUTED,
              background: mode === "measure" ? BG : BG_HEADER,
              outline: "none",
              cursor: mode === "measure" ? "pointer" : "default",
            }}
          >
            {measures.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>

        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
          <span style={{ color: TEXT_SECONDARY }}>in</span>
          <button
            onClick={toggleDirection}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              border: `1px solid ${BORDER}`,
              borderRadius: 3,
              padding: "2px 8px",
              fontSize: 12,
              color: TEXT_SECONDARY,
              background: BG,
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            <SvgArrow direction={direction} size={11} />
            {direction === "asc" ? "Ascending" : "Descending"}
          </button>
          <span style={{ color: TEXT_SECONDARY }}>order</span>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 500, fontSize: 12, color: TEXT_SECONDARY, marginBottom: 4 }}>Multi sort</div>
          <div style={{ minHeight: MIN_MULTI_SORT_HEIGHT }}>
            {entries.length === 0 ? (
              <div style={{ color: TEXT_MUTED, fontSize: 11 }}>Add multiple fields to sort</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
                {entries.map((entry, i) => (
                  <div key={i} style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    border: `1px solid ${BORDER}`,
                    borderRadius: 14,
                    padding: "4px 10px",
                    fontSize: 12,
                    background: BG_HEADER,
                  }}>
                    <SvgArrow direction={entry.direction} size={11} />
                    <span style={{ flex: 1, color: TEXT }}>{describeSortEntry(entry)}</span>
                    <SvgX size={11} onClick={() => handleRemoveEntry(i)} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={handleAddToMultiSort}
            style={{
              border: `1px solid ${BORDER}`,
              borderRadius: 3,
              padding: "4px 10px",
              fontSize: 12,
              color: TEXT_SECONDARY,
              background: BG,
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            Add to Multi Sort
          </button>
          <button
            onClick={handleApply}
            style={{
              border: `1px solid ${BORDER}`,
              borderRadius: 3,
              padding: "4px 14px",
              fontSize: 12,
              color: "#fff",
              background: TEXT_SECONDARY,
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};

// #endregion sort-dropdown

// #region filter-dropdown

const FILTER_NS = "filter";
const FILTER_HEADER_NS = (field: string) => `filter-header-${field}`;

const inputStyle: React.CSSProperties = {
  border: `1px solid ${BORDER}`,
  borderRadius: 3,
  padding: "4px 6px",
  fontSize: 12,
  color: TEXT,
  background: BG,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const SetFilterDropdown: React.FC<{
  field: string;
  distinctValues: string[] | null;
  currentFilters: ScalarFilter[];
  onApply: (field: string, filters: ScalarFilter[]) => void;
  onClear: (field: string) => void;
  onClose: () => void;
}> = ({ field, distinctValues, currentFilters, onApply, onClear, onClose }) => {
  const existingSetFilter = currentFilters.find(f => f.op === "in");

  const [selectedValues, setSelectedValues] = useState<Set<string>>(() => {
    if (existingSetFilter && Array.isArray(existingSetFilter.value)) {
      return new Set(existingSetFilter.value.map(String));
    }
    return new Set(distinctValues ?? []);
  });
  const initializedRef = useRef(!!existingSetFilter || !!distinctValues);
  useEffect(() => {
    if (!initializedRef.current && distinctValues) {
      initializedRef.current = true;
      setSelectedValues(new Set(distinctValues));
    }
  }, [distinctValues]);
  const [searchText, setSearchText] = useState("");

  const filteredValues = useMemo(() => {
    if (!distinctValues) return [];
    if (!searchText) return distinctValues;
    const lower = searchText.toLowerCase();
    return distinctValues.filter(v => v.toLowerCase().includes(lower));
  }, [distinctValues, searchText]);

  const handleSelectAll = () => {
    setSelectedValues(new Set(filteredValues));
  };

  const handleDeselectAll = () => {
    setSelectedValues(new Set());
  };

  const handleToggleValue = (val: string) => {
    setSelectedValues(prev => {
      const next = new Set(prev);
      if (next.has(val)) {
        next.delete(val);
      } else {
        next.add(val);
      }
      return next;
    });
  };

  const handleApply = () => {
    const vals = Array.from(selectedValues);
    onApply(field, [{ type: "scalar", field, op: "in", value: vals }]);
  };

  return (
    <div style={{
      border: `1px solid ${BORDER}`,
      borderRadius: 4,
      width: 280,
      fontSize: 12,
      fontWeight: "normal",
      color: TEXT,
      background: BG,
      boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
      display: "flex",
      flexDirection: "column",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: BG_HEADER, borderBottom: `1px solid ${BORDER}`, borderRadius: "4px 4px 0 0" }}>
        <span style={{ fontWeight: 500, fontSize: 12, color: TEXT_SECONDARY }}>Filter {field}</span>
        <SvgX size={14} onClick={onClose} />
      </div>

      <div style={{ padding: "12px" }}>
        <input
          type="text"
          placeholder="Search..."
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          style={{ ...inputStyle, marginBottom: 6 }}
        />
        <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
          <span style={{ cursor: "pointer", color: TEXT_SECONDARY, fontSize: 11, textDecoration: "underline" }} onClick={handleSelectAll}>Select All</span>
          <span style={{ cursor: "pointer", color: TEXT_SECONDARY, fontSize: 11, textDecoration: "underline" }} onClick={handleDeselectAll}>Deselect All</span>
        </div>
        <div style={{ maxHeight: 200, overflowY: "auto", border: `1px solid ${BORDER}`, borderRadius: 3, padding: 4 }}>
          {distinctValues === null ? (
            <div style={{ color: TEXT_MUTED, padding: 8, textAlign: "center" }}>Loading...</div>
          ) : filteredValues.map(val => (
            <label key={val} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 4px", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={selectedValues.has(val)}
                onChange={() => handleToggleValue(val)}
                style={{ accentColor: TEXT_SECONDARY, width: 14, height: 14, margin: 0 }}
              />
              <span>{val}</span>
            </label>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
          <button
            onClick={() => onClear(field)}
            style={{
              border: `1px solid ${BORDER}`,
              borderRadius: 3,
              padding: "4px 10px",
              fontSize: 12,
              color: TEXT_SECONDARY,
              background: BG,
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            Clear
          </button>
          <button
            onClick={handleApply}
            disabled={selectedValues.size === 0}
            style={{
              border: `1px solid ${BORDER}`,
              borderRadius: 3,
              padding: "4px 14px",
              fontSize: 12,
              color: "#fff",
              background: selectedValues.size === 0 ? "#b0b4bc" : TEXT_SECONDARY,
              cursor: selectedValues.size === 0 ? "not-allowed" : "pointer",
              fontWeight: 500,
              opacity: selectedValues.size === 0 ? 0.6 : 1,
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};

// #endregion filter-dropdown

// #region merge-renderers

function mergeRenderers(
  options: GridDataViewModelOptions | undefined,
  viewModel: PivotDataViewModel,
  vTrackDefsOverride?: GridDataViewModelOptions["vTrackDefs"],
): GridDataViewModelOptions {
  const existingRow = viewModel.facetDefs.row;
  const existingCol = viewModel.facetDefs.col;
  const newRow = options?.facetDefs?.row ?? [];
  const newCol = options?.facetDefs?.col ?? [];
  return {
    ...options,
    ...(vTrackDefsOverride && { vTrackDefs: vTrackDefsOverride }),
    facetDefs: {
      ...options?.facetDefs!,
      row: newRow.map((d, i) => ({ ...d, trackRenderer: existingRow[i]?.trackRenderer, headerRenderer: existingRow[i]?.headerRenderer, text: existingRow[i]?.text })),
      col: newCol.map((d, i) => ({ ...d, trackRenderer: existingCol[i]?.trackRenderer, headerRenderer: existingCol[i]?.headerRenderer, text: existingCol[i]?.text })),
    },
  };
}

// #endregion merge-renderers

// #region bottom-fixture

class AggregateFooterFixture extends PHorizontalFixture {
  viewModelKey(): string {
    return "aggregate-footer";
  }

  getHeight(): number {
    return 28;
  }

  headerCell(ctx: FacetHeaderContext): HTMLElement | null {
    if (ctx.level > 0) {
      const empty = document.createElement("span");
      return empty;
    }
    const vm = this.data as PivotDataViewModel | undefined;
    if (!vm) return null;
    const boroughLevel = vm.rowFacets[0];
    const boroughs = new Set<string>();
    if (boroughLevel) {
      for (const val of boroughLevel) {
        if (val != null) boroughs.add(val);
      }
    }
    const span = document.createElement("span");
    span.style.cssText = "font-size:11px;padding:2px 4px;font-weight:500;color:#4c4f69;";
    span.textContent = `${boroughs.size} boroughs`;
    return span;
  }

  getCellsToRender(viewModel: BaseViewModel, fixtureViewModel: BaseFixtureViewModel, sliceData: BaseSliceResult): {
    nodesToAppend: HTMLElement[];
  } {
    const nodesToAppend: HTMLElement[] = [];
    const vm = viewModel as any;
    const pivotVm = this.data as PivotDataViewModel;
    const numRowFacetLevels = pivotVm.numRowFacetLevels;
    const leftFixtureCount = vm.fixtures?.left?.length ?? 0;
    const numRows = pivotVm.numRows;
    const colFacets = pivotVm.columnFacets;
    const measureLevel = colFacets[colFacets.length - 1];

    for (let i = 0; i < sliceData.sliceNumCols; i++) {
      const colIndex = viewModel.x0 + i;
      const key = `agg-col-${colIndex}`;
      const gridCol = leftFixtureCount + numRowFacetLevels + i + 1;
      const [cell, needAppend, contentDirty] = this.placeCellInDom({
        key,
        gridRow: fixtureViewModel.track,
        gridCol,
        hintContentDirty: true,
        cls: `header ${fixtureViewModel.suggestedCls.join(" ")}`,
        extraStyles: {
          bottom: fixtureViewModel.offset,
        },
      });

      if (contentDirty) {
        cell.style.cssText += "font-size:11px;padding:0 4px;font-weight:500;color:#4c4f69;display:flex;align-items:center;justify-content:flex-end;";
        const measureName = measureLevel?.[colIndex];
        const slice = pivotVm.getSlice(colIndex, 0, colIndex + 1, numRows);
        const colData = slice.data?.[0];

        cell.replaceChildren();
        if (colData && measureName === "Base Salary") {
          let sum = 0;
          for (const val of colData) {
            if (val != null && typeof val === "number") sum += val;
          }
          const numSpan = document.createElement("span");
          numSpan.textContent = formatInt(sum);
          const unit = document.createElement("span");
          unit.style.cssText = "font-size:9px;color:#9ca3af;margin-left:3px;";
          unit.textContent = "$";
          cell.appendChild(numSpan);
          cell.appendChild(unit);
        } else if (colData && measureName === "Regular Hours") {
          let sum = 0;
          let count = 0;
          for (const val of colData) {
            if (val != null && typeof val === "number") {
              sum += val;
              count++;
            }
          }
          if (count > 0) {
            const numSpan = document.createElement("span");
            numSpan.textContent = formatInt(sum / count);
            const unit = document.createElement("span");
            unit.style.cssText = "font-size:9px;color:#9ca3af;margin-left:3px;";
            unit.textContent = "hrs";
            cell.appendChild(numSpan);
            cell.appendChild(unit);
          }
        }
      }

      if (needAppend) nodesToAppend.push(cell);
    }

    return { nodesToAppend };
  }
}

// #endregion bottom-fixture

// #region facet-renderer

const GLOBAL_ROW_NS = "global-row";
const GLOBAL_COL_NS = "global-col";

function makeFacetRenderer(
  projectionTreeRef: React.MutableRefObject<ProjectionTree>,
  projectionDisabledRef: React.MutableRefObject<boolean>,
  modelRef: React.MutableRefObject<SqlPivotTableDataModel | null>,
  viewModelRef: React.MutableRefObject<PivotDataViewModel | null>,
  buildConfig: () => PivotBuildConfig,
): FacetCellRenderer {
  return (data: string, dataCtx: FacetDataContext, rCtx: FacetRendererContext) => {
    const isLeaf = dataCtx.level >= 1;

    const globalRowMeta = dataCtx.viewModel.metaState.get(GLOBAL_ROW_NS);
    const isGlobalRowLoading = globalRowMeta?.["loading"] === true;

    const buildContent = (): string | HTMLElement => {
      const displayName = data != null ? toTitleCase(String(data)) : "";
      if (isLeaf || data == null) return displayName;
      const facetMeta = dataCtx.viewModel.metadata?.getRowFacetMeta(dataCtx.level, dataCtx.index);
      const agencyCount = facetMeta?.agencyCount as number | undefined;
      if (agencyCount == null) return displayName;
      const wrapper = document.createElement("div");
      wrapper.style.display = "flex";
      wrapper.style.flexDirection = "column";
      wrapper.style.lineHeight = "1.3";
      const nameEl = document.createElement("span");
      nameEl.textContent = displayName;
      const countEl = document.createElement("span");
      countEl.style.fontSize = "10px";
      countEl.style.color = "#9ca3af";
      countEl.textContent = `${agencyCount} ${agencyCount === 1 ? "agency" : "agencies"}`;
      wrapper.appendChild(nameEl);
      wrapper.appendChild(countEl);
      return wrapper;
    };

    if (isGlobalRowLoading) {
      return buildContent();
    }

    const ns = `row-${dataCtx.level}-${dataCtx.index}`;
    const meta = dataCtx.viewModel.metaState.get(ns);
    const isLoading = meta?.["loading"] === true;

    if (isLoading) {
      return {
        left: svgSpinner(11),
        content: buildContent(),
      };
    }

    if (isLeaf || data == null) {
      return projectionDisabledRef.current ? buildContent() : String(data ?? "");
    }

    const facetDef = dataCtx.viewModel.facetDefs.row[dataCtx.level];
    const levelMeta = facetDef?.meta;

    let direction: "right" | "down" = "right";
    if (projectionDisabledRef.current) {
      direction = "down";
    } else if (levelMeta) {
      const ps = levelMeta.projectionState;
      if (ps === ProjectionState.PROJECTED) {
        direction = "down";
      } else if (ps === ProjectionState.SOME_PROJECTED) {
        direction = levelMeta.projectedValues.has(String(data)) ? "down" : "right";
      }
    }

    const icon = svgChevron(direction);

    icon.addEventListener("click", async (e) => {
      e.stopPropagation();
      const viewModel = viewModelRef.current!;
      const model = modelRef.current!;

      dataCtx.viewModel.metaState.set(ns, "loading", true);
      rCtx.render(viewModel);

      if (projectionDisabledRef.current) {
        projectionDisabledRef.current = false;
        projectionTreeRef.current = {};
        const levelValues = dataCtx.viewModel.rowFacets[dataCtx.level];
        for (const v of levelValues) {
          if (v != null) projectionTreeRef.current[v] = {};
        }
      }
      projectionTreeRef.current = toggleProjection(projectionTreeRef.current, dataCtx.path, dataCtx.level);

      const config = buildConfig();
      const result = await model.getViewModelData(config);

      formatDecimals(result.data, result.data.map((_, i) => i));

      viewModel.updateData({ data: result.data, columnFacets: result.columnFacets, rowFacets: result.rowFacets, options: mergeRenderers(result.options, viewModel, buildVTrackDefs(result.columnFacets)), metadata: result.metadata });

      dataCtx.viewModel.metaState.clear(ns);
      rCtx.render(viewModel);
    });

    return {
      left: icon,
      content: buildContent(),
    };
  };
}

// #endregion facet-renderer

// #region state-helpers

function getSortConfigForField(viewModel: PivotDataViewModel, field: string): SortEntryConfig | undefined {
  const sortState = viewModel.metaState.get(SORT_NS);
  return sortState?.[field] as SortEntryConfig | undefined;
}

function getMultiSortEntries(viewModel: PivotDataViewModel): SortEntryConfig[] {
  const sortState = viewModel.metaState.get(SORT_NS);
  return (sortState?.["multiSortEntries"] as SortEntryConfig[] | undefined) ?? [];
}

function saveSortState(viewModel: PivotDataViewModel, entries: SortEntryConfig[]): void {
  viewModel.metaState.set(SORT_NS, "multiSortEntries", entries);
  for (const field of ROW_FIELDS) {
    viewModel.metaState.clear(SORT_NS, field);
  }
  for (const entry of entries) {
    viewModel.metaState.set(SORT_NS, entry.field, entry);
  }
}

function getFilterForField(viewModel: PivotDataViewModel, field: string): ScalarFilter[] {
  const filterState = viewModel.metaState.get(FILTER_NS);
  return (filterState?.[field] as ScalarFilter[] | undefined) ?? [];
}

function saveFilterState(viewModel: PivotDataViewModel, field: string, filters: ScalarFilter[]): void {
  viewModel.metaState.set(FILTER_NS, field, filters);
}

function clearFilterState(viewModel: PivotDataViewModel, field: string): void {
  viewModel.metaState.clear(FILTER_NS, field);
}

function getAllFiltersFromMetaState(viewModel: PivotDataViewModel): Filter[] {
  const allFilters: Filter[] = [];
  for (const field of FILTER_FIELDS) {
    const filters = getFilterForField(viewModel, field);
    allFilters.push(...filters);
  }
  return allFilters;
}

type RowExpansionState = "collapsed" | "expanded" | "partial";

function getRowExpansionState(projectionDisabled: boolean, tree: ProjectionTree): RowExpansionState {
  if (projectionDisabled) return "expanded";
  if (Object.keys(tree).length > 0) return "partial";
  return "collapsed";
}

// #endregion state-helpers

// #region metadata-plumber

const agencyCountPlumber: PivotMetadataPlumber = () => ({
  resolver: {
    resolve({ gridCte, tableAlias }) {
      return [{
        alias: "__meta__agency_count",
        sql: `SUM(CASE WHEN COUNT(${tableAlias}."Agency Name") > 0 THEN 1 ELSE 0 END) OVER (PARTITION BY ${gridCte}."Work Location Borough")`,
      }];
    },
  } as SqlPivotMetadataResolver,
  reshaper: {
    reshape({ raw, rowIndex, rowDimCount, data, colFacets }, metadata) {
      const agencyCount = raw.metadata?.["__meta__agency_count"];
      if (agencyCount) {
        const numRows = raw.data[0]?.length ?? 0;
        const seen = new Set<number>();

        metadata.rowFacets = [];
        for (let r = 0; r < numRows; r++) {
          const rowKey = [];
          for (let d = 0; d < rowDimCount; d++) rowKey.push(raw.data[d][r] ?? null);
          const rowIdx = rowIndex.get(rowKey.join("\0"));
          if (rowIdx === undefined || seen.has(rowIdx)) continue;
          seen.add(rowIdx);

          metadata.rowFacets.push({
            level: 0,
            index: rowIdx,
            meta: { agencyCount: agencyCount[r] },
          });
        }
      }

      const measureLevel = colFacets[colFacets.length - 1];
      if (measureLevel && data.length > 0) {
        metadata.valueColumns = [];
        for (let colIdx = 0; colIdx < data.length; colIdx++) {
          if (measureLevel[colIdx] !== "Base Salary") continue;
          const col = data[colIdx];
          let sum = 0;
          let count = 0;
          for (const val of col) {
            if (val != null && typeof val === "number") {
              sum += val;
              count++;
            }
          }
          if (count > 0) {
            metadata.valueColumns.push({
              colIndex: colIdx,
              meta: { avg: Math.round((sum / count) * 100) / 100 },
            });
          }
        }
      }
    },
  } as PivotMetadataReshaper,
});

// #endregion metadata-plumber

// #region component

type PivotBuildConfig = { rows: AxisExpr | AxisConfig; columns: AxisExpr | AxisConfig; sort?: SortEntry[]; filter?: Filter[] };

export function PivotGrid() {
  const containerRef = useRef<HTMLDivElement>(null);
  const data = useDataSource();
  const rowProjectionRef = useRef<ProjectionTree>({});
  const projectionDisabledRef = useRef(true);
  const agencyCollapsedRef = useRef(false);
  const modelRef = useRef<SqlPivotTableDataModel | null>(null);
  const viewModelRef = useRef<PivotDataViewModel | null>(null);
  const gridRef = useRef<Grid | null>(null);
  const sortEntriesRef = useRef<SortEntry[]>([
    { field: "Work Location Borough", direction: "asc" },
    { field: "Leave Status as of June 30", direction: "asc" },
  ]);
  const [sortDropdownState, setSortDropdownState] = useState<{ field: string; anchorEl: HTMLElement } | null>(null);
  const setSortDropdownStateRef = useRef(setSortDropdownState);
  setSortDropdownStateRef.current = setSortDropdownState;

  const [filterDropdownState, setFilterDropdownState] = useState<{ field: string; anchorEl: HTMLElement } | null>(null);
  const setFilterDropdownStateRef = useRef(setFilterDropdownState);
  setFilterDropdownStateRef.current = setFilterDropdownState;
  const [filterDistinctValues, setFilterDistinctValues] = useState<string[] | null>(null);

  const buildConfigRef = useRef<() => PivotBuildConfig>(() => ({
    rows: hierarchy("Work Location Borough", "Leave Status as of June 30"),
    columns: cross("Agency Name", concat("Base Salary", "Regular Hours")),
  }));

  const openFilterDropdown = useCallback((field: string, anchorEl: HTMLElement) => {
    setSortDropdownStateRef.current(null);
    setFilterDistinctValues(null);
    setFilterDropdownStateRef.current({ field, anchorEl });
    const model = modelRef.current;
    if (model) {
      model.resolveFacetValues({ type: "facet", fields: [field], mode: "distinct" }).then(result => {
        setFilterDistinctValues(result[0]);
      });
    }
  }, []);
  const openFilterDropdownRef = useRef(openFilterDropdown);
  openFilterDropdownRef.current = openFilterDropdown;

  const refetchAndDraw = useCallback(async () => {
    const model = modelRef.current;
    const viewModel = viewModelRef.current;
    const grid = gridRef.current;
    if (!model || !viewModel || !grid) return;

    const config = buildConfigRef.current();
    const result = await model.getViewModelData(config);
    formatDecimals(result.data, result.data.map((_, i) => i));

    let columnFacets = result.columnFacets;
    let options = result.options;

    if (agencyCollapsedRef.current) {
      const numCols = columnFacets[0]?.length ?? 0;
      const syntheticLevel = new Array(numCols).fill("Across all agencies");
      columnFacets = [syntheticLevel, ...columnFacets];

      if (options?.facetDefs) {
        options = {
          ...options,
          facetDefs: {
            ...options.facetDefs,
            col: [{}, ...options.facetDefs.col],
          },
        };
      }
    }

    viewModel.updateData({ data: result.data, columnFacets, rowFacets: result.rowFacets, options: mergeRenderers(options, viewModel, buildVTrackDefs(columnFacets, agencyCollapsedRef.current)), metadata: result.metadata });
    grid.data = viewModel;
    grid.draw();
  }, []);

  const handleGlobalRowToggle = useCallback(async () => {
    const viewModel = viewModelRef.current;
    const grid = gridRef.current;
    if (!viewModel || !grid) return;

    const currentState = getRowExpansionState(projectionDisabledRef.current, rowProjectionRef.current);

    if (currentState === "collapsed") {
      projectionDisabledRef.current = true;
    } else {
      projectionDisabledRef.current = false;
      rowProjectionRef.current = {};
    }

    viewModel.metaState.set(GLOBAL_ROW_NS, "loading", true);
    grid.draw();

    await refetchAndDraw();

    viewModel.metaState.clear(GLOBAL_ROW_NS);
    grid.draw();
  }, [refetchAndDraw]);
  const handleGlobalRowToggleRef = useRef(handleGlobalRowToggle);
  handleGlobalRowToggleRef.current = handleGlobalRowToggle;

  const handleGlobalColToggle = useCallback(async () => {
    const viewModel = viewModelRef.current;
    const grid = gridRef.current;
    if (!viewModel || !grid) return;

    agencyCollapsedRef.current = !agencyCollapsedRef.current;
    viewModel.metaState.set(GLOBAL_COL_NS, "agencyCollapsed", agencyCollapsedRef.current);

    viewModel.metaState.set(GLOBAL_COL_NS, "loading", true);
    grid.draw();

    await refetchAndDraw();

    viewModel.metaState.clear(GLOBAL_COL_NS, "loading");
    grid.draw();
  }, [refetchAndDraw]);
  const handleGlobalColToggleRef = useRef(handleGlobalColToggle);
  handleGlobalColToggleRef.current = handleGlobalColToggle;

  const makeHeaderRenderer = useCallback((axis: "row" | "col", level: number, field: string, filterable: boolean): FacetHeaderRenderer => {
    return (text: string, ctx: FacetHeaderContext) => {
      const headerNs = SORT_HEADER_NS(level);
      const filterHeaderNs = FILTER_HEADER_NS(field);
      const globalRowMeta = ctx.viewModel.metaState.get(GLOBAL_ROW_NS);
      const globalColMeta = ctx.viewModel.metaState.get(GLOBAL_COL_NS);
      const headerMeta = ctx.viewModel.metaState.get(headerNs);
      const filterHeaderMeta = ctx.viewModel.metaState.get(filterHeaderNs);
      const isSortLoading = headerMeta?.["loading"] === true;
      const isFilterLoading = filterHeaderMeta?.["loading"] === true;
      const isGlobalRowLoading = globalRowMeta?.["loading"] === true;
      const isGlobalColLoading = globalColMeta?.["loading"] === true;

      const isRowAxis = axis === "row";
      const leftElements: HTMLElement[] = [];

      if (isRowAxis && field === ROW_FIELDS[0]) {
        if (isSortLoading) {
          leftElements.push(svgSpinner(11));
        } else {
          const sortConfig = getSortConfigForField(ctx.viewModel as PivotDataViewModel, field);
          const sortIcon = svgSortIcon(11);
          if (sortConfig) {
            sortIcon.style.background = "rgba(92, 95, 119, 0.15)";
            sortIcon.style.borderRadius = "3px";
            sortIcon.style.padding = "1px";
          }
          sortIcon.addEventListener("click", (e) => {
            e.stopPropagation();
            setFilterDropdownStateRef.current(null);
            setSortDropdownStateRef.current({ field, anchorEl: sortIcon });
          });
          leftElements.push(sortIcon);
        }

        if (isGlobalRowLoading) {
          leftElements.push(svgSpinner(11));
        } else {
          const rowState = getRowExpansionState(projectionDisabledRef.current, rowProjectionRef.current);
          let globalChevron: HTMLElement;
          if (rowState === "collapsed") {
            globalChevron = svgChevron("right");
          } else if (rowState === "expanded") {
            globalChevron = svgChevron("down");
          } else {
            globalChevron = svgDash();
          }
          globalChevron.addEventListener("click", (e) => {
            e.stopPropagation();
            handleGlobalRowToggleRef.current();
          });
          leftElements.push(globalChevron);
        }
      } else if (isRowAxis && field === ROW_FIELDS[1]) {
        if (isSortLoading) {
          leftElements.push(svgSpinner(11));
        } else {
          const sortConfig = getSortConfigForField(ctx.viewModel as PivotDataViewModel, field);
          const sortIcon = svgSortIcon(11);
          if (sortConfig) {
            sortIcon.style.background = "rgba(92, 95, 119, 0.15)";
            sortIcon.style.borderRadius = "3px";
            sortIcon.style.padding = "1px";
          }
          sortIcon.addEventListener("click", (e) => {
            e.stopPropagation();
            setFilterDropdownStateRef.current(null);
            setSortDropdownStateRef.current({ field, anchorEl: sortIcon });
          });
          leftElements.push(sortIcon);
        }
      } else if (!isRowAxis && field === COL_HEADER_FIELDS[0]) {
        if (isGlobalColLoading) {
          leftElements.push(svgSpinner(11));
        } else {
          const isCollapsed = agencyCollapsedRef.current;
          const globalChevron = svgChevron(isCollapsed ? "right" : "down");
          globalChevron.addEventListener("click", (e) => {
            e.stopPropagation();
            handleGlobalColToggleRef.current();
          });
          leftElements.push(globalChevron);
        }
      }

      let rightEl: HTMLElement | undefined;
      const hideFilter = !isRowAxis && field === COL_HEADER_FIELDS[0] && agencyCollapsedRef.current;
      if (filterable && !hideFilter) {
        if (isFilterLoading) {
          rightEl = svgSpinner(11);
        } else {
          const currentFilters = getFilterForField(ctx.viewModel as PivotDataViewModel, field);
          const filterIcon = svgFilterIcon(11);
          if (currentFilters.length > 0) {
            filterIcon.style.background = "rgba(92, 95, 119, 0.15)";
            filterIcon.style.borderRadius = "3px";
            filterIcon.style.padding = "1px";
          }
          filterIcon.addEventListener("click", (e) => {
            e.stopPropagation();
            setSortDropdownStateRef.current(null);
            openFilterDropdownRef.current(field, filterIcon);
          });
          rightEl = filterIcon;
        }
      }

      return {
        left: leftElements.length === 1 ? leftElements[0] : leftElements.length > 1 ? (() => {
          const wrapper = document.createElement("span");
          wrapper.style.display = "inline-flex";
          wrapper.style.alignItems = "center";
          wrapper.style.gap = "4px";
          leftElements.forEach(el => wrapper.appendChild(el));
          return wrapper;
        })() : undefined,
        content: text,
        right: rightEl,
      };
    };
  }, []);

  const handleMultiSortChange = useCallback((entries: SortEntryConfig[]) => {
    const viewModel = viewModelRef.current;
    if (viewModel) {
      viewModel.metaState.set(SORT_NS, "multiSortEntries", entries);
    }
  }, []);

  const handleSortApply = useCallback(async (entries: SortEntryConfig[]) => {
    const model = modelRef.current;
    const viewModel = viewModelRef.current;
    const grid = gridRef.current;
    if (!model || !viewModel || !grid) return;

    saveSortState(viewModel, entries);

    sortEntriesRef.current = entries.map(e => ({
      field: e.field,
      direction: e.direction,
      by: e.by,
    }));

    for (let i = 0; i < ROW_FIELDS.length; i++) {
      viewModel.metaState.set(SORT_HEADER_NS(i), "loading", true);
    }
    setSortDropdownState(null);
    grid.draw();

    await refetchAndDraw();

    for (let i = 0; i < ROW_FIELDS.length; i++) {
      viewModel.metaState.clear(SORT_HEADER_NS(i));
    }
    grid.draw();
  }, [refetchAndDraw]);

  const handleFilterApply = useCallback(async (field: string, filters: ScalarFilter[]) => {
    const model = modelRef.current;
    const viewModel = viewModelRef.current;
    const grid = gridRef.current;
    if (!model || !viewModel || !grid) return;

    saveFilterState(viewModel, field, filters);

    viewModel.metaState.set(FILTER_HEADER_NS(field), "loading", true);
    setFilterDropdownState(null);
    grid.draw();

    await refetchAndDraw();

    viewModel.metaState.clear(FILTER_HEADER_NS(field));
    grid.draw();
  }, [refetchAndDraw]);

  const handleFilterClear = useCallback(async (field: string) => {
    const model = modelRef.current;
    const viewModel = viewModelRef.current;
    const grid = gridRef.current;
    if (!model || !viewModel || !grid) return;

    clearFilterState(viewModel, field);

    viewModel.metaState.set(FILTER_HEADER_NS(field), "loading", true);
    setFilterDropdownState(null);
    grid.draw();

    await refetchAndDraw();

    viewModel.metaState.clear(FILTER_HEADER_NS(field));
    grid.draw();
  }, [refetchAndDraw]);

  useEffect(() => {
    if (data.status !== "ready" || !containerRef.current) return;

    const { ds, columns } = data;
    const schema = columns.map((c) => ({
      name: c.normColName,
      displayName: c.originalColName,
      type: c.type,
      subtype: c.subtype,
      aggregateFn: c.aggregateFn,
    }));

    const model = new SqlPivotTableDataModel(schema, ds, agencyCountPlumber);
    modelRef.current = model;

    const buildConfig = (): PivotBuildConfig => {
      const vm = viewModelRef.current;
      const allFilters = vm ? getAllFiltersFromMetaState(vm) : [];
      const rowsExpr = hierarchy("Work Location Borough", "Leave Status as of June 30");
      const rows: AxisExpr | AxisConfig = projectionDisabledRef.current
        ? rowsExpr
        : { expr: rowsExpr, projection: treeToPaths(rowProjectionRef.current) };
      const colExpr = agencyCollapsedRef.current
        ? concat("Base Salary", "Regular Hours")
        : cross("Agency Name", concat("Base Salary", "Regular Hours"));
      return {
        rows,
        columns: colExpr,
        sort: sortEntriesRef.current.length > 0 ? sortEntriesRef.current : undefined,
        filter: allFilters.length > 0 ? allFilters : undefined,
      };
    };
    buildConfigRef.current = buildConfig;

    const facetRenderer = makeFacetRenderer(rowProjectionRef, projectionDisabledRef, modelRef, viewModelRef, buildConfig);
    const rowHeaderRenderer0 = makeHeaderRenderer("row", 0, ROW_FIELDS[0], true);
    const rowHeaderRenderer1 = makeHeaderRenderer("row", 1, ROW_FIELDS[1], false);
    const colHeaderRenderer0 = makeHeaderRenderer("col", 0, COL_HEADER_FIELDS[0], true);

    let cancelled = false;
    (async () => {
      const config = buildConfig();
      const result = await model.getViewModelData(config);

      if (cancelled) return;

      formatDecimals(result.data, result.data.map((_, i) => i));

      const options = result.options!;
      const facetDefs = options.facetDefs!;
      facetDefs.row[0] = { ...facetDefs.row[0], text: "Location", trackRenderer: facetRenderer, headerRenderer: rowHeaderRenderer0 };
      facetDefs.row[1] = { ...facetDefs.row[1], text: ROW_HEADER_LABELS[1], headerRenderer: rowHeaderRenderer1 };
      facetDefs.col[0] = { ...facetDefs.col[0], text: "Agency Name", headerRenderer: colHeaderRenderer0 };
      options.vTrackDefs = buildVTrackDefs(result.columnFacets);

      const viewModel = new PivotDataViewModel({
        data: result.data,
        columnFacets: result.columnFacets,
        rowFacets: result.rowFacets,
        options,
        metadata: result.metadata,
      });
      viewModelRef.current = viewModel;

      saveSortState(viewModel, sortEntriesRef.current.map(e => ({
        field: e.field,
        direction: e.direction as SortDirection,
        by: e.by,
      })));



      const grid = new Grid({ fixtures: { top: [], left: [], bottom: [AggregateFooterFixture], right: [] } }, containerRef.current!);
      gridRef.current = grid;
      grid.data = viewModel;
      grid.draw();
    })();

    return () => { cancelled = true; };
  }, [data, makeHeaderRenderer]);

  const sortAnchorRect = sortDropdownState?.anchorEl.getBoundingClientRect();
  const filterAnchorRect = filterDropdownState?.anchorEl.getBoundingClientRect();

  let initialMode: SortMode = "alphabetical";
  let initialDirection: SortDirection = "asc";
  let initialMeasure = MEASURE_NAMES[0];
  let currentMultiSortEntries: SortEntryConfig[] = [];
  if (sortDropdownState && viewModelRef.current) {
    const config = getSortConfigForField(viewModelRef.current, sortDropdownState.field);
    if (config) {
      initialDirection = config.direction;
      if (config.by) {
        initialMode = "measure";
        initialMeasure = config.by;
      }
    }
    currentMultiSortEntries = getMultiSortEntries(viewModelRef.current);
  }

  let currentFilterFilters: ScalarFilter[] = [];
  if (filterDropdownState && viewModelRef.current) {
    currentFilterFilters = getFilterForField(viewModelRef.current, filterDropdownState.field);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex items-center justify-center min-h-0">
        {data.status === "loading" && <span style={{ fontSize: 13, color: "#6b7280" }}>Loading data...</span>}
        {data.status === "error" && <span style={{ fontSize: 13, color: "#dc2626" }}>{data.error}</span>}
        <div ref={containerRef} style={{ width: 800, height: 480, position: "relative", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.08)", boxSizing: "border-box", contain: "layout style", display: data.status === "ready" ? "block" : "none" }} />
      </div>

      {sortDropdownState && sortAnchorRect && (
        <>
          <div
            style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }}
            onClick={() => setSortDropdownState(null)}
          />
          <div style={{
            position: "fixed",
            top: sortAnchorRect.bottom + 4,
            left: sortAnchorRect.left,
            zIndex: 1000,
          }}>
            <SortDropdown
              field={sortDropdownState.field}
              measures={MEASURE_NAMES}
              initialMode={initialMode}
              initialDirection={initialDirection}
              initialMeasure={initialMeasure}
              multiSortEntries={currentMultiSortEntries}
              onApply={handleSortApply}
              onMultiSortChange={handleMultiSortChange}
              onClose={() => setSortDropdownState(null)}
            />
          </div>
        </>
      )}

      {filterDropdownState && filterAnchorRect && (
        <>
          <div
            style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }}
            onClick={() => setFilterDropdownState(null)}
          />
          <div style={{
            position: "fixed",
            top: filterAnchorRect.bottom + 4,
            left: filterAnchorRect.left,
            zIndex: 1000,
          }}>
            <SetFilterDropdown
              field={filterDropdownState.field}
              distinctValues={filterDistinctValues}
              currentFilters={currentFilterFilters}
              onApply={handleFilterApply}
              onClear={handleFilterClear}
              onClose={() => setFilterDropdownState(null)}
            />
          </div>
        </>
      )}
    </div>
  );
}

// #endregion component
