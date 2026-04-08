import React, { useCallback, useRef, useState } from "react";
import type { FacetHeaderProps } from "../types";
import type { FlatSliceResult, FlatRowMeta } from "grid/dist/renderer";
import { FlattenedDataViewModel } from "grid/dist/renderer";
import type { FlattenedDataViewModelParams } from "grid/dist/index";
import { Sort } from "./Sort";
import { useDataModelContext } from "./DataModelContext";

const PlusIcon: React.FC<{size?: number}> = ({size = 9}) => (
  <svg width={size} height={size} viewBox="0 0 16 16" style={{display: "block"}}>
    <rect x="0.5" y="0.5" width="15" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="1" />
    <line x1="4" y1="8" x2="12" y2="8" stroke="currentColor" strokeWidth="1.5" />
    <line x1="8" y1="4" x2="8" y2="12" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

const MinusIcon: React.FC<{size?: number}> = ({size = 9}) => (
  <svg width={size} height={size} viewBox="0 0 16 16" style={{display: "block"}}>
    <rect x="0.5" y="0.5" width="15" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="1" />
    <line x1="4" y1="8" x2="12" y2="8" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

const Chevron: React.FC = () => (
  <svg width="6" height="10" viewBox="0 0 6 10" style={{display: "block", flexShrink: 0, opacity: 0.4}}>
    <path d="M1 1 L5 5 L1 9" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

interface ExpandAllButtonProps {
  depth: number;
  viewModel: FlattenedDataViewModel;
  render: (vm: FlattenedDataViewModel) => void;
}

const ExpandAllButton: React.FC<ExpandAllButtonProps> = ({ depth, viewModel, render }) => {
  const { model } = useDataModelContext();
  const [loading, setLoading] = useState(false);
  const busyRef = useRef(false);

  const hasExpandedAtDepth = useCallback(() => {
    const slice = viewModel.getSlice(0, 0, 1, viewModel.numRows) as FlatSliceResult;
    return slice.rowMeta.some((m: FlatRowMeta) => m.depth === depth && !m.isLeaf && m.isExpanded);
  }, [viewModel, depth]);

  const handleClick = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setLoading(true);

    const slice = viewModel.getSlice(0, 0, 1, viewModel.numRows) as FlatSliceResult;
    const isCollapsing = hasExpandedAtDepth();

    const paths: string[][] = [];
    for (let i = 0; i < slice.rowMeta.length; i++) {
      const m = slice.rowMeta[i];
      if (m.depth !== depth || m.isLeaf) continue;
      if ((isCollapsing && m.isExpanded) || (!isCollapsing && !m.isExpanded)) {
        paths.push(viewModel.getSelectPath(i));
      }
    }

    let result: FlattenedDataViewModelParams | undefined;
    for (const path of paths) {
      result = isCollapsing
        ? await model.collapseData(path)
        : await model.expandData(path);
    }
    if (result) viewModel.updateData(result);

    render(viewModel);
    busyRef.current = false;
    setLoading(false);
  }, [model, viewModel, render, depth, hasExpandedAtDepth]);

  return (
    <span
      onClick={handleClick}
      style={{cursor: loading ? "wait" : "pointer", display: "inline-flex", alignItems: "center", flexShrink: 0, opacity: loading ? 0.4 : 0.9}}
    >
      {hasExpandedAtDepth() ? <MinusIcon /> : <PlusIcon />}
    </span>
  );
};

export const GroupedRowHeaderRenderer: React.FC<FacetHeaderProps> = ({ text, viewModel, render, container }) => {
  const { gridConfig } = useDataModelContext();
  container.style.width = "100%";
  const fields = text.split("\0");
  const groupSchema = viewModel.facetDefs.row[0].groupSchema;
  const flatVM = viewModel as FlattenedDataViewModel;

  return (
    <div style={{display: "flex", flexDirection: "column", width: "100%", overflow: "hidden", gap: 0}}>
      {fields.map((field, i) => {
        const schema = groupSchema?.[i];
        const isLast = i === fields.length - 1;
        return (
          <div key={field} style={{display: "flex", alignItems: "center", gap: 4, paddingLeft: i * 16, minWidth: 0, overflow: "hidden", position: "relative"}}>
            {i > 0 && (
              <span style={{
                position: "absolute",
                left: (i - 1) * 16 + 4,
                top: 0,
                height: "50%",
                width: 12,
                borderLeft: "1px solid rgba(0,0,0,0.15)",
                borderBottom: "1px solid rgba(0,0,0,0.15)",
                borderBottomLeftRadius: 3,
                pointerEvents: "none",
              }} />
            )}
            <ExpandAllButton depth={i} viewModel={flatVM} render={render as (vm: FlattenedDataViewModel) => void} />
            <span style={{flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0}}>
              {schema?.displayName ?? field}
            </span>
            {gridConfig.enableSorting && schema && (
              <span style={{flexShrink: 0}}>
                <Sort schema={schema} viewModel={viewModel} render={render} />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};
