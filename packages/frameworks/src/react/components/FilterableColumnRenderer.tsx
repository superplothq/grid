import React from "react";
import type { FacetCellProps } from "../types";
import { Sort } from "./Sort";
import { Filter } from "./Filter";
import { useDataModelContext } from "./DataModelContext";

export const FilterableColumnRenderer: React.FC<FacetCellProps> = ({ value, viewModel, render, container }) => {
  const { gridConfig } = useDataModelContext();
  const schema = viewModel.schema!.find((s) => s.displayName === value || s.name === value)!;
  if (!schema) {
    return <></>;
  }
  container.style.width = "100%";
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: "8px" }}>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{value}</span>
      <div style={{ display: "flex", alignItems: "center", gap: "2px", flexShrink: 0 }}>
        <Filter schema={schema} viewModel={viewModel} render={render} />
        {gridConfig.enableSorting && <Sort schema={schema} viewModel={viewModel} render={render} />}
      </div>
    </div>
  );
};
