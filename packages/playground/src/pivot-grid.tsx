import React, {useEffect, useRef, useState} from "react";
import "grid/dist/grid.css";
import Grid, {GridDataViewModel} from "grid/dist/renderer";
import {BrowserInMemoryDataModel, DuckDBWasmBundles, cross, hierarchy, GridData, MeasureSchema} from "grid/dist/index";

const DUCKDB_BUNDLES: DuckDBWasmBundles = {
  mvp: {
    mainModule: "/duckdb-mvp.wasm",
    mainWorker: "/duckdb-browser-mvp.worker.js",
  },
  eh: {
    mainModule: "/duckdb-eh.wasm",
    mainWorker: "/duckdb-browser-eh.worker.js",
  },
};

const gridData: GridData = {
  columns: [
    "region",
    "country",
    "city",
    "department",
    "product",
    "channel",
    "quarter",
    "segment",
    {name: "revenue", displayName: "Revenue", type: "measure", aggregateFn: "sum"} as MeasureSchema,
    {name: "cost", displayName: "Cost", type: "measure", aggregateFn: "sum"} as MeasureSchema,
    {name: "units_sold", displayName: "Units Sold", type: "measure", aggregateFn: "sum"} as MeasureSchema,
    {name: "returns", displayName: "Returns", type: "measure", aggregateFn: "sum"} as MeasureSchema,
  ],
  data: [
    // region
    ["North", "North", "North", "North", "North", "North", "South", "South", "South", "South", "South", "South", "East", "East", "East", "East", "East", "East", "West", "West", "West", "West", "West", "West"],
    // country
    ["USA", "USA", "USA", "Canada", "Canada", "Canada", "Brazil", "Brazil", "Brazil", "Argentina", "Argentina", "Argentina", "India", "India", "India", "Japan", "Japan", "Japan", "UK", "UK", "UK", "Germany", "Germany", "Germany"],
    // city
    ["New York", "Chicago", "Boston", "Toronto", "Vancouver", "Montreal", "Sao Paulo", "Rio", "Brasilia", "Buenos Aires", "Cordoba", "Rosario", "Mumbai", "Delhi", "Bangalore", "Tokyo", "Osaka", "Kyoto", "London", "Manchester", "Birmingham", "Berlin", "Munich", "Hamburg"],
    // department
    ["Sales", "Engineering", "Marketing", "Sales", "Engineering", "Marketing", "Sales", "Engineering", "Marketing", "Sales", "Engineering", "Marketing", "Sales", "Engineering", "Marketing", "Sales", "Engineering", "Marketing", "Sales", "Engineering", "Marketing", "Sales", "Engineering", "Marketing"],
    // product
    ["Widget", "Gadget", "Widget", "Gadget", "Widget", "Gadget", "Widget", "Gadget", "Widget", "Gadget", "Widget", "Gadget", "Widget", "Gadget", "Widget", "Gadget", "Widget", "Gadget", "Widget", "Gadget", "Widget", "Gadget", "Widget", "Gadget"],
    // channel
    ["Online", "Retail", "Online", "Retail", "Online", "Retail", "Online", "Retail", "Online", "Retail", "Online", "Retail", "Online", "Retail", "Online", "Retail", "Online", "Retail", "Online", "Retail", "Online", "Retail", "Online", "Retail"],
    // quarter
    ["Q1", "Q2", "Q3", "Q4", "Q1", "Q2", "Q3", "Q4", "Q1", "Q2", "Q3", "Q4", "Q1", "Q2", "Q3", "Q4", "Q1", "Q2", "Q3", "Q4", "Q1", "Q2", "Q3", "Q4"],
    // segment
    ["Enterprise", "SMB", "Enterprise", "SMB", "Enterprise", "SMB", "Enterprise", "SMB", "Enterprise", "SMB", "Enterprise", "SMB", "Enterprise", "SMB", "Enterprise", "SMB", "Enterprise", "SMB", "Enterprise", "SMB", "Enterprise", "SMB", "Enterprise", "SMB"],
    // revenue
    [1200, 800, 950, 1100, 750, 680, 1400, 920, 870, 1050, 630, 710, 1300, 880, 960, 1150, 790, 720, 1350, 850, 930, 1080, 760, 700],
    // cost
    [600, 400, 475, 550, 375, 340, 700, 460, 435, 525, 315, 355, 650, 440, 480, 575, 395, 360, 675, 425, 465, 540, 380, 350],
    // units_sold
    [120, 80, 95, 110, 75, 68, 140, 92, 87, 105, 63, 71, 130, 88, 96, 115, 79, 72, 135, 85, 93, 108, 76, 70],
    // returns
    [5, 3, 4, 6, 2, 3, 7, 4, 3, 5, 2, 4, 6, 3, 5, 4, 3, 2, 5, 4, 3, 6, 2, 3],
  ],
};

const PivotGridPlayground: React.FC = () => {
  const gridConRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<Grid | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const model = await BrowserInMemoryDataModel.create(gridData, DUCKDB_BUNDLES);
      const viewModel = await model.getViewModelData({
        rows: hierarchy("region", "country"),
        columns: cross("department", "revenue"),
      });

      if (cancelled) return;

      if (!gridConRef.current) return;

      if (!gridRef.current) {
        gridRef.current = new Grid({}, gridConRef.current);
      }

      gridRef.current.data = viewModel;
      gridRef.current.draw();
      setLoading(false);
    };

    init().catch((err) => {
      if (!cancelled) {
        setError(String(err));
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <h2>Pivot Grid</h2>
      <p>rows: hierarchy(region, country) | columns: cross(department, revenue)</p>
      {loading && <p>Loading DuckDB-WASM...</p>}
      {error && <p style={{color: "red"}}>Error: {error}</p>}
      <div style={{
        position: "relative",
        background: "white",
        height: "calc(100vh - 200px)",
        width: "calc(100vw - 200px)",
        border: "1px solid #eaeaea",
        margin: 0,
        padding: 0,
        boxSizing: "border-box",
        contain: "layout style",
      }} ref={gridConRef}>
      </div>
    </>
  );
};

export default PivotGridPlayground;
