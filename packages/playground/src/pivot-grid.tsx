import React, {useEffect, useRef, useState} from "react";
import "grid/dist/grid.css";
import Grid, {GridDataViewModel, FacetCellRenderer, FacetDataContext, FacetRendererContext, FacetHeaderRenderer, FacetHeaderContext, GridDataViewModelOptions} from "grid/dist/renderer";
import {BrowserInMemoryDataModel, DuckDBWasmBundles, cross, hierarchy, GridData, MeasureSchema, ProjectionState, AxisConfig, DimensionalProjectionPath} from "grid/dist/index";
import feather from "feather-icons";

const DUCKDB_BUNDLES: DuckDBWasmBundles = {
  mvp: {
    mainModule: "/duckdb-mvp.wasm",
    mainWorker: "/duckdb-browser-mvp.worker.js",
  },
  eh: {
    mainModule: "/duckdb-eh.wasm",
    mainWorker: "/duckdb-browser-eh.worker.js",
  },
};

const gridData: GridData = {
  columns: [
    "region",
    "country",
    "city",
    "department",
    "product",
    "channel",
    "quarter",
    "segment",
    {name: "revenue", displayName: "Revenue", type: "measure", aggregateFn: "sum"} as MeasureSchema,
    {name: "cost", displayName: "Cost", type: "measure", aggregateFn: "sum"} as MeasureSchema,
    {name: "units_sold", displayName: "Units Sold", type: "measure", aggregateFn: "sum"} as MeasureSchema,
    {name: "returns", displayName: "Returns", type: "measure", aggregateFn: "sum"} as MeasureSchema,
  ],
  data: [
    // region
    ["North", "North", "North", "North", "North", "North", "South", "South", "South", "South", "South", "South", "East", "East", "East", "East", "East", "East", "West", "West", "West", "West", "West", "West"],
    // country
    ["USA", "USA", "USA", "Canada", "Canada", "Canada", "Brazil", "Brazil", "Brazil", "Argentina", "Argentina", "Argentina", "India", "India", "India", "Japan", "Japan", "Japan", "UK", "UK", "UK", "Germany", "Germany", "Germany"],
    // city
    ["New York", "Chicago", "Boston", "Toronto", "Vancouver", "Montreal", "Sao Paulo", "Rio", "Brasilia", "Buenos Aires", "Cordoba", "Rosario", "Mumbai", "Delhi", "Bangalore", "Tokyo", "Osaka", "Kyoto", "London", "Manchester", "Birmingham", "Berlin", "Munich", "Hamburg"],
    // department
    ["Sales", "Engineering", "Marketing", "Sales", "Engineering", "Marketing", "Sales", "Engineering", "Marketing", "Sales", "Engineering", "Marketing", "Sales", "Engineering", "Marketing", "Sales", "Engineering", "Marketing", "Sales", "Engineering", "Marketing", "Sales", "Engineering", "Marketing"],
    // product
    ["Widget", "Gadget", "Widget", "Gadget", "Widget", "Gadget", "Widget", "Gadget", "Widget", "Gadget", "Widget", "Gadget", "Widget", "Gadget", "Widget", "Gadget", "Widget", "Gadget", "Widget", "Gadget", "Widget", "Gadget", "Widget", "Gadget"],
    // channel
    ["Online", "Retail", "Online", "Retail", "Online", "Retail", "Online", "Retail", "Online", "Retail", "Online", "Retail", "Online", "Retail", "Online", "Retail", "Online", "Retail", "Online", "Retail", "Online", "Retail", "Online", "Retail"],
    // quarter
    ["Q1", "Q2", "Q3", "Q4", "Q1", "Q2", "Q3", "Q4", "Q1", "Q2", "Q3", "Q4", "Q1", "Q2", "Q3", "Q4", "Q1", "Q2", "Q3", "Q4", "Q1", "Q2", "Q3", "Q4"],
    // segment
    ["Enterprise", "SMB", "Enterprise", "SMB", "Enterprise", "SMB", "Enterprise", "SMB", "Enterprise", "SMB", "Enterprise", "SMB", "Enterprise", "SMB", "Enterprise", "SMB", "Enterprise", "SMB", "Enterprise", "SMB", "Enterprise", "SMB", "Enterprise", "SMB"],
    // revenue
    [1200, 800, 950, 1100, 750, 680, 1400, 920, 870, 1050, 630, 710, 1300, 880, 960, 1150, 790, 720, 1350, 850, 930, 1080, 760, 700],
    // cost
    [600, 400, 475, 550, 375, 340, 700, 460, 435, 525, 315, 355, 650, 440, 480, 575, 395, 360, 675, 425, 465, 540, 380, 350],
    // units_sold
    [120, 80, 95, 110, 75, 68, 140, 92, 87, 105, 63, 71, 130, 88, 96, 115, 79, 72, 135, 85, 93, 108, 76, 70],
    // returns
    [5, 3, 4, 6, 2, 3, 7, 4, 3, 5, 2, 4, 6, 3, 5, 4, 3, 2, 5, 4, 3, 6, 2, 3],
  ],
};

