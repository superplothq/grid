# Pivot Metadata Plumbing — Revised Plan

This document replaces `impl/pivot-metadata-plumbing.md` as the source of truth for metadata support.

The plan is structured in independent sections that can be implemented and reviewed separately. Each section is self-contained and does not depend on later sections.

---

## Section 1: ViewModel Metadata Types, Storage, and Renderer Plumbing

This section is independent of DataModel resolve + reshape. It adds the shared metadata types, stores them on the ViewModel, and threads them into every renderer context so that cell renderers can use metadata immediately when it is supplied through ViewModel params.

### Metadata Targets

Metadata can be attached to six targets in the grid:

| Target | Description | Addressing |
|--------|-------------|------------|
| **Column facet cells** | Column headers (e.g. "Q1", "revenue") | `level` + `index` in column facet space |
| **Row facet cells** | Row headers (e.g. "Europe", "Germany") | `level` + `index` in row facet space |
| **Header cells** | Corner cells / axis labels | `axis` + `level` |
| **Value cells — per column** | Metadata shared by all cells in a data column | `colIndex` |
| **Value cells — per row** | Metadata shared by all cells in a data row | `rowIndex` |
| **Value cells — per cell** | Metadata for a single data cell | `colIndex` + `rowIndex` |

### Shared Metadata Result Types

These types live in `packages/grid/src/renderer/types.ts` because both pivot and standard table ViewModels and renderers need them. The DataModel layer produces these; the ViewModel stores them; the renderer passes them through.

```ts
type MetadataValue = Record<string, unknown>;

interface ColumnFacetMetadata {
  level: number;
  index: number;
  meta: MetadataValue;
}

interface RowFacetMetadata {
  level: number;
  index: number;
  meta: MetadataValue;
}

interface HeaderMetadata {
  axis: "row" | "column";
  level: number;
  meta: MetadataValue;
}

interface ValueColumnMetadata {
  colIndex: number;
  meta: MetadataValue;
}

interface ValueRowMetadata {
  rowIndex: number;
  meta: MetadataValue;
}

interface ValueCellMetadata {
  colIndex: number;
  rowIndex: number;
  meta: MetadataValue;
}

interface ViewModelMetadata {
  columnFacets?: ColumnFacetMetadata[];
  rowFacets?: RowFacetMetadata[];
  headers?: HeaderMetadata[];
  valueColumns?: ValueColumnMetadata[];
  valueRows?: ValueRowMetadata[];
  valueCells?: ValueCellMetadata[];

  getValueCellMeta(colIndex: number, rowIndex: number): MetadataValue | undefined;
  getValueColumnMeta(colIndex: number): MetadataValue | undefined;
  getValueRowMeta(rowIndex: number): MetadataValue | undefined;
  getColumnFacetMeta(level: number, index: number): MetadataValue | undefined;
  getRowFacetMeta(level: number, index: number): MetadataValue | undefined;
  getHeaderMeta(axis: "row" | "column", level: number): MetadataValue | undefined;
}
```

Notes:

- The metadata arrays are dense — every entry is a complete record addressed by its coordinates (`colIndex`, `rowIndex`, `level`, etc.). Not every cell/column/row needs an entry; only targets that carry metadata appear in the array.
- `MetadataValue` is open-ended. Core does not interpret keys inside `meta`; product code and cell renderers own the semantics.
- `rowIndex` and `colIndex` in value metadata match `data[col][row]` coordinates directly. Pivot output is not paginated, so there is no offset translation.
- The accessor methods (`getValueCellMeta`, etc.) are part of the `ViewModelMetadata` interface so any code holding a metadata reference can do lookups without needing the viewmodel.

### ViewModel Storage

`GridDataViewModel` initializes `metadata` in the constructor with the accessor methods defined once. Subclass `updateData` merges incoming metadata arrays via spread — the methods survive because they're already on the object:

```ts
// GridDataViewModel constructor:
this.metadata = {
  // NOTE: do not use Array.find here — these methods sit in the render hot path
  // (called per cell). Build a Map index from the arrays and look up by key instead.
  getValueCellMeta: (col, row) => { ... },
  getValueColumnMeta: (col) => { ... },
  getValueRowMeta: (row) => { ... },
  getColumnFacetMeta: (level, index) => { ... },
  getRowFacetMeta: (level, index) => { ... },
  getHeaderMeta: (axis, level) => { ... },
};
```

Subclass `updateData` merges incoming arrays:

```ts
// In PivotDataViewModel.updateData / FlattenedDataViewModel.updateData:
if (params.metadata) {
  this.metadata = { ...this.metadata, ...params.metadata };
}
```

The spread preserves existing methods and any arrays not overwritten by the incoming partial. Multiple sources can contribute metadata for different targets incrementally.

`PivotDataViewModelParams` and `FlattenedDataViewModelParams` both add:

```ts
metadata?: Partial<ViewModelMetadata>;
```

When no metadata is pushed, the methods exist but return `undefined` (no arrays to search). No behavioral change to existing code.

### Renderer Context Changes

#### Value cell renderer — `RendererContext` + `ValueCellDataContext`

`RendererContext` stays unchanged — it is the renderer-owned context (container, key):

```ts
interface RendererContext {
  container: HTMLElement;
  key: string;
}
```

Add a new `ValueCellDataContext` that carries the data-side context, parallel to how facet renderers have `FacetDataContext`:

```ts
interface ValueCellDataContext {
  viewModel: GridDataViewModel;
  rowIndex: number;
  colIndex: number;
}
```

The `CellRenderer` signature becomes:

