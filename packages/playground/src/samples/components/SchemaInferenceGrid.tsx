import React, {useCallback} from "react";
import "grid/dist/grid.css";
import type {DataSchema, ColumnMetadata} from "grid/dist/index";
import type {GetRowsIR, FlatTableConfig, FlattenedDataViewModelParams} from "grid/dist/index";
import {
  DataGrid, useFlatGrid, SkeletonGrid, GridErrOverlay,
  type FacetCellProps, type CellProps, type ReactFacetDefs,
} from "frameworks/dist/react";
import {useDataSource} from "./DataSourceContext";
import {DataSourceProvider} from "./DataSourceContext";
import {useTheme} from "./ThemeContext";

function buildSchema(columns: ColumnMetadata[]): DataSchema[] {
  return columns.map((col) => ({
    name: col.normColName,
    displayName: col.originalColName,
    type: col.type,
    subtype: col.subtype,
    aggregateFn: col.aggregateFn,
  }));
}

function buildTypeLabels(schema: DataSchema[]): string[] {
  return schema.map((s) => {
    if (s.subtype === "temporal") return "Temporal";
    return s.type === "measure" ? "Measure" : "Dimension";
  });
}

const SCHEMA_FIXES: Record<string, string> = {
  "Payroll Number": "Should be dimension, not measure",
  "Agency Start Date": "Should be temporal (datetime)",
  "Base Salary": "Should be measure, not dimension",
  "Regular Hours": "Should be measure, not dimension",
  "Regular Gross Paid": "Should be measure, not dimension",
  "OT Hours": "Should be measure, not dimension",
  "Total OT Paid": "Should be measure, not dimension",
  "Total Other Pay": "Should be measure, not dimension",
};

const COLORS = {
  light: {Dimension: "#d6eaf8", Measure: "#d4edda", Temporal: "#fef9e7"},
  dark: {Dimension: "#1a3a5c", Measure: "#1a3c2a", Temporal: "#3c3a1a"},
};

const SchemaTypeFacet: React.FC<FacetCellProps & {theme: string}> = ({value, theme, cell}) => {
  const c = theme === "dark" ? COLORS.dark : COLORS.light;
  cell.style.backgroundColor = c[value as keyof typeof c] ?? "";
  return <span>{value}</span>;
};

const WarningColNameFacet: React.FC<FacetCellProps> = ({value}) => {
  const fix = SCHEMA_FIXES[value ?? ""];
  return (
    <span>
      {value}
      {fix && <span title={fix} style={{cursor: "help", fontSize: 11, color: "#e67e22", marginLeft: 4}}>⚠</span>}
    </span>
  );
};

const ColNameFacet: React.FC<FacetCellProps> = ({value}) => (
  <span>{value}</span>
);

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {day: "2-digit", month: "short", year: "numeric"});

const TemporalCell: React.FC<CellProps> = ({value}) => {
  if (value == null) return <span />;
  const d = new Date(value as string);
  const formatted = isNaN(d.getTime()) ? String(value) : DATE_FORMAT.format(d);
  return <span>{formatted}</span>;
};

interface InnerProps {
  ds: import("grid/dist/index").SqlDataSource;
  columns: ColumnMetadata[];
  theme: string;
  height: string;
  showWarnings?: boolean;
  showTemporalFormat?: boolean;
}

const SchemaInferenceGridInner: React.FC<InnerProps> = ({ds, columns, theme, height, showWarnings, showTemporalFormat}) => {
  const schema = React.useMemo(() => buildSchema(columns), [columns]);

  const config = React.useMemo<FlatTableConfig>(() => ({schema, pageSize: 100}), [schema]);

  const ir = React.useMemo<GetRowsIR>(() => ({
    startRow: 0,
    endRow: 100,
    groupPath: [],
    groupBy: [],
    project: schema.map((s) => s.name),
    sort: [],
    filter: [],
  }), [schema]);

  const typeLabels = React.useMemo(() => buildTypeLabels(schema), [schema]);

  const transformResult = useCallback((result: FlattenedDataViewModelParams): FlattenedDataViewModelParams => ({
    ...result,
    columnFacets: [typeLabels, result.columnFacets[0]],
  }), [typeLabels]);

  const ThemedSchemaTypeFacet = React.useMemo<React.FC<FacetCellProps>>(() => {
    return (props) => <SchemaTypeFacet {...props} theme={theme} />;
  }, [theme]);

  const colNameRenderer = showWarnings ? WarningColNameFacet : ColNameFacet;

  const temporalColumns = React.useMemo(() => {
    if (!showTemporalFormat) return undefined;
    return schema.map((s) =>
      s.subtype === "temporal" ? {renderer: TemporalCell} : {}
    );
  }, [schema, showTemporalFormat]);

  const facetDefs = React.useMemo<ReactFacetDefs>(() => ({
    row: [{text: ""}],
    col: [
      {text: "", facetField: "schemaType", trackRenderer: ThemedSchemaTypeFacet},
      {text: "", facetField: "colName", trackRenderer: colNameRenderer},
      // {text: "", facetField: "schemaType"},
      // {text: "", facetField: "colName"},
    ],
    axis: "col",
  }), [ThemedSchemaTypeFacet, colNameRenderer]);

  const {bindings, loading, error, fetchPage} = useFlatGrid({
    dataSource: ds,
    schema,
    config,
    ir,
    columns: temporalColumns,
    facetDefs,
    transformResult,
  });

  if (loading) return <div className="grid-sample" style={{height}}><SkeletonGrid theme={theme} /></div>;
  if (error) return <div className="grid-sample" style={{height}}><GridErrOverlay theme={theme} errBody={error.message} /></div>;

  return (
    <div className="grid-sample" style={{height}}>
      <DataGrid
        {...bindings}
        layout="flat"
        theme={theme}
        onViewDataEmpty={({startRow, endRow}) => fetchPage(startRow, endRow)}
      />
    </div>
  );
};

const SchemaInferenceGrid: React.FC<{height?: string}> = ({height = "150px"}) => {
  const dsState = useDataSource();
  const theme = useTheme();

  if (dsState.status === "loading") return <div className="grid-sample" style={{height}}><SkeletonGrid theme={theme} /></div>;
  if (dsState.status === "error") return <div className="grid-sample" style={{height}}><GridErrOverlay theme={theme} errBody={dsState.error} /></div>;

  return <SchemaInferenceGridInner ds={dsState.ds} columns={dsState.columns} theme={theme} height={height} showWarnings />;
};

export const CleanGrid: React.FC<{height?: string}> = ({height = "500px"}) => {
  const theme = useTheme();

  return (
    <DataSourceProvider mode="clean">
      <CleanGridInner theme={theme} height={height} />
    </DataSourceProvider>
  );
};

const CleanGridInner: React.FC<{theme: string; height: string}> = ({theme, height}) => {
  const dsState = useDataSource();

  if (dsState.status === "loading") return <div className="grid-sample" style={{height}}><SkeletonGrid theme={theme} /></div>;
  if (dsState.status === "error") return <div className="grid-sample" style={{height}}><GridErrOverlay theme={theme} errBody={dsState.error} /></div>;

  return <SchemaInferenceGridInner ds={dsState.ds} columns={dsState.columns} theme={theme} height={height} showTemporalFormat />;
};

export default SchemaInferenceGrid;
