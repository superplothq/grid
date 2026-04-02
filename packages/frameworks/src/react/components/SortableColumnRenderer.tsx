import React from "react";
import type { FacetCellProps } from "../types";
import { Sort } from "./Sort";

export const SortableColumnRenderer: React.FC<FacetCellProps> = ({ value, viewModel, render }) => {
  const schema = viewModel.schema!.find(s => s.displayName === value || s.name === value)!;
  if (!schema) {
    return <></>;
  }
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
      <span>{value}</span>
      <Sort schema={schema} viewModel={viewModel} render={render} />
    </div>
  );
};