```ts
type CellRenderer<T> = (
  data: T,
  dataCtx: ValueCellDataContext,
  ctx: RendererContext,
) => string | HTMLElement | HTMLElement[] | void;
```

The renderer (`standard-layout.ts`) already has `absoluteColIndex` and `absoluteRowIndex` at the call site — they just aren't passed through today:

```ts
// current:
const content = renderer(value, { container: cell, key });

// becomes:
const dataCtx: ValueCellDataContext = {
  viewModel: this.data!,
  rowIndex: absoluteRowIndex,
  colIndex: absoluteColIndex,
};
const content = renderer(value, dataCtx, { container: cell, key });
```

This is a breaking change to `CellRenderer`. All existing cell renderers (including `textRenderer`, `createChartRenderer`, and user-provided renderers) need to accept the new second argument. Existing renderers that don't use metadata can ignore `dataCtx`.

#### Facet cell renderer — `FacetDataContext`

Current:

```ts
interface FacetDataContext {
  viewModel: GridDataViewModel;
  path: (string | null)[];
  level: number;
  index: number;
  flatMeta?: FlatRowMeta;
  key: string;
}
```

No changes needed. `viewModel.metadata` is available, so facet renderers can call `viewModel.metadata?.getColumnFacetMeta(level, index)` or `viewModel.metadata?.getRowFacetMeta(level, index)`.

#### Header cell renderer — `HeaderCellContext`

Current:

```ts
interface HeaderCellContext {
  viewModel: GridDataViewModel;
  level: number;
  key: string;
  cell: HTMLElement;
  container: HTMLElement;
  render: (viewModel: GridDataViewModel) => void;
}
```

No changes needed. Header renderers can call `viewModel.metadata?.getHeaderMeta(axis, level)`. The axis ("row" or "column") is known by the renderer from context (row headers vs column headers are rendered in different code paths).

### React Adapter Changes

#### `CellProps`

Current:

```ts
interface CellProps<T = any> {
  value: T;
  cell: HTMLElement;
}
```

Add:

```ts
interface CellProps<T = any> {
  value: T;
  cell: HTMLElement;
  viewModel: GridDataViewModel;
  rowIndex: number;
  colIndex: number;
}
```

In `ReactCellAdapter.createNativeDataCellRenderer`:

```ts
// current:
return (data: any, ctx: RendererContext) => { ... }

// becomes:
return (data: any, dataCtx: ValueCellDataContext, ctx: RendererContext) => {
  const root = this.#getOrCreateRoot(ctx.key, ctx.container);
  const wrapped = this.#wrap(createElement(Component, {
    value: data,
    cell: ctx.container,
    viewModel: dataCtx.viewModel,
    rowIndex: dataCtx.rowIndex,
    colIndex: dataCtx.colIndex,
  }));
  this.#pendingRenders.push(() => root.render(wrapped));
};
```

`FacetCellProps` and `FacetHeaderProps` already carry `viewModel` which exposes `.metadata` — no changes needed.

### Usage Examples

Value cell renderer with per-cell metadata:

```ts
const qualityRenderer: CellRenderer<unknown> = (data, dataCtx, ctx) => {
  const cellMeta = dataCtx.viewModel.metadata?.getValueCellMeta(dataCtx.colIndex, dataCtx.rowIndex);
  if (cellMeta?.quality === "missing") ctx.container.style.background = "#e5e7eb";
  if (cellMeta?.quality === "mismatched") ctx.container.style.background = "#fee2e2";
  return data == null ? "" : String(data);
};
```

Value cell renderer with per-column metadata (e.g. heatmap):

```ts
const heatmapRenderer: CellRenderer<number> = (data, dataCtx, ctx) => {
  const colMeta = dataCtx.viewModel.metadata?.getValueColumnMeta(dataCtx.colIndex);
  if (colMeta && data != null) {
    const intensity = (data - (colMeta.min as number)) / ((colMeta.max as number) - (colMeta.min as number));
    ctx.container.style.background = `rgba(25, 118, 210, ${intensity})`;
  }
  return data == null ? "" : String(data);
};
```

Column facet renderer with metadata (e.g. profile bar):

```ts
const profileFacetRenderer: FacetCellRenderer = (data, dataCtx, ctx) => {
  const meta = dataCtx.viewModel.metadata?.getColumnFacetMeta(dataCtx.level, dataCtx.index);
  if (meta) {
    const bar = document.createElement("div");
    bar.className = "profile-bar";
    bar.style.width = `${((meta.valid as number) / (meta.total as number)) * 100}%`;
    ctx.container.appendChild(bar);
  }
  return { content: data ?? "" };
};
```

### Implementation Steps

1. Add `ViewModelMetadata`, `ValueCellDataContext`, and related types to `packages/grid/src/renderer/types.ts`.
2. Initialize `metadata` with accessor methods in `GridDataViewModel` constructor.
3. Add `metadata?: Partial<ViewModelMetadata>` to `PivotDataViewModelParams` and `FlattenedDataViewModelParams`.
4. Merge incoming metadata in `PivotDataViewModel` and `FlattenedDataViewModel` `updateData`.
5. Add `ValueCellDataContext` as second argument to `CellRenderer` signature.
6. Update `standard-layout.ts` to pass `ValueCellDataContext` when calling value cell renderers.
7. Update built-in renderers (`textRenderer`, `createChartRenderer`) to accept the new signature.
8. Extend React `CellProps` with `viewModel`, `rowIndex`, `colIndex`.
9. Update `ReactCellAdapter.createNativeDataCellRenderer` to forward `ValueCellDataContext` fields.
10. Export new types from `packages/grid/src/renderer/index.ts` and `packages/frameworks/src/react/index.ts`.

---

