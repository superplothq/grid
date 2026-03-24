import React, {useEffect, useRef, useState} from "react";
import "grid/dist/grid.css";
import Grid, {FlattenedDataViewModel, FacetCellRenderer, FacetDataContext, FacetRendererContext, GridDataViewModelOptions} from "grid/dist/renderer";
import {DuckDBWasmDataSource, SqlFlatTableDataModel, GridData, DataSchema, FlatTableConfig, GetRowsIR, FlatTableViewModelArgs} from "grid/dist/index";
import feather from "feather-icons";

const NUM_GROUPS = 1000;
const NUM_ITEMS_PER_GROUP = 200;

function generateGridData(): GridData {
  const groups: string[] = [];
  const items: string[] = [];
  const values: number[] = [];

  for (let g = 0; g < NUM_GROUPS; g++) {
    for (let i = 0; i < NUM_ITEMS_PER_GROUP; i++) {
      groups.push(`Group-${g}`);
      items.push(`Item-${g}-${i}`);
      values.push(Math.floor(Math.random() * 10000));
    }
  }

  return {
    columns: [
      "group",
      "item",
      {name: "value", displayName: "Value", type: "measure", aggregateFn: "sum"} as DataSchema,
    ],
    data: [groups, items, values],
  };
}

const flatSchema: DataSchema[] = [
  {name: "group", type: "dimension"},
  {name: "item", type: "dimension"},
  {name: "value", displayName: "Value", type: "measure", aggregateFn: "sum"},
];

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

      const select = dataCtx.path.filter((v): v is string => v !== null);
      let result: FlatTableViewModelArgs;
      if (flatMeta.isExpanded) {
        result = await model.collapseData(select);
      } else {
        result = await model.expandData(select);
      }

      const updatedOptions: GridDataViewModelOptions = {
        ...result.options,
        facetDefs: viewModel.facetDefs,
      };
      viewModel.updateData({ data: result.data, columnFacets: result.columnFacets, rowFacet: result.rowFacet, rowMeta: result.rowMeta, options: updatedOptions });
      dataCtx.viewModel.metaState.clear(ns);
      grid.draw();
    });

    return {
      left: icon,
      content: String(data ?? ""),
    };
  };
}

const DELAY_MS = 2000;

const FlatTablePlayground: React.FC = () => {
  const gridConRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<Grid | null>(null);
  const modelRef = useRef<SqlFlatTableDataModel | null>(null);
  const viewModelRef = useRef<FlattenedDataViewModel | null>(null);
  const lastIRRef = useRef<GetRowsIR | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchingPage, setFetchingPage] = useState(false);

  const [pageSize, setPageSize] = useState(() =>
    localStorage.getItem("flat-table-pageSize") ?? "100"
  );
  const [maxCacheSize, setMaxCacheSize] = useState(() =>
    localStorage.getItem("flat-table-maxCacheSize") ?? "20"
  );

  const handlePageSizeChange = (value: string) => {
    setPageSize(value);
    localStorage.setItem("flat-table-pageSize", value);
  };

  const handleMaxCacheSizeChange = (value: string) => {
    setMaxCacheSize(value);
    localStorage.setItem("flat-table-maxCacheSize", value);
  };

  useEffect(() => {
    let cancelled = false;
    gridRef.current = null;

    const init = async () => {
      const ps = parseInt(pageSize, 10) || 100;
      const mcs = parseInt(maxCacheSize, 10) || 20;

      setLoading(true);
      setError(null);

      const gridData = generateGridData();
      const config: FlatTableConfig = {
        schema: flatSchema,
        pageSize: ps,
        maxCacheSize: mcs,
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

      // Wrap getData with artificial delay
      const origGetData = model.getData.bind(model);
      (model as any).getData = async (ir: GetRowsIR) => {
        await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        return origGetData(ir);
      };

      if (cancelled) return;
      modelRef.current = model;

      const ir: GetRowsIR = {
        startRow: 0,
        endRow: ps,
        select: [],
        groupBy: ["group", "item"],
        project: ["value"],
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
          row: [{trackRenderer: facetRenderer, text: "Group"}],
          col: [{text: ""}],
          axis: "col",
        },
      };

      const viewModel = new FlattenedDataViewModel({
        data: result.data, columnFacets: result.columnFacets, rowFacet: result.rowFacet, rowMeta: result.rowMeta, options,
      });
      viewModelRef.current = viewModel;

      if (!gridConRef.current) return;

      const grid = new Grid({}, gridConRef.current, "flat");
      gridRef.current = grid;
      grid.data = viewModel;
      grid.draw();

      // Throttled viewDataEmpty handler
      let throttleTimer: ReturnType<typeof setTimeout> | null = null;
      let pendingVP: {startRow: number; endRow: number} | null = null;

      grid.on("viewDataEmpty", (vp) => {
        pendingVP = vp;
        if (throttleTimer) return;
        throttleTimer = setTimeout(async () => {
          throttleTimer = null;
          const currentVP = pendingVP;
          pendingVP = null;
          if (!currentVP) return;

          setFetchingPage(true);
          const newIR: GetRowsIR = {
            ...lastIRRef.current!,
            startRow: currentVP.startRow,
            endRow: currentVP.endRow,
          };
          lastIRRef.current = newIR;

          const fetchResult = await model.getViewModelData(newIR);

          const updatedOptions: GridDataViewModelOptions = {
            ...fetchResult.options,
            facetDefs: {
              row: [{trackRenderer: facetRenderer, text: "Group"}],
              col: [{text: ""}],
              axis: "col",
            },
          };

          viewModel.updateData({
            data: fetchResult.data, columnFacets: fetchResult.columnFacets, rowFacet: fetchResult.rowFacet, rowMeta: fetchResult.rowMeta, options: updatedOptions,
          });
          grid.draw();
          setFetchingPage(false);
        }, 150);
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
  }, [pageSize, maxCacheSize]);

  return (
    <>
      <h2>Flat Table (Pagination)</h2>
      <p>200K rows (1000 groups x 200 items), groupBy: group, project: value (sum)</p>
      <div style={{marginBottom: 8}}>
        <label>
          Page Size:{" "}
          <input
            type="text"
            value={pageSize}
            onChange={(e) => handlePageSizeChange(e.target.value)}
            style={{width: 60}}
          />
        </label>
        <label style={{marginLeft: 16}}>
          Max Cache Size:{" "}
          <input
            type="text"
            value={maxCacheSize}
            onChange={(e) => handleMaxCacheSizeChange(e.target.value)}
            style={{width: 60}}
          />
        </label>
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
        height: "calc(100vh - 250px)",
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

export default FlatTablePlayground;
