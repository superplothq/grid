import React, {useEffect, useRef, useState} from "react";
import "@superplot/grid/grid.css";
import type {DataSchema, ColumnMetadata} from "@superplot/grid";
import type {StandardDataFetchAndTransformIR, StandardTableConfig} from "@superplot/grid";
import {
  DataGrid, useFlatGrid, SkeletonGrid, GridErrOverlay,
  type ColumnDef, type ReactFacetDefs, type DataGridHandle,
} from "@superplot/react";
import {useDataSource} from "./DataSourceContext";
import {useTheme} from "./ThemeContext";

const TARGET_COLUMN = "Leave Status as of June 30";

function buildSchema(columns: ColumnMetadata[]): DataSchema[] {
  return columns.map((col) => ({
    name: col.normColName,
    displayName: col.originalColName,
    type: col.type,
    subtype: col.subtype,
    aggregateFn: col.aggregateFn,
  }));
}

function buildColumns(schema: DataSchema[], exclude: boolean): ColumnDef[] {
  return schema.map((s) => {
    if ((s.displayName ?? s.name) === TARGET_COLUMN) {
      return {colSize: {strategy: "max-cell" as const, excludeColumnFacets: exclude}};
    }
    return {};
  });
}

const FACET_DEFS: ReactFacetDefs = {
  row: [{text: ""}],
  col: [{text: "", facetField: "colName"}],
  axis: "col",
};

const ExcludeColumnFacetsInner: React.FC<{height: string; exclude: boolean}> = ({height, exclude}) => {
  const dsState = useDataSource();
  const theme = useTheme();

  if (dsState.status === "loading") return <div className="grid-sample" style={{height}}><SkeletonGrid theme={theme} /></div>;
  if (dsState.status === "error") return <div className="grid-sample" style={{height}}><GridErrOverlay theme={theme} errBody={dsState.error} /></div>;

  const {ds, columns: columnMeta} = dsState;
  const schema = buildSchema(columnMeta);

  return <ExcludeColumnFacetsGrid ds={ds} schema={schema} theme={theme} height={height} exclude={exclude} />;
};

interface GridProps {
  ds: import("@superplot/grid").SqlDataSource;
  schema: DataSchema[];
  theme: string;
  height: string;
  exclude: boolean;
}

const ExcludeColumnFacetsGrid: React.FC<GridProps> = ({ds, schema, theme, height, exclude}) => {

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

  const columns = React.useMemo(() => buildColumns(schema, exclude), [schema, exclude]);

  const {bindings, gridRef, viewModel, loading, error, fetchPage} = useFlatGrid({
    dataSource: ds,
    schema,
    config,
    ir,
    columns,
    facetDefs: FACET_DEFS,
  });

  useEffect(() => {
    const grid = gridRef.current?.grid;
    if (!grid || !viewModel) return;
    const idx = schema.findIndex((s) => (s.displayName ?? s.name) === TARGET_COLUMN);
    if (idx >= 0) {
      const unsub = grid.on("renderComplete", () => {
        unsub();
        grid.scrollTo("column", idx);
      });
    }
  }, [viewModel, schema]);

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

const ExcludeColumnFacetsTable: React.FC<{height?: string}> = ({height = "500px"}) => {
  const [exclude, setExclude] = useState(true);

  return (
    <div>
      <div style={{display: "flex", gap: "8px", marginBottom: "8px"}}>
        <button className="sample-btn" onClick={() => setExclude((v) => !v)}>
          excludeColumnFacets: {exclude ? "ON" : "OFF"}
        </button>
      </div>
      <ExcludeColumnFacetsInner key={String(exclude)} height={height} exclude={exclude} />
    </div>
  );
};

export default ExcludeColumnFacetsTable;