## Section 2: Pivot DataModel Metadata Extraction

This section adds metadata extraction to the pivot DataModel pipeline. The user (or agent) provides a **metadata plumber** — a factory function that takes a `PivotConfig` and returns a paired **resolver** (what metadata to fetch) and **reshaper** (how to map it into `ViewModelMetadata`).

### Why Resolver + Reshaper

The pivot pipeline has two reshape stages:

1. **SQL reshape** — `SqlPivotTableDataModel.getData()` generates CTEs, joins, GROUP BY, but the result is returned as a SQL flat table in column-major format.
2. **Local reshape** — `PivotTableDataModel.getViewModelData()` maps each raw result row into `data[colIdx][rowIdx]` using inverted facet indexes.

Metadata must be extracted during stage 1 (as extra SQL columns) and placed into `ViewModelMetadata` coordinates during stage 2 (using the same dimension → facet index mapping). The resolver handles stage 1; the reshaper handles stage 2. Both are provided by the user because metadata semantics are product-specific.

### Metadata Config on PivotConfig

`PivotConfig` gains a generic `metadata` field. Core does not interpret this field — it passes it through to the resolver and reshaper. The agent defines the shape at implementation time:

```ts
interface PivotConfig {
  rows: AxisExpr | AxisConfig;
  columns: AxisExpr | AxisConfig;
  filter?: Filter[];
  sort?: SortEntry[];
  metadata?: unknown;  // agent-defined, opaque to core
}
```

Example — an agent might define:

```ts
interface MyMetadataConfig {
  profitField: string;
  groupByField: string;
  showMissing: boolean;
}

const config: PivotConfig = {
  rows: hierarchy("continent", "country"),
  columns: "revenue",
  metadata: {
    profitField: "profit",
    groupByField: "continent",
    showMissing: true,
  } as MyMetadataConfig,
};
```

The resolver and reshaper cast `config.metadata` to the type they expect. Core never touches it.

### No preAggregate / postAggregate Distinction

An earlier iteration of this plan split resolver contributions into two stages:

- **preAggregate** — logic evaluated against raw source rows before SQL grouping. The row-level expression is wrapped in an aggregate to survive GROUP BY. Example: counting rows where revenue is below a threshold.
- **postAggregate** — logic evaluated directly as aggregate expressions in the grouped result. Example: COUNT, MIN, MAX over a column.

This split is not needed. Both stages produce aggregate select expressions in the same GROUP BY query:

```sql
-- "pre-aggregate" (row-level logic inside aggregate):
SUM(CASE WHEN T."revenue" < 500 THEN 1 ELSE 0 END) AS "__meta__low_count"

-- "post-aggregate" (direct aggregate):
COUNT(T."revenue") AS "__meta__non_null"
```

Both are SQL strings added to the select list. The DataModel does not need to distinguish them. The resolver returns expressions; whether they contain row-level CASE logic or are pure aggregates is the resolver's business.

### Hidden Source Fields

The resolver can reference any source column through the table alias `T`, even fields not in the pivot config. The source table is already LEFT JOINed in the main query:

```sql
FROM __d__2 LEFT JOIN "data" T ON ...
```

So `T."profit"` is available even when `profit` is not a dimension or measure. No special `dependsOn` mechanism is needed.

### Window Functions and SQL Compatibility

The resolver returns opaque SQL strings dropped into the SELECT list. This includes window functions like `SUM(SUM(profit)) OVER (PARTITION BY continent)` — which is valid because window functions evaluate after GROUP BY and can reference aggregate results. DuckDB (the target engine for this project) supports nested aggregates in window functions, as do PostgreSQL and SQL Server.

If a future data source has stricter SQL limitations (e.g. older MySQL, SQLite), the resolver can work around it by returning a correlated subquery instead:

```ts
resolve({ gridCte }) {
  return [{
    alias: "__meta__continent_total",
    sql: `(SELECT SUM("profit") FROM "data" WHERE "continent" = ${gridCte}."continent")`,
  }];
}
```

The resolver interface does not constrain the SQL form — subqueries, window functions, CASE expressions, and scalar functions all work. The resolver implementation owns the workaround for its target engine; the interface does not need to change.

### Resolver

The resolver tells the DataModel what extra metadata to fetch alongside the main data. The base interface is generic over the contribution type `T` — each DataModel subclass defines its own contribution shape.

Base input and contract:

```ts
interface PivotMetadataResolverInput {
  ir: PivotDataFetchAndTransformIR;
  schema: DataSchema[];
}

interface PivotMetadataResolver<T> {
  resolve(input: PivotMetadataResolverInput): T[];
}
```

SQL-specific resolver — extends the base input with SQL context and fixes the contribution type to `SqlSelectExpression`:

```ts
interface SqlPivotMetadataResolverInput extends PivotMetadataResolverInput {
  gridCte: string;    // e.g. "__d__2"
  tableAlias: string; // "T"
}

interface SqlSelectExpression {
  alias: string; // e.g. "__meta__profit_pct"
  sql: string;   // e.g. "100.0 * SUM(T.\"profit\") / NULLIF(...)"
}

interface SqlPivotMetadataResolver extends PivotMetadataResolver<SqlSelectExpression> {
  resolve(input: SqlPivotMetadataResolverInput): SqlSelectExpression[];
}
```

Later, an API-specific resolver would fix a different contribution type:

```ts
// Future — not implemented now
interface ApiMetadataField {
  key: string;
  payload: Record<string, unknown>;
}

interface ApiPivotMetadataResolverInput extends PivotMetadataResolverInput {
  endpoint: string;
}

interface ApiPivotMetadataResolver extends PivotMetadataResolver<ApiMetadataField> {
  resolve(input: ApiPivotMetadataResolverInput): ApiMetadataField[];
}
```

