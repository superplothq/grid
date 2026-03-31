import { useRef, useState, useEffect, useCallback, type FC, type ReactNode } from "react";
import { PivotDataViewModel, type GridDataViewModelOptions, type VTrackDef } from "grid/dist/renderer";
import { SqlPivotDataModel, type DataSchema, type PivotConfig } from "grid/dist/index";
import type { PivotDataViewModelParams } from "grid/dist/renderer/pivot-data-viewmodel";
import type { SqlDataSource } from "grid/dist/index";
import { ReactCellAdapter } from "../renderer-adapter";
import type { ColumnDef } from "../types";

export interface UsePivotGridOptions {
  dataSource: SqlDataSource;
  schema: DataSchema[];
  config: PivotConfig;
  columns?: ColumnDef[];
  facetDefs?: GridDataViewModelOptions["facetDefs"];
  contextWrapper?: FC<{ children: ReactNode }>;
}

export interface UsePivotGridResult {
  viewModel: PivotDataViewModel | null;
  loading: boolean;
  error: Error | null;
  onCellRelease: (key: string, cell: HTMLElement) => void;
}

export function usePivotGrid(options: UsePivotGridOptions): UsePivotGridResult {
  const { dataSource, schema, config, columns, facetDefs, contextWrapper } = options;

  const modelRef = useRef<SqlPivotDataModel | null>(null);
  const adapterRef = useRef<ReactCellAdapter | null>(null);
  const vmRef = useRef<PivotDataViewModel | null>(null);
  const vTrackDefsRef = useRef<VTrackDef[] | undefined>(undefined);
  const facetDefsRef = useRef(facetDefs);
  facetDefsRef.current = facetDefs;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  if (!modelRef.current) {
    modelRef.current = new SqlPivotDataModel(schema, dataSource);
  }

  if (!adapterRef.current) {
    adapterRef.current = new ReactCellAdapter(contextWrapper);
  }

  if (!vTrackDefsRef.current && columns) {
    vTrackDefsRef.current = columns.map((col) => {
      const def: VTrackDef = {};
      if (col.renderer) def.renderer = adapterRef.current!.createNativeRenderer(col.renderer);
      if (col.cellHeight !== undefined) def.cellHeight = col.cellHeight;
      if (col.sampleData !== undefined) def.sampleData = col.sampleData;
      if (col.colSize !== undefined) def.colSize = col.colSize;
      return def;
    });
  }

  useEffect(() => {
    const model = modelRef.current;
    if (!model) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    model.getViewModelData(config).then((result: PivotDataViewModelParams) => {
      if (cancelled) return;

      const vmOptions: GridDataViewModelOptions = {
        ...result.options,
        ...(facetDefsRef.current && { facetDefs: facetDefsRef.current }),
        ...(vTrackDefsRef.current && { vTrackDefs: vTrackDefsRef.current }),
      };

      if (!vmRef.current) {
        vmRef.current = new PivotDataViewModel({
          ...result,
          options: vmOptions,
        });
      } else {
        vmRef.current.updateData({
          ...result,
          options: vmOptions,
        });
      }
      setLoading(false);
    }).catch((err: unknown) => {
      if (!cancelled) {
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [config]);

  useEffect(() => {
    return () => {
      adapterRef.current?.dispose();
    };
  }, []);

  const onCellRelease = useCallback((key: string) => {
    adapterRef.current?.handleCellRelease(key);
  }, []);

  return { viewModel: vmRef.current, loading, error, onCellRelease };
}
