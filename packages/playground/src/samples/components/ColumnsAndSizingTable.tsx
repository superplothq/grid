import React from "react";
import "@superplot/grid/grid.css";
import type {DataSchema, ColumnMetadata} from "@superplot/grid";
import type {StandardDataFetchAndTransformIR, StandardTableConfig} from "@superplot/grid";
import {
  DataGrid, useFlatGrid, SkeletonGrid, GridErrOverlay,
  type ColumnDef, type ReactFacetDefs,
} from "@superplot/react";
import {useDataSource} from "./DataSourceContext";
import {useTheme} from "./ThemeContext";

const PROJECT = ["First Name", "Last Name", "Regular Gross Paid"];

const COLUMNS: ColumnDef[] = [
  {colSize: {strategy: "static" as const, width: 1, unit: "fr" as const}},
  {colSize: {strategy: "static" as const, width: 1, unit: "fr" as const}},
  {colSize: {strategy: "static" as const, width: 2, unit: "fr" as const}},
];

function buildSchema(columns: ColumnMetadata[]): DataSchema[] {
  return columns.map((col) => ({
    name: col.normColName,
    displayName: col.originalColName,
    type: col.type,
    subtype: col.subtype,
    aggregateFn: col.aggregateFn,
  }));
}

const FACET_DEFS: ReactFacetDefs = {
  row: [{text: ""}],
  col: [{text: "", facetField: "colName"}],
  axis: "col",
};

const ColumnsAndSizingInner: React.FC<{height: string}> = ({height}) => {
  const dsState = useDataSource();
  const theme = useTheme();

  if (dsState.status === "loading") return <div className="grid-sample" style={{height}}><SkeletonGrid theme={theme} /></div>;
  if (dsState.status === "error") return <div className="grid-sample" style={{height}}><GridErrOverlay theme={theme} errBody={dsState.error} /></div>;

  const {ds, columns: columnMeta} = dsState;
  const schema = buildSchema(columnMeta);
  const projectedSchema = schema.filter((s) => PROJECT.includes(s.displayName ?? s.name));

  return <ColumnsAndSizingGrid ds={ds} schema={projectedSchema} theme={theme} height={height} />;
};

interface GridProps {
  ds: import("@superplot/grid").SqlDataSource;
  schema: DataSchema[];
  theme: string;
  height: string;
}

const ColumnsAndSizingGrid: React.FC<GridProps> = ({ds, schema, theme, height}) => {
  const config = React.useMemo<Partial<StandardTableConfig>>(() => ({pageSize: 100}), []);

  const ir = React.useMemo<StandardDataFetchAndTransformIR>(() => ({
    startRow: 0,
    endRow: 100,
    groupPath: [],
    groupBy: [],
    project: schema.map((s) => s.name),
    sort: [],
    filter: [],
  }), []);

  const {bindings, loading, error, fetchPage} = useFlatGrid({
    dataSource: ds,
    schema,
    config,
    ir,
    columns: COLUMNS,
    facetDefs: FACET_DEFS,
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

const ColumnsAndSizingTable: React.FC<{height?: string}> = ({height = "500px"}) => {
  return <ColumnsAndSizingInner height={height} />;
};

export default ColumnsAndSizingTable;
