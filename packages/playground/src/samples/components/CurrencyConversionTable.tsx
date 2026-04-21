import React, {useEffect, useMemo, useState} from "react";
import "grid/dist/grid.css";
import type {DataSchema, ColumnMetadata} from "grid/dist/index";
import type {GetRowsIR, FlatTableConfig} from "grid/dist/index";
import {
  DataGrid, useFlatGrid, SkeletonGrid, GridErrOverlay,
  type ColumnDef, type FacetCellProps, type ReactFacetDefs,
} from "frameworks/dist/react";
import type {SelectionDef} from "frameworks/dist/react/data";
import {useDataSource} from "./DataSourceContext";
import {useTheme} from "./ThemeContext";

const PROJECT = ["First Name", "Last Name", "Total OT Paid", "Total Other Pay"];
const MEASURE_COLUMNS = new Set(["Total OT Paid", "Total Other Pay"]);
const USD_TO_INR = 83.5;
const META_NS = "currency";
const MEASURE_PREDICATE = (dim: string, dimVal: string | null) => dim === "colName" && MEASURE_COLUMNS.has(dimVal ?? "");

function buildSchema(columns: ColumnMetadata[]): DataSchema[] {
  return columns.map((col) => ({
    name: col.normColName,
    displayName: col.originalColName,
    type: col.type,
    subtype: col.subtype,
    aggregateFn: col.aggregateFn,
  }));
}

const CurrencyButton: React.FC<FacetCellProps> = ({value, index, viewModel, render}) => {
  const meta = viewModel.metaState.get(META_NS);
  const currency = meta?.[value ?? ""] ?? "USD";

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const colName = value ?? "";
    const next = currency === "USD" ? "INR" : "USD";
    viewModel.metaState.set(META_NS, colName, next);
    const transforms = viewModel.metaState.get("transforms")!;
    if (next === "INR") {
      transforms["applyTransform"](index, (v: any) => v != null ? v * USD_TO_INR : v);
    } else {
      transforms["resetTransform"](index);
    }
    render(viewModel);
  };

  return (
    <span style={{display: "flex", alignItems: "center", gap: "8px"}}>
      <span>{value}</span>
      <button
        className="sample-btn"
        style={{fontSize: "10px", padding: "1px 4px", lineHeight: 1.4}}
        onClick={handleClick}
      >
        {currency}
      </button>
    </span>
  );
};

const GlobalCurrencyButton: React.FC<FacetCellProps> = ({value, viewModel, render}) => {
  const meta = viewModel.metaState.get(META_NS);
  const currency = meta?.[value ?? ""] ?? "USD";
  const measureIndices = viewModel.metaState.get("transforms")?.["measureIndices"] as Map<string, number> | undefined;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = currency === "USD" ? "INR" : "USD";
    const transforms = viewModel.metaState.get("transforms")!;

    if (measureIndices) {
      for (const [colName, colIndex] of measureIndices) {
        viewModel.metaState.set(META_NS, colName, next);
        if (next === "INR") {
          transforms["applyTransform"](colIndex, (v: any) => v != null ? v * USD_TO_INR : v);
        } else {
          transforms["resetTransform"](colIndex);
        }
      }
    }
    render(viewModel);
  };

  return (
    <span style={{display: "flex", alignItems: "center", gap: "8px"}}>
      <span>{value}</span>
      <button
        className="sample-btn"
        style={{fontSize: "10px", padding: "1px 4px", lineHeight: 1.4}}
        onClick={handleClick}
      >
        {currency}
      </button>
    </span>
  );
};

const COLUMNS: ColumnDef[] = [
  {colSize: {strategy: "static" as const, width: 1, unit: "fr" as const}},
  {colSize: {strategy: "static" as const, width: 1, unit: "fr" as const}},
  {colSize: {strategy: "static" as const, width: 2, unit: "fr" as const}},
  {colSize: {strategy: "static" as const, width: 2, unit: "fr" as const}},
];

const FACET_DEFS: ReactFacetDefs = {
  row: [{text: ""}],
  col: [{text: "", facetField: "colName"}],
  axis: "col",
};

const CurrencyConversionTable: React.FC<{height?: string}> = ({height = "300px"}) => {
  const dsState = useDataSource();
  const theme = useTheme();

  if (dsState.status === "loading") return <div className="grid-sample" style={{height}}><SkeletonGrid theme={theme} /></div>;
  if (dsState.status === "error") return <div className="grid-sample" style={{height}}><GridErrOverlay theme={theme} errBody={dsState.error} /></div>;

  const {ds, columns: columnMeta} = dsState;
  const schema = buildSchema(columnMeta);
  const projectedSchema = schema.filter((s) => PROJECT.includes(s.displayName ?? s.name));

  return <CurrencyConversionGrid ds={ds} schema={projectedSchema} theme={theme} height={height!} />;
};

interface GridProps {
  ds: import("grid/dist/index").SqlDataSource;
  schema: DataSchema[];
  theme: string;
  height: string;
}

const CurrencyConversionGrid: React.FC<GridProps> = ({ds, schema, theme, height}) => {
  const [globalMode, setGlobalMode] = useState(false);

  const config = useMemo<FlatTableConfig>(() => ({schema, pageSize: 100}), [schema]);

  const ir = useMemo<GetRowsIR>(() => ({
    startRow: 0,
    endRow: 100,
    groupPath: [],
    groupBy: [],
    project: schema.map((s) => s.name),
    sort: [],
    filter: [],
  }), [schema]);

  const measureIndices = useMemo(() => {
    const map = new Map<string, number>();
    schema.forEach((s, i) => {
      const name = s.displayName ?? s.name;
      if (MEASURE_COLUMNS.has(name)) map.set(name, i);
    });
    return map;
  }, [schema]);

  const selections = useMemo<SelectionDef[]>(() => [{
    predicate: MEASURE_PREDICATE,
    trackRenderer: globalMode ? GlobalCurrencyButton : CurrencyButton,
  }], [globalMode]);

  const {bindings, viewModel, loading, error, fetchPage, applyTransform, resetTransform} = useFlatGrid({
    dataSource: ds,
    schema,
    config,
    ir,
    columns: COLUMNS,
    facetDefs: FACET_DEFS,
    selections,
  });

  useEffect(() => {
    if (!viewModel) return;
    viewModel.metaState.set("transforms", "applyTransform", applyTransform);
    viewModel.metaState.set("transforms", "resetTransform", resetTransform);
    viewModel.metaState.set("transforms", "measureIndices", measureIndices);
  }, [viewModel, applyTransform, resetTransform, measureIndices]);

  if (loading) return <div className="grid-sample" style={{height}}><SkeletonGrid theme={theme} /></div>;
  if (error) return <div className="grid-sample" style={{height}}><GridErrOverlay theme={theme} errBody={error.message} /></div>;

  return (
    <div>
      <div style={{marginBottom: "8px"}}>
        <button className="sample-btn" onClick={() => setGlobalMode((v) => !v)}>
          Global: {globalMode ? "ON" : "OFF"}
        </button>
        <p style={{margin: "4px 0 0", fontSize: "12px", opacity: 0.7}}>
          {globalMode
            ? "Toggling currency on any column converts all measure columns together."
            : "Each measure column converts independently."}
        </p>
      </div>
      <div className="grid-sample" style={{height}}>
        <DataGrid
          {...bindings}
          layout="flat"
          theme={theme}
          onViewDataEmpty={({startRow, endRow}) => fetchPage(startRow, endRow)}
        />
      </div>
    </div>
  );
};

export default CurrencyConversionTable;
