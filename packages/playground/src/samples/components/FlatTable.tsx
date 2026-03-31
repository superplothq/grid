import React from "react";
import "grid/dist/grid.css";
import type {DataSchema, ColumnMetadata} from "grid/dist/index";
import type {GetRowsIR, FlatTableConfig} from "grid/dist/index";
import {DataGrid, useFlatGrid, SkeletonGrid, GridErrOverlay} from "frameworks/dist/react";
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
  ds: import("grid/dist/index").SqlDataSource;
  columns: ColumnMetadata[];
  theme: string;
  height: string;
}

const FlatTableInner: React.FC<FlatTableInnerProps> = ({ds, columns, theme, height}) => {
  const schema = React.useMemo(() => buildSchema(columns), [columns]);

  const config = React.useMemo<FlatTableConfig>(() => ({schema, pageSize: 100}), [schema]);

  const ir = React.useMemo<GetRowsIR>(() => ({
    startRow: 0,
    endRow: 100,
    select: [],
    groupBy: [],
    project: schema.map((s) => s.name),
    sort: [],
    filter: [],
  }), [schema]);

  const {viewModel, loading, error, fetchPage, onCellRelease} = useFlatGrid({
    dataSource: ds,
    schema,
    config,
    ir,
    facetDefs: {row: [{text: ""}], col: [{text: "", facetField: "colName"}], axis: "col"},
  });

  if (loading) return <p>Loading table...</p>;
  if (error) return <p style={{color: "red"}}>Error: {error.message}</p>;

  return (
    <div className="grid-sample" style={{
      border: "2px solid rgb(160, 160, 160)",
      borderRadius: "8px",
      height
    }}>
      <DataGrid
        data={viewModel}
        layout="flat"
        theme={theme}
        onCellRelease={onCellRelease}
        onViewDataEmpty={({startRow, endRow}) => fetchPage(startRow, endRow)}
      />
    </div>
  );
};

export default FlatTable;
