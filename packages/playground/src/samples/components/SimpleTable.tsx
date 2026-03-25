import React, {useEffect, useRef, useState} from "react";
import "grid/dist/grid.css";
import Grid, {FlattenedDataViewModel, GridDataViewModelOptions, VTrackDef} from "grid/dist/renderer";
import {SqlFlatTableDataModel, FlatTableConfig, GetRowsIR, ColumnMetadata, DataSchema} from "grid/dist/index";
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

export interface ColFacetLevel {
  labels: string[];
  facetField?: string;
}

interface SimpleTableProps {
  height?: string;
  project?: string[];
  vTrackDefs?: VTrackDef[];
  colFacetLevels?: (schema: DataSchema[]) => ColFacetLevel[];
  onGridReady?: (grid: Grid, schema: DataSchema[], theme: string) => void;
}

const SimpleTable: React.FC<SimpleTableProps> = ({height = "500px", project, vTrackDefs, colFacetLevels, onGridReady}) => {
  const dsState = useDataSource();
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (dsState.status !== "ready") return;
    let cancelled = false;

    (async () => {
      const {ds, columns: columnMeta} = dsState;
      const schema = buildSchema(columnMeta);
      const config: FlatTableConfig = {schema, pageSize: 100};
      const model = new SqlFlatTableDataModel(config, schema, ds);

      const projectedSchema = project
        ? schema.filter((s) => project.includes(s.displayName ?? s.name))
        : schema;

      const ir: GetRowsIR = {
        startRow: 0,
        endRow: 100,
        select: [],
        groupBy: [],
        project: projectedSchema.map((s) => s.name),
        sort: [],
        filter: [],
      };

      const result = await model.getViewModelData(ir);
      if (cancelled) return;

      const extraLevels = colFacetLevels ? colFacetLevels(projectedSchema) : [];
      const columnFacets = [
        ...extraLevels.map((l) => l.labels),
        result.columnFacets[0],
      ];
      const colFacetDefs = [
        ...extraLevels.map((l) => ({text: "", ...(l.facetField && {facetField: l.facetField})})),
        {text: "", facetField: "colName"},
      ];

      const options: GridDataViewModelOptions = {
        ...result.options,
        ...(vTrackDefs && {vTrackDefs}),
        facetDefs: {
          row: [{text: ""}],
          col: colFacetDefs,
          axis: "col",
        },
      };

      const viewModel = new FlattenedDataViewModel({
        data: result.data, columnFacets, rowFacet: result.rowFacet, rowMeta: result.rowMeta, options, schema: projectedSchema,
      });

      if (!containerRef.current) return;
      const grid = new Grid({theme}, containerRef.current, "flat");
      grid.data = viewModel;
      grid.draw();
      if (onGridReady) onGridReady(grid, schema, theme);
      setLoading(false);
    })().catch((err) => {
      if (!cancelled) {
        console.log(err);
        setError(String(err));
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [dsState, theme]);

  if (dsState.status === "loading") return <p>Initializing datasource...</p>;
  if (dsState.status === "error") return <p style={{color: "red"}}>Datasource error: {dsState.error}</p>;

  return (
    <div>
      {loading && !error && <p>Loading table...</p>}
      {error && <p style={{color: "red"}}>Error: {error}</p>}
      <div ref={containerRef} className="grid-sample" style={{height}} />
    </div>
  );
};

export default SimpleTable;
