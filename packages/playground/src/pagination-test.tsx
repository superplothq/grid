import React, {useEffect, useRef, useState} from "react";
import "grid/dist/grid.css";
import Grid, {FlattenedDataViewModel, FacetCellRenderer, FacetDataContext, FacetRendererContext, GridDataViewModelOptions} from "grid/dist/renderer";
import {DuckDBWasmDataSource, SqlFlatTableDataModel, GridData, DataSchema, FlatTableConfig, GetRowsIR, FlattenedDataViewModelParams} from "grid/dist/index";
import feather from "feather-icons";

const L0_COUNT = 30;
const L1_COUNT = 30;
const L2_COUNT = 30;

function generateGridData(): GridData {
  const level0: string[] = [];
  const level1: string[] = [];
  const level2: string[] = [];
  const detail: string[] = [];
  const metricA: number[] = [];
  const metricB: number[] = [];

  const pad = (n: number, max: number) => String(n).padStart(String(max - 1).length, "0");

  for (let i = 0; i < L0_COUNT; i++) {
    for (let j = 0; j < L1_COUNT; j++) {
      for (let k = 0; k < L2_COUNT; k++) {
        const pi = pad(i, L0_COUNT);
        const pj = pad(j, L1_COUNT);
        const pk = pad(k, L2_COUNT);
        level0.push(`data${pi}`);
        level1.push(`data${pi}.data${pj}`);
        level2.push(`data${pi}.data${pj}.data${pk}`);
        detail.push(`detail_${pi}_${pj}_${pk}`);
        metricA.push(Math.floor(Math.random() * 1000));
        metricB.push(Math.floor(Math.random() * 500));
      }
    }
  }

  return {
    columns: [
      "level0", "level1", "level2", "detail",
      {name: "metricA", displayName: "Metric A", type: "measure", aggregateFn: "sum"} as DataSchema,
      {name: "metricB", displayName: "Metric B", type: "measure", aggregateFn: "sum"} as DataSchema,
    ],
    data: [level0, level1, level2, detail, metricA, metricB],
  };
}

const flatSchema: DataSchema[] = [
  {name: "level0", displayName: "Level 0", type: "dimension"},
  {name: "level1", displayName: "Level 1", type: "dimension"},
  {name: "level2", displayName: "Level 2", type: "dimension"},
  {name: "detail", displayName: "Detail", type: "dimension"},
  {name: "metricA", displayName: "Metric A", type: "measure", aggregateFn: "sum"},
  {name: "metricB", displayName: "Metric B", type: "measure", aggregateFn: "sum"},
];

const GROUP_BY = ["level0", "level1", "level2"];
const PROJECT = ["detail", "metricA", "metricB"];

const svgIcon = (name: string, size = 12): HTMLElement => {
  const wrapper = document.createElement("span");
  wrapper.style.display = "inline-flex";
  wrapper.style.alignItems = "center";
  wrapper.style.opacity = "0.9";
  wrapper.innerHTML = feather.icons[name as keyof typeof feather.icons].toSvg({width: size, height: size, "stroke-width": 2.5});
  return wrapper;
};

const spinnerIcon = (size = 12): HTMLElement => {
  const wrapper = document.createElement("span");
  wrapper.style.display = "inline-flex";
  wrapper.style.alignItems = "center";
  wrapper.style.opacity = "0.9";
  wrapper.innerHTML = feather.icons["loader" as keyof typeof feather.icons].toSvg({width: size, height: size, "stroke-width": 2.5});
  const svg = wrapper.firstElementChild as SVGElement;
  svg.style.animation = "spin 1s linear infinite";
  return wrapper;
};