The generic is scoped to the resolver — it does not ripple into `PivotConfig`, `PivotTableDataModel`, or other types. A single resolver can return multiple contributions for different metadata extractions. The matching reshaper reads all of them.

The resolver already knows the config because the plumber factory captured it in the closure — `PivotMetadataResolverInput` does not carry `config`.

### Reshaper

The reshaper maps raw result data into `ViewModelMetadata` coordinates after the local reshape.

```ts
interface PivotMetadataReshapeInput {
  config: PivotConfig;
  raw: PivotRawDataFromSource;
  data: any[][];                    // final reshaped grid: data[colIdx][rowIdx]
  rowIndex: Map<string, number>;    // dimension key → rowIdx
  colIndex: Map<string, number>;    // dimension key → colIdx
  rowFacets: (string | null)[][];   // fullRowFacets
  colFacets: (string | null)[][];   // fullColFacets
  measures: Measure[];
  rowDimCount: number;
  colDimCount: number;
}

interface PivotMetadataReshaper {
  reshape(input: PivotMetadataReshapeInput, metadata: Partial<ViewModelMetadata>): void;
}
```

For SQL, the reshaper reads metadata from extra columns in the raw result. For a future API DataModel, the reshaper might read metadata from a separate response field — the reshape input can be extended then.

The reshaper writes directly into `input.metadata`. `getViewModelData()` passes this metadata into `PivotDataViewModelParams`.

### Metadata Plumber — Factory Pattern

`PivotTableDataModel` does not have `PivotConfig` at construction time — it arrives later in `getViewModelData(config)`. The constructor takes a **plumber** factory function that receives the config and returns a paired `{ resolver, reshaper }`:

```ts
interface PivotMetadataPlumbing<T> {
  resolver?: PivotMetadataResolver<T>;
  reshaper: PivotMetadataReshaper;
}

type PivotMetadataPlumber<T = unknown> = (config: PivotConfig) => PivotMetadataPlumbing<T>;
```

The plumber closes over whatever setup it needs (validation rules, feature flags, etc.) and reads `config.metadata` to decide what to produce:

```ts
function createProfitMetadataPlumber(): PivotMetadataPlumber {
  return (config: PivotConfig) => {
    const metaConfig = config.metadata as MyMetadataConfig;
    if (!metaConfig?.profitField) {
      // No metadata requested — reshaper is a no-op
      return { reshaper: { reshape() {} } };
    }
    return {
      resolver: buildProfitResolver(metaConfig),
      reshaper: buildProfitReshaper(metaConfig),
    };
  };
}
```

### Integration in Constructors

The constructor takes the plumber as a single parameter. The base class owns the plumber and the reshaper call. The SQL subclass narrows the resolver type inside `getData`:

```ts
class PivotTableDataModel {
  private metadataPlumber?: PivotMetadataPlumber;

  constructor(schema: DataSchema[], metadataPlumber?: PivotMetadataPlumber) {
    super(schema);
    this.metadataPlumber = metadataPlumber;
  }
}

class SqlPivotTableDataModel extends PivotTableDataModel {
  constructor(
    schema: DataSchema[],
    dataSource: SqlDataSource,
    metadataPlumber?: PivotMetadataPlumber,
  ) {
    super(schema, metadataPlumber);
    this.dataSource = dataSource;
    this.table = dataSource.table;
  }
}
```

### Integration in getViewModelData

`getViewModelData` calls the plumber with the config, passes the resolver to `getData`, and calls the reshaper after the reshape loop:

```ts
async getViewModelData(config: PivotConfig): Promise<PivotDataViewModelParams> {
  const plumbing = this.metadataPlumber?.(config);

  // ... existing IR computation ...

  const result = await this.getData(ir.merged, plumbing?.resolver);

  // ... existing reshape loop that fills data[colIdx][rowIdx] ...

  let metadata: Partial<ViewModelMetadata> | undefined;
  if (plumbing?.reshaper) {
    metadata = {};
    plumbing.reshaper.reshape({
      config,
      raw: result,
      data,
      rowIndex,
      colIndex,
      rowFacets: fullRowFacets,
      colFacets: fullColFacets,
      measures: ir.measures,
      rowDimCount,
      colDimCount,
    }, metadata);
  }

  return {
    data,
    columnFacets: fullColFacets,
    rowFacets: fullRowFacets,
    options: { ... },
    metadata,
  };
}
```

### Integration in getData

`getData` gains an optional second parameter for the resolver. The base signature accepts `PivotMetadataResolver<unknown>`; the SQL subclass narrows it to `SqlPivotMetadataResolver`:

```ts
// Base class:
abstract getData(
  ir: PivotDataFetchAndTransformIR,
  metadataResolver?: PivotMetadataResolver<unknown>,
): Promise<PivotRawDataFromSource>;

// SQL subclass:
async getData(
  branch: PivotDataFetchAndTransformIR,
  metadataResolver?: PivotMetadataResolver<unknown>,
): Promise<PivotRawDataFromSource> {
  // ... existing CTE generation ...

  const sqlResolver = metadataResolver as SqlPivotMetadataResolver | undefined;
  const metadataContributions = sqlResolver?.resolve({
    ir: branch, schema: this.schema, gridCte, tableAlias: "T",
  }) ?? [];
  const metadataSelect = metadataContributions.map(s => `${s.sql} AS "${s.alias}"`);

  const selectClause = [...dimSelect, ...measureSelect, ...metadataSelect].join(", ");

  // ... existing query execution ...

  // existing columns/data extraction unchanged
  const columns = [...dimFields, ...measures.map(m => m.field)];
  // ...

  // metadata extracted separately
  const metadata: Record<string, any[]> | undefined =
    metadataContributions.length > 0
      ? Object.fromEntries(metadataContributions.map(c => [c.alias, rows.map(r => r[c.alias])]))
      : undefined;

  return { columns, data, ...(metadata && { metadata }) };
}
```

