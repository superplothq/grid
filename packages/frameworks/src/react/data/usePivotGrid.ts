import { useRef, useState, useEffect, useCallback, type FC, type ReactNode } from "react";
import { PivotDataViewModel, type GridDataViewModelOptions, type VTrackDef } from "grid/dist/renderer";
import { SqlPivotDataModel, type DataSchema, type PivotConfig } from "grid/dist/index";
import type { PivotDataViewModelParams } from "grid/dist/renderer/pivot-data-viewmodel";
import type { SqlDataSource } from "grid/dist/index";
import type { FacetDef } from "grid/dist/renderer";
import { ReactCellAdapter } from "../renderer-adapter";
import type { ColumnDef, ReactFacetDefs } from "../types";

export interface UsePivotGridOptions {
  dataSource: SqlDataSource;
  schema: DataSchema[];
  config: PivotConfig;
  columns?: ColumnDef[];
  facetDefs?: ReactFacetDefs;
  contextWrapper?: FC<{ children: ReactNode }>;
}

export interface UsePivotGridResult {
  viewModel: PivotDataViewModel | null;
  loading: boolean;
  error: Error | null;
  onCellRelease: (key: string, cell: HTMLElement) => void;
  onBeforeMeasure: () => void;
}

export function usePivotGrid(options: UsePivotGridOptions): UsePivotGridResult {
  const { dataSource, schema, config, columns, facetDefs, contextWrapper } = options;

  const modelRef = useRef<SqlPivotDataModel | null>(null);
  const adapterRef = useRef<ReactCellAdapter | null>(null);
  const vmRef = useRef<PivotDataViewModel | null>(null);
  const vTrackDefsRef = useRef<VTrackDef[] | undefined>(undefined);

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
      if (col.renderer) def.renderer = adapterRef.current!.createNativeDataCellRenderer(col.renderer);
      if (col.cellHeight !== undefined) def.cellHeight = col.cellHeight;
      if (col.sampleData !== undefined) def.sampleData = col.sampleData;
      if (col.colSize !== undefined) def.colSize = col.colSize;
      return def;
    });
  }

  const nativeFacetDefsRef = useRef<GridDataViewModelOptions["facetDefs"] | undefined>(undefined);
  if (!nativeFacetDefsRef.current && facetDefs) {
    const adapter = adapterRef.current!;
    const resolve = (defs: ReactFacetDefs["row"]): Partial<FacetDef>[] =>
      defs.map(({trackRenderer, headerRenderer, ...rest}) => {
        const native: Partial<FacetDef> = {...rest};
        if (trackRenderer) native.trackRenderer = adapter.createNativeFacetRenderer(trackRenderer);
        if (headerRenderer) native.headerRenderer = adapter.createNativeHeaderRenderer(headerRenderer);
        return native;
      });
    nativeFacetDefsRef.current = {
      row: resolve(facetDefs.row),
      col: resolve(facetDefs.col),
      axis: facetDefs.axis,
    };
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
        ...(nativeFacetDefsRef.current && { facetDefs: nativeFacetDefsRef.current }),
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

  const onBeforeMeasure = useCallback(() => {
    adapterRef.current?.flush();
  }, []);

  return { viewModel: vmRef.current, loading, error, onCellRelease, onBeforeMeasure };
}