function makeFacetRenderer(
  modelRef: React.MutableRefObject<SqlFlatTableDataModel | null>,
  viewModelRef: React.MutableRefObject<FlattenedDataViewModel | null>,
  gridRef: React.MutableRefObject<Grid | null>,
  lastIRRef: React.MutableRefObject<GetRowsIR | null>,
): FacetCellRenderer {
  return (data: string, dataCtx: FacetDataContext, rCtx: FacetRendererContext) => {
    const flatMeta = dataCtx.flatMeta;
    if (!flatMeta || flatMeta.isLeaf) return String(data ?? "");

    const ns = `row-${dataCtx.level}-${dataCtx.index}`;
    const meta = dataCtx.viewModel.metaState.get(ns);
    const isLoading = meta?.["loading"] === true;

    if (isLoading) {
      return {
        left: spinnerIcon(11),
        content: String(data ?? ""),
      };
    }

    const iconName = flatMeta.isExpanded ? "chevron-down" : "chevron-right";
    const icon = svgIcon(iconName, 11);
    icon.style.cursor = "pointer";

    icon.addEventListener("click", async (e) => {
      e.stopPropagation();
      const model = modelRef.current!;
      const viewModel = viewModelRef.current!;
      const grid = gridRef.current!;

      dataCtx.viewModel.metaState.set(ns, "loading", true);
      rCtx.render(viewModel);

      const select = dataCtx.path as string[];
      let result: FlattenedDataViewModelParams;
      if (flatMeta.isExpanded) {
        result = await model.collapseAndGetData(select);
      } else {
        result = await model.expandAndGetData(select);
      }

      viewModel.updateData({ data: result.data, columnFacets: result.columnFacets, rowFacet: result.rowFacet, rowMeta: result.rowMeta, totalRows: result.totalRows, offsetTop: result.offsetTop });
      dataCtx.viewModel.metaState.clear(ns);
      grid.draw();
    });

    return {
      left: icon,
      content: String(data ?? ""),
    };
  };
}

function collectPathsAtLevel(pages: any[], targetLevel: number, currentPath: string[]): string[][] {
  const result: string[][] = [];
  const currentLevel = currentPath.length;

  for (const page of pages) {
    if (!page.data) continue;
    for (let rowIdx = 0; rowIdx < page.rowCount; rowIdx++) {
      const value = String(page.data[0][rowIdx]);
      const path = [...currentPath, value];

      if (currentLevel === targetLevel) {
        result.push(path);
      } else {
        const expanded = page.expandedRows.get(rowIdx);
        if (expanded?.expanded) {
          result.push(...collectPathsAtLevel(expanded.pages, targetLevel, path));
        }
      }
    }
  }
  return result;
}

function collectExpandedPathsAtLevel(pages: any[], targetLevel: number, currentPath: string[]): string[][] {
  const result: string[][] = [];
  const currentLevel = currentPath.length;

  for (const page of pages) {
    if (!page.data) continue;
    for (let rowIdx = 0; rowIdx < page.rowCount; rowIdx++) {
      const value = String(page.data[0][rowIdx]);
      const path = [...currentPath, value];
      const expanded = page.expandedRows.get(rowIdx);

      if (currentLevel === targetLevel) {
        if (expanded?.expanded) result.push(path);
      } else if (expanded?.expanded) {
        result.push(...collectExpandedPathsAtLevel(expanded.pages, targetLevel, path));
      }
    }
  }
  return result;
}