function mergeRenderers(
  options: GridDataViewModelOptions | undefined,
  viewModel: GridDataViewModel,
): GridDataViewModelOptions {
  const existingRow = viewModel.facetDefs.row;
  const existingCol = viewModel.facetDefs.col;
  const newRow = options?.facetDefs?.row ?? [];
  const newCol = options?.facetDefs?.col ?? [];
  return {
    ...options,
    facetDefs: {
      ...options?.facetDefs!,
      row: newRow.map((d, i) => ({ ...d, trackRenderer: existingRow[i]?.trackRenderer, headerRenderer: existingRow[i]?.headerRenderer, text: existingRow[i]?.text })),
      col: newCol.map((d, i) => ({ ...d, trackRenderer: existingCol[i]?.trackRenderer, headerRenderer: existingCol[i]?.headerRenderer, text: existingCol[i]?.text })),
    },
  };
}

function buildFacetDefs(
  options: GridDataViewModelOptions | undefined,
  rowRenderer: FacetCellRenderer,
  colRenderer: FacetCellRenderer,
  rowHierarchyFields: string[],
  colHierarchyFields: string[],
): GridDataViewModelOptions {
  return {
    ...options,
    facetDefs: {
      ...options?.facetDefs!,
      row: (options?.facetDefs?.row ?? []).map((d, i) => ({ ...d, trackRenderer: rowRenderer, headerRenderer: rowHeaderRenderer, text: rowHierarchyFields[i] ?? "" })),
      col: (options?.facetDefs?.col ?? []).map((d, i) => ({ ...d, trackRenderer: colRenderer, headerRenderer: colHeaderRenderer, text: colHierarchyFields[i] ?? "" })),
    },
  };
}

const rowHeaderRenderer: FacetHeaderRenderer = (text: string, _ctx: FacetHeaderContext) => {
  return {
    left: svgIcon("bar-chart-2", 11),
    content: text,
  };
};

const colHeaderRenderer: FacetHeaderRenderer = (text: string, _ctx: FacetHeaderContext) => {
  return {
    content: text,
    right: svgIcon("filter", 11),
  };
};

const ROW_HIERARCHY_FIELDS = ["region", "country", "city"];
const COL_HIERARCHY_FIELDS = ["department", "product"];

const ROW_DIMS = hierarchy("region", "country", "city");
const COL_DIMS = hierarchy("department", "product");
const MEASURE = "revenue";

const ROW_HIERARCHY_DEPTH = 3;
const COL_HIERARCHY_DEPTH = 2;

const svgIcon = (name: string, size = 12): HTMLElement => {
  const wrapper = document.createElement("span");
  wrapper.style.display = "inline-flex";
  wrapper.style.alignItems = "center";
  wrapper.style.opacity = "0.9";
  wrapper.innerHTML = feather.icons[name as keyof typeof feather.icons].toSvg({ width: size, height: size, "stroke-width": 2.5 });
  return wrapper;
};

