import React, { useEffect, useRef, useState } from "react";
import "grid/dist/grid.css";
import Grid, { GridDataViewModel, LayoutEvents, SelectionPayload, ColDef, ColAutoSizeConfig, createChartRenderer, CellRenderer, FacetCellRenderer } from "grid/dist/renderer";
import feather from "feather-icons";

interface TwoKeyData {
  primary: string;
  secondary: string;
}

const twoKeyRenderer: CellRenderer<TwoKeyData> = (data) => {
  if (!data) return "";
  return `<div style="display:flex;flex-direction:column;align-items:flex-start;line-height:1.2">
    <div style="font-weight:bold">${data.primary}</div>
    <div>${data.secondary}</div>
  </div>`;
};

interface ThreeKeyData {
  first: string;
  second: string;
  third: string;
}

const threeKeyRenderer: CellRenderer<ThreeKeyData> = (data) => {
  if (!data) return "";
  return `<div style="display:flex;flex-direction:column;align-items:flex-start;line-height:1.2;font-weight:bold">
    <div>${data.first}</div>
    <div>${data.second}</div>
    <div>${data.third}</div>
  </div>`;
};

const svgIcon = (name: string, size = 12): HTMLElement => {
  const wrapper = document.createElement("span");
  wrapper.style.display = "inline-flex";
  wrapper.style.alignItems = "center";
  wrapper.style.opacity = "0.9";
  wrapper.innerHTML = feather.icons[name as keyof typeof feather.icons].toSvg({ width: size, height: size, "stroke-width": 2.5 });
  return wrapper;
};

const rowFacetRenderer: FacetCellRenderer = (data, ctx) => {
  const isLeaf = ctx.level === ctx.path.length - 1;
  if (isLeaf) return String(data ?? "");
  return {
    left: svgIcon("chevron-right", 11),
    content: String(data ?? ""),
  };
};

const colFacetRenderer: FacetCellRenderer = (data, ctx) => {
  const isLeaf = ctx.level === ctx.path.length - 1;
  if (!isLeaf) {
    return {
      left: svgIcon("chevron-right", 11),
      content: String(data ?? ""),
    };
  }
  return {
    left: svgIcon("arrow-down", 10),
    content: String(data ?? ""),
    right: svgIcon("filter", 10),
  };
};