const PaginationTestPlayground: React.FC = () => {
  const gridConRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<Grid | null>(null);
  const modelRef = useRef<SqlFlatTableDataModel | null>(null);
  const viewModelRef = useRef<FlattenedDataViewModel | null>(null);
  const lastIRRef = useRef<GetRowsIR | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchingPage, setFetchingPage] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      setLoading(true);
      setError(null);

      const gridData = generateGridData();
      const config: FlatTableConfig = {
        schema: flatSchema,
        pageSize: 20,
      };

      const dataSchema: DataSchema[] = gridData.columns.map((col) => {
        if (typeof col === "string") {
          return { name: col, displayName: col, type: "dimension" as const };
        }
        return col;
      });
      const ds = await DuckDBWasmDataSource.create();
      await ds.loadData({ schema: dataSchema, data: gridData.data });
      const model = new SqlFlatTableDataModel(config, dataSchema, ds);

      if (cancelled) return;
      modelRef.current = model;

      const ir: GetRowsIR = {
        startRow: 0,
        endRow: 20,
        groupPath: [],
        groupBy: GROUP_BY,
        project: PROJECT,
        sort: [],
        filter: [],
      };
      lastIRRef.current = ir;

      const result = await model.getViewModelData(ir);
      if (cancelled) return;

      const facetRenderer = makeFacetRenderer(modelRef, viewModelRef, gridRef, lastIRRef);
      const options: GridDataViewModelOptions = {
        ...result.options,
        facetDefs: {
          row: [{trackRenderer: facetRenderer, text: ""}],
          col: [{text: ""}],
          axis: "col",
        },
      };

      const viewModel = new FlattenedDataViewModel({
        data: result.data, columnFacets: result.columnFacets, rowFacet: result.rowFacet, rowMeta: result.rowMeta, options, totalRows: result.totalRows, offsetTop: result.offsetTop,
      });
      viewModelRef.current = viewModel;

      if (!gridConRef.current) return;

      const grid = new Grid({}, gridConRef.current, "flat");
      gridRef.current = grid;
      grid.data = viewModel;
      grid.draw();

      grid.on("viewDataEmpty", async (vp) => {
        console.log('>>> vp', vp.startRow, vp.endRow);
        setFetchingPage(true);
        const newIR: GetRowsIR = {
          ...lastIRRef.current!,
          startRow: vp.startRow,
          endRow: vp.endRow,
        };
        lastIRRef.current = newIR;

        const fetchResult = await model.getViewModelData(newIR);

        viewModel.updateData({
          data: fetchResult.data, columnFacets: fetchResult.columnFacets, rowFacet: fetchResult.rowFacet, rowMeta: fetchResult.rowMeta, totalRows: fetchResult.totalRows, offsetTop: fetchResult.offsetTop,
        });
        grid.draw();
        setFetchingPage(false);
      });

      setLoading(false);
    };

    init().catch((err) => {
      if (!cancelled) {
        setError(String(err));
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, []);

  const handleExpandAll = async (level: number) => {
    if (busy) return;
    const model = modelRef.current;
    const viewModel = viewModelRef.current;
    const grid = gridRef.current;
    if (!model || !viewModel || !grid) return;

    setBusy(true);
    try {
      const paths = collectPathsAtLevel(model.pages, level, []);
      console.log(`Expanding ${paths.length} paths at level ${level}`);
      for (const path of paths) {
        try {
          const result = await model.expandAndGetData(path);
          viewModel.updateData({ data: result.data, columnFacets: result.columnFacets, rowFacet: result.rowFacet, rowMeta: result.rowMeta, totalRows: result.totalRows, offsetTop: result.offsetTop });
        } catch (e) {
          console.log(`Skip expand ${path.join("/")}:`, e);
        }
      }
      grid.draw();
    } finally {
      setBusy(false);
    }
  };

  const handleCollapseAll = async (level: number) => {
    if (busy) return;
    const model = modelRef.current;
    const viewModel = viewModelRef.current;
    const grid = gridRef.current;
    if (!model || !viewModel || !grid) return;

    setBusy(true);
    try {
      const paths = collectExpandedPathsAtLevel(model.pages, level, []);
      console.log(`Collapsing ${paths.length} paths at level ${level}`);
      for (const path of paths) {
        try {
          const result = await model.collapseAndGetData(path);
          viewModel.updateData({ data: result.data, columnFacets: result.columnFacets, rowFacet: result.rowFacet, rowMeta: result.rowMeta, totalRows: result.totalRows, offsetTop: result.offsetTop });
        } catch (e) {
          console.log(`Skip collapse ${path.join("/")}:`, e);
        }
      }
      grid.draw();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h2>Pagination Test (3-level grouping)</h2>
      <p>{L0_COUNT * L1_COUNT * L2_COUNT} rows ({L0_COUNT} x {L1_COUNT} x {L2_COUNT}), groupBy: level0/level1/level2, project: detail + metricA(sum) + metricB(sum)</p>
      <div style={{marginBottom: 8, display: "flex", gap: 8, flexWrap: "wrap"}}>
        <button onClick={() => handleExpandAll(0)} disabled={busy || loading}>Expand All Level 0</button>
        <button onClick={() => handleCollapseAll(0)} disabled={busy || loading}>Collapse All Level 0</button>
        <button onClick={() => handleExpandAll(1)} disabled={busy || loading}>Expand All Level 1</button>
        <button onClick={() => handleCollapseAll(1)} disabled={busy || loading}>Collapse All Level 1</button>
        <button onClick={() => handleExpandAll(2)} disabled={busy || loading}>Expand All Level 2</button>
        <button onClick={() => handleCollapseAll(2)} disabled={busy || loading}>Collapse All Level 2</button>
      </div>
      {loading && <p>Loading DuckDB-WASM...</p>}
      {error && <p style={{color: "red"}}>Error: {error}</p>}
      {fetchingPage && (
        <div style={{
          background: "#e3f2fd",
          padding: "4px 12px",
          fontSize: "12px",
          marginBottom: 4,
        }}>
          Fetching page...
        </div>
      )}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <div style={{
        position: "relative",
        background: "white",
        height: "280px",
        width: "calc(100vw - 200px)",
        border: "1px solid #eaeaea",
        margin: 0,
        padding: 0,
        boxSizing: "border-box",
        contain: "layout style",
      }} ref={gridConRef}>
      </div>
    </>
  );
};

export default PaginationTestPlayground;
