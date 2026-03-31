import { useRef, useState, useEffect, useCallback } from "react";
import { FlattenedDataViewModel, type GridDataViewModelOptions, type VTrackDef } from "grid/dist/renderer";
import type { SqlFlatTableDataModel, FlattenedDataViewModelParams, GetRowsIR } from "grid/dist/index";

export interface UseFlatDataOptions {
  facetDefs?: GridDataViewModelOptions["facetDefs"];
  vTrackDefs?: VTrackDef[];
}

export interface UseFlatDataResult {
  viewModel: FlattenedDataViewModel | null;
  loading: boolean;
  error: Error | null;
  fetchPage: (startRow: number, endRow: number) => Promise<void>;
}

export function useFlatData(
  model: SqlFlatTableDataModel | null,
  ir: GetRowsIR | null,
  options?: UseFlatDataOptions,
): UseFlatDataResult {
  const vmRef = useRef<FlattenedDataViewModel | null>(null);
  const irRef = useRef(ir);
  irRef.current = ir;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const applyResult = useCallback((result: FlattenedDataViewModelParams) => {
    const opts = optionsRef.current;
    const vmOptions: GridDataViewModelOptions = {
      ...result.options,
      ...(opts?.facetDefs && { facetDefs: opts.facetDefs }),
      ...(opts?.vTrackDefs && { vTrackDefs: opts.vTrackDefs }),
    };

    if (!vmRef.current) {
      vmRef.current = new FlattenedDataViewModel({
        ...result,
        options: vmOptions,
      });
    } else {
      vmRef.current.updateData({
        ...result,
        options: vmOptions,
      });
    }
  }, []);

  useEffect(() => {
    if (!model || !ir) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    model.getViewModelData(ir).then((result: FlattenedDataViewModelParams) => {
      if (cancelled) return;
      applyResult(result);
      setLoading(false);
    }).catch((err: unknown) => {
      if (!cancelled) {
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [model, ir, applyResult]);

  const fetchPage = useCallback(async (startRow: number, endRow: number) => {
    if (!model || !irRef.current) return;
    const pageIR: GetRowsIR = { ...irRef.current, startRow, endRow };
    const result = await model.getViewModelData(pageIR);
    applyResult(result);
  }, [model, applyResult]);

  return { viewModel: vmRef.current, loading, error, fetchPage };
}