The SQL subclass narrows `PivotMetadataResolver<unknown>` to `SqlPivotMetadataResolver` because it knows it is dealing with SQL contributions. The base class never calls `resolve` — it only passes the resolver through to `getData`.

`PivotRawDataFromSource` gains an optional `metadata` field for metadata columns, keeping the existing `columns` and `data` untouched:

```ts
interface PivotRawDataFromSource {
  columns: string[];
  data: any[][];
  metadata?: Record<string, any[]>;  // alias → column values
}
```

Inside `getData`, metadata columns are extracted separately after query execution:

```ts
// existing flow unchanged
const columns = [...dimFields, ...measures.map(m => m.field)];
if (srcColumns.length > 0) columns.push(...srcColumns);
const data = columns.map((col, i) => { /* existing extraction logic */ });

// metadata extracted separately — does not touch columns/data
const metadataContributions = sqlResolver?.resolve({ ir: branch, schema: this.schema, gridCte, tableAlias: "T" }) ?? [];
const metadata: Record<string, any[]> | undefined =
  metadataContributions.length > 0
    ? Object.fromEntries(metadataContributions.map(c => [c.alias, rows.map(r => r[c.alias])]))
    : undefined;

return { columns, data, ...(metadata && { metadata }) };
```

The existing reshape loop in `getViewModelData` only reads `columns` and `data` — it never sees metadata columns. The reshaper reads metadata via `raw.metadata?.["__meta__..."]`.

### Profit Percentage Example

Config:

```ts
const config: PivotConfig = {
  rows: hierarchy("continent", "country"),
  columns: "revenue",
  metadata: {
    profitField: "profit",
    groupByField: "continent",
  },
};
```

Plumber factory:

```ts
function createProfitPlumber(): PivotMetadataPlumber {
  return (config: PivotConfig) => {
    const meta = config.metadata as { profitField: string; groupByField: string } | undefined;
    if (!meta) return { reshaper: { reshape() {} } };

    return {
      resolver: {
        resolve({ gridCte, tableAlias }) {
          return [{
            alias: "__meta__profit_pct",
            sql: `100.0 * SUM(${tableAlias}."${meta.profitField}") / NULLIF(SUM(SUM(${tableAlias}."${meta.profitField}")) OVER (PARTITION BY ${gridCte}."${meta.groupByField}"), 0)`,
          }];
        },
      } as SqlPivotMetadataResolver,

      reshaper: {
        reshape({ raw, rowIndex, rowDimCount }, metadata) {
          const profitPct = raw.metadata?.["__meta__profit_pct"];
          if (!profitPct) return;
          const numRows = raw.data[0]?.length ?? 0;

          metadata.rowFacets = [];
          for (let r = 0; r < numRows; r++) {
            const rowKey = [];
            for (let d = 0; d < rowDimCount; d++) {
              rowKey.push(raw.data[d][r] ?? null);
            }
            const rowIdx = rowIndex.get(rowKey.join("\0"));
            if (rowIdx === undefined) continue;

            metadata.rowFacets.push({
              level: 1,
              index: rowIdx,
              meta: { profitPct: profitPct[r] },
            });
          }
        },
      },
    };
  };
}
```

Generated SQL:

```sql
WITH __d__0 AS (SELECT "continent", "country", MIN(rowid) AS "__ord__0"
                FROM "data" GROUP BY "continent", "country")
SELECT __d__0."continent", __d__0."country",
  SUM(T."revenue") AS "revenue",
  100.0 * SUM(T."profit") / NULLIF(SUM(SUM(T."profit")) OVER (PARTITION BY __d__0."continent"), 0)
    AS "__meta__profit_pct"
FROM __d__0
LEFT JOIN "data" T ON T."continent" = __d__0."continent" AND T."country" = __d__0."country"
GROUP BY __d__0."continent", __d__0."country"
ORDER BY MIN(__d__0."__ord__0")
```

Usage:

```ts
const model = new SqlPivotTableDataModel(schema, dataSource, createProfitPlumber());

const params = await model.getViewModelData(config);
// params.metadata.rowFacets contains profit percentage per country
```

### What This Does Not Cover

- **Post-reshape metadata** (heatmaps, ranks, visual bands): These don't need a resolver — they compute metadata from the final grid. The reshaper already receives `data` so it can handle simple cases. A separate post-reshape callback can be added when needed.
- **Companion queries**: For metadata at a different grain than the main query. Can be added as an extension to the resolver when a concrete use case demands it.
- **Plugin registry**: No `kind`-based plugin lookup. The plumber returns a resolver and reshaper directly. If multiple metadata kinds are needed, the resolver returns multiple expressions and the reshaper handles them all. The plumber can read `config.metadata` to switch on/off different extractions.
- **Dimensionless pivot metadata**: When both axes are measure-only (e.g. `rows: concat("revenue", "cost"), columns: "profit"`), the merged IR has `dimSpec.type === "none"`. In this case, `SqlPivotTableDataModel.getData()` takes an early return with a simple `SELECT SUM(...) FROM table` — no CTEs, no grid CTE, no table alias `T`. The metadata resolver is not called in this branch because there is no `gridCte` or `tableAlias` to pass. This is a grand-total edge case (single row, no grouping). The reshaper can still compute post-reshape metadata from `data[][]` in this scenario, but SQL-contributed metadata is not available. Can be addressed later if a concrete use case needs it.

