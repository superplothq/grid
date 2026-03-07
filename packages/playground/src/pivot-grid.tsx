import React, {useEffect, useRef, useState} from "react";
import "grid/dist/grid.css";
import Grid, {PivotDataViewModel, FacetCellRenderer, FacetDataContext, FacetRendererContext, FacetHeaderRenderer, FacetHeaderContext, GridDataViewModelOptions} from "grid/dist/renderer";
import {BrowserInMemoryDataModel, cross, hierarchy, GridData, MeasureSchema, ProjectionState, AxisConfig, DimensionalProjectionPath, SortEntry, Filter, ScalarFilter} from "grid/dist/index";
import feather from "feather-icons";
import SortDropdown, {SortEntryConfig} from "./sort-dropdown";
import FilterDropdown from "./filter-dropdown";

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
  viewModel: PivotDataViewModel,
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
  rowHeaderRendererFn: FacetHeaderRenderer,
  colHeaderRendererFn: FacetHeaderRenderer,
): GridDataViewModelOptions {
  return {
    ...options,
    facetDefs: {
      ...options?.facetDefs!,
      row: (options?.facetDefs?.row ?? []).map((d, i) => ({ ...d, trackRenderer: rowRenderer, headerRenderer: rowHeaderRendererFn, text: rowHierarchyFields[i] ?? "" })),
      col: (options?.facetDefs?.col ?? []).map((d, i) => ({ ...d, trackRenderer: colRenderer, headerRenderer: colHeaderRendererFn, text: colHierarchyFields[i] ?? "" })),
    },
  };
}