// Declare the custom element for TypeScript
declare global {
  namespace JSX {
    interface IntrinsicElements {
      "dataflow-grid": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}

// Sample data: 10 rows of string arrays
// const sampleData: GridData = {
//   columns: ["Name", "Email", "Title", "City"],
//   data: [
//     ["John Doe", "Jane Smith", "Bob Johnson", "Alice Williams", "Charlie Brown", "Diana Prince", "Eve Davis", "Frank Miller", "Grace Lee", "Henry Wilson", "John Doe", "Jane Smith", "Bob Johnson", "Alice Williams", "Charlie Brown", "Diana Prince", "Eve Davis", "Frank Miller", "Grace Lee", "Henry Wilson"],
//     ["john.doe@example.com", "jane.smith@exampleexampleexample.commmmmmmmmm", "bob.johnson@example.com", "alice.williams@example.com", "charlie.brown@example.com", "diana.prince@example.com", "eve.davis@example.com", "frank.miller@example.com", "grace.lee@example.com", "henry.wilson@example.com", "john.doe@example.com", "jane.smith@exampleexampleexample.commmmmmmmmm", "bob.johnson@example.com", "alice.williams@example.com", "charlie.brown@example.com", "diana.prince@example.com", "eve.davis@example.com", "frank.miller@example.com", "grace.lee@example.com", "henry.wilson@example.com"],
//     ["Software Engineer", "Product Manager", "Designer", "Data Scientist", "DevOps Engineer", "Marketing Manager", "Sales Director", "HR Manager", "QA Engineer", "Tech Lead", "Software Engineer", "Product Manager", "Designer", "Data Scientist", "DevOps Engineer", "Marketing Manager", "Sales Director", "HR Manager", "QA Engineer", "Tech Lead"],
//     ["New York", "San Francisco", "Los Angeles", "Boston", "Seattle", "Chicago", "Miami", "Austin", "Portland", "Denver", "New York", "San Francisco", "Los Angeles", "Boston", "Seattle", "Chicago", "Miami", "Austin", "Portland", "Denver"] ,
//   ]
// };

const NullFacetDemo: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;

    // 3 row facet levels, 8 rows — matches the computeMerges comment example
    // const rowFacetLevel0: (string | null)[] = ["l0_0", "l0_0", "l0_0", "l0_0", "l0_0", "l0_0", "l0_1", "l0_2", "l0_3", "l0_1", "l0_3", "l0_5" ];
    // const rowFacetLevel1: (string | null)[] = [null,   "l1_0", "l1_0", "l1_0", "l1_1", "l1_1", null,   null, null,   'he', null, null];
    // const rowFacetLevel2: (string | null)[] = [null,   "a",    "b",    "b",    null,   "c",    null,   null, null,   null, null, 'de'];

    let testsliceidx = 0;
    const rowFacetLevel0: (string | null)[] = ["l0_0", "l0_0", "l0_0", "l0_0", "l0_0", "l0_0", "l0_1", "l0_2", "l0_3", "l0_1", "l0_3", "l0_5" ].slice(testsliceidx);
    const rowFacetLevel1: (string | null)[] = [null,   "l1_0", "l1_0", "l1_0", "l1_1", "l1_1", null,   null, null,   'he', null, null].slice(testsliceidx);
    const rowFacetLevel2: (string | null)[] = [null,   "aa",    "bb",    "bb",    null,   "cc",    null,   null, null,   null, null, 'de'].slice(testsliceidx);

    // 3 col facet levels, 8 cols — same structure for columns
    const colFacetLevel0: (string | null)[] = ["c0_0", "c0_0", "c0_0", "c0_0", "c0_0", "c0_0", "c0_1", "c0_2"];
    const colFacetLevel1: (string | null)[] = [null,   "c1_0", "c1_0", "c1_0", "c1_1", "c1_1", null,   null];
    const colFacetLevel2: (string | null)[] = [null,   "xx",    "yy",    "yy",    null,   "zz",    null,   null];

    // 8 cols × 8 rows of simple numeric data
    const data: number[][] = [];
    for (let col = 0; col < colFacetLevel0.length; col++) {
      const colData: number[] = [];
      for (let row = 0; row < rowFacetLevel0.length; row++) {
        colData.push(col * 8 + row + 1);
      }
      data.push(colData);
    }

    const grid = new Grid({}, ref.current);
    grid.data = new GridDataViewModel(
      data,
      [colFacetLevel0, colFacetLevel1, colFacetLevel2],
      [rowFacetLevel0, rowFacetLevel1, rowFacetLevel2],
      { facetRenderer: { row: rowFacetRenderer, column: colFacetRenderer } }
    );
    grid.draw();
  }, []);

  return (
    <div style={{
      position: "relative",
      background: "white",
      height: "200px",
      width: "400px",
      border: "1px solid #eaeaea",
      contain: "layout style",
      marginBottom: "40px",
    }} ref={ref} />
  );
};

