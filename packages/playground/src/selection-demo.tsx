import React, { useEffect, useRef, useState } from "react";
import "grid/dist/grid.css";
import Grid, {
  PivotDataViewModel,
  FlattenedDataViewModel,
  createRowMeta,
  Selection,
  CellSelection,
} from "grid/dist/renderer";

// 2 row facet levels (region, city), 2 col facet levels (department, measure)
// 6 rows: 2 cities per region × 3 regions
// 6 columns: 3 departments × 2 measures
const ROW_FACET_LEVEL0 = ["North", "North", "South", "South", "East", "East"];
const ROW_FACET_LEVEL1 = ["New York", "Chicago", "Atlanta", "Miami", "Boston", "Philadelphia"];
const ROW_FACETS: (string | null)[][] = [ROW_FACET_LEVEL0, ROW_FACET_LEVEL1];

const COL_FACET_LEVEL0 = ["Sales", "Sales", "Engineering", "Engineering", "Marketing", "Marketing"];
const COL_FACET_LEVEL1 = ["Revenue", "Cost", "Revenue", "Cost", "Revenue", "Cost"];
const COL_FACETS: (string | null)[][] = [COL_FACET_LEVEL0, COL_FACET_LEVEL1];

// column-major: data[colIndex][rowIndex], 6 rows each
const DATA: number[][] = [
  [1200, 800, 950, 1100, 870, 760],   // Sales/Revenue
  [600, 400, 475, 550, 435, 380],     // Sales/Cost
  [750, 680, 920, 840, 630, 710],     // Engineering/Revenue
  [375, 340, 460, 420, 315, 355],     // Engineering/Cost
  [870, 630, 960, 780, 1050, 890],    // Marketing/Revenue
  [435, 315, 480, 390, 525, 445],     // Marketing/Cost
];

const FLAT_ROW_FACET = ["North", "New York", "Chicago", "South", "Atlanta", "Miami", "East", "Boston", "Philadelphia"];
const FLAT_ROW_META = new Uint8Array([
  createRowMeta(0, false, true),
  createRowMeta(1, true, false),
  createRowMeta(1, true, false),
  createRowMeta(0, false, true),
  createRowMeta(1, true, false),
  createRowMeta(1, true, false),
  createRowMeta(0, false, true),
  createRowMeta(1, true, false),
  createRowMeta(1, true, false),
]);
// Flat data: 9 rows (3 groups + 6 leaves), same 6 columns
// Group rows get null data, leaf rows get actual values
const FLAT_DATA: (number | null)[][] = [
  [null, 1200, 800, null, 950, 1100, null, 870, 760],
  [null, 600, 400, null, 475, 550, null, 435, 380],
  [null, 750, 680, null, 920, 840, null, 630, 710],
  [null, 375, 340, null, 460, 420, null, 315, 355],
  [null, 870, 630, null, 960, 780, null, 1050, 890],
  [null, 435, 315, null, 480, 390, null, 525, 445],
];

type ActiveSelection = { label: string; ref: Selection | CellSelection };

const btnStyle: React.CSSProperties = {
  padding: "6px 12px",
  cursor: "pointer",
  border: "1px solid #ccc",
  borderRadius: 4,
  background: "#fff",
  fontSize: 13,
};

const activeBtnStyle: React.CSSProperties = {
  ...btnStyle,
  background: "#e8f0fe",
  borderColor: "#4285f4",
};

