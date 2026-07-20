# SuperPlot Grid - setup skill

You are a coding agent setting up `@superplot/grid` in the user's project. Follow this file top to bottom. Latest release: `@superplot/grid@0.5.0`.

## What you are installing

SuperPlot is a headless, high performance data grid. At its core it is two things and the seam between them:

- A **DataViewModel** - a thin, render-ready structure that holds the data (`FlattenedDataViewModel` for standard tables, `PivotDataViewModel` for pivots).
- A **Renderer** - the `Grid` instance that turns that structure into DOM, with virtualization, cell recycling, and column sizing built in.

It deliberately ships **no** sort menu, filter popup, or pagination bar. You compose those peripheral components in glue code against a small typed contract. Data flows one way: the state you hold -> viewmodel -> `grid.draw()`. The grid is always a pure function of your state.

## Step 0 - clarify requirements with the user

Before writing code, ask the user whatever is not already clear from their request:

1. **Data** - where does it come from? An in-memory array, an API, or SQL over DuckDB WASM?
2. **Shape** - a standard table (one row per record), or a pivot (aggregated rows x columns)?
3. **Interactions** - sorting, filtering, pagination, row grouping, selection? How should each look?
4. **Theme** - light, dark, or following the app's theme?
5. **Placement** - which framework, and which page/component should host the grid?

Sensible defaults if the user has no opinion: in-memory standard table, sortable column headers, light theme.

## Step 1 - install

Detect the package manager from the lockfile and install:

```sh
npm install @superplot/grid    # or: bun add / pnpm add / yarn add
```

TypeScript types ship with the package. It works under strict mode.

## Step 2 - import rules

- For viewmodel-driven grids (the common case), deep-import from **`@superplot/grid/renderer`**. Do NOT import the package root for this - the root entry pulls the DuckDB WASM datasource stack into the bundle.
- Import the root `@superplot/grid` only when you use the SQL layers (`DuckDBWasmDataSource`, `SqlStandardTableDataModel`, `SqlPivotTableDataModel`).
- Import the stylesheet once, wherever your bundler accepts CSS imports: `import "@superplot/grid/grid.css"`.
- The renderer touches the DOM, so it is browser-only. In SSR frameworks (Next.js etc.) construct the grid in client-side code only.

## Step 3 - minimal working grid

```ts
import Grid, { FlattenedDataViewModel } from "@superplot/grid/renderer";
import type { FlattenedDataViewModelParams } from "@superplot/grid/renderer/flattened-data-viewmodel";
import "@superplot/grid/grid.css";

const COLUMNS = ["name", "city", "revenue"];

function buildParams(rows: Record<string, unknown>[]): FlattenedDataViewModelParams {
  return {
    // Column-major: one inner array per column, holding that column's value for every row.
    data: COLUMNS.map((field) => rows.map((row) => row[field] ?? null)),
    // Header labels. One level for a plain table; extra levels create grouped headers.
    columnFacets: [COLUMNS],
    // Sizes the scrollbar. With server paging, also pass offsetTop for the loaded block.
    totalRows: rows.length,
  };
}

// The mount element must have an explicit height, overflow auto, and position relative.
const mount = document.getElementById("grid")!;
mount.style.cssText = "position:relative;height:400px;overflow:auto;";

const grid = new Grid({ theme: "light" }, mount, "flat"); // layout: "flat" | "pivot"
const viewModel = new FlattenedDataViewModel(buildParams(rows));
grid.data = viewModel;
grid.draw();
```

Contract notes:

- `data` is **column-major**. Getting this wrong is the most common mistake - `data[colIndex][rowIndex]`, not row objects.
- Columns auto-size to content by default. To make columns share the full width instead, pass `options.vTrackDefs` with `colSize: { strategy: "static", width: 1, unit: "fr" }` per column.
- Per-column formatting and custom cells also go through `options.vTrackDefs` (`valueFormatter`, `renderer`).

## Step 4 - interactions: the one update path

Whatever the interaction (sort, filter, page, group), the response is always the same three moves:

1. Hold the interaction state on `viewModel.metaState` - a namespaced key-value store that survives data updates: `metaState.set("sort", "field", "name")`, `metaState.get("sort")`, `metaState.clear("sort")`.
2. Derive new rows from that state and call `viewModel.updateData(buildParams(derivedRows))`. The viewmodel is **persistent** - never construct a new one per update.
3. Call `grid.draw()`. `metaState` has no reactivity; `draw()` is what re-runs rendering.

