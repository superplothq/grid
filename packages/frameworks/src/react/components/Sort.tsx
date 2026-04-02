import React, { useCallback, useState } from "react";
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

function formatDirectionLabel(dir: SortDirection | null): string {
  if (dir === "asc") return "Ascending";
  if (dir === "desc") return "Descending";
  return "Unsorted";
}

function buildTooltip(field: string, direction: SortDirection | null, allEntries: SortEntry[]): string {
  const lines: string[] = [];
  lines.push(`${field}: ${formatDirectionLabel(direction)}`);
  if (allEntries.length > 0) {
    lines.push("");
    lines.push("Active sorts:");
    for (const e of allEntries) {
      lines.push(`  ${e.field}: ${formatDirectionLabel(e.direction)}`);
    }
  }
  lines.push("");
  const cmdKey = navigator.platform.includes("Mac") ? "\u2318" : "\u229E";
  lines.push("Click: Single sort");
  lines.push(`${cmdKey}+Click: Reset sort`);
  lines.push("\u21E7+Click: Multi sort");
  return lines.join("\n");
}

export const Sort: React.FC<SortProps> = ({ schema, viewModel, render }) => {
  const { model, ir } = useDataModelContext();
  const field = schema.name;
  const direction = getCurrentDirection(viewModel, field);
  const [tooltip, setTooltip] = useState("");

  const handleMouseEnter = useCallback(() => {
    const entries = getSortEntries(viewModel);
    setTooltip(buildTooltip(field, direction, entries));
  }, [viewModel, field, direction]);

  const handleClick = useCallback(async (e: React.MouseEvent) => {
    const currentEntries = getSortEntries(viewModel);

    let newEntries: SortEntry[];

    if (e.metaKey) {
      newEntries = currentEntries.filter(entry => entry.field !== field);
    } else if (e.shiftKey) {
      const nextDir = cycleDirection(direction);
      if (nextDir === null) {
        newEntries = currentEntries.filter(entry => entry.field !== field);
      } else {
        const existing = currentEntries.find(entry => entry.field === field);
        if (existing) {
          newEntries = currentEntries.map(entry => entry.field === field ? { ...entry, direction: nextDir } : entry);
        } else {
          newEntries = [...currentEntries, { field, direction: nextDir }];
        }
      }
    } else {
      const nextDir = cycleDirection(direction);
      if (nextDir === null) {
        newEntries = [];
      } else {
        newEntries = [{ field, direction: nextDir }];
      }
    }

    viewModel.metaState.set(SORT_META_NS, "entries", newEntries);

    const result = await model.getViewModelData({ ...ir, sort: newEntries });
    (viewModel as FlattenedDataViewModel).updateData(result);
    render(viewModel);
  }, [model, ir, viewModel, render, field, direction]);

  const faded = 0.25;
  const solid = 0.9;
  const upOpacity = direction === "asc" ? solid : faded;
  const downOpacity = direction === "desc" ? solid : faded;

  return (
    <svg
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      width="10"
      height="14"
      viewBox="0 0 10 14"
      style={{ cursor: "pointer", marginLeft: 4, userSelect: "none" }}
    >
      <title>{tooltip}</title>
      <path d="M5 0.5 L9 5.5 L1 5.5 Z" fill="currentColor" opacity={upOpacity} />
      <path d="M5 13.5 L9 8.5 L1 8.5 Z" fill="currentColor" opacity={downOpacity} />
    </svg>
  );
};