const MEASURE_NAMES = (gridData.columns.filter(c => typeof c === "object" && (c as MeasureSchema).type === "measure") as MeasureSchema[]).map(m => m.name);

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
  viewModelRef: React.MutableRefObject<PivotDataViewModel | null>,
  buildConfig: () => { rows: AxisConfig; columns: AxisConfig; sort?: SortEntry[]; filter?: Filter[] },
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
  const viewModelRef = useRef<PivotDataViewModel | null>(null);
  const rowProjectionRef = useRef<ProjectionTree>({});
  const colProjectionRef = useRef<ProjectionTree>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [measureOnRows, setMeasureOnRows] = useState(false);
  const measureOnRowsRef = useRef(false);
  const sortEntriesRef = useRef<SortEntry[]>([]);
  const [multiSortEntries, setMultiSortEntries] = useState<SortEntryConfig[]>([]);
  const multiSortEntriesRef = useRef(multiSortEntries);
  multiSortEntriesRef.current = multiSortEntries;
  const [sortDropdownState, setSortDropdownState] = useState<{field: string; anchorEl: HTMLElement} | null>(null);
  const setSortDropdownStateRef = useRef(setSortDropdownState);
  setSortDropdownStateRef.current = setSortDropdownState;
  const filterMapRef = useRef<Map<string, ScalarFilter[]>>(new Map());
  const [filterDropdownState, setFilterDropdownState] = useState<{field: string; fieldType: "dimension" | "measure"; anchorEl: HTMLElement} | null>(null);
  const setFilterDropdownStateRef = useRef(setFilterDropdownState);
  setFilterDropdownStateRef.current = setFilterDropdownState;
  const filterDistinctValuesRef = useRef<string[] | null>(null);
  const [filterDistinctValues, setFilterDistinctValues] = useState<string[] | null>(null);

  const openFilterDropdown = (field: string, fieldType: "dimension" | "measure", anchorEl: HTMLElement) => {
    setSortDropdownStateRef.current(null);
    filterDistinctValuesRef.current = null;
    setFilterDistinctValues(null);
    setFilterDropdownState({field, fieldType, anchorEl});
    if (fieldType === "dimension") {
      const model = modelRef.current;
      if (model) {
        model.resolveFacetValues({type: "facet", fields: [field], mode: "distinct"}).then(result => {
          filterDistinctValuesRef.current = result[0];
          setFilterDistinctValues(result[0]);
        });
      }
    }
  };
  const openFilterDropdownRef = useRef(openFilterDropdown);
  openFilterDropdownRef.current = openFilterDropdown;

  const getFieldType = (fieldName: string): "dimension" | "measure" => {
    const col = gridData.columns.find(c => (typeof c === "object" ? (c as MeasureSchema).name : c) === fieldName);
    return (typeof col === "object" && (col as MeasureSchema).type === "measure") ? "measure" : "dimension";
  };

  const buildConfig = (): { rows: AxisConfig; columns: AxisConfig; sort?: SortEntry[]; filter?: Filter[] } => {
    const onRows = measureOnRowsRef.current;
    const allFilters: Filter[] = [];
    filterMapRef.current.forEach(filters => { allFilters.push(...filters); });
    return {
      rows: { expr: onRows ? cross(ROW_DIMS, MEASURE) : ROW_DIMS, projection: treeToPaths(rowProjectionRef.current) },
      columns: { expr: onRows ? COL_DIMS : cross(COL_DIMS, MEASURE), projection: treeToPaths(colProjectionRef.current) },
      sort: sortEntriesRef.current.length > 0 ? sortEntriesRef.current : undefined,
      filter: allFilters.length > 0 ? allFilters : undefined,
    };
  };

  const rowHeaderRenderer: FacetHeaderRenderer = (text: string, ctx: FacetHeaderContext) => {
    const field = ROW_HIERARCHY_FIELDS[ctx.level];
    const hasSortApplied = sortEntriesRef.current.some(e => e.field === field);
    const sortIcon = svgIcon("bar-chart-2", 11);
    sortIcon.style.cursor = "pointer";
    if (hasSortApplied) {
      sortIcon.style.background = "rgba(92, 95, 119, 0.15)";
      sortIcon.style.borderRadius = "3px";
      sortIcon.style.padding = "1px";
    }
    sortIcon.addEventListener("click", (e) => {
      e.stopPropagation();
      setFilterDropdownStateRef.current(null);
      setSortDropdownStateRef.current({field, anchorEl: sortIcon});
    });

    const hasFilterApplied = filterMapRef.current.has(field);
    const filterIcon = svgIcon("filter", 11);
    filterIcon.style.cursor = "pointer";
    if (hasFilterApplied) {
      filterIcon.style.background = "rgba(92, 95, 119, 0.15)";
      filterIcon.style.borderRadius = "3px";
      filterIcon.style.padding = "1px";
    }
    filterIcon.addEventListener("click", (e) => {
      e.stopPropagation();
      openFilterDropdownRef.current(field, getFieldType(field), filterIcon);
    });

    return {
      left: sortIcon,
      content: text,
      right: filterIcon,
    };
  };

  const colHeaderRenderer: FacetHeaderRenderer = (text: string, ctx: FacetHeaderContext) => {
    const field = COL_HIERARCHY_FIELDS[ctx.level];
    const hasFilterApplied = filterMapRef.current.has(field);
    const filterIcon = svgIcon("filter", 11);
    filterIcon.style.cursor = "pointer";
    if (hasFilterApplied) {
      filterIcon.style.background = "rgba(92, 95, 119, 0.15)";
      filterIcon.style.borderRadius = "3px";
      filterIcon.style.padding = "1px";
    }
    filterIcon.addEventListener("click", (e) => {
      e.stopPropagation();
      openFilterDropdownRef.current(field, getFieldType(field), filterIcon);
    });
    return {
      content: text,
      right: filterIcon,
    };
  };

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const model = await BrowserInMemoryDataModel.create(gridData);
      modelRef.current = model;

      const config = buildConfig();
      const result = await model.getViewModelData(config);

      if (cancelled) return;
      if (!gridConRef.current) return;

      const rowRenderer = makeFacetRenderer("row", ROW_HIERARCHY_DEPTH, rowProjectionRef, modelRef, viewModelRef, buildConfig);
      const colRenderer = makeFacetRenderer("col", COL_HIERARCHY_DEPTH, colProjectionRef, modelRef, viewModelRef, buildConfig);

      const viewModel = new PivotDataViewModel(
        result.data, result.columnFacets, result.rowFacets,
        buildFacetDefs(result.options, rowRenderer, colRenderer, ROW_HIERARCHY_FIELDS, COL_HIERARCHY_FIELDS, rowHeaderRenderer, colHeaderRenderer),
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
      buildFacetDefs(result.options, rowRenderer, colRenderer, ROW_HIERARCHY_FIELDS, COL_HIERARCHY_FIELDS, rowHeaderRenderer, colHeaderRenderer),
    );

    grid.draw();
  };

  const handleMultiSortChange = (entries: SortEntryConfig[]) => {
    setMultiSortEntries(entries);
  };

  const handleSortApply = async (entries: SortEntryConfig[]) => {
    const model = modelRef.current;
    const viewModel = viewModelRef.current;
    const grid = gridRef.current;
    if (!model || !viewModel || !grid) return;

    setMultiSortEntries(entries);
    sortEntriesRef.current = entries.map(e => ({
      field: e.field,
      direction: e.direction,
      by: e.by,
    }));

    const config = buildConfig();
    const result = await model.getViewModelData(config);

    const rowRenderer = makeFacetRenderer("row", ROW_HIERARCHY_DEPTH, rowProjectionRef, modelRef, viewModelRef, buildConfig);
    const colRenderer = makeFacetRenderer("col", COL_HIERARCHY_DEPTH, colProjectionRef, modelRef, viewModelRef, buildConfig);

    viewModel.updateData(
      result.data, result.columnFacets, result.rowFacets,
      buildFacetDefs(result.options, rowRenderer, colRenderer, ROW_HIERARCHY_FIELDS, COL_HIERARCHY_FIELDS, rowHeaderRenderer, colHeaderRenderer),
    );
    grid.draw();

    setSortDropdownState(null);
  };

  const handleFilterApply = async (field: string, filters: ScalarFilter[]) => {
    const model = modelRef.current;
    const viewModel = viewModelRef.current;
    const grid = gridRef.current;
    if (!model || !viewModel || !grid) return;

    filterMapRef.current.set(field, filters);

    const config = buildConfig();
    const result = await model.getViewModelData(config);

    const rowRenderer = makeFacetRenderer("row", ROW_HIERARCHY_DEPTH, rowProjectionRef, modelRef, viewModelRef, buildConfig);
    const colRenderer = makeFacetRenderer("col", COL_HIERARCHY_DEPTH, colProjectionRef, modelRef, viewModelRef, buildConfig);

    viewModel.updateData(
      result.data, result.columnFacets, result.rowFacets,
      buildFacetDefs(result.options, rowRenderer, colRenderer, ROW_HIERARCHY_FIELDS, COL_HIERARCHY_FIELDS, rowHeaderRenderer, colHeaderRenderer),
    );
    grid.draw();

    setFilterDropdownState(null);
  };

  const handleFilterClear = async (field: string) => {
    const model = modelRef.current;
    const viewModel = viewModelRef.current;
    const grid = gridRef.current;
    if (!model || !viewModel || !grid) return;

    filterMapRef.current.delete(field);

    const config = buildConfig();
    const result = await model.getViewModelData(config);

    const rowRenderer = makeFacetRenderer("row", ROW_HIERARCHY_DEPTH, rowProjectionRef, modelRef, viewModelRef, buildConfig);
    const colRenderer = makeFacetRenderer("col", COL_HIERARCHY_DEPTH, colProjectionRef, modelRef, viewModelRef, buildConfig);

    viewModel.updateData(
      result.data, result.columnFacets, result.rowFacets,
      buildFacetDefs(result.options, rowRenderer, colRenderer, ROW_HIERARCHY_FIELDS, COL_HIERARCHY_FIELDS, rowHeaderRenderer, colHeaderRenderer),
    );
    grid.draw();

    setFilterDropdownState(null);
  };

  const dropdownAnchorRect = sortDropdownState?.anchorEl.getBoundingClientRect();
  const filterAnchorRect = filterDropdownState?.anchorEl.getBoundingClientRect();

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

      {sortDropdownState && dropdownAnchorRect && (
        <>
          <div
            style={{position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 999}}
            onClick={() => setSortDropdownState(null)}
          />
          <div style={{
            position: "fixed",
            top: dropdownAnchorRect.bottom + 4,
            left: dropdownAnchorRect.left,
            zIndex: 1000,
          }}>
            <SortDropdown
              field={sortDropdownState.field}
              measures={MEASURE_NAMES}
              multiSortEntries={multiSortEntries}
              onApply={handleSortApply}
              onMultiSortChange={handleMultiSortChange}
              onClose={() => setSortDropdownState(null)}
            />
          </div>
        </>
      )}

      {filterDropdownState && filterAnchorRect && (
        <>
          <div
            style={{position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 999}}
            onClick={() => setFilterDropdownState(null)}
          />
          <div style={{
            position: "fixed",
            top: filterAnchorRect.bottom + 4,
            left: filterAnchorRect.left,
            zIndex: 1000,
          }}>
            <FilterDropdown
              field={filterDropdownState.field}
              fieldType={filterDropdownState.fieldType}
              distinctValues={filterDistinctValues}
              currentFilters={filterMapRef.current.get(filterDropdownState.field) ?? []}
              onApply={handleFilterApply}
              onClear={handleFilterClear}
              onClose={() => setFilterDropdownState(null)}
            />
          </div>
        </>
      )}
    </>
  );
};

export default PivotGridPlayground;
