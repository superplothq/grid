import { useRef, useState, useEffect, useCallback, type FC, type ReactNode } from "react";
import { FlattenedDataViewModel, type GridDataViewModelOptions, type VTrackDef } from "grid/dist/renderer";
import type { FacetPredicate, SelectionProps, ColAutoSizeConfig } from "grid/dist/renderer";
import { SqlFlatTableDataModel, type FlattenedDataViewModelParams, type GetRowsIR, type FlatTableConfig, type DataSchema } from "grid/dist/index";
import type { SqlDataSource } from "grid/dist/index";
import type { FacetDef } from "grid/dist/renderer";
import { ReactCellAdapter } from "../renderer-adapter";
import type { ColumnDef, CellProps, FacetCellProps, DataGridHandle, ReactFacetDefs } from "../types";

export interface SelectionDef {
  predicate: FacetPredicate;
  trackRenderer?: FC<FacetCellProps>;
  cellRenderer?: FC<CellProps>;
  colSize?: ColAutoSizeConfig;
}

export interface UseFlatGridOptions {
  dataSource: SqlDataSource;
  schema: DataSchema[];
  config: FlatTableConfig;
  ir: GetRowsIR;
  columns?: ColumnDef[];
  facetDefs?: ReactFacetDefs;
  selections?: SelectionDef[];
  transformResult?: (result: FlattenedDataViewModelParams) => FlattenedDataViewModelParams;
  contextWrapper?: FC<{ children: ReactNode }>;
}

export type TransformFn = (val: any) => any;

export interface GridBindings {
  ref: React.RefObject<DataGridHandle>;
  data: FlattenedDataViewModel | null;
  onCellRelease: (key: string, cell: HTMLElement) => void;
  onBeforeMeasure: () => void;
}

export interface UseFlatGridResult {
  bindings: GridBindings;
  viewModel: FlattenedDataViewModel | null;
  gridRef: React.RefObject<DataGridHandle>;
  loading: boolean;
  error: Error | null;
  fetchPage: (startRow: number, endRow: number) => Promise<void>;
  applyTransform: (colIndex: number, fn: TransformFn) => void;
  resetTransform: (colIndex: number) => void;
}

export function useFlatGrid(options: UseFlatGridOptions): UseFlatGridResult {
  const { dataSource, schema, config, ir, columns, facetDefs, selections, transformResult, contextWrapper } = options;

  const modelRef = useRef<SqlFlatTableDataModel | null>(null);
  const adapterRef = useRef<ReactCellAdapter | null>(null);
  const vmRef = useRef<FlattenedDataViewModel | null>(null);
  const vTrackDefsRef = useRef<VTrackDef[] | undefined>(undefined);
  const gridRef = useRef<DataGridHandle>(null);
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

  const lastRawResultRef = useRef<FlattenedDataViewModelParams | null>(null);
  const columnTransformsRef = useRef<Map<number, TransformFn>>(new Map());

  const applyResult = useCallback((rawResult: FlattenedDataViewModelParams) => {
    lastRawResultRef.current = rawResult;
    const result = transformResultRef.current ? transformResultRef.current(rawResult) : rawResult;

    const transforms = columnTransformsRef.current;
    let data = result.data;
    if (transforms.size > 0) {
      data = data.map((col, i) => {
        const fn = transforms.get(i);
        if (!fn) return col;
        return col.map(fn);
      });
    }

    const vmOptions: GridDataViewModelOptions = {
      ...result.options,
      ...(nativeFacetDefsRef.current && { facetDefs: nativeFacetDefsRef.current }),
      ...(vTrackDefsRef.current && { vTrackDefs: vTrackDefsRef.current }),
    };

    if (!vmRef.current) {
      vmRef.current = new FlattenedDataViewModel({
        ...result,
        data,
        options: vmOptions,
      });
    } else {
      vmRef.current.updateData({
        ...result,
        data,
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

  useEffect(() => {
    const grid = gridRef.current?.grid;
    if (!grid || !vmRef.current || !selections || selections.length === 0) return;

    const adapter = adapterRef.current!;
    const undos = selections.map((sel) => {
      const props: SelectionProps = {};
      if (sel.trackRenderer) props.trackRenderer = adapter.createNativeFacetRenderer(sel.trackRenderer);
      if (sel.cellRenderer) props.cellRenderer = adapter.createNativeDataCellRenderer(sel.cellRenderer);
      if (sel.colSize) props.colSize = sel.colSize;
      return grid.selectAll(sel.predicate).prop(props);
    });

    return () => { for (const s of undos) s.undo(); };
  }, [selections, loading]);

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

  const onBeforeMeasure = useCallback(() => {
    adapterRef.current?.flush();
  }, []);

  const applyTransform = useCallback((colIndex: number, fn: TransformFn) => {
    columnTransformsRef.current.set(colIndex, fn);
    if (lastRawResultRef.current) applyResult(lastRawResultRef.current);
  }, [applyResult]);

  const resetTransform = useCallback((colIndex: number) => {
    columnTransformsRef.current.delete(colIndex);
    if (lastRawResultRef.current) applyResult(lastRawResultRef.current);
  }, [applyResult]);

  const bindings: GridBindings = { ref: gridRef, data: vmRef.current, onCellRelease, onBeforeMeasure };

  return { bindings, viewModel: vmRef.current, gridRef, loading, error, fetchPage, applyTransform, resetTransform };
}