const GridPlayground: React.FC = () => {
  const gridConRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<Grid | null>(null);

  const defaultRowFacetConfig = "5;10";
  const defaultColFacetConfig = "2;3;3";
  const defaultCellSizeConfig = "";
  const defaultColSizeConfigExample = `0,2:[strategy=max;excludeColumnFacets=1]
5-8:[strategy=fixed;widthInPx=90]`;

  const [rowFacetConfig, setRowFacetConfig] = useState(() =>
    localStorage.getItem("grid_rowFacetConfig") ?? defaultRowFacetConfig
  );
  const [colFacetConfig, setColFacetConfig] = useState(() =>
    localStorage.getItem("grid_colFacetConfig") ?? defaultColFacetConfig
  );
  const [cellSizeConfig, setCellSizeConfig] = useState(() =>
    localStorage.getItem("grid_cellSizeConfig") ?? defaultCellSizeConfig
  );
  const [colSizeConfig, setColSizeConfig] = useState(() =>
    localStorage.getItem("grid_colSizeConfig") ?? defaultColSizeConfigExample
  );
  const [appliedColSizeConfig, setAppliedColSizeConfig] = useState(() =>
    localStorage.getItem("grid_colSizeConfig") ?? ""
  );
  const [totalDataPoints, setTotalDataPoints] = useState(0);
  const [events, setEvents] = useState<Array<{ name: string; payload: unknown }>>([]);
  const [perfMetrics, setPerfMetrics] = useState<LayoutEvents['debug_perf:metrics'] | null>(null);

  // Selection state
  const [cellSelection, setCellSelection] = useState("");
  const [rangeSelection, setRangeSelection] = useState("");
  const [colSelection, setColSelection] = useState("");
  const [rowSelection, setRowSelection] = useState("");
  const [activeSelections, setActiveSelections] = useState<Map<string, { label: string; unsub: () => void }>>(new Map());

  const handleRowFacetChange = (value: string) => {
    setRowFacetConfig(value);
    localStorage.setItem("grid_rowFacetConfig", value);
  };

  const handleColFacetChange = (value: string) => {
    setColFacetConfig(value);
    localStorage.setItem("grid_colFacetConfig", value);
  };

  const handleCellSizeChange = (value: string) => {
    setCellSizeConfig(value);
    localStorage.setItem("grid_cellSizeConfig", value);
  };

  const handleReset = () => {
    setRowFacetConfig(defaultRowFacetConfig);
    setColFacetConfig(defaultColFacetConfig);
    setCellSizeConfig(defaultCellSizeConfig);
    localStorage.setItem("grid_rowFacetConfig", defaultRowFacetConfig);
    localStorage.setItem("grid_colFacetConfig", defaultColFacetConfig);
    localStorage.setItem("grid_cellSizeConfig", defaultCellSizeConfig);
  };

  const unsubFnsRef = useRef<Map<string, () => void>>(new Map());

  const formatSelectionLabel = (p: SelectionPayload): string => {
    if (p.fromRow === p.toRow && p.fromCol === p.toCol) return `Cell(${p.fromRow},${p.fromCol})`;
    if (p.fromCol === 0 && p.toCol === Infinity) return `Row(${p.fromRow})`;
    if (p.fromRow === 0 && p.toRow === Infinity) return `Col(${p.fromCol})`;
    return `Range(${p.fromRow},${p.fromCol},${p.toRow},${p.toCol})`;
  };

  const handleSelectionAdded = (payload: SelectionPayload) => {
    const unsub = unsubFnsRef.current.get(payload.hash);
    if (!unsub) return;
    setActiveSelections(prev => {
      const next = new Map(prev);
      next.set(payload.hash, { label: formatSelectionLabel(payload), unsub });
      return next;
    });
  };

  const handleSelectionRemoved = (payload: SelectionPayload) => {
    unsubFnsRef.current.delete(payload.hash);
    setActiveSelections(prev => {
      const next = new Map(prev);
      next.delete(payload.hash);
      return next;
    });
  };

  const handleSelect = (result: [string, () => void] | null) => {
    if (result) unsubFnsRef.current.set(result[0], result[1]);
  };

  const handleSelectCell = () => {
    if (!gridRef.current || !cellSelection.trim()) return;
    const parts = cellSelection.split(",").map(s => parseInt(s.trim(), 10));
    if (parts.length !== 2 || parts.some(isNaN)) return;
    handleSelect(gridRef.current.selectCellByDataIndex(parts[0], parts[1]));
  };

  const handleSelectRange = () => {
    if (!gridRef.current || !rangeSelection.trim()) return;
    const parts = rangeSelection.split(",").map(s => parseInt(s.trim(), 10));
    if (parts.length !== 4 || parts.some(isNaN)) return;
    handleSelect(gridRef.current.selectRangeByDataIndex(parts[0], parts[1], parts[2], parts[3]));
  };

  const handleSelectColumn = () => {
    if (!gridRef.current || !colSelection.trim()) return;
    const colIndex = parseInt(colSelection.trim(), 10);
    if (isNaN(colIndex)) return;
    handleSelect(gridRef.current.selectColumnByDataIndex(colIndex));
  };

  const handleSelectRow = () => {
    if (!gridRef.current || !rowSelection.trim()) return;
    const rowIndex = parseInt(rowSelection.trim(), 10);
    if (isNaN(rowIndex)) return;
    handleSelect(gridRef.current.selectRowByDataIndex(rowIndex));
  };

  const generateRandomNumber = (minDigits: number, maxDigits: number): string => {
    const digits = Math.floor(Math.random() * (maxDigits - minDigits + 1)) + minDigits;
    const min = Math.pow(10, digits - 1);
    const max = Math.pow(10, digits) - 1;
    return String(Math.floor(Math.random() * (max - min + 1)) + min);
  };

  const generateLongString = (length: number): string => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const parseFacetConfig = (config: string): number[] => {
    if (!config.trim()) return [];
    return config.split(";").map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);
  };

  const parseCellSizeConfig = (config: string): { rowMod: number; rowStrict: boolean; colMod: number; colStrict: boolean; length: number } | null => {
    if (!config.trim()) return null;
    // Format: 50x4:30 or 50!x4!:30 or 50x4!:30 or 50!x4:30
    const match = config.match(/^(\d+)(!?)x(\d+)(!?):(\d+)$/);
    if (!match) return null;
    return {
      rowMod: parseInt(match[1], 10),
      rowStrict: match[2] === "!",
      colMod: parseInt(match[3], 10),
      colStrict: match[4] === "!",
      length: parseInt(match[5], 10),
    };
  };

  const parseColSizeConfig = (config: string): Map<number, ColAutoSizeConfig> => {
    const result = new Map<number, ColAutoSizeConfig>();
    if (!config.trim()) return result;

    const lines = config.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("//")) continue;

      // Format: indices:[key=value;key=value] // optional comment
      const match = trimmed.match(/^([^:]+):\[([^\]]*)\]/);
      if (!match) continue;

      const indicesStr = match[1].trim();
      const settingsStr = match[2].trim();

      // Parse indices: "0,2" or "5-8"
      const colIndices: number[] = [];
      const parts = indicesStr.split(",");
      for (const part of parts) {
        const rangePart = part.trim();
        if (rangePart.includes("-")) {
          const [start, end] = rangePart.split("-").map(s => parseInt(s.trim(), 10));
          if (!isNaN(start) && !isNaN(end)) {
            for (let i = start; i <= end; i++) {
              colIndices.push(i);
            }
          }
        } else {
          const idx = parseInt(rangePart, 10);
          if (!isNaN(idx)) colIndices.push(idx);
        }
      }

      // Parse settings: "strategy=max;excludeColumnFacets=1"
      const settings: Record<string, string> = {};
      const settingParts = settingsStr.split(";");
      for (const sp of settingParts) {
        const [key, value] = sp.split("=").map(s => s.trim());
        if (key && value !== undefined) {
          settings[key] = value;
        }
      }

      // Build ColAutoSizeConfig
      const colSizeConfig: ColAutoSizeConfig = settings.strategy === "fixed"
        ? {
            strategy: "fixed-width",
            excludeColumnFacets: settings.excludeColumnFacets === "1",
            ...(settings.widthInPx && { widthInPx: parseInt(settings.widthInPx, 10) }),
            ...(settings.minWidthInPx && { minWidthInPx: parseInt(settings.minWidthInPx, 10) }),
            ...(settings.maxWidthInPx && { maxWidthInPx: parseInt(settings.maxWidthInPx, 10) }),
          }
        : {
            strategy: "max-cell",
            excludeColumnFacets: settings.excludeColumnFacets === "1",
          };

      for (const idx of colIndices) {
        result.set(idx, colSizeConfig);
      }
    }

    return result;
  };

  const handleApplyColSizeConfig = () => {
    localStorage.setItem("grid_colSizeConfig", colSizeConfig);
    setAppliedColSizeConfig(colSizeConfig);
  };

  const handleResetColSizeConfig = () => {
    localStorage.removeItem("grid_colSizeConfig");
    setColSizeConfig(defaultColSizeConfigExample);
    setAppliedColSizeConfig("");
  };

  const handleGenerate = () => {
    if (!gridConRef.current) {
      console.error("Grid container is not ready");
      return;
    }

    const rowFacets = parseFacetConfig(rowFacetConfig);
    const colFacets = parseFacetConfig(colFacetConfig);
    const cellSize = parseCellSizeConfig(cellSizeConfig);

    // Calculate total rows and columns
    // DEFAULT_ROWS_NO_FACETS: Change this value to adjust default row count for simple tables (no row facets)
    const DEFAULT_ROWS_NO_FACETS = 10000;
    const totalRows = rowFacets.length > 0 ? rowFacets.reduce((a, b) => a * b, 1) : DEFAULT_ROWS_NO_FACETS;
    const totalCols = colFacets.length > 0 ? colFacets.reduce((a, b) => a * b, 1) : 0;

    if (totalCols === 0) {
      setTotalDataPoints(0);
      return;
    }

    setTotalDataPoints(totalRows * totalCols);

    // Generate row facet arrays in row-major format: [[f1_v0, f2_v0], [f1_v0, f2_v1], ...]
    // If no row facets, these remain empty (simple table with no row headers)
    const rowFacetRowMajor: string[][] = [];
    let rowFacetLevelMajor: string[][] | undefined = undefined;

    if (rowFacets.length > 0) {
      const generateRowFacets = (level: number, current: string[]) => {
        if (level === rowFacets.length) {
          rowFacetRowMajor.push([...current]);
          return;
        }
        for (let i = 0; i < rowFacets[level]; i++) {
          current.push(`RF${level}_${i}`);
          generateRowFacets(level + 1, current);
          current.pop();
        }
      };
      generateRowFacets(0, []);

      // Transpose to level-major for GridDataModel: [[all_level0_values], [all_level1_values], ...]
      rowFacetLevelMajor = [];
      for (let level = 0; level < rowFacets.length; level++) {
        rowFacetLevelMajor.push(rowFacetRowMajor.map(row => row[level]));
      }
    }

    // Generate column facet arrays in column-major format: [[f1_v0, f2_v0, f3_v0], [f1_v0, f2_v0, f3_v1], ...]
    const colFacetColMajor: string[][] = [];
    const generateColFacets = (level: number, current: string[]) => {
      if (level === colFacets.length) {
        colFacetColMajor.push([...current]);
        return;
      }
      for (let i = 0; i < colFacets[level]; i++) {
        current.push(`CF${level}_${i}`);
        generateColFacets(level + 1, current);
        current.pop();
      }
    };
    generateColFacets(0, []);

    // Transpose to level-major for GridDataModel
    const colFacetLevelMajor: string[][] = [];
    for (let level = 0; level < colFacets.length; level++) {
      colFacetLevelMajor.push(colFacetColMajor.map(col => col[level]));
    }

    // Determine which columns should have chart data (last facet ends with "_1")
    const chartColumns = new Set<number>();
    colFacetColMajor.forEach((facets, colIndex) => {
      const lastFacet = facets[facets.length - 1];
      if (lastFacet && lastFacet.endsWith("_1")) {
        chartColumns.add(colIndex);
      }
    });

    // Absolute column indices for special renderers
    const twoKeyColIndex = 2;
    const threeKeyColIndex = totalCols - 1;

    // Generate data in column-major format: data[col][row]
    const data: (string | number[] | TwoKeyData | ThreeKeyData)[][] = [];
    for (let col = 0; col < totalCols; col++) {
      const colData: (string | number[] | TwoKeyData | ThreeKeyData)[] = [];
      for (let row = 0; row < totalRows; row++) {
        if (col === twoKeyColIndex) {
          colData.push({
            primary: generateRandomNumber(3, 5),
            secondary: generateRandomNumber(3, 5),
          });
        } else if (col === threeKeyColIndex) {
          colData.push({
            first: generateRandomNumber(3, 4),
            second: generateRandomNumber(3, 4),
            third: generateRandomNumber(3, 4),
          });
        } else if (chartColumns.has(col)) {
          const chartData = Array.from({ length: 8 }, () => Math.floor(Math.random() * 100));
          colData.push(chartData);
        } else {
          let cellValue = generateRandomNumber(4, 7);

          // Check if cell size config applies (1-indexed modulo)
          if (cellSize) {
            const rowMatch = cellSize.rowStrict
              ? (row + 1) === cellSize.rowMod
              : (row + 1) % cellSize.rowMod === 0;
            const colMatch = cellSize.colStrict
              ? (col + 1) === cellSize.colMod
              : (col + 1) % cellSize.colMod === 0;

            if (rowMatch && colMatch) {
              cellValue = generateLongString(cellSize.length);
            }
          }

          colData.push(cellValue);
        }
      }
      data.push(colData);
    }

    // Create or update grid
    if (!gridRef.current) {
      gridRef.current = new Grid({}, gridConRef.current);
      for (const e of ['renderComplete', 'selectionAdded', 'selectionRemoved']) {
        gridRef.current.on(e as any, (payload) => {
          setEvents((prev) => [{ name: e, payload }, ...prev.slice(0, 49)]);
        });
      }
      gridRef.current.on('debug_perf:metrics', (payload) => {
        setPerfMetrics(payload);
      });
      gridRef.current.on('selectionAdded', handleSelectionAdded);
      gridRef.current.on('selectionRemoved', handleSelectionRemoved);
    }

    // Create renderers for chart columns (columns where last facet is CF2_1)
    const lineChart = createChartRenderer({ chartType: "line" });

    // Parse applied col size config
    const colSizeOverrides = parseColSizeConfig(appliedColSizeConfig);

    // Build colDefs array - one entry per column
    const colDefs: ColDef[] = [];
    for (let col = 0; col < totalCols; col++) {
      const colFacetsForCol = colFacetColMajor[col];
      const lastFacet = colFacetsForCol[colFacetsForCol.length - 1];
      const colSize = colSizeOverrides.get(col);

      if (lastFacet && lastFacet.endsWith("_1")) {
        colDefs[col] = { renderer: lineChart, cellHeight: 24, sampleData: [50, 60, 70, 80, 90], colSize };
      } else if (col === twoKeyColIndex) {
        colDefs[col] = { renderer: twoKeyRenderer, cellHeight: 36, colSize };
      } else if (col === threeKeyColIndex) {
        colDefs[col] = { renderer: threeKeyRenderer, cellHeight: 48, sampleData: { first: "1234", second: "5678", third: "9012" }, colSize };
      } else if (colSize) {
        colDefs[col] = { colSize };
      }
    }

    console.log("Generated data:", { totalRows, totalCols, rowFacets: rowFacetLevelMajor, colFacets: colFacetLevelMajor, data });
    gridRef.current.data = new GridDataViewModel(data, colFacetLevelMajor, rowFacetLevelMajor, { colDefs, facetRenderer: { row: rowFacetRenderer, column: colFacetRenderer } });
    gridRef.current.draw();
  };

  // Generate grid on page load with current input values
  useEffect(() => {
    handleGenerate();
  }, []);

  return (
    <>
      <details>
        <summary>Usage</summary>
        <pre>
  {`Usage:
  - Row Facet Config: semicolon-separated counts (e.g., "5;10" = 2 levels, 5×10=50 rows)
  - Column Facet Config: semicolon-separated counts (e.g., "2;3;3" = 3 levels, 2×3×3=18 cols)
  - Cell Size Config: "ROWxCOL:LENGTH" where ! means strict position
      50x4:30    = every 50th row AND every 4th col gets 30-char string
      50!x4!:30  = only row 50 AND col 4 gets 30-char string
      50x4!:30   = every 50th row AND only col 4
      50!x4:30   = only row 50 AND every 4th col
  - Empty row/col config = no data; empty col config only = standard table`}
        </pre>
      </details>
      <hr/>
      <div>
        <label>
          Row Facet Config:
          <input
            type="text"
            value={rowFacetConfig}
            onChange={(e) => handleRowFacetChange(e.target.value)}
          />
        </label>
        <label>
          Column Facet Config:
          <input
            type="text"
            value={colFacetConfig}
            onChange={(e) => handleColFacetChange(e.target.value)}
          />
        </label>
        <label>
          Cell Size Config:
          <input
            type="text"
            value={cellSizeConfig}
            onChange={(e) => handleCellSizeChange(e.target.value)}
            placeholder="e.g., 50x4:30"
          />
        </label>
        <button onClick={handleGenerate}>Generate</button>
        <button onClick={handleReset}>Reset</button>
        <span> Total data points: {totalDataPoints}</span>
      </div>
      <div style={{ marginTop: "8px" }}>
        <label style={{ verticalAlign: "top" }}>
          Col Size Config:
          <textarea
            value={colSizeConfig}
            onChange={(e) => setColSizeConfig(e.target.value)}
            rows={3}
            cols={50}
            style={{ marginLeft: "4px", fontFamily: "monospace", fontSize: "11px" }}
          />
        </label>
        <button onClick={() => { handleApplyColSizeConfig(); handleGenerate(); }}>Apply</button>
        <button onClick={() => { handleResetColSizeConfig(); handleGenerate(); }}>Reset</button>
        {appliedColSizeConfig && <span style={{ marginLeft: "8px", color: "green" }}>✓ Applied</span>}
      </div>
      <hr/>
      <div>
        <label>
          Cell <span style={{fontSize: '10px'}}>(row,col)</span>:
          <input
            type="text"
            value={cellSelection}
            onChange={(e) => setCellSelection(e.target.value)}
            placeholder="0,0"
          />
        </label>
        <button onClick={handleSelectCell}>Select</button>
        {" | "}
        <label>
          Range <span style={{fontSize: '10px'}}>(fromRow,fromCol,toRow,toCol)</span>:
          <input
            type="text"
            value={rangeSelection}
            onChange={(e) => setRangeSelection(e.target.value)}
            placeholder="0,0,2,2"
          />
        </label>
        <button onClick={handleSelectRange}>Select</button>
        {" | "}
        <label>
          Column:
          <input
            type="text"
            value={colSelection}
            onChange={(e) => setColSelection(e.target.value)}
            placeholder="0"
          />
        </label>
        <button onClick={handleSelectColumn}>Select</button>
        {" | "}
        <label>
          Row:
          <input
            type="text"
            value={rowSelection}
            onChange={(e) => setRowSelection(e.target.value)}
            placeholder="0"
          />
        </label>
        <button onClick={handleSelectRow}>Select</button>
      </div>
      {activeSelections.size > 0 && (
        <div>
          Active Selections:{" "}
          {Array.from(activeSelections.entries()).map(([hash, { label, unsub }]) => (
            <button key={hash} onClick={unsub} style={{ marginRight: "4px" }}>
              {label} (Clear)
            </button>
          ))}
        </div>
      )}
      <hr/>
      <div style={{
        position: "relative",
        background: "white",
        height: "calc(100vh - 400px)",
        width: "calc(100vw - 200px)",
        border: "1px solid #eaeaea",
        margin: 0,
        padding: 0,
        boxSizing: "border-box",
        contain: "layout style",
      }} ref={gridConRef}>
      </div>
      <details>
        <summary>Perf</summary>
        <pre id="pref-info" style={{ maxHeight: "150px", overflow: "auto", fontSize: "11px", background: "#f5f5f5", padding: "8px" }}>
          {perfMetrics ? JSON.stringify(perfMetrics, null, 2) : ''}
        </pre>
      </details>
      <details>
        <summary>Events ({events.length})</summary>
        <pre style={{ maxHeight: "150px", overflow: "auto", fontSize: "11px", background: "#f5f5f5", padding: "8px" }}>
{events.map((e, i) => `[${events.length - i}] ${e.name} ${JSON.stringify(e.payload)}`).join('\n')}
        </pre>
      </details>
      <hr/>
      <h3>Null-Facet Secondary Axis Merge Demo</h3>
      <NullFacetDemo />
    </>
  );
};

export default GridPlayground;

