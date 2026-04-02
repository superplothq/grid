import React, { useCallback } from "react";
import type { GridDataViewModel } from "grid/dist/renderer";
import { FlattenedDataViewModel } from "grid/dist/renderer";
import type { DataSchema, SortEntry, SortDirection } from "grid/dist/index";
import { useDataModelContext } from "./DataModelContext";

const SORT_META_NS = "sort";

export interface SortProps {
  schema: DataSchema;
  viewModel: GridDataViewModel;
  render: (vm: GridDataViewModel) => void;
}

function getSortEntries(viewModel: GridDataViewModel): SortEntry[] {
  const meta = viewModel.metaState.get(SORT_META_NS);
  return (meta?.["entries"] as SortEntry[]) ?? [];
}

function getCurrentDirection(viewModel: GridDataViewModel, field: string): SortDirection | null {
  const entries = getSortEntries(viewModel);
  const entry = entries.find(e => e.field === field);
  return entry?.direction ?? null;
}

function cycleDirection(current: SortDirection | null): SortDirection | null {
  if (current === null) return "asc";
  if (current === "asc") return "desc";
  return null;
}

export const Sort: React.FC<SortProps> = ({ schema, viewModel, render }) => {
  const { model, ir } = useDataModelContext();
  const field = schema.name;
  const direction = getCurrentDirection(viewModel, field);

  const handleClick = useCallback(async () => {
    const currentEntries = getSortEntries(viewModel);
    const nextDir = cycleDirection(direction);

    let newEntries: SortEntry[];
    if (nextDir === null) {
      newEntries = currentEntries.filter(e => e.field !== field);
    } else {
      const existing = currentEntries.find(e => e.field === field);
      if (existing) {
        newEntries = currentEntries.map(e => e.field === field ? { ...e, direction: nextDir } : e);
      } else {
        newEntries = [...currentEntries, { field, direction: nextDir }];
      }
    }

    viewModel.metaState.set(SORT_META_NS, "entries", newEntries);

    const result = await model.getViewModelData({ ...ir, sort: newEntries });
    (viewModel as FlattenedDataViewModel).updateData(result);
    render(viewModel);
  }, [model, ir, viewModel, render, field, direction]);

  return (
    <span
      onClick={handleClick}
      style={{
        cursor: "pointer",
        opacity: direction ? 1 : 0.3,
        marginLeft: 4,
        fontSize: 10,
        userSelect: "none",
      }}
    >
      {direction === "desc" ? "▼" : "▲"}
    </span>
  );
};
