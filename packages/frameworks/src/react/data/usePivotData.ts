import { useRef, useState, useEffect } from "react";
import { PivotDataViewModel, type GridDataViewModelOptions, type VTrackDef } from "grid/dist/renderer";
import type { PivotDataViewModelParams } from "grid/dist/renderer/pivot-data-viewmodel";
import type { SqlPivotDataModel } from "grid/dist/index";
import type { PivotConfig } from "grid/dist/index";

export interface UsePivotDataOptions {
  facetDefs?: GridDataViewModelOptions["facetDefs"];
  vTrackDefs?: VTrackDef[];
}

export interface UsePivotDataResult {
  viewModel: PivotDataViewModel | null;
  loading: boolean;
  error: Error | null;
}

export function usePivotData(
  model: SqlPivotDataModel | null,
  config: PivotConfig | null,
  options?: UsePivotDataOptions,
): UsePivotDataResult {
  const vmRef = useRef<PivotDataViewModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!model || !config) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    model.getViewModelData(config).then((result: PivotDataViewModelParams) => {
      if (cancelled) return;

      const vmOptions: GridDataViewModelOptions = {
        ...result.options,
        ...(options?.facetDefs && { facetDefs: options.facetDefs }),
        ...(options?.vTrackDefs && { vTrackDefs: options.vTrackDefs }),
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
  }, [model, config]);

  return { viewModel: vmRef.current, loading, error };
}
