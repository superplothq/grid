import React, { useRef, useState } from "react";
import "grid";
import Grid, { GridDataModel } from "grid";

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

const GridPlayground: React.FC = () => {
  const gridConRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<Grid | null>(null);

  const defaultRowFacetConfig = "5;10";
  const defaultColFacetConfig = "2;3;3";
  const defaultCellSizeConfig = "";

  const [rowFacetConfig, setRowFacetConfig] = useState(() =>
    localStorage.getItem("grid_rowFacetConfig") ?? defaultRowFacetConfig
  );
  const [colFacetConfig, setColFacetConfig] = useState(() =>
    localStorage.getItem("grid_colFacetConfig") ?? defaultColFacetConfig
  );
  const [cellSizeConfig, setCellSizeConfig] = useState(() =>
    localStorage.getItem("grid_cellSizeConfig") ?? defaultCellSizeConfig
  );
  const [totalDataPoints, setTotalDataPoints] = useState(0);

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

    // Generate data
    const data: string[][] = [];
    for (let row = 0; row < totalRows; row++) {
      const rowData: string[] = [];
      for (let col = 0; col < totalCols; col++) {
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

        rowData.push(cellValue);
      }
      data.push(rowData);
    }

    // Create or update grid
    if (!gridRef.current) {
      gridRef.current = new Grid({}, gridConRef.current);
    }

    console.log("Generated data:", { totalRows, totalCols, rowFacets: rowFacetRowMajor, colFacets: colFacetColMajor, data });
    gridRef.current.data = new GridDataModel(data, colFacetLevelMajor, rowFacetLevelMajor);
    gridRef.current.draw();
  };

  return (
    <>
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
      <pre id="pref-info"></pre>
      <div style={{position: "relative", background: "#fafafa", height: "calc(100vh - 600px)", width: "calc(100vw - 200px)", border: "1px solid #e0e0e0",
      margin: 0, padding: 0, boxSizing: "border-box"}} ref={gridConRef}>
      </div>
    </>
  );
};

export default GridPlayground;

