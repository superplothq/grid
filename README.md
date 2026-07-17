# SuperPlot Grid

A high-performance, headless JavaScript grid and pivot table. The core is fully framework-agnostic and exposes APIs for data modeling, viewmodel construction, and rendering, with React bindings provided on top.

The engine follows a layered pipeline: **DataSource -> DataModel -> DataViewModel -> Renderer**. Data is stored and queried through DuckDB (WASM in the browser, native in Node.js), reshaped into pivot or flat-table view models, and handed to a renderer designed to be fast and simple to reason about.

## Links

- Get started: https://superplot.dev/grid/docs
- Documentation: https://superplot.dev/grid/docs
- Live demos and samples: https://superplot.dev/grid/docs/samples

## Packages

This is a Yarn workspace made up of the following packages:

- **packages/grid** - Headless grid / pivot table core (TypeScript, DuckDB, SQL-based querying)
- **packages/frameworks** - Framework bindings (React 18): `DataGrid`, `usePivotGrid`, `useFlatGrid`, `useDataSource`
- **packages/playground** - React app for developing and demoing grid samples
- **packages/web** - SuperPlot public site (Next.js, static export) that hosts `/grid/docs`
- **packages/docs** - Standalone documentation site
- **packages/samples** - Self-contained grid samples consumed by the site

## Requirements

- Node.js 18+
- Yarn 1.x (this repo pins `yarn@1.22.22`)

## Getting started

Install dependencies from the repo root:

```bash
yarn install
```

Build the grid core (compiles TypeScript, builds CSS, and builds the React bindings):

```bash
yarn grid:build
```

Start the playground to explore samples during development:

```bash
yarn start
```

Run the public site (which serves the docs and demos locally):

```bash
yarn web:start
```

## Common scripts

Run from the repo root:

| Script | What it does |
| --- | --- |
| `yarn install` | Install all workspace dependencies |
| `yarn grid:build` | Build the grid core, CSS, and React bindings |
| `yarn start` | Start the playground app |
| `yarn web:start` | Start the SuperPlot web site (docs + demos) |
| `yarn web:build` | Build the web site (static export) |
| `yarn lint` | Lint every workspace |
| `yarn clean` | Remove build output across workspaces |

Package-scoped scripts:

```bash
# Run grid unit tests
yarn workspace grid test:unit

# Lint the grid package and auto-fix
yarn workspace grid lint --fix

# Type-check the samples package
yarn workspace samples types:check
```

## Learn more

See https://superplot.dev/grid/docs for guides, the API reference, and live samples.

## License

Released under the [MIT License](./LICENSE).
