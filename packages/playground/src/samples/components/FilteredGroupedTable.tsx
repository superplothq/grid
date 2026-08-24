import React, {useCallback, useRef, useState} from "react";
import "@superplot/grid/grid.css";
import type {DataSchema, ColumnMetadata} from "@superplot/grid";
import type {StandardDataFetchAndTransformIR, StandardTableConfig} from "@superplot/grid";
import {FlattenedDataViewModel} from "@superplot/grid/renderer";
import type {FacetCellProps} from "@superplot/react";
import {DataGrid, useFlatGrid, SkeletonGrid, GridErrOverlay, useDataModelContext} from "@superplot/react";
import {useDataSource} from "./DataSourceContext";
import {useTheme} from "./ThemeContext";

function buildSchema(columns: ColumnMetadata[]): DataSchema[] {
  return columns.map((col) => {
    const base: DataSchema = {
      name: col.normColName,
      displayName: col.originalColName,
      type: col.type,
      subtype: col.subtype,
      aggregateFn: col.type === "measure" ? (col.aggregateFn ?? "sum") : col.aggregateFn,
    };
    if (col.normColName === "Work Location Borough" || col.normColName === "Leave Status as of June 30" || col.normColName === "Pay Basis") {
      base.cardinality = "low";
    }
    if (col.subtype === "temporal") {
      base.cardinality = "low";
    }
    return base;
  });
}

const PlusIcon: React.FC<{size?: number}> = ({size = 11}) => (
  <svg width={size} height={size} viewBox="0 0 16 16" style={{display: "block"}}>
    <rect x="0.5" y="0.5" width="15" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="1" />
    <line x1="4" y1="8" x2="12" y2="8" stroke="currentColor" strokeWidth="1.5" />
    <line x1="8" y1="4" x2="8" y2="12" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

const MinusIcon: React.FC<{size?: number}> = ({size = 11}) => (
  <svg width={size} height={size} viewBox="0 0 16 16" style={{display: "block"}}>
    <rect x="0.5" y="0.5" width="15" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="1" />
    <line x1="4" y1="8" x2="12" y2="8" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

const ExpandCollapseRenderer: React.FC<FacetCellProps> = ({value, path, viewModel, render, flatMeta}) => {
  const {model} = useDataModelContext();
  const [loading, setLoading] = useState(false);
  const busyRef = useRef(false);

  const handleClick = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setLoading(true);

    const result = flatMeta!.isExpanded
      ? await model.collapse(path as string[])
      : await model.expand(path as string[]);

    (viewModel as FlattenedDataViewModel).updateData(result);
    render(viewModel);
    busyRef.current = false;
    setLoading(false);
  }, [model, path, flatMeta, viewModel, render]);

  if (!flatMeta || flatMeta.isLeaf) return <>{String(value ?? "")}</>;

  return (
    <span style={{display: "flex", alignItems: "center", gap: 4, overflow: "hidden", width: "100%"}}>
      <span
        onClick={handleClick}
        style={{cursor: loading ? "wait" : "pointer", display: "inline-flex", alignItems: "center", flexShrink: 0, opacity: loading ? 0.4 : 0.9}}
      >
        {flatMeta.isExpanded ? <MinusIcon /> : <PlusIcon />}
      </span>
      <span style={{overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>{String(value ?? "")}</span>
    </span>
  );
};

interface FilteredGroupedTableProps {
  height?: string;
}

const GROUP_BY = ["Agency Name", "Work Location Borough"];

const FilteredGroupedTable: React.FC<FilteredGroupedTableProps> = ({height = "500px"}) => {
  const dsState = useDataSource();
  const theme = useTheme();

  if (dsState.status === "loading") return <div className="grid-sample" style={{height}}><SkeletonGrid theme={theme} /></div>;
  if (dsState.status === "error") return <div className="grid-sample" style={{height}}><GridErrOverlay theme={theme} errBody={dsState.error} /></div>;

  return <FilteredGroupedTableInner ds={dsState.ds} columns={dsState.columns} theme={theme} height={height} />;
};

interface FilteredGroupedTableInnerProps {
  ds: import("@superplot/grid").SqlDataSource;
  columns: ColumnMetadata[];
  theme: string;
  height: string;
}

const FilteredGroupedTableInner: React.FC<FilteredGroupedTableInnerProps> = ({ds, columns, theme, height}) => {
  const schema = React.useMemo(() => buildSchema(columns), [columns]);
  const config = React.useMemo<Partial<StandardTableConfig>>(() => ({pageSize: 20}), []);

  const ir = React.useMemo<StandardDataFetchAndTransformIR>(() => ({
    startRow: 0,
    endRow: 20,
    groupPath: [],
    groupBy: GROUP_BY,
    project: [...schema.filter(s => s.type === "measure").map(s => s.name), ...schema.filter(s => s.type !== "measure").map(s => s.name)],
    sort: [],
    filter: [],
  }), []);

  const {bindings, loading, error, fetchPage} = useFlatGrid({
    dataSource: ds,
    schema,
    config,
    ir,
    facetDefs: {row: [{text: "", trackRenderer: ExpandCollapseRenderer}], col: [{text: "", facetField: "colName"}], axis: "col"},
    enableSorting: true,
    enableFiltering: true,
    theme,
  });

  if (loading) return <div className="grid-sample" style={{border: "2px solid rgb(160, 160, 160)", borderRadius: "8px", height}}><SkeletonGrid theme={theme} /></div>;
  if (error) {
    setTimeout(() => { throw error }, 0)
    return <div className="grid-sample" style={{border: "2px solid rgb(160, 160, 160)", borderRadius: "8px", height}}><GridErrOverlay theme={theme} errBody={error.message} /></div>;
  }

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

export default FilteredGroupedTable;
