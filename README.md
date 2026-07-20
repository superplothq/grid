# SuperPlot Grid

A high-performance, headless JavaScript grid and pivot table. The core is fully framework-agnostic and exposes APIs for data modeling, viewmodel construction, and rendering, with React bindings provided on top.

The engine follows a layered pipeline: **DataSource -> DataModel -> DataViewModel -> Renderer**. Data is stored and queried through DuckDB (WASM in the browser, native in Node.js), reshaped into pivot or flat-table view models, and handed to a renderer designed to be fast and simple to reason about.

## Links

- Get started: https://superplot.dev/grid/docs
- Documentation: https://superplot.dev/grid/docs
- Live demos and samples: https://superplot.dev/grid/docs/samples

## Packages

This is a Bun workspace made up of the following packages:

- **packages/grid** - Headless grid / pivot table core (TypeScript, DuckDB, SQL-based querying)
- **packages/frameworks** - Framework bindings (React 18): `DataGrid`, `usePivotGrid`, `useFlatGrid`, `useDataSource`
- **packages/web** - SuperPlot public site (Next.js, static export) that hosts `/grid/docs`

## Getting started

Install dependencies from the repo root:

```bash
bun install
```

Build the grid core (compiles TypeScript, builds CSS, and builds the React bindings):

```bash
bun run grid:build
```

Start the playground to explore samples during development:

```bash
bun run start
```

Run the public site (which serves the docs and demos locally):

```bash
bun run web:start
```

## Common scripts

Run from the repo root:

| Script | What it does |
| --- | --- |
| `bun install` | Install all workspace dependencies |
| `bun run grid:build` | Build the grid core, CSS, and React bindings |
| `bun run start` | Start the playground app |
| `bun run web:start` | Start the SuperPlot web site (docs + demos) |
| `bun run web:build` | Build the web site (static export) |
| `bun run lint` | Lint every workspace |
| `bun run clean` | Remove build output across workspaces |

Package-scoped scripts:

```bash
# Run grid unit tests
bun --filter @superplot/grid test:unit

# Lint the grid package and auto-fix
bun --filter @superplot/grid lint --fix

# Type-check the samples package
bun --filter samples types:check
```

## Learn more

See https://superplot.dev/grid/docs for guides, the API reference, and live samples.

## License

Released under the [MIT License](./LICENSE).