const SelectionDemo: React.FC = () => {
  const gridConRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<Grid | null>(null);
  const [layoutMode, setLayoutMode] = useState<"pivot" | "flat">("pivot");
  const [activeSelections, setActiveSelections] = useState<ActiveSelection[]>([]);
  const activeSelectionsRef = useRef(activeSelections);
  activeSelectionsRef.current = activeSelections;

  const createGrid = (mode: "pivot" | "flat") => {
    const wrapper = gridConRef.current!;
    const oldEl = wrapper.firstElementChild as HTMLElement | null;
    if (oldEl) wrapper.removeChild(oldEl);

    const el = document.createElement("div");
    el.style.cssText = "position:relative;width:100%;height:100%;overflow:auto;";
    wrapper.appendChild(el);

    const grid = new Grid({}, el, mode === "flat" ? "flat" : "pivot");

    const colFacetDefs = [{ text: "Department", facetField: "department" }, { text: "Measure", facetField: null }];
    if (mode === "flat") {
      grid.data = new FlattenedDataViewModel(
        FLAT_DATA, COL_FACETS, FLAT_ROW_FACET, FLAT_ROW_META,
        {
          facetDefs: {
            row: [{ text: "Region", facetField: "region" }],
            col: colFacetDefs,
            axis: "col",
          },
        },
      );
    } else {
      grid.data = new PivotDataViewModel(
        DATA, COL_FACETS, ROW_FACETS,
        {
          facetDefs: {
            row: [{ text: "Region", facetField: "region" }, { text: "City", facetField: "city" }],
            col: colFacetDefs,
            axis: "col",
          },
        },
      );
    }

    grid.draw();
    gridRef.current = grid;
  };

  useEffect(() => {
    createGrid("pivot");
  }, []);

  const handleToggleLayout = () => {
    for (const s of activeSelectionsRef.current) s.ref.undo();
    setActiveSelections([]);
    const next = layoutMode === "pivot" ? "flat" : "pivot";
    setLayoutMode(next);
    createGrid(next);
  };

  const isActive = (label: string) => activeSelections.some(s => s.label === label);

  const toggle = (label: string, create: () => Selection | CellSelection) => {
    const existing = activeSelectionsRef.current.find(s => s.label === label);
    if (existing) {
      existing.ref.undo();
      setActiveSelections(prev => prev.filter(s => s.label !== label));
    } else {
      const ref = create();
      setActiveSelections(prev => [...prev, { label, ref }]);
    }
  };

  const handleColHeader = () => {
    const grid = gridRef.current!;
    toggle("col-header", () =>
      grid.selectAll((dim, dimVal) => dim === "department" && dimVal === "Engineering")
        .style((el) => {
          el.style.backgroundColor = "#e3f2fd";
        })
    );
  };

  const handleRowHeader = () => {
    const grid = gridRef.current!;
    toggle("row-header", () =>
      grid.selectAll((dim) => dim === "city")
        .prop({
          trackRenderer: (data) => {
            const span = document.createElement("span");
            span.style.transition = "color 0.4s ease";
            span.style.color = "#1565c0";
            span.textContent = `\u263A ${data}`;
            requestAnimationFrame(() => { span.style.color = "#e65100"; });
            return { content: span };
          },
        })
    );
  };

  const handleCellConditional = () => {
    const grid = gridRef.current!;
    const allValues = DATA.flat().filter(v => v > 500);
    const minVal = Math.min(...allValues);
    const maxVal = Math.max(...allValues);

    toggle("cell-conditional", () =>
      grid.selectAll(() => true)
        .selectAllCell((v) => typeof v === "number" && v > 500)
        .prop({
          cellRenderer: (value: number) => {
            const t = (value - minVal) / (maxVal - minVal);
            const r = Math.round(255 * t);
            const g = Math.round(255 * (1 - t));
            const el = document.createElement("span");
            el.textContent = String(value);
            el.style.backgroundColor = `rgba(${r}, ${g}, 80, 0.25)`;
            el.style.display = "block";
            el.style.padding = "0 4px";
            return el;
          },
        })
    );
  };

  return (
    <>
      <h2>Selection API Demo</h2>
      <p style={{ fontSize: 13, color: "#666", margin: "4px 0 12px" }}>
        rows: hierarchy(region, city) &nbsp;|&nbsp; columns: cross(department, measure[revenue, cost])
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <button style={btnStyle} onClick={handleToggleLayout}>
          Layout: {layoutMode === "pivot" ? "Pivot" : "Grouped"}
        </button>

        <span style={{ borderLeft: "1px solid #ddd", margin: "0 4px" }} />

        <button style={isActive("col-header") ? activeBtnStyle : btnStyle} onClick={handleColHeader}>
          Column Header BG
        </button>

        <button style={isActive("row-header") ? activeBtnStyle : btnStyle} onClick={handleRowHeader}>
          Row Header Smiley
        </button>

        <button style={isActive("cell-conditional") ? activeBtnStyle : btnStyle} onClick={handleCellConditional}>
          Cell Conditional Formatting
        </button>
      </div>

      <div
        ref={gridConRef}
        style={{
          position: "relative",
          background: "white",
          height: "calc(100vh - 220px)",
          width: "calc(100vw - 200px)",
          border: "1px solid #eaeaea",
          contain: "layout style",
        }}
      />
    </>
  );
};

export default SelectionDemo;
