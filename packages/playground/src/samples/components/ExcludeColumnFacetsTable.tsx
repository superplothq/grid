import React, {useCallback, useRef, useState} from "react";
import Grid, {VTrackDef} from "grid/dist/renderer";
import {ColumnMetadata} from "grid/dist/index";
import SimpleTable from "./SimpleTable";
import {useDataSource} from "./DataSourceContext";

const TARGET_COLUMN = "Leave Status as of June 30";

function buildVTrackDefs(columns: ColumnMetadata[], exclude: boolean): VTrackDef[] {
  return columns.map((col) => {
    if (col.originalColName === TARGET_COLUMN) {
      return {colSize: {strategy: "max-cell" as const, excludeColumnFacets: exclude}};
    }
    return {};
  });
}

const ExcludeColumnFacetsTable: React.FC<{height?: string}> = ({height = "500px"}) => {
  const [exclude, setExclude] = useState(true);
  const dsState = useDataSource();
  const colIndexRef = useRef(-1);

  const columns = dsState.status === "ready" ? dsState.columns : [];

  const handleGridReady = useCallback((grid: Grid) => {
    const idx = columns.findIndex((col) => col.originalColName === TARGET_COLUMN);
    colIndexRef.current = idx;
    if (idx >= 0) {
      const unsub = grid.on("renderComplete", () => {
        unsub();
        grid.scrollTo("column", idx);
      });
    }
  }, [columns]);

  return (
    <div>
      <div style={{display: "flex", gap: "8px", marginBottom: "8px"}}>
        <button className="sample-btn" onClick={() => setExclude((v) => !v)}>
          excludeColumnFacets: {exclude ? "ON" : "OFF"}
        </button>
      </div>
      <SimpleTable
        key={String(exclude)}
        height={height}
        vTrackDefs={columns.length > 0 ? buildVTrackDefs(columns, exclude) : undefined}
        onGridReady={handleGridReady}
      />
    </div>
  );
};

export default ExcludeColumnFacetsTable;