const spinnerIcon = (size = 12): HTMLElement => {
  const wrapper = document.createElement("span");
  wrapper.style.display = "inline-flex";
  wrapper.style.alignItems = "center";
  wrapper.style.opacity = "0.9";
  wrapper.innerHTML = feather.icons["loader" as keyof typeof feather.icons].toSvg({ width: size, height: size, "stroke-width": 2.5 });
  const svg = wrapper.firstElementChild as SVGElement;
  svg.style.animation = "spin 1s linear infinite";
  return wrapper;
};

interface ProjectionTree {
  [value: string]: ProjectionTree;
}

function toggleProjection(tree: ProjectionTree, path: (string | null)[], level: number): ProjectionTree {
  const value = path[level]!;

  if (level === 0) {
    const newTree = {...tree};
    if (value in newTree) {
      delete newTree[value];
    } else {
      newTree[value] = {};
    }
    return newTree;
  }

  const ancestor = path[0]!;
  if (!(ancestor in tree)) return tree;
  const newTree = {...tree};
  newTree[ancestor] = toggleProjectionAt(tree[ancestor], path, 1, level);
  return newTree;
}

function toggleProjectionAt(subtree: ProjectionTree, path: (string | null)[], currentLevel: number, targetLevel: number): ProjectionTree {
  const value = path[currentLevel]!;
  if (currentLevel === targetLevel) {
    const newSubtree = {...subtree};
    if (value in newSubtree) {
      delete newSubtree[value];
    } else {
      newSubtree[value] = {};
    }
    return newSubtree;
  }

  if (!(value in subtree)) return subtree;
  const newSubtree = {...subtree};
  newSubtree[value] = toggleProjectionAt(subtree[value], path, currentLevel + 1, targetLevel);
  return newSubtree;
}

function treeToPaths(tree: ProjectionTree): DimensionalProjectionPath[] | undefined {
  const keys = Object.keys(tree);
  if (keys.length === 0) return [];

  const paths: DimensionalProjectionPath[] = [];
  for (const key of keys) {
    const subtree = tree[key];
    const childPaths = treeToPaths(subtree);
    if (childPaths && childPaths.length > 0) {
      for (const childPath of childPaths) {
        paths.push({ open: [key], next: childPath });
      }
    } else {
      paths.push({ open: [key] });
    }
  }
  return paths;
}

function makeFacetRenderer(
  axis: "row" | "col",
  hierarchyDepth: number,
  projectionTreeRef: React.MutableRefObject<ProjectionTree>,
  modelRef: React.MutableRefObject<BrowserInMemoryDataModel | null>,
  viewModelRef: React.MutableRefObject<GridDataViewModel | null>,
  buildConfig: () => { rows: AxisConfig; columns: AxisConfig },
): FacetCellRenderer {
  return (data: string, dataCtx: FacetDataContext, rCtx: FacetRendererContext) => {
    const isLeaf = dataCtx.level >= hierarchyDepth - 1;

    const facetDef = dataCtx.viewModel.facetDefs[axis][dataCtx.level];
    const levelMeta = facetDef?.meta;

    const ns = `${axis}-${dataCtx.level}-${dataCtx.index}`;
    const meta = dataCtx.viewModel.metaState.get(ns);
    const isLoading = meta?.["loading"] === true;

    if (isLoading) {
      return {
        left: spinnerIcon(11),
        content: String(data ?? ""),
      };
    }

    if (isLeaf || data == null) {
      return String(data ?? "");
    }

    let iconName = "chevron-right";
    if (levelMeta) {
      const ps = levelMeta.projectionState;
      if (ps === ProjectionState.PROJECTED) {
        iconName = "chevron-down";
      } else if (ps === ProjectionState.SOME_PROJECTED) {
        iconName = levelMeta.projectedValues.has(String(data)) ? "chevron-down" : "chevron-right";
      }
    }

    const icon = svgIcon(iconName, 11);
    icon.style.cursor = "pointer";

    icon.addEventListener("click", async (e) => {
      e.stopPropagation();
      const viewModel = viewModelRef.current!;
      const model = modelRef.current!;

      dataCtx.viewModel.metaState.set(ns, "loading", true);
      rCtx.render(viewModel);

      projectionTreeRef.current = toggleProjection(projectionTreeRef.current, dataCtx.path, dataCtx.level);

      const config = buildConfig();
      const result = await model.getViewModelData(config);

      viewModel.updateData(result.data, result.columnFacets, result.rowFacets, mergeRenderers(result.options, viewModel));

      dataCtx.viewModel.metaState.clear(ns);
      rCtx.render(viewModel);
    });

    return {
      left: icon,
      content: String(data ?? ""),
    };
  };
}

