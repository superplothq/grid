import React, { useRef, useState, useEffect, useCallback, createElement, type FC, type ReactNode } from "react";
import { FlattenedDataViewModel, type GridDataViewModelOptions, type VTrackDef } from "grid/dist/renderer";
import type { FacetPredicate, SelectionProps, ColAutoSizeConfig } from "grid/dist/renderer";
import { SqlStandardTableDataModel, type FlattenedDataViewModelParams, type StandardDataFetchAndTransformIR, type StandardTableConfig, type DataSchema, type SortEntry, type ScalarFilter, type ColumnRangeValues } from "grid/dist/index";
import type { SqlDataSource } from "grid/dist/index";
import type { FacetDef } from "grid/dist/renderer";
import { ReactCellAdapter } from "../renderer-adapter";
import type { ColumnDef, CellProps, FacetCellProps, DataGridHandle, ReactFacetDefs, ReactFacetDef } from "../types";
import { SortableColumnRenderer } from "../components/SortableColumnRenderer";
import { FilterableColumnRenderer } from "../components/FilterableColumnRenderer";
import { GroupedRowHeaderRenderer } from "../components/GroupedRowHeaderRenderer";
import { DataModelContext } from "../components/DataModelContext";

const DEFAULT_PAGE_SIZE = 10000;

export interface SelectionDef {
  predicate: FacetPredicate;
  trackRenderer?: FC<FacetCellProps>;
  cellRenderer?: FC<CellProps>;
  colSize?: ColAutoSizeConfig;
}

export interface UseFlatGridOptions {
  dataSource: SqlDataSource;
  schema: DataSchema[];
  config: Partial<StandardTableConfig>;
  ir: StandardDataFetchAndTransformIR;
  columns?: ColumnDef[];
  facetDefs?: ReactFacetDefs;
  selections?: SelectionDef[];
  transformResult?: (result: FlattenedDataViewModelParams) => FlattenedDataViewModelParams;
  contextWrapper?: FC<{ children: ReactNode }>;
  enableSorting?: boolean;
  enableFiltering?: boolean;
  enablePageView?: boolean;
  displayPageSize?: number;
  theme?: string;
}

export type TransformFn = (val: any) => any;

export interface GridBindings {
  ref: React.RefObject<DataGridHandle>;
  data: FlattenedDataViewModel | null;
  pageLoadingInProgress: boolean;
  onCellRelease: (key: string, cell: HTMLElement) => void;
  onBeforeMeasure: () => void;
}

export interface PageViewState {
  currentPage: number;
  totalPages: number;
  displayPageSize: number;
  datasetTotalRows: number;
  loading: boolean;
  goToPage: (page: number) => Promise<void>;
  setDisplayPageSize: (size: number) => void;
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
  pageView: PageViewState | null;
}