### Dry Runs

#### Dry Run 1: Concat measures with per-cell quality metadata

Config:

```ts
const config: PivotConfig = {
  rows: hierarchy("continent", "country"),
  columns: concat("revenue", "cost"),
  metadata: { quality: ["revenue", "cost"] },
};
```

IR:

- rowIR: `dimSpec = hierarchy(["continent", "country"])`, `measures = []`
- colIR: `dimSpec = none` (both are measures), `measures = [sum(revenue), sum(cost)]`
- combined dimSpec: `hierarchy(["continent", "country"])`
- measures: `[sum(revenue), sum(cost)]`
- `rowDimCount = 2`, `colDimCount = 0`

Resolver contributes:

```ts
resolve({ tableAlias }) {
  return [
    { alias: "__meta__revenue__count", sql: `COUNT(${tableAlias}."revenue")` },
    { alias: "__meta__revenue__missing", sql: `SUM(CASE WHEN ${tableAlias}."revenue" IS NULL THEN 1 ELSE 0 END)` },
    { alias: "__meta__cost__count", sql: `COUNT(${tableAlias}."cost")` },
    { alias: "__meta__cost__missing", sql: `SUM(CASE WHEN ${tableAlias}."cost" IS NULL THEN 1 ELSE 0 END)` },
  ];
}
```

Generated SQL:

```sql
WITH __d__0 AS (SELECT "continent", "country", MIN(rowid) AS "__ord__0"
                FROM "data" GROUP BY "continent", "country")
SELECT __d__0."continent", __d__0."country",
  SUM(T."revenue") AS "revenue",
  SUM(T."cost") AS "cost",
  COUNT(T."revenue") AS "__meta__revenue__count",
  SUM(CASE WHEN T."revenue" IS NULL THEN 1 ELSE 0 END) AS "__meta__revenue__missing",
  COUNT(T."cost") AS "__meta__cost__count",
  SUM(CASE WHEN T."cost" IS NULL THEN 1 ELSE 0 END) AS "__meta__cost__missing"
FROM __d__0
LEFT JOIN "data" T ON T."continent" = __d__0."continent" AND T."country" = __d__0."country"
GROUP BY __d__0."continent", __d__0."country"
ORDER BY MIN(__d__0."__ord__0")
```

Raw result:

```ts
{
  columns: ["continent", "country", "revenue", "cost"],
  data: [
    ["Asia", "Asia", "Europe", "Europe"],   // continent
    ["China", "Japan", "Germany", "UK"],     // country
    [5000, 3000, 4000, 2000],               // revenue
    [3000, 2000, 2500, 1500],               // cost
  ],
  metadata: {
    "__meta__revenue__count":   [42, 31, 38, 25],
    "__meta__revenue__missing": [3, 0, 1, 2],
    "__meta__cost__count":      [40, 30, 37, 24],
    "__meta__cost__missing":    [5, 1, 2, 3],
  }
}
```

Facets (`colDimCount = 0`, columns are just measure names):

```
fullColFacets = [["revenue", "cost"]]
fullRowFacets = [["Asia", "Asia", "Europe", "Europe"], ["China", "Japan", "Germany", "UK"]]

colIndex: "revenue" → 0, "cost" → 1
rowIndex: "Asia\0China" → 0, "Asia\0Japan" → 1, "Europe\0Germany" → 2, "Europe\0UK" → 3
```

Reshape loop:

```
r=0 (Asia, China):     mi=0 → data[0][0]=5000 (revenue)  mi=1 → data[1][0]=3000 (cost)
r=1 (Asia, Japan):     mi=0 → data[0][1]=3000             mi=1 → data[1][1]=2000
r=2 (Europe, Germany): mi=0 → data[0][2]=4000             mi=1 → data[1][2]=2500
r=3 (Europe, UK):      mi=0 → data[0][3]=2000             mi=1 → data[1][3]=1500
```

Reshaper — iterates raw rows × measures, reads metadata from `raw.metadata` per measure, writes per-cell:

```ts
reshape({ raw, rowIndex, colIndex, rowDimCount, measures }, metadata) {
  metadata.valueCells = [];
  const numRows = raw.data[0]?.length ?? 0;

  for (let r = 0; r < numRows; r++) {
    const rowKey = [];
    for (let d = 0; d < rowDimCount; d++) rowKey.push(raw.data[d][r] ?? null);
    const rowIdx = rowIndex.get(rowKey.join("\0"));
    if (rowIdx === undefined) continue;

    for (let mi = 0; mi < measures.length; mi++) {
      const field = measures[mi].field;
      const counts = raw.metadata?.[`__meta__${field}__count`];
      const missing = raw.metadata?.[`__meta__${field}__missing`];
      const colIdx = colIndex.get(field);  // measure name is the col key
      if (colIdx === undefined) continue;

      metadata.valueCells.push({
        colIndex: colIdx, rowIndex: rowIdx,
        meta: { count: counts?.[r], missing: missing?.[r] },
      });
    }
  }
}
```

Result — 8 entries (4 rows × 2 measures), e.g.:

```
colIdx=0(revenue), rowIdx=0(China):  { count: 42, missing: 3 }
colIdx=1(cost),    rowIdx=0(China):  { count: 40, missing: 5 }
colIdx=0(revenue), rowIdx=1(Japan):  { count: 31, missing: 0 }
...
```

#### Dry Run 2: Cross with window function — profit share as row facet metadata

Config:

```ts
const config: PivotConfig = {
  rows: hierarchy("continent", "country"),
  columns: cross("department", "revenue"),
  metadata: { profitShare: { field: "profit", partitionBy: "continent" } },
};
```

IR:

- rowIR: `dimSpec = hierarchy(["continent", "country"])`, `measures = []`
- colIR: `dimSpec = simple("department")`, `measures = [sum(revenue)]`
- combined: `cross(hierarchy(continent, country), simple(department))`
- `rowDimCount = 2`, `colDimCount = 1`

Resolver — window function computes country-level profit share within continent. The GROUP BY is (continent, country, department), so we use nested windows to get the country-level sum across departments:

```ts
resolve({ gridCte, tableAlias }) {
  return [{
    alias: "__meta__profit_share",
    sql: `100.0 * SUM(SUM(${tableAlias}."profit")) OVER (PARTITION BY ${gridCte}."continent", ${gridCte}."country")
           / NULLIF(SUM(SUM(${tableAlias}."profit")) OVER (PARTITION BY ${gridCte}."continent"), 0)`,
  }];
}
```

Generated SQL:

```sql
WITH __d__0 AS (SELECT "continent", "country", MIN(rowid) AS "__ord__0"
                FROM "data" GROUP BY "continent", "country"),
     __d__1 AS (SELECT "department", MIN(rowid) AS "__ord__1"
                FROM "data" GROUP BY "department"),
     __d__2 AS (SELECT * FROM __d__0 CROSS JOIN __d__1)
SELECT __d__2."continent", __d__2."country", __d__2."department",
  SUM(T."revenue") AS "revenue",
  100.0 * SUM(SUM(T."profit")) OVER (PARTITION BY __d__2."continent", __d__2."country")
         / NULLIF(SUM(SUM(T."profit")) OVER (PARTITION BY __d__2."continent"), 0)
    AS "__meta__profit_share"
FROM __d__2
LEFT JOIN "data" T ON T."continent"=__d__2."continent"
  AND T."country"=__d__2."country" AND T."department"=__d__2."department"
GROUP BY __d__2."continent", __d__2."country", __d__2."department"
ORDER BY MIN(__d__2."__ord__0"), MIN(__d__2."__ord__1")
```

The nested window `SUM(SUM(profit)) OVER (PARTITION BY continent, country)` collapses departments — gives the country total. Divided by `SUM(SUM(profit)) OVER (PARTITION BY continent)` — the continent total. The ratio is the same for every department row within the same country.

Raw result (4 countries × 2 departments = 8 rows):

```ts
{
  columns: ["continent", "country", "department", "revenue"],
  data: [
    ["Asia","Asia","Asia","Asia","Europe","Europe","Europe","Europe"],
    ["China","China","Japan","Japan","Germany","Germany","UK","UK"],
    ["Electronics","Apparel","Electronics","Apparel","Electronics","Apparel","Electronics","Apparel"],
    [2000, 3000, 1500, 1500, 2500, 1500, 1200, 800],
  ],
  metadata: {
    "__meta__profit_share": [62.5, 62.5, 37.5, 37.5, 66.7, 66.7, 33.3, 33.3],
  }
}
```

Note: profit share repeats within each country (62.5 for both China rows). This is row-level metadata, not cell-level.

Facets:

```
fullColFacets = [["Electronics", "Apparel"], ["revenue", "revenue"]]
fullRowFacets = [["Asia", "Asia", "Europe", "Europe"], ["China", "Japan", "Germany", "UK"]]

colIndex: "Electronics\0revenue" → 0, "Apparel\0revenue" → 1
rowIndex: "Asia\0China" → 0, "Asia\0Japan" → 1, "Europe\0Germany" → 2, "Europe\0UK" → 3
```

Reshaper — deduplicates by rowIdx since the value is the same across departments:

```ts
reshape({ raw, rowIndex, rowDimCount }, metadata) {
  const profitShare = raw.metadata?.["__meta__profit_share"];
  if (!profitShare) return;
  const numRows = raw.data[0]?.length ?? 0;
  const seen = new Set<number>();

  metadata.rowFacets = [];
  for (let r = 0; r < numRows; r++) {
    const rowKey = [];
    for (let d = 0; d < rowDimCount; d++) rowKey.push(raw.data[d][r] ?? null);
    const rowIdx = rowIndex.get(rowKey.join("\0"));
    if (rowIdx === undefined || seen.has(rowIdx)) continue;
    seen.add(rowIdx);

    metadata.rowFacets.push({
      level: 1, index: rowIdx,
      meta: { profitShare: profitShare[r] },
    });
  }
}
```

Result — 4 entries (one per country):

```
level=1, index=0(China):   { profitShare: 62.5 }
level=1, index=1(Japan):   { profitShare: 37.5 }
level=1, index=2(Germany): { profitShare: 66.7 }
level=1, index=3(UK):      { profitShare: 33.3 }
```

#### Dry Run 3: Array accumulation for sparkline charts

Config:

```ts
const config: PivotConfig = {
  rows: "continent",
  columns: cross("quarter", "revenue"),
  metadata: { sparkline: { field: "monthly_revenue" } },
};
```

IR:

- rowIR: `dimSpec = simple("continent")`, `measures = []`
- colIR: `dimSpec = simple("quarter")`, `measures = [sum(revenue)]`
- combined: `cross(simple(continent), simple(quarter))`
- `rowDimCount = 1`, `colDimCount = 1`

Resolver — uses DuckDB's `LIST` aggregate to accumulate individual values into an array:

```ts
resolve({ tableAlias }) {
  return [{
    alias: "__meta__sparkline",
    sql: `LIST(${tableAlias}."monthly_revenue" ORDER BY ${tableAlias}."month")`,
  }];
}
```

