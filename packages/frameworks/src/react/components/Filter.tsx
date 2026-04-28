import React, { useCallback, useState, useRef } from "react";
import { createPortal } from "react-dom";
import type { GridDataViewModel } from "grid/dist/renderer";
import type { DataSchema, ScalarFilter, ColumnRangeValues } from "grid/dist/index";
import { useDataModelContext } from "./DataModelContext";
import { FilterDropdown } from "./FilterDropdown";

const FILTER_META_NS = "filter";

export interface FilterProps {
  schema: DataSchema;
  viewModel: GridDataViewModel;
  render: (vm: GridDataViewModel) => void;
}

function getFilterEntries(viewModel: GridDataViewModel): Map<string, ScalarFilter[]> {
  const meta = viewModel.metaState.get(FILTER_META_NS);
  return (meta?.["entries"] as Map<string, ScalarFilter[]>) ?? new Map();
}

function hasActiveFilter(viewModel: GridDataViewModel, field: string): boolean {
  const entries = getFilterEntries(viewModel);
  const filters = entries.get(field);
  return !!filters && filters.length > 0;
}

export const Filter: React.FC<FilterProps> = ({ schema, viewModel, render }) => {
  const { filterAction, getRangeOfColumn, gridConfig } = useDataModelContext();
  const field = schema.name;
  const isActive = hasActiveFilter(viewModel, field);
  const [open, setOpen] = useState(false);
  const [domain, setDomain] = useState<ColumnRangeValues | null>(null);
  const iconRef = useRef<SVGSVGElement>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (open) {
      setOpen(false);
      return;
    }
    if (iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect();
      const popoverWidth = 280;
      const popoverMaxHeight = 400;
      let top = rect.bottom + 4;
      let left = rect.left;
      if (left + popoverWidth > window.innerWidth) {
        left = window.innerWidth - popoverWidth - 8;
      }
      if (left < 8) left = 8;
      if (top + popoverMaxHeight > window.innerHeight) {
        top = rect.top - popoverMaxHeight - 4;
        if (top < 8) top = 8;
      }
      setPopoverPos({ top, left });
    }
    setOpen(true);
    setDomain(null);
    if (getRangeOfColumn && schema.type === "dimension" && schema.cardinality === "low") {
      getRangeOfColumn(field).then(setDomain);
    }
  }, [open, getRangeOfColumn, field, schema]);

  const currentFilters = getFilterEntries(viewModel).get(field) ?? [];

  const handleApply = useCallback(async (filters: ScalarFilter[]) => {
    const entries = getFilterEntries(viewModel);
    const updated = new Map(entries);
    updated.set(field, filters);
    viewModel.metaState.set(FILTER_META_NS, "entries", updated);

    const allFilters: ScalarFilter[] = [];
    updated.forEach((f) => allFilters.push(...f));

    if (filterAction) {
      await filterAction(allFilters);
    }
    setOpen(false);
  }, [viewModel, field, filterAction]);

  const handleClear = useCallback(async () => {
    const entries = getFilterEntries(viewModel);
    const updated = new Map(entries);
    updated.delete(field);
    viewModel.metaState.set(FILTER_META_NS, "entries", updated);

    const allFilters: ScalarFilter[] = [];
    updated.forEach((f) => allFilters.push(...f));

    if (filterAction) {
      await filterAction(allFilters);
    }
    setOpen(false);
  }, [viewModel, field, filterAction]);

  const faded = 0.25;
  const solid = 0.9;
  const opacity = isActive ? solid : faded;

  return (
    <>
      <svg
        ref={iconRef}
        onClick={handleClick}
        width="10"
        height="10"
        viewBox="0 0 10 10"
        style={{ cursor: "pointer", userSelect: "none", flexShrink: 0 }}
      >
        <path d="M0 1 L10 1 L6 5 L6 9 L4 8 L4 5 Z" fill="currentColor" opacity={opacity} />
      </svg>
      {open && createPortal(
        <>
          <div
            style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }}
            onClick={() => setOpen(false)}
          />
          <div style={{ position: "fixed", top: popoverPos.top, left: popoverPos.left, zIndex: 1000 }}>
            <FilterDropdown
              schema={schema}
              domain={domain}
              currentFilters={currentFilters}
              onApply={handleApply}
              onClear={handleClear}
              onClose={() => setOpen(false)}
              theme={gridConfig.theme}
            />
          </div>
        </>,
        document.body
      )}
    </>
  );
};
