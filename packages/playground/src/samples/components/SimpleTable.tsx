import React, {useEffect, useRef, useState} from "react";
import "grid/dist/grid.css";
import Grid, {FlattenedDataViewModel, GridDataViewModelOptions} from "grid/dist/renderer";
import {SqlFlatTableDataModel, FlatTableConfig, GetRowsIR, ColumnMetadata, Schema} from "grid/dist/index";
import {useDataSource} from "./DataSourceContext";

function buildSchema(columns: ColumnMetadata[]): Schema[] {
  return columns.map((col) => ({
    name: col.normColName,
    displayName: col.originalColName,
    type: (col.type === "INTEGER" || col.type === "DOUBLE" ? "measure" : "dimension") as Schema["type"],
  }));
}

interface SimpleTableProps {
  height?: string;
}

const SimpleTable: React.FC<SimpleTableProps> = ({height = "500px"}) => {
  const dsState = useDataSource();
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

      const dimensions = schema.filter((s) => s.type === "dimension").map((s) => s.name);
      const measures = schema.filter((s) => s.type === "measure").map((s) => s.name);

      const ir: GetRowsIR = {
        startRow: 0,
        endRow: 100,
        select: [],
        // groupBy: dimensions,
        groupBy: [],
        project: [...dimensions, ...measures],
        sort: [],
        filter: [],
      };

      const result = await model.getViewModelData(ir);
      if (cancelled) return;

      const options: GridDataViewModelOptions = {
        ...result.options,
        facetDefs: {
          row: [{text: ""}],
          col: [{text: ""}],
          axis: "col",
        },
      };

      const viewModel = new FlattenedDataViewModel(
        result.data, result.columnFacets, result.rowFacet, result.rowMeta, options,
      );

      if (!containerRef.current) return;
      const grid = new Grid({}, containerRef.current, "flat");
      grid.data = viewModel;
      grid.draw();
      setLoading(false);
    })().catch((err) => {
      if (!cancelled) {
        console.log(err);
        setError(String(err));
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [dsState]);

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