Generated SQL:

```sql
WITH __d__0 AS (SELECT "continent", MIN(rowid) AS "__ord__0"
                FROM "data" GROUP BY "continent"),
     __d__1 AS (SELECT "quarter", MIN(rowid) AS "__ord__1"
                FROM "data" GROUP BY "quarter"),
     __d__2 AS (SELECT * FROM __d__0 CROSS JOIN __d__1)
SELECT __d__2."continent", __d__2."quarter",
  SUM(T."revenue") AS "revenue",
  LIST(T."monthly_revenue" ORDER BY T."month") AS "__meta__sparkline"
FROM __d__2
LEFT JOIN "data" T ON T."continent"=__d__2."continent" AND T."quarter"=__d__2."quarter"
GROUP BY __d__2."continent", __d__2."quarter"
ORDER BY MIN(__d__2."__ord__0"), MIN(__d__2."__ord__1")
```

`LIST(... ORDER BY month)` returns a native ordered array per group. No JSON packing — DuckDB returns arrays natively.

Raw result (3 continents × 4 quarters = 12 rows):

```ts
{
  columns: ["continent", "quarter", "revenue"],
  data: [
    ["Asia","Asia","Asia","Asia","Europe","Europe","Europe","Europe","NA","NA","NA","NA"],
    ["Q1","Q2","Q3","Q4","Q1","Q2","Q3","Q4","Q1","Q2","Q3","Q4"],
    [1200, 1500, 1800, 2000, 900, 1100, 1300, 1400, 2000, 2200, 2500, 2800],
  ],
  metadata: {
    "__meta__sparkline": [
      [400,380,420], [500,490,510], [580,600,620], [650,670,680],   // Asia
      [290,300,310], [350,360,390], [420,430,450], [460,470,470],   // Europe
      [650,670,680], [720,730,750], [810,840,850], [900,930,970],   // NA
    ],
  }
}
```

`metadata["__meta__sparkline"]` is an array of arrays — each element is the LIST result for that group. `columns` and `data` are untouched; the existing reshape loop never sees the sparkline data.

Facets:

```
fullColFacets = [["Q1","Q2","Q3","Q4"], ["revenue","revenue","revenue","revenue"]]
fullRowFacets = [["Asia", "Europe", "NA"]]

colIndex: "Q1\0revenue"→0, "Q2\0revenue"→1, "Q3\0revenue"→2, "Q4\0revenue"→3
rowIndex: "Asia"→0, "Europe"→1, "NA"→2
```

Reshaper — attaches sparkline array as per-cell metadata:

```ts
reshape({ raw, rowIndex, colIndex, rowDimCount, colDimCount, measures }, metadata) {
  const sparkline = raw.metadata?.["__meta__sparkline"];
  if (!sparkline) return;
  const numRows = raw.data[0]?.length ?? 0;
  const totalDimCount = rowDimCount + colDimCount;

  metadata.valueCells = [];
  for (let r = 0; r < numRows; r++) {
    const rowKey = [];
    for (let d = 0; d < rowDimCount; d++) rowKey.push(raw.data[d][r] ?? null);

    const colDimParts = [];
    for (let d = rowDimCount; d < totalDimCount; d++) colDimParts.push(raw.data[d][r] ?? null);

    for (let mi = 0; mi < measures.length; mi++) {
      const colKey = [...colDimParts, measures[mi].field].join("\0");
      const rowIdx = rowIndex.get(rowKey.join("\0"));
      const colIdx = colIndex.get(colKey);
      if (rowIdx === undefined || colIdx === undefined) continue;

      metadata.valueCells.push({
        colIndex: colIdx, rowIndex: rowIdx,
        meta: { sparkline: sparkline[r] },
      });
    }
  }
}
```

Result — 12 entries (one per cell), e.g.:

```
colIdx=0(Q1), rowIdx=0(Asia):   { sparkline: [400, 380, 420] }
colIdx=1(Q2), rowIdx=0(Asia):   { sparkline: [500, 490, 510] }
colIdx=0(Q1), rowIdx=1(Europe): { sparkline: [290, 300, 310] }
...
```

Cell renderer shows aggregate value + sparkline:

```ts
const sparkRenderer: CellRenderer<number> = (data, dataCtx, ctx) => {
  const meta = dataCtx.viewModel.metadata?.getValueCellMeta(dataCtx.colIndex, dataCtx.rowIndex);
  if (meta?.sparkline) {
    const values = meta.sparkline as number[];
    ctx.container.innerHTML = `<span>${data ?? ""}</span>${createSparklineSVG(values, 60, 16)}`;
    return;
  }
  return data == null ? "" : String(data);
};
```

### Implementation Steps

1. Add `metadata?: unknown` to `PivotConfig` in `packages/grid/src/datamodel/types.ts`.
2. Add `PivotMetadataResolver<T>`, `SqlPivotMetadataResolver`, `PivotMetadataReshaper`, `PivotMetadataPlumber`, `PivotMetadataPlumbing`, and related input types to `packages/grid/src/datamodel/types.ts`.
3. Add `metadataPlumber` constructor param to `PivotTableDataModel`.
4. Add optional `PivotMetadataResolver<unknown>` param to the abstract `getData` signature.
5. In `SqlPivotTableDataModel.getData()`, narrow resolver to `SqlPivotMetadataResolver`, call `resolve()`, and append contributions to `selectClause`.
6. In `PivotTableDataModel.getViewModelData()`, call plumber with config, pass resolver to `getData`, call reshaper after reshape loop.
7. Pass `metadata` into the returned `PivotDataViewModelParams`.
