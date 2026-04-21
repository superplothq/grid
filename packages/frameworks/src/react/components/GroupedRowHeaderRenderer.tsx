import React, { useCallback, useEffect, useRef, useState } from "react";
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

const pathKey = (p: string[]): string => p.join("\0");

const ExpandAllButton: React.FC<ExpandAllButtonProps> = ({ depth, viewModel, render }) => {
  const { model, grid, expandAction, collapseAction } = useDataModelContext();
  const [loading, setLoading] = useState(false);
  const [isExpandedAll, setIsExpandedAll] = useState(false);
  const busyRef = useRef(false);
  const seenPathsRef = useRef<Set<string>>(new Set());

  const collectRowsAtDepth = useCallback((): { path: string[]; meta: FlatRowMeta }[] => {
    const vp = viewModel.viewport;
    if (vp.y1 <= vp.y0) return [];
    const slice = viewModel.getSlice(0, vp.y0, 1, vp.y1) as FlatSliceResult;
    const rows: { path: string[]; meta: FlatRowMeta }[] = [];
    for (let i = 0; i < slice.rowMeta.length; i++) {
      const m = slice.rowMeta[i];
      if (m.depth !== depth || m.isLeaf) continue;
      rows.push({ path: viewModel.getSelectPath(vp.y0 + i), meta: m });
    }
    return rows;
  }, [viewModel, depth]);

  const applyInViewport = useCallback(async (mode: "expand" | "collapse", onlyNewPaths: boolean): Promise<void> => {
    const rows = collectRowsAtDepth();
    const paths: string[][] = [];
    for (const { path, meta } of rows) {
      const key = pathKey(path);
      if (onlyNewPaths && seenPathsRef.current.has(key)) continue;
      if (mode === "expand" && !meta.isExpanded) paths.push(path);
      else if (mode === "collapse" && meta.isExpanded) paths.push(path);
      seenPathsRef.current.add(key);
    }
    if (paths.length === 0) return;
    if (expandAction && collapseAction) {
      for (const path of paths) {
        if (mode === "expand") await expandAction(path);
        else await collapseAction(path);
      }
    } else {
      let result: FlattenedDataViewModelParams | undefined;
      for (const path of paths) {
        result = mode === "expand"
          ? await model.expandAndGetData(path)
          : await model.collapseAndGetData(path);
      }
      if (result) viewModel.updateData(result);
      render(viewModel);
    }
  }, [model, viewModel, render, collectRowsAtDepth, expandAction, collapseAction]);

  const collapseAllSeen = useCallback(async (): Promise<void> => {
    const paths = Array.from(seenPathsRef.current).map(s => s.split("\0"));
    if (paths.length === 0) return;
    if (collapseAction) {
      for (const path of paths) {
        await collapseAction(path);
      }
    } else {
      let result: FlattenedDataViewModelParams | undefined;
      for (const path of paths) {
        result = await model.collapseAndGetData(path);
      }
      if (result) viewModel.updateData(result);
      render(viewModel);
    }
  }, [model, viewModel, render, collapseAction]);

  const handleClick = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setLoading(true);
    if (isExpandedAll) {
      await collapseAllSeen();
      seenPathsRef.current = new Set();
      setIsExpandedAll(false);
    } else {
      seenPathsRef.current = new Set();
      await applyInViewport("expand", false);
      setIsExpandedAll(true);
    }
    busyRef.current = false;
    setLoading(false);
  }, [isExpandedAll, applyInViewport, collapseAllSeen]);

  useEffect(() => {
    if (!isExpandedAll) return;
    const unsub = grid.on("viewModelDataChanged", () => {
      if (busyRef.current) return;
      busyRef.current = true;
      applyInViewport("expand", true).finally(() => {
        busyRef.current = false;
      });
    });
    return unsub;
  }, [isExpandedAll, grid, applyInViewport]);

  return (
    <span
      onClick={handleClick}
      style={{cursor: loading ? "wait" : "pointer", display: "inline-flex", alignItems: "center", flexShrink: 0, opacity: loading ? 0.4 : 0.9}}
    >
      {isExpandedAll ? <MinusIcon /> : <PlusIcon />}
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
