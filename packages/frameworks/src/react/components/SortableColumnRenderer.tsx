import React from "react";
import type { FacetCellProps } from "../types";
import { Sort } from "./Sort";

export const SortableColumnRenderer: React.FC<FacetCellProps> = ({ value, viewModel, render, container }) => {
  const schema = viewModel.schema!.find(s => s.displayName === value || s.name === value)!;
  if (!schema) {
    return <></>;
  }
  container.style.width = "100%";
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: "8px" }}>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{value}</span>
      <Sort schema={schema} viewModel={viewModel} render={render} />
    </div>
  );
};