```ts
function render(): void {
  const sort = viewModel.metaState.get("sort") as { field: string; dir: "asc" | "desc" } | undefined;
  let view = allRows;
  if (sort) {
    const factor = sort.dir === "asc" ? 1 : -1;
    view = allRows.slice().sort((a, b) => compare(a[sort.field], b[sort.field]) * factor);
  }
  viewModel.updateData(buildParams(view));
  grid.draw();
}
```

Renderer gotchas that will bite you if skipped:

- Cells are recycled on every draw, so per-cell `onclick` handlers get swallowed. Attach **delegated** `pointerdown`/`click` listeners on the mount element and match targets via `data-*` attributes you set in your renderers.
- Custom header renderers (`options.facetDefs.col[].trackRenderer`) are also called with a synthetic sample string during layout measurement. Return `""` when the value is not one of your known fields.
- A custom cell renderer must return `""` (not `undefined`) to clear a cell, otherwise the recycled cell keeps its stale content.

Do not invent sort/filter/pagination UI from scratch. Fetch the canonical end-to-end implementations and adapt them:

- Sort: https://superplot.dev/grid/docs/samples/headless-sort
- Filter: https://superplot.dev/grid/docs/samples/headless-filter
- Pagination: https://superplot.dev/grid/docs/samples/headless-paginate

## Framework glue (React example)

Construct the grid once per mounted container and keep the viewmodel out of framework state:

```tsx
"use client";
import { useEffect, useRef } from "react";
import Grid, { FlattenedDataViewModel } from "@superplot/grid/renderer";
import "@superplot/grid/grid.css";

export function DataGrid({ rows }: { rows: Row[] }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<{ grid: Grid; viewModel: FlattenedDataViewModel }>(null);

  useEffect(() => {
    const grid = new Grid({}, mountRef.current!, "flat");
    const viewModel = new FlattenedDataViewModel(buildParams(rows));
    grid.data = viewModel;
    grid.draw();
    stateRef.current = { grid, viewModel };
    return () => {
      stateRef.current = null;
      mountRef.current?.replaceChildren();
    };
  }, []);

  useEffect(() => {
    if (!stateRef.current) return;
    stateRef.current.viewModel.updateData(buildParams(rows));
    stateRef.current.grid.draw();
  }, [rows]);

  return <div ref={mountRef} style={{ position: "relative", height: 400, overflow: "auto" }} />;
}
```

The same shape applies to any framework: create once on mount, push updates through `updateData` + `draw()`, tear down on unmount.

## Themes

- Built-in themes: `"light"` and `"dark"`, chosen via the `theme` field of the config passed to the `Grid` constructor.
- Custom themes: `registerTheme(name, tokens)` from `@superplot/grid/renderer`, then pass that name as `theme`.
- To switch theme on a live grid (e.g. following an app-wide dark mode toggle), re-apply the theme tokens as CSS custom properties on `grid.trackSurfaceContainer`. See https://superplot.dev/grid/docs/renderer/themes for the token list and pattern.

## Pivot tables and SQL-backed grids

For aggregated pivots or SQL-driven tables, use the optional data layers from the package root `@superplot/grid`:

- `DuckDBWasmDataSource` stores data in in-browser DuckDB and executes SQL.
- `SqlStandardTableDataModel` produces `FlattenedDataViewModel`s with grouping and pagination handled for you.
- `SqlPivotTableDataModel` takes a `PivotConfig` built from table algebra operators (`cross`, `hierarchy`, `concat`) and produces `PivotDataViewModel`s.

Read these before implementing:

- Pivot pipeline: https://superplot.dev/grid/docs/pivot-table
- Datasource layer: https://superplot.dev/grid/docs/datasource
- Datamodel layer: https://superplot.dev/grid/docs/datamodel
- Fullstack (server-backed) grids: https://superplot.dev/grid/docs/fullstack-grid

## Step 5 - verify

1. Build or start the dev server and open the page. The grid should render rows inside its scroll container.
2. Scroll: rows should virtualize smoothly with no blank flashes at normal speed.
3. Exercise each interaction you built and confirm the grid updates.
4. If cells render blank, check the two usual suspects: `data` is column-major, and `totalRows` is set.

## Reference

- Docs index for agents (fetch this for the full page list): https://superplot.dev/grid/docs/llms.txt
- Docs home: https://superplot.dev/grid/docs/
- Headless programming model: https://superplot.dev/grid/docs/headless
- Viewmodel contract: https://superplot.dev/grid/docs/viewmodel
- Renderer, events, selections: https://superplot.dev/grid/docs/renderer
- Type references: https://superplot.dev/grid/docs/type-references
- npm: https://www.npmjs.com/package/@superplot/grid