export function useFlatGrid(options: UseFlatGridOptions): UseFlatGridResult {
  const { dataSource, schema, config, ir, columns, facetDefs, selections, transformResult, contextWrapper, enableSorting, enableFiltering, enablePageView, displayPageSize, theme } = options;

  const modelRef = useRef<SqlStandardTableDataModel | null>(null);
  const adapterRef = useRef<ReactCellAdapter | null>(null);
  const vmRef = useRef<FlattenedDataViewModel | null>(null);
  const vTrackDefsRef = useRef<VTrackDef[] | undefined>(undefined);
  const gridRef = useRef<DataGridHandle>(null);
  const irRef = useRef(ir);
  irRef.current = ir;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [pageLoadingInProgress, setPageLoadingInProgress] = useState(false);
  const inFlightCountRef = useRef(0);

  const [currentPage, setCurrentPage] = useState(0);
  const [datasetTotalRows, setDatasetTotalRows] = useState(0);
  const [activePageSize, setActivePageSize] = useState(displayPageSize ?? config.pageSize ?? DEFAULT_PAGE_SIZE);

  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;
  const activePageSizeRef = useRef(activePageSize);
  activePageSizeRef.current = activePageSize;

  // The "active IR" accumulates runtime modifications (sort, filter, etc.) on top of
  // the prop IR. All page-view operations read from this so that page navigation,
  // expand, and collapse preserve sort/filter state across fetches.
  const activeIRRef = useRef<StandardDataFetchAndTransformIR>(ir);
  activeIRRef.current = { ...ir, sort: activeIRRef.current.sort, filter: activeIRRef.current.filter };

  const sortActionRef = useRef<(entries: SortEntry[]) => Promise<void>>(async () => {});
  const filterActionRef = useRef<(filters: ScalarFilter[]) => Promise<void>>(async () => {});
  const getRangeOfColumnRef = useRef<(field: string) => Promise<ColumnRangeValues>>(async () => ({ type: "categorical" as const, values: [] }));
  const expandActionRef = useRef<(selectPath: string[]) => Promise<void>>(async () => {});
  const collapseActionRef = useRef<(selectPath: string[]) => Promise<void>>(async () => {});

  if (!modelRef.current) {
    modelRef.current = new SqlStandardTableDataModel(config, schema, dataSource);
  }

  const resolvedWrapper = ({ children }: { children: ReactNode }) => {
    const inner = createElement(DataModelContext.Provider, { value: {
      model: modelRef.current!,
      ir: irRef.current,
      gridConfig: { enableSorting, enableFiltering, theme },
      grid: gridRef.current!.grid,
      sortAction: (entries: SortEntry[]) => sortActionRef.current(entries),
      filterAction: (filters: ScalarFilter[]) => filterActionRef.current(filters),
      getRangeOfColumn: (field: string) => getRangeOfColumnRef.current(field),
      expandAction: (selectPath: string[]) => expandActionRef.current(selectPath),
      collapseAction: (selectPath: string[]) => collapseActionRef.current(selectPath),
    } }, children);
    return contextWrapper ? createElement(contextWrapper, null, inner) : inner;
  };

  if (!adapterRef.current) {
    adapterRef.current = new ReactCellAdapter(resolvedWrapper);
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
    const resolve = (defs: ReactFacetDef[]): Partial<FacetDef>[] =>
      defs.map(({trackRenderer, headerRenderer, ...rest}) => {
        const native: Partial<FacetDef> = {...rest};
        if (trackRenderer) native.trackRenderer = adapter.createNativeFacetRenderer(trackRenderer);
        if (headerRenderer) native.headerRenderer = adapter.createNativeHeaderRenderer(headerRenderer);
        return native;
      });

    const colDefs = facetDefs.col;
    const needsFilterRenderer = enableFiltering && !colDefs.some(d => d.trackRenderer);
    const needsSortRenderer = enableSorting && !needsFilterRenderer && !colDefs.some(d => d.trackRenderer);
    const resolvedCol = needsFilterRenderer
      ? resolve(colDefs.map(d => ({ ...d, trackRenderer: FilterableColumnRenderer })))
      : needsSortRenderer
        ? resolve(colDefs.map(d => ({ ...d, trackRenderer: SortableColumnRenderer })))
        : resolve(colDefs);

    const resolvedRow = resolve(facetDefs.row);
    if (ir.groupBy.length > 0 && resolvedRow.length > 0 && !facetDefs.row[0].headerRenderer) {
      const groupSchema = ir.groupBy.map(field => schema.find(s => s.name === field || s.displayName === field)!);
      const text = groupSchema.map(s => s.displayName ?? s.name).join("\0");
      resolvedRow[0] = {
        ...resolvedRow[0],
        text,
        groupSchema,
        headerRenderer: adapter.createNativeHeaderRenderer(GroupedRowHeaderRenderer),
      };
    }

    nativeFacetDefsRef.current = {
      row: resolvedRow,
      col: resolvedCol,
      axis: facetDefs.axis,
    };
  }

  const transformResultRef = useRef(transformResult);
  transformResultRef.current = transformResult;

  const lastRawResultRef = useRef<FlattenedDataViewModelParams | null>(null);
  const columnTransformsRef = useRef<Map<number, TransformFn>>(new Map());

  const applyResult = useCallback((rawResult: FlattenedDataViewModelParams, pageWindow?: { page: number; size: number }) => {
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

    let viewResult;
    // Use the explicit pageWindow if provided (from the request that produced this result),
    // falling back to refs for callers that don't pass it (applyTransform/resetTransform).
    const pvPage = pageWindow?.page ?? currentPageRef.current;
    const pvSize = pageWindow?.size ?? activePageSizeRef.current;
    if (enablePageView) {
      // The datamodel's flatten() returns the full contiguous block (all loaded pages).
      // For page view, slice to only the rows that belong to the current page.
      // offsetTop tells us how many rows are before the block start; the page starts
      // at (pageStartRow - offsetTop) within the returned data arrays.
      const pageStartRow = pvPage * pvSize;
      const blockOffsetTop = result.offsetTop ?? 0;
      const sliceStart = pageStartRow - blockOffsetTop;
      const sliceEnd = Math.min(sliceStart + pvSize, data[0]?.length ?? 0);
      const clampedSliceStart = Math.max(0, sliceStart);

      let slicedData = data.map(col => col.slice(clampedSliceStart, sliceEnd));
      let slicedRowFacet = result.rowFacet?.slice(clampedSliceStart, sliceEnd);
      let slicedRowMeta = result.rowMeta ? Array.from(result.rowMeta).slice(clampedSliceStart, sliceEnd) : undefined;

      // When a group spans a page boundary, the sliced page may start with child rows
      // whose parent group rows are on the previous page. getSelectPath() walks backwards
      // to find ancestors — if they're missing, it produces broken paths (e.g. ["", "ACTIVE"]).
      // Fix: scan backwards in the unsliced data to find ancestor group rows for each
      // missing depth level and prepend them so getSelectPath() can reconstruct full paths.
      //
      // Known limitation: when the flattened block itself starts at a child row
      // (clampedSliceStart === 0 but firstDepth > 0), the ancestor rows are not in the
      // flattened result at all — they'd need to be resolved from the datamodel's page
      // tree. This can happen when a large expanded group spans multiple cache pages and
      // the preceding cache page is evicted. Fixing this requires datamodel-level changes
      // to include ancestor context in flatten() output.
      if (slicedRowMeta && slicedRowFacet && clampedSliceStart > 0) {
        const firstDepth = (slicedRowMeta[0] & 0xF0) >> 4;
        if (firstDepth > 0) {
          const ancestors: { facet: string | null; meta: number; data: any[] }[] = [];
          let remaining = firstDepth;
          for (let i = clampedSliceStart - 1; i >= 0 && remaining > 0; i--) {
            const bits = result.rowMeta![i];
            const d = (bits & 0xF0) >> 4;
            if (d < remaining) {
              ancestors.push({
                facet: result.rowFacet![i],
                meta: bits,
                data: data.map(col => col[i]),
              });
              remaining = d;
            }
          }
          ancestors.reverse();
          if (ancestors.length > 0) {
            slicedRowFacet = [...ancestors.map(a => a.facet), ...slicedRowFacet];
            slicedRowMeta = [...ancestors.map(a => a.meta), ...slicedRowMeta];
            slicedData = data.map((_, colIdx) => [
              ...ancestors.map(a => a.data[colIdx]),
              ...slicedData[colIdx],
            ]);
          }
        }
      }

      viewResult = {
        ...result,
        data: slicedData,
        rowFacet: slicedRowFacet,
        rowMeta: slicedRowMeta ? new Uint8Array(slicedRowMeta) : undefined,
        offsetTop: 0,
        totalRows: slicedData[0]?.length ?? 0,
        options: vmOptions,
        schema,
      };
    } else {
      viewResult = { ...result, data, options: vmOptions, schema };
    }

    if (!vmRef.current) {
      vmRef.current = new FlattenedDataViewModel(viewResult);
    } else {
      vmRef.current.updateData(viewResult);
    }
  }, []);

  useEffect(() => {
    const model = modelRef.current;
    if (!model) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    const initialIR = enablePageView
      ? { ...ir, startRow: 0, endRow: displayPageSize ?? model.config.pageSize }
      : ir;

    if (enablePageView) {
      setCurrentPage(0);
      currentPageRef.current = 0;
    }

    model.getViewModelData(initialIR).then((result: FlattenedDataViewModelParams) => {
      if (cancelled) return;
      applyResult(result, enablePageView ? { page: 0, size: displayPageSize ?? model.config.pageSize } : undefined);
      if (enablePageView) setDatasetTotalRows(model.computeTotalLogicalRows());
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
    if (enablePageView) return;
    const model = modelRef.current;
    if (!model || !irRef.current) return;
    const pageIR: StandardDataFetchAndTransformIR = { ...activeIRRef.current, startRow, endRow };
    inFlightCountRef.current++;
    setPageLoadingInProgress(true);
    try {
      const result = await model.getViewModelData(pageIR);
      applyResult(result);
      gridRef.current?.grid.scheduleDraw();
    } finally {
      inFlightCountRef.current--;
      if (inFlightCountRef.current === 0) {
        setPageLoadingInProgress(false);
      }
    }
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

  const goToPageWithSize = useCallback(async (page: number, pgSize: number) => {
    const model = modelRef.current;
    if (!model || !activeIRRef.current) return;
    const total = model.computeTotalLogicalRows();
    if (total === 0) {
      setCurrentPage(0);
      setDatasetTotalRows(0);
      return;
    }
    const totalPages = Math.ceil(total / pgSize);
    if (page < 0 || page >= totalPages) return;

    setCurrentPage(page);
    currentPageRef.current = page;
    activePageSizeRef.current = pgSize;
    const startRow = page * pgSize;
    const endRow = Math.min(startRow + pgSize, total);

    inFlightCountRef.current++;
    setPageLoadingInProgress(true);
    try {
      const pw = { page, size: pgSize };
      const pageIR: StandardDataFetchAndTransformIR = { ...activeIRRef.current, startRow, endRow };
      const result = await model.getViewModelData(pageIR);
      applyResult(result, pw);
      setDatasetTotalRows(model.computeTotalLogicalRows());
      gridRef.current?.grid.scrollTo("row", 0);
      gridRef.current?.grid.scheduleDraw();
    } finally {
      inFlightCountRef.current--;
      if (inFlightCountRef.current === 0) setPageLoadingInProgress(false);
    }
  }, [applyResult]);

  const goToPage = useCallback(async (page: number) => {
    goToPageWithSize(page, activePageSize);
  }, [goToPageWithSize, activePageSize]);

  const setDisplayPageSizeFn = useCallback((newSize: number) => {
    setActivePageSize(newSize);
    setCurrentPage(0);
    goToPageWithSize(0, newSize);
  }, [goToPageWithSize]);

  const sortAction = useCallback(async (newSortEntries: SortEntry[]) => {
    const model = modelRef.current;
    if (!model || !irRef.current) return;

    activeIRRef.current = { ...activeIRRef.current, sort: newSortEntries };

    if (enablePageView) {
      setCurrentPage(0);
      currentPageRef.current = 0;
    }

    const startRow = enablePageView ? 0 : activeIRRef.current.startRow;
    const endRow = enablePageView ? activePageSizeRef.current : activeIRRef.current.endRow;

    inFlightCountRef.current++;
    setPageLoadingInProgress(true);
    try {
      const sortIR: StandardDataFetchAndTransformIR = { ...activeIRRef.current, startRow, endRow };
      const result = await model.getViewModelData(sortIR);
      applyResult(result, enablePageView ? { page: 0, size: activePageSizeRef.current } : undefined);
      if (enablePageView) {
        setDatasetTotalRows(model.computeTotalLogicalRows());
        gridRef.current?.grid.scrollTo("row", 0);
      }
      gridRef.current?.grid.scheduleDraw();
    } finally {
      inFlightCountRef.current--;
      if (inFlightCountRef.current === 0) setPageLoadingInProgress(false);
    }
  }, [applyResult, enablePageView]);

  const filterAction = useCallback(async (newFilters: ScalarFilter[]) => {
    const model = modelRef.current;
    if (!model || !irRef.current) return;

    const expandedPaths = model.getExpandedPaths();

    activeIRRef.current = { ...activeIRRef.current, filter: newFilters };

    if (enablePageView) {
      setCurrentPage(0);
      currentPageRef.current = 0;
    }

    const startRow = enablePageView ? 0 : activeIRRef.current.startRow;
    const endRow = enablePageView ? activePageSizeRef.current : activeIRRef.current.endRow;

    inFlightCountRef.current++;
    setPageLoadingInProgress(true);
    try {
      const filterIR: StandardDataFetchAndTransformIR = { ...activeIRRef.current, startRow, endRow };
      const result = await model.getViewModelData(filterIR);

      // Re-expand previously expanded paths (parents before children)
      if (expandedPaths.length > 0) {
        expandedPaths.sort((a, b) => a.length - b.length);
        for (const path of expandedPaths) {
          await model.expand(path);
        }
      }

      const finalResult = expandedPaths.length > 0
        ? await model.getViewModelData({ ...activeIRRef.current, startRow, endRow })
        : result;

      applyResult(finalResult, enablePageView ? { page: 0, size: activePageSizeRef.current } : undefined);
      if (enablePageView) {
        setDatasetTotalRows(model.computeTotalLogicalRows());
        gridRef.current?.grid.scrollTo("row", 0);
      }
      gridRef.current?.grid.scheduleDraw();
    } finally {
      inFlightCountRef.current--;
      if (inFlightCountRef.current === 0) setPageLoadingInProgress(false);
    }
  }, [applyResult, enablePageView]);

  const getRangeOfColumnAction = useCallback(async (field: string): Promise<ColumnRangeValues> => {
    const model = modelRef.current;
    if (!model) return { type: "categorical", values: [] };
    return model.getRangeOfColumn(field);
  }, []);

  const expandAction = useCallback(async (selectPath: string[]) => {
    const model = modelRef.current;
    if (!model) return;

    const result = await model.expand(selectPath);

    if (enablePageView) {
      const total = model.computeTotalLogicalRows();
      setDatasetTotalRows(total);
      const pg = currentPageRef.current;
      const sz = activePageSizeRef.current;
      const startRow = pg * sz;
      const endRow = Math.min(startRow + sz, total);
      const pageIR: StandardDataFetchAndTransformIR = { ...activeIRRef.current, startRow, endRow };
      const pageResult = await model.getViewModelData(pageIR);
      applyResult(pageResult, { page: pg, size: sz });
    } else {
      applyResult(result);
    }

    gridRef.current?.grid.scheduleDraw();
  }, [applyResult, enablePageView]);

  const collapseAction = useCallback(async (selectPath: string[]) => {
    const model = modelRef.current;
    if (!model) return;

    const result = await model.collapse(selectPath);

    if (enablePageView) {
      const total = model.computeTotalLogicalRows();
      setDatasetTotalRows(total);
      const sz = activePageSizeRef.current;
      const totalPages = Math.max(1, Math.ceil(total / sz));
      const clampedPage = Math.min(currentPageRef.current, totalPages - 1);
      if (clampedPage !== currentPageRef.current) {
        setCurrentPage(clampedPage);
        currentPageRef.current = clampedPage;
      }
      const startRow = clampedPage * sz;
      const endRow = Math.min(startRow + sz, total);
      const pageIR: StandardDataFetchAndTransformIR = { ...activeIRRef.current, startRow, endRow };
      const pageResult = await model.getViewModelData(pageIR);
      applyResult(pageResult, { page: clampedPage, size: sz });
    } else {
      applyResult(result);
    }

    gridRef.current?.grid.scheduleDraw();
  }, [applyResult, enablePageView]);

  sortActionRef.current = sortAction;
  filterActionRef.current = filterAction;
  getRangeOfColumnRef.current = getRangeOfColumnAction;
  expandActionRef.current = expandAction;
  collapseActionRef.current = collapseAction;

  const totalPages = Math.max(1, Math.ceil(datasetTotalRows / activePageSize));
  const pageView: PageViewState | null = enablePageView ? {
    currentPage,
    totalPages,
    displayPageSize: activePageSize,
    datasetTotalRows,
    loading: pageLoadingInProgress,
    goToPage,
    setDisplayPageSize: setDisplayPageSizeFn,
  } : null;

  const bindings: GridBindings = { ref: gridRef, data: vmRef.current, pageLoadingInProgress, onCellRelease, onBeforeMeasure };

  return { bindings, viewModel: vmRef.current, gridRef, loading, error, fetchPage, applyTransform, resetTransform, pageView };
}
