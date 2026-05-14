import { useEffect, useRef } from "react";
import { registerSample } from "./registry";
import { useDataSource } from "../DataSourceProvider";
import { SqlPivotTableDataModel, cross, hierarchy, concat } from "grid";
import Grid, { PivotDataViewModel } from "grid/dist/renderer";
import "grid/dist/grid.css";
import { formatDecimals } from "../lib/format";

function BasicPivot() {
  const containerRef = useRef<HTMLDivElement>(null);
  const data = useDataSource();

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

    const model = new SqlPivotTableDataModel(schema, ds);

    let cancelled = false;
    (async () => {
      const result = await model.getViewModelData({
        rows: hierarchy("Work Location Borough", "Leave Status as of June 30"),
        columns: cross("Agency Name", concat("Base Salary", "Regular Hours")),
        sort: [
          { field: "Work Location Borough", direction: "asc" },
          { field: "Leave Status as of June 30", direction: "asc" },
        ],
      });

      if (cancelled) return;

      formatDecimals(result.data, result.data.map((_, i) => i));

      const viewModel = new PivotDataViewModel({
        data: result.data,
        columnFacets: result.columnFacets,
        rowFacets: result.rowFacets,
        options: result.options,
      });

      const grid = new Grid({}, containerRef.current!);
      grid.data = viewModel;
      grid.draw();
    })();

    return () => { cancelled = true; };
  }, [data]);

  return (
    <div className="flex flex-col h-full">
      <div className="overflow-y-auto shrink-0" style={{ maxHeight: "40%", padding: "40px 48px 24px" }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "#111827", lineHeight: 1.3 }}>Basic Pivot Table</h1>
        <p style={{ marginTop: 12, fontSize: 13, lineHeight: 1.75, color: "#4b5563", maxWidth: 640 }}>
          This sample pivots NYC Citywide Payroll data by agency and borough on rows, crossed
          with pay basis and base salary on columns. The underlying data engine executes the
          aggregation in DuckDB WASM, and the grid renders the reshaped result with sticky row
          and column facets for comfortable navigation across large cross-tabulations.
        </p>
        <p style={{ marginTop: 10, fontSize: 13, lineHeight: 1.75, color: "#4b5563", maxWidth: 640 }}>
          Pivot tables are the backbone of business intelligence reporting. They let analysts
          slice revenue by geography and time in a single view without writing SQL. The grid
          handles virtualized rendering so even pivots with thousands of cells scroll at 60 fps.
          Column resize, auto-fit on double-click, and cell selection are available out of the box.
        </p>
      </div>

      <div className="flex-1 flex items-center justify-center min-h-0">
        {data.status === "loading" && <span style={{ fontSize: 13, color: "#6b7280" }}>Loading data...</span>}
        {data.status === "error" && <span style={{ fontSize: 13, color: "#dc2626" }}>{data.error}</span>}
        <div ref={containerRef} style={{ width: 800, height: 480, position: "relative", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.08)", boxSizing: "border-box", contain: "layout style", display: data.status === "ready" ? "block" : "none" }} />
      </div>
    </div>
  );
}

registerSample({
  id: "basic-pivot",
  title: "Basic Pivot Table",
  component: BasicPivot,
});
