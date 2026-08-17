# SuperPlot Grid - setup skill

Here is the guide to set up `@superplot/grid` in a project. Follow it top to bottom.

## What you are installing

SuperPlot is a headless, high performance data grid. At its core it is two things and the seam between them:

- A **DataViewModel** - a thin, render-ready structure that holds the data in column major format (`FlattenedDataViewModel` for standard tables, `PivotDataViewModel` for pivots).
- A **Renderer** - the `Grid` instance. It provides the layout engine, the render cycle (`draw()`), scroll handling, virtualization, cell recycling/pooling, column auto-sizing, selections, themes and other ui related behaviour / operation. DataViewModel feeds data for drawing.

Upstream of that seam sits a **data layer** that produces viewmodel data for you:

- **DataModel** - a client-side data modelling contract (fetch raw data, page caching with eviction, row grouping with progressive expand/collapse, sorting, filtering, pivot aggregation, reshape it for the viewmodel).
- **DataSource** - Connects to source of data and transparently pass (request to source and result from source)
  data between datamodel and source.

Using a DataModel / DataSource is optional (although recommended).

It deliberately ships **no** UI components like sort menu, filter popup, or pagination bar. You compose those peripheral components in glue code based on user's requirement against a small typed contract.

## Dataflow

Data flows one way: the state you hold in glue code -> viewmodel -> `grid.draw()`. The grid is always a pure function of your state. viewmodel -> grid is very fast (hot path), it's expected that during update (interaction / data receive etc) viewmodel is updated and passed to grid for redrawing.

## Step 0 - clarify requirements with the user

Before writing code, resolve the data source (0.1) and the remaining questions (0.2). Ask the user only what is not already clear from their request.

### 0.1 Data - decision procedure

Two questions decide everything. **D1 - who executes queries?** Either the client can hold the full dataset (DuckDB WASM does all sort/filter/group/page locally), or the server owns querying (the API datamodel/datasource is the path). **D2 - is the shape known?** Either a schema is provided, or a sample must be examined to infer it.

Follow this procedure to answer them:

```text
START
  ask: "Where does the data live?"
  |
  |-- "in a JS object / array in the app"
  |       D1 = client (full data already in memory)
  |       --> RESOLVE_SCHEMA
  |
  |-- "at a URL serving JSON / CSV"
  |       fetch once and EXAMINE the response:
  |         - returns the complete dataset?     --> D1 = client
  |             (ingest via DuckDB WASM loadDataFromURL)
  |             --> RESOLVE_SCHEMA
  |         - accepts query/paging params,
  |           returns partial slices?           --> it is actually a REST endpoint,
  |                                                 go to the REST branch
  |
  |-- "behind a REST endpoint that does the querying"
  |       D1 = server
  |       clarify before coding:
  |         - which operations does the server support?
  |           (filter / sort / groupBy / pagination / aggregation)
  |         - request & response shape (payload contract)
  |       --> RESOLVE_SCHEMA
  |
  |-- anything else / unclear
          PROBE loop - keep asking until the answers place it in a branch above:
            - where is the data actually coming from?
            - is the FULL dataset obtainable at once, or only pages/slices?
                (full --> D1 = client; pages only --> D1 = server)
            - can we fetch a sample row set to examine?
          if it genuinely fits none of the above:
            - can the full data be downloaded once and handed to DuckDB WASM?
                yes --> treat as WASM_LOCAL (custom fetch/parse glue, then loadData)
            - otherwise --> CUSTOM

RESOLVE_SCHEMA (D2, runs for every branch)
  schema provided by user?          --> use it
  else: examine sample rows and infer
        (measure vs dimension, temporal/nominal/integer/decimal),
        confirm inferred schema with the user

TERMINAL STATES
  WASM_LOCAL   -- full data + DuckDB WASM datasource + SQL datamodels
  API_SERVER   -- server owns querying (REST, GraphQL, ...). Implement a thin
                  DataSource/DataModel for that protocol against the contract;
                  built-in API implementations are planned but not shipped yet
  CUSTOM       -- reach here only when full download is infeasible AND the server
                  cannot query (e.g. dumb paging over a huge dataset, live
                  streaming feeds, data locked in another client-side store)
```

Do not start coding until you have reached a terminal state and resolved the schema.

### 0.2 Remaining questions

1. **Shape** - a standard table (one row per record), or a pivot (aggregated rows x columns)?
2. **Interactions** - sorting, filtering, pagination, row grouping, selection? How should each look?
3. **Theme** - light, dark, or following the app's theme?
4. **Placement** - which framework, and which page/component should host the grid?

Sensible defaults if the user has no opinion: in-memory standard table, sortable column headers, light theme.

## Step 1 - install

If `@superplot/grid` is already in the project's dependencies, skip the install and keep the installed version. Otherwise, detect the package manager from the lockfile and install:

```sh
npm install @superplot/grid    # or: bun add / pnpm add / yarn add
```

TypeScript types ship with the package. It works under strict mode.

## Step 2 - read the guide that ships with the package

The full programming guide - import rules, the viewmodel/renderer contract, the interaction update path, renderer gotchas, framework glue, themes, and the SQL/pivot layers - ships inside the package, version-matched to what is installed:

**Read `node_modules/@superplot/grid/AGENTS.md` and follow it.**

If you cannot locate the file, fetch https://superplot.dev/grid/agents.md instead.

## Step 3 - verify

1. Build or start the dev server and open the page. The grid should render rows inside its scroll container.
2. Scroll: rows should virtualize smoothly with no blank flashes at normal speed.
3. Exercise each interaction you built and confirm the grid updates.
4. If cells render blank, check the two usual suspects: `data` is column-major, and `totalRows` is set.

## Reference

- Full agent guide (same content as the packaged AGENTS.md): https://superplot.dev/grid/agents.md
- Docs index for agents (fetch this for the full page list): https://superplot.dev/grid/docs/llms.txt
- Docs home: https://superplot.dev/grid/docs/
- npm: https://www.npmjs.com/package/@superplot/grid
