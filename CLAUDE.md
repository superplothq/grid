# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. This repository creates a high performant js grid.

## Project Structure

This is a yarn workspace with following packages:

- **packages/utils**: Ignore for now
- **packages/datamodel**: Ignore for now
- **packages/playground**: React web application that creates playground where samples of grid can get created during development / demo
- **packages/grid**: High peformant Grid / pivot table implementation

### Technology Stack
- **utils**: TypeScript, ESLint
- **datamodel**: TypeScript, ESLint
- **grid**: TypeScript, ESLint
- **playground**: React 18, TypeScript, Webpack 5, ESLint

### package.json scripts
- grid unit tests: yarn workspace grid test:unit
- grid lint: yarn workspace grid lint --fix
- build: yarn workspace grid build && yarn workspace grid build:css
- playground build: yarn workspace playground build

### Development Server
Already setup by the user and running. 

## Grid

- Renderer and datamodel are decoupled; `GridDataViewModel` is the bridge contract between them
- ./packages/playground/src/grid.tsx uses the grid library to render the grid

### Datamodel side
- `GridDataModel` (abstract) → `SqlDataModel` (abstract, SQL-based pivot) → `DuckDBDataModel` (node) → `InMemoryDataModel` (node in-memory)
- `SqlDataModel` → `DuckDBWasmDataModel` (browser wasm) → `BrowserInMemoryDataModel` (browser in-memory)
- `GridDataModel.getViewModelData(PivotConfig)` resolves facet spaces, fetches aggregated data, reshapes into pivot table, returns `GridDataViewModel`
- Subclasses implement `resolveFacetValues()` and `getData()` — the actual data fetching

### Renderer side
- `Grid` (controller/entry point) receives `GridDataViewModel` via `grid.data = viewModel`
- `Grid` delegates to `StandardLayout` (extends `PLayout` abstract protocol)
- Layout uses `viewModel.getSlice()` for virtualized rendering of visible cells

## Notes
- Do NOT write defensive code unless explicity asked to do so. It's better to get runtime error than to create bugs with defensive code.
- Do NOT make formatting changes (like adding/removing spaces, adding/removing newlines, etc) to existing code.
- If you are writing test, do NOT add number for text inside describe or it.
- Do NOT write comments unless explicity asked to do so. But do NOT remove any existing comments.
- Do NOT address TODO in code comments unless explicity asked to do so.
- Run lint `yarn workspace grid lint --fix 2>&1` to fix autofixable lints and report the rest which you can try fixing manually
- Do NOT run playground build
- All packages use TypeScript with strict mode enabled
- The workspace uses yarn workspaces for dependency management
- ESLint is configured but may need workspace-level configuration fixes
