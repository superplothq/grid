# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. This repository creates a high performant js grid.

## Project Structure

This is a Bun workspace with following packages:

- **packages/grid**: High performant Grid / pivot table implementation — headless core that exposes APIs for data modeling, viewmodel construction, and rendering
- **packages/frameworks**: Framework-specific bindings (currently React 18) that wrap the headless grid core into components
- **packages/playground**: React web application that creates playground where samples of grid can get created during development / demo
- **packages/web**: SuperPlot public site (Next.js 16 static export, React 19, dev port 3334). Owns its own `/docs` route: fumadocs is wired directly into this app (`source.config.ts`, `app/docs/`, `lib/docs-source.ts`). Samples render at `/docs/samples`.
- **packages/docs**: Standalone fumadocs documentation site (dev port 3333, has its own CLAUDE.md). **Unrelated to web's `/docs` route** — never implement web `/docs` features here or merge its output into web.
- **packages/samples**: Self-contained grid samples consumed by web's `/docs` via a fumadocs collection. Each sample is one directory (`src/samples/<id>/`) holding `index.mdx` (page + frontmatter), `sample.ts` (`mount(el, ctx) => cleanup`, headless core + in-memory viewmodels — no DuckDB), `conversation.json` (human/agent transcript), and optional `thumbnail.*`. Shared helpers are hoisted to `src/runtime/`; samples never import from sibling samples. Datasets live in `datasets/`.

### Technology Stack
- **grid**: TypeScript, ESLint, DuckDB (WASM for browser, native for Node.js) for local data storage and SQL-based querying
- **frameworks**: React 18, TypeScript, ESLint
- **playground**: React 18, TypeScript, Webpack 5, ESLint
- **web**: Next.js 16 (static export), React 19, fumadocs (core/mdx/ui), Tailwind 4 (loaded only via `app/docs/docs.css`)
- **docs**: Next.js 16 (static export), React 19, fumadocs, Tailwind 4
- **samples**: TypeScript only — depends on `grid` (deep-imports `@superplot/grid/renderer` to avoid pulling DuckDB), no framework dependency

### package.json scripts
- grid unit tests: bun --filter @superplot/grid test:unit
- grid lint: bun --filter @superplot/grid lint --fix
- build: bun --filter @superplot/grid build
- playground build: bun --filter playground build
- samples type check: bun --filter samples types:check
- web build: bun --filter web build (emits raw sample sources to public/samples first)

### Development Server
Already setup by the user and running.

## Grid

### Philosophy
The grid follows a layered pipeline: **DataSource → DataModel → DataViewModel → Renderer**. The DataSource handles raw data storage and query execution. The DataModel transforms data (pivot aggregation, flat table grouping). The DataViewModel is the bridge contract — a thin, ready-to-render structure. The final step, DataViewModel → Renderer, is designed to be stupid fast and easy to reason about.

### Headless core and framework bindings
The grid core (`packages/grid`) is fully headless — no UI framework dependency. It exposes APIs that any framework can call. The `packages/frameworks` package provides React bindings (`DataGrid` component, hooks like `usePivotGrid`, `useFlatGrid`, `useDataSource`, and `DataSourceProvider` context).

### DataSource layer
`DataSource<T>` is the generic interface for query execution with ref-counted lifecycle (`addRef`/`release`). `SqlDataSource` (abstract) narrows to SQL strings and provides `loadData()` for column-major data ingestion. Multiple grids (pivot and flat) can share a single datasource via ref counting.

- `DataSource<T>` (interface) — generic: execute, addRef, release
  - `SqlDataSource` (abstract) — implements `DataSource<string>`, adds loadData + table
    - `DuckDBDataSource` — Node.js native DuckDB
    - `DuckDBWasmDataSource` — Browser WASM DuckDB

### DataModel layer
Two pipelines share the same DataSource:
- **Pivot**: `SqlPivotDataModel` — takes a `PivotConfig` with table algebra operators (`cross`, `hierarchy`, `concat`), generates SQL via IR, reshapes flat results into a 2D pivot grid, produces `PivotDataViewModel`
- **Flat table**: `SqlFlatTableDataModel` — renders individual rows with optional row grouping and expand/collapse, produces `FlattenedDataViewModel`

Inheritance:
- `GridPivotDataModel` (abstract)
  - `SqlPivotDataModel` — takes `SqlDataSource`, generates SQL from pivot config
- `FlatTableDataModel` (abstract)
  - `SqlFlatTableDataModel` — takes `SqlDataSource`, generates SQL for grouped/paginated rows

See `docs/pivot-data-pipeline.md` and `docs/flat-table-pipeline.md` for full pipeline documentation.

### ViewModel layer
`GridDataViewModel` is the bridge contract between datamodel and renderer. Both subclasses provide `getSlice()` for virtualized rendering of only the visible viewport.

- `GridDataViewModel` (abstract)
  - `PivotDataViewModel` — multi-level row/column facets with aggregated data cells
  - `FlattenedDataViewModel` — single-level row facet with packed row metadata (depth/leaf/expanded bits in `Uint8Array`)

### Renderer side
- `Grid` (controller/entry point) receives `GridDataViewModel` via `grid.data = viewModel`
- `Grid` delegates to layout: `StandardLayout` for pivot, `GroupedRowLayout` for flat tables (extends `StandardLayout`)
- Layout uses `viewModel.getSlice()` for virtualized rendering of visible cells

## Notes
- Do NOT write defensive code unless explicity asked to do so. It's better to get runtime error than to create bugs with defensive code.
- Do NOT make formatting changes (like adding/removing spaces, adding/removing newlines, etc) to existing code.
- If you are writing test, do NOT add number for text inside describe or it.
- Do NOT write comments unless explicity asked to do so. But do NOT remove any existing comments.
- Do NOT address TODO in code comments unless explicity asked to do so.
- Run lint `bun --filter @superplot/grid lint --fix 2>&1` to fix autofixable lints and report the rest which you can try fixing manually
- Do NOT run playground build
- All packages use TypeScript with strict mode enabled
- The workspace uses Bun workspaces for dependency management
- ESLint: grid/frameworks/playground use eslint 8 (legacy .eslintrc); web/docs use eslint 9 flat config with eslint-config-next. Keep web/docs on eslint ^9 — eslint 10 breaks eslint-config-next's plugin stack (eslint-plugin-react supports up to ^9.7)
