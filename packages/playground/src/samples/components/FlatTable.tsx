import React from "react";
import "@superplot/grid/grid.css";
import type {DataSchema, ColumnMetadata} from "@superplot/grid";
import type {StandardDataFetchAndTransformIR, StandardTableConfig} from "@superplot/grid";
import {DataGrid, useFlatGrid, SkeletonGrid, GridErrOverlay} from "@superplot/react";
import {useDataSource} from "./DataSourceContext";
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

interface FlatTableProps {
  height?: string;
}

const FlatTable: React.FC<FlatTableProps> = ({height = "500px"}) => {
  const dsState = useDataSource();
  const theme = useTheme();

  if (dsState.status === "loading") return <div className="grid-sample" style={{height}}><SkeletonGrid theme={theme} /></div>;
  if (dsState.status === "error") return <div className="grid-sample" style={{height}}><GridErrOverlay theme={theme} errBody={dsState.error} /></div>;

  return <FlatTableInner ds={dsState.ds} columns={dsState.columns} theme={theme} height={height} />;
};

interface FlatTableInnerProps {
  ds: import("@superplot/grid").SqlDataSource;
  columns: ColumnMetadata[];
  theme: string;
  height: string;
}

const FlatTableInner: React.FC<FlatTableInnerProps> = ({ds, columns, theme, height}) => {
  const schema = React.useMemo(() => buildSchema(columns), [columns]);

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
    facetDefs: {row: [{text: ""}], col: [{text: "", facetField: "colName"}], axis: "col"},
    enableSorting: true,
  });

  if (loading) return <div className="grid-sample" style={{border: "2px solid rgb(160, 160, 160)", borderRadius: "8px", height}}><SkeletonGrid theme={theme} /></div>;
  if (error) return <div className="grid-sample" style={{border: "2px solid rgb(160, 160, 160)", borderRadius: "8px", height}}><GridErrOverlay theme={theme} errBody={error.message} /></div>;

  return (
    <div className="grid-sample" style={{
      border: "2px solid rgb(160, 160, 160)",
      borderRadius: "8px",
      height
    }}>
      <DataGrid
        {...bindings}
        layout="flat"
        theme={theme}
        onViewDataEmpty={(p) => { if (p.reason === "out-of-range") fetchPage(p.startRow, p.endRow); }}
      />
    </div>
  );
};

export default FlatTable;
