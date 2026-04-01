import { useRef, useState, useEffect, useCallback, type FC, type ReactNode } from "react";
import { FlattenedDataViewModel, type GridDataViewModelOptions, type VTrackDef } from "grid/dist/renderer";
import { SqlFlatTableDataModel, type FlattenedDataViewModelParams, type GetRowsIR, type FlatTableConfig, type DataSchema } from "grid/dist/index";
import type { SqlDataSource } from "grid/dist/index";
import type { FacetDef } from "grid/dist/renderer";
import { ReactCellAdapter } from "../renderer-adapter";
import type { ColumnDef, ReactFacetDefs } from "../types";

export interface UseFlatGridOptions {
  dataSource: SqlDataSource;
  schema: DataSchema[];
  config: FlatTableConfig;
  ir: GetRowsIR;
  columns?: ColumnDef[];
  facetDefs?: ReactFacetDefs;
  transformResult?: (result: FlattenedDataViewModelParams) => FlattenedDataViewModelParams;
  contextWrapper?: FC<{ children: ReactNode }>;
}

export interface UseFlatGridResult {
  viewModel: FlattenedDataViewModel | null;
  loading: boolean;
  error: Error | null;
  fetchPage: (startRow: number, endRow: number) => Promise<void>;
  onCellRelease: (key: string, cell: HTMLElement) => void;
}

export function useFlatGrid(options: UseFlatGridOptions): UseFlatGridResult {
  const { dataSource, schema, config, ir, columns, facetDefs, transformResult, contextWrapper } = options;

  const modelRef = useRef<SqlFlatTableDataModel | null>(null);
  const adapterRef = useRef<ReactCellAdapter | null>(null);
  const vmRef = useRef<FlattenedDataViewModel | null>(null);
  const vTrackDefsRef = useRef<VTrackDef[] | undefined>(undefined);
  const irRef = useRef(ir);
  irRef.current = ir;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  if (!modelRef.current) {
    modelRef.current = new SqlFlatTableDataModel(config, schema, dataSource);
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

  const transformResultRef = useRef(transformResult);
  transformResultRef.current = transformResult;

  const applyResult = useCallback((rawResult: FlattenedDataViewModelParams) => {
    const result = transformResultRef.current ? transformResultRef.current(rawResult) : rawResult;
    const vmOptions: GridDataViewModelOptions = {
      ...result.options,
      ...(nativeFacetDefsRef.current && { facetDefs: nativeFacetDefsRef.current }),
      ...(vTrackDefsRef.current && { vTrackDefs: vTrackDefsRef.current }),
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
    const model = modelRef.current;
    if (!model) return;
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
  }, [ir, applyResult]);

  useEffect(() => {
    return () => {
      adapterRef.current?.dispose();
    };
  }, []);

  const fetchPage = useCallback(async (startRow: number, endRow: number) => {
    const model = modelRef.current;
    if (!model || !irRef.current) return;
    const pageIR: GetRowsIR = { ...irRef.current, startRow, endRow };
    const result = await model.getViewModelData(pageIR);
    applyResult(result);
  }, [applyResult]);

  const onCellRelease = useCallback((key: string) => {
    adapterRef.current?.handleCellRelease(key);
  }, []);

  return { viewModel: vmRef.current, loading, error, fetchPage, onCellRelease };
}
