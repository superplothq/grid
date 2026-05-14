import { useEffect, useRef } from "react";
import { registerSample } from "./registry";
import { useDataSource } from "../DataSourceProvider";
import { SqlStandardTableDataModel } from "grid";
import Grid, { FlattenedDataViewModel } from "grid/dist/renderer";
import "grid/dist/grid.css";
import { formatDecimals } from "../lib/format";

function BasicFlatTable() {
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

    const model = new SqlStandardTableDataModel(schema, ds);

    let cancelled = false;
    (async () => {
      const result = await model.getData({
        startRow: 0,
        endRow: 500,
        groupPath: [],
        groupBy: [],
        project: schema.map((s) => s.name),
        sort: [],
        filter: [],
      });

      if (cancelled) return;

      const measureIndices = schema.reduce<number[]>((acc, s, i) => {
        if (s.type === "measure") acc.push(i);
        return acc;
      }, []);
      formatDecimals(result.rowData, measureIndices);

      const viewModel = new FlattenedDataViewModel({
        data: result.rowData,
        columnFacets: [schema.map((s) => s.displayName ?? s.name)],
        schema,
        totalRows: result.totalRowCount,
        offsetTop: 0,
      });

      const grid = new Grid({}, containerRef.current!, "flat");
      grid.data = viewModel;
      grid.draw();
    })();

    return () => { cancelled = true; };
  }, [data]);

  return (
    <div className="flex flex-col h-full">
      <div className="overflow-y-auto shrink-0" style={{ maxHeight: "40%", padding: "40px 48px 24px" }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "#111827", lineHeight: 1.3 }}>Basic Flat Table</h1>
        <p style={{ marginTop: 12, fontSize: 13, lineHeight: 1.75, color: "#4b5563", maxWidth: 640 }}>
          A standard tabular view of NYC Citywide Payroll records. The flat table layout renders
          individual rows with all 15 columns — names, agencies, boroughs, salary figures, and
          overtime data. The data is loaded into DuckDB WASM and queried with a single pass, then
          handed to a FlattenedDataViewModel that the grid renders with virtualized scrolling.
        </p>
        <p style={{ marginTop: 10, fontSize: 13, lineHeight: 1.75, color: "#4b5563", maxWidth: 640 }}>
          Flat tables are ideal for operational dashboards, admin panels, and data exploration
          interfaces where users need to scan individual records. The grid supports column resize,
          row selection, and keyboard navigation. Because rendering is fully virtualized, the same
          component can handle tables with millions of rows without any change in configuration —
          only the visible viewport is painted to the DOM.
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
  id: "basic-flat-table",
  title: "Basic Flat Table",
  component: BasicFlatTable,
});