const PivotGridPlayground: React.FC = () => {
  const gridConRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<Grid | null>(null);
  const modelRef = useRef<BrowserInMemoryDataModel | null>(null);
  const viewModelRef = useRef<GridDataViewModel | null>(null);
  const rowProjectionRef = useRef<ProjectionTree>({});
  const colProjectionRef = useRef<ProjectionTree>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [measureOnRows, setMeasureOnRows] = useState(false);
  const measureOnRowsRef = useRef(false);

  const buildConfig = (): { rows: AxisConfig; columns: AxisConfig } => {
    const onRows = measureOnRowsRef.current;
    return {
      rows: { expr: onRows ? cross(ROW_DIMS, MEASURE) : ROW_DIMS, projection: treeToPaths(rowProjectionRef.current) },
      columns: { expr: onRows ? COL_DIMS : cross(COL_DIMS, MEASURE), projection: treeToPaths(colProjectionRef.current) },
    };
  };

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const model = await BrowserInMemoryDataModel.create(gridData, DUCKDB_BUNDLES);
      modelRef.current = model;

      const config = buildConfig();
      const result = await model.getViewModelData(config);

      if (cancelled) return;
      if (!gridConRef.current) return;

      const rowRenderer = makeFacetRenderer("row", ROW_HIERARCHY_DEPTH, rowProjectionRef, modelRef, viewModelRef, buildConfig);
      const colRenderer = makeFacetRenderer("col", COL_HIERARCHY_DEPTH, colProjectionRef, modelRef, viewModelRef, buildConfig);

      const viewModel = new GridDataViewModel(
        result.data, result.columnFacets, result.rowFacets,
        buildFacetDefs(result.options, rowRenderer, colRenderer, ROW_HIERARCHY_FIELDS, COL_HIERARCHY_FIELDS),
      );
      viewModelRef.current = viewModel;

      if (!gridRef.current) {
        gridRef.current = new Grid({}, gridConRef.current);
      }

      gridRef.current.data = viewModel;
      gridRef.current.draw();
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

  const handleToggleMeasureAxis = async () => {
    const model = modelRef.current;
    const viewModel = viewModelRef.current;
    const grid = gridRef.current;
    if (!model || !viewModel || !grid) return;

    const nextOnRows = !measureOnRowsRef.current;
    measureOnRowsRef.current = nextOnRows;
    setMeasureOnRows(nextOnRows);

    rowProjectionRef.current = {};
    colProjectionRef.current = {};

    const config = buildConfig();
    const result = await model.getViewModelData(config);

    const rowRenderer = makeFacetRenderer("row", ROW_HIERARCHY_DEPTH, rowProjectionRef, modelRef, viewModelRef, buildConfig);
    const colRenderer = makeFacetRenderer("col", COL_HIERARCHY_DEPTH, colProjectionRef, modelRef, viewModelRef, buildConfig);

    viewModel.updateData(
      result.data, result.columnFacets, result.rowFacets,
      buildFacetDefs(result.options, rowRenderer, colRenderer, ROW_HIERARCHY_FIELDS, COL_HIERARCHY_FIELDS),
    );

    grid.draw();
  };

  return (
    <>
      <h2>Pivot Grid</h2>
      <p>rows: hierarchy(region, country, city) | columns: cross(hierarchy(department, product), revenue)</p>
      <button onClick={handleToggleMeasureAxis} disabled={loading} style={{marginBottom: 8}}>
        Measure on: {measureOnRows ? "Rows" : "Columns"}
      </button>
      {loading && <p>Loading DuckDB-WASM...</p>}
      {error && <p style={{color: "red"}}>Error: {error}</p>}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <div style={{
        position: "relative",
        background: "white",
        height: "calc(100vh - 200px)",
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

export default PivotGridPlayground;
