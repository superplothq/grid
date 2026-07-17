# Standard Table Metadata Plumbing — Revised Plan

This document describes metadata support for the standard table (flat table) pipeline. It follows the same pattern established by `impl/pivot-metadata-plumbing-revised.md` for pivot tables.

The ViewModel and renderer plumbing (Section 1 of the pivot plan) is already implemented and shared between both pipelines:

- `ViewModelMetadata` types with 6 targets and Map-indexed accessor methods
- `FlattenedDataViewModelParams.metadata?: Partial<ViewModelMetadata>`
- `GridDataViewModel.mergeMetadata()` with `#rebuildMetadataIndexes()`
- `CellRenderer<T>` signature: `(data, dataCtx: ValueCellDataContext, ctx: RendererContext)`
- `standard-layout.ts` passes `ValueCellDataContext` to cell renderers
- React `CellProps` extended with `viewModel`, `rowIndex`, `colIndex`

This plan covers the DataModel layer only — how metadata is requested, resolved, cached, and projected into `FlattenedDataViewModelParams`.

---

## Key Difference from Pivot: Pagination

Pivot output is not paginated — one `getData` call returns all rows, one reshape pass produces the full grid. Metadata is resolved once and reshaped once.

Standard table data is paginated via `PageNode`s. The `StandardTableDataModel` maintains a tree of page slots; each page holds a fixed slice of rows. Pages are fetched on demand as the user scrolls, and distant pages are evicted when the cache grows too large.

This creates two metadata storage lifetimes:

| Scope | Lifetime | Example |
|-------|----------|---------|
| **Column metadata** | Global to the current query shape (project, groupBy, filter, sort). Fetched once, survives page fetches and evictions. Invalidated when the IR changes. | min, max, missing count, distinct count, top values |
| **Page metadata** (rows + cells) | Scoped to a `PageNode`. Fetched alongside page data in the same query. Evicted when the page is evicted. | per-cell quality, per-row markers, validation flags |

The ViewModel only sees one contiguous block of rows at a time (the pages around the current scroll position). The DataModel projects cached column metadata plus visible page metadata into a single `ViewModelMetadata` aligned with the returned data block.

---

## globalResolver + resolver + reshaper

The standard table has two resolvers because column metadata and page metadata have fundamentally different scopes:

- **Column metadata** is global — min/max/missing across the entire table. It cannot come from a page-scoped `getData` call because the page query has `LIMIT/OFFSET` and only sees a slice of rows. A separate query is needed.
- **Page metadata** is page-scoped — per-row/per-cell data for the rows in that page. This fits the pivot pattern: contributions ride along with the `getData` call.

### globalResolver

Runs once when column metadata cache is missing. Runs its own query (not through `getData`). Returns raw global metadata.

```ts
interface StandardMetadataResolverInput {
  ir: StandardDataFetchAndTransformIR;
  schema: DataSchema[];
  dataSource?: DataSource<any>;
}

interface StandardGlobalMetadataResolver {
  resolve(input: StandardMetadataResolverInput): Promise<StandardRawMetadata>;
}
```

No `rowData` in the input — global metadata doesn't depend on any single page's data.

### resolver

Contributes to each `getData` call, same pattern as pivot's `PivotMetadataResolver<T>`. For SQL, returns `SqlSelectExpression[]` that get appended to the page query's SELECT clause. Raw page metadata comes back in `GetRowsResponse.metadata` alongside page data.

The base interface is generic over the contribution type `T`:

```ts
interface StandardMetadataResolver<T> {
  resolve(input: StandardMetadataResolverInput): T[];
}

interface SqlStandardMetadataResolver extends StandardMetadataResolver<SqlSelectExpression> {
  resolve(input: SqlStandardMetadataResolverInput): SqlSelectExpression[];
}

interface SqlStandardMetadataResolverInput extends StandardMetadataResolverInput {
  table: string;
}
```

This mirrors the pivot pattern where `SqlPivotMetadataResolver` extends `PivotMetadataResolver<SqlSelectExpression>` with SQL-specific input fields (`gridCte`, `tableAlias`). For standard table, the SQL-specific context is `table` (the table name).

### globalReshaper

Paired with `globalResolver`. Takes global raw metadata and produces `StandardColumnMetadata[]` — cached on the model:

```ts
interface StandardGlobalMetadataReshaperInput {
  ir: StandardDataFetchAndTransformIR;
  raw: StandardRawMetadata;
  schema: DataSchema[];
}

interface StandardGlobalMetadataReshaper {
  reshape(input: StandardGlobalMetadataReshaperInput): StandardColumnMetadata[];
}
```

### reshaper

Paired with `resolver`. Takes page raw metadata + page data and produces `PageMetadata` — cached on the PageNode. Same role as pivot's `PivotMetadataReshaper`:

```ts
interface StandardMetadataReshaperInput {
  ir: StandardDataFetchAndTransformIR;
  pageMetadata: Record<string, any[]>;
  rowData: any[][];
  schema: DataSchema[];
}

interface StandardMetadataReshaper {
  reshape(input: StandardMetadataReshaperInput): PageMetadata;
}
```

The reshaper receives `rowData` alongside `pageMetadata` so it can cross-reference raw metadata with page data (e.g., resolver returns column min/max via SQL, reshaper derives per-cell heatmap intensity from the data values + column bounds).

---

## Plumber Factory

The constructor takes a **plumber** factory function that receives the IR and returns the paired resolvers + reshaper:

```ts
interface StandardMetadataPlumbing {
  globalResolver?: StandardGlobalMetadataResolver;
  globalReshaper?: StandardGlobalMetadataReshaper;
  resolver?: StandardMetadataResolver<unknown>;
  reshaper: StandardMetadataReshaper;
}

type StandardMetadataPlumber = (ir: StandardDataFetchAndTransformIR) => StandardMetadataPlumbing;
```

The plumber closes over whatever setup it needs and reads `ir.metadata` to decide what to produce:

```ts
function createQualityPlumber(rules: ValidationRule[]): StandardMetadataPlumber {
  return (ir: StandardDataFetchAndTransformIR) => {
    const config = ir.metadata as QualityConfig | undefined;
    return {
      globalResolver: buildProfileResolver(config),
      globalReshaper: buildProfileReshaper(config),
      resolver: buildQualityPageResolver(config),
      reshaper: buildQualityReshaper(config),
    };
  };
}
```

The plumber is called on every `getViewModelData`, but this is lightweight — it just creates resolver/reshaper objects (closures). The actual expensive work (server calls, SQL queries) only happens when column metadata is missing from the model cache or a `PageNode` doesn't have metadata yet. If metadata config hasn't changed and pages already have cached metadata, the resolvers are never called.

---

## Metadata Config on IR

`StandardDataFetchAndTransformIR` gains a generic `metadata` field. Core does not interpret this field — it passes it through to the plumber. The agent defines the shape at implementation time:

```ts
interface StandardDataFetchAndTransformIR {
  startRow: number;
  endRow: number;
  groupPath: string[];
  groupBy: string[];
  project: string[];
  sort: SortEntry[];
  filter: ScalarFilter[];
  metadata?: unknown;  // NEW — agent-defined, opaque to core
}
```

This is the same pattern as `PivotConfig.metadata?: unknown`. Core only checks for truthiness (`if (ir.metadata)`) to decide whether to invoke the plumber.

---

## Raw Metadata Types

### Global raw — resolver output

The global resolver returns raw metadata in an open-ended format:

```ts
interface StandardRawMetadata {
  [key: string]: unknown;
}
```

For a SQL resolver, this might contain raw query result rows. The reshaper knows how to interpret it because the plumber created both from the same config.

### Page raw — from GetRowsResponse

Page metadata rides along with the `getData` call. `GetRowsResponse` gains an optional `metadata` field, same pattern as `PivotRawDataFromSource.metadata`:

```ts
interface GetRowsResponse {
  rowData: any[][];
  totalRowCount: number;
  metadata?: Record<string, any[]>;  // NEW — alias → column-major arrays
}
```

The resolver contributes SQL expressions (or other contributions) to `getData`. The SQL subclass appends them to the SELECT clause, extracts metadata columns from results, and returns them in `GetRowsResponse.metadata`. Existing `rowData` and `totalRowCount` extraction is untouched.

---

## Cache Types — Reshaper Outputs

Each reshaper returns exactly what gets cached. No wrapper type needed.

`globalReshaper.reshape(...)` → `StandardColumnMetadata[]` → cached on model:

```ts
interface StandardColumnMetadata {
  colIdx: number;
  meta: MetadataValue;
}
```

`reshaper.reshape(...)` → `PageMetadata` → cached on PageNode:

```ts
interface StandardPageRowMetadata {
  rowIdx: number;  // local to PageNode
  meta: MetadataValue;
}

interface StandardPageCellMetadata {
  rowIdx: number;  // local to PageNode
  colIdx: number;
  meta: MetadataValue;
}

interface PageMetadata {
  rows?: StandardPageRowMetadata[];
  cells?: StandardPageCellMetadata[];
}
```

### Storage

Column metadata is stored on the model instance:

```ts
class StandardTableDataModel {
  columnMetadata?: StandardColumnMetadata[];
}
```

Page metadata is stored on the `PageNode`:

```ts
interface PageNode {
  data: any[][] | null;
  physicalStart: number;
  rowCount: number;
  expandedRows: Map<number, ExpandedGroup>;
  metadata?: PageMetadata;  // NEW
}
```

When the IR changes (groupBy, filter, project, sort), both `this.pages` and `this.columnMetadata` are reset. When a page is evicted, its `metadata` is lost with it — same lifecycle as `data`.

---

## Integration in StandardTableDataModel

The base class takes the plumber as an optional constructor parameter:

```ts
abstract class StandardTableDataModel {
  private metadataPlumber?: StandardMetadataPlumber;
  columnMetadata?: StandardColumnMetadata[];

  constructor(schema: DataSchema[], config: Partial<StandardTableConfig> = {}, metadataPlumber?: StandardMetadataPlumber) {
    super(schema);
    this.config = { ...defaultConfig, ...config };
    this.metadataPlumber = metadataPlumber;
  }
}
```

### getData signature

`getData` gains an optional second parameter for the resolver, mirroring pivot's `getData(ir, metadataResolver?)`:

```ts
abstract getData(
  ir: StandardDataFetchAndTransformIR,
  resolver?: StandardMetadataResolver<unknown>,
): Promise<GetRowsResponse>;
```

The base class passes the resolver through. The SQL subclass narrows it to `SqlStandardMetadataResolver` inside `getData`.

### Integration in getViewModelData

```ts
async getViewModelData(ir: StandardDataFetchAndTransformIR): Promise<FlattenedDataViewModelParams> {
  // ... existing IR change detection and page reset ...

  // When IR changes, also reset column metadata
  if (irChanged) {
    this.columnMetadata = undefined;
  }

  // ... existing bootstrap and page slot creation ...

  const plumbing = ir.metadata ? this.metadataPlumber?.(ir) : undefined;

  // Global column metadata: resolve + reshape once when missing
  const columnMetadataPromise =
    plumbing?.globalResolver && !this.columnMetadata
      ? this.resolveGlobalMetadata(ir, plumbing)
      : undefined;

  // Page fetches — pass resolver to getData
  const pagesToFetch = getUnfetchedPagesByLogicalBoundary(this.pages, ir.startRow, ir.endRow);

  await Promise.all([
    columnMetadataPromise?.then(cols => {
      if (cols) this.columnMetadata = cols;
    }),
    ...pagesToFetch.map(async (req) => {
      const fetchIR: StandardDataFetchAndTransformIR = {
        ...ir,
        groupPath: req.selectPath,
        startRow: req.page.physicalStart,
        endRow: req.page.physicalStart + req.page.rowCount,
      };
      // resolver contributions ride along with getData
      const response = await this.getData(fetchIR, plumbing?.resolver);
      req.page.data = response.rowData;

      // Reshape page metadata from response
      if (plumbing?.reshaper && response.metadata && !req.page.metadata) {
        req.page.metadata = plumbing.reshaper.reshape({
          ir: fetchIR,
          pageMetadata: response.metadata,
          rowData: response.rowData,
          schema: this.schema,
        });
      }
    }),
  ]);

  this.#evictIfNeeded();

  const params = this.#flatten();

  if (ir.metadata) {
    params.metadata = this.projectMetadata(params);
  }

  return params;
}
```

### Global metadata resolution

The global resolver runs separately — not through `getData`. It runs its own queries:

```ts
private async resolveGlobalMetadata(
  ir: StandardDataFetchAndTransformIR,
  plumbing: StandardMetadataPlumbing,
): Promise<StandardColumnMetadata[] | undefined> {
  const raw = await plumbing.globalResolver!.resolve(
    this.buildResolverInput(ir)
  );
  return plumbing.globalReshaper!.reshape({
    ir,
    raw,
    schema: this.schema,
  });
}
```

### Resolver input builder

The base class provides a hook method so SQL subclasses can inject `dataSource`:

```ts
protected buildResolverInput(
  ir: StandardDataFetchAndTransformIR,
): StandardMetadataResolverInput {
  return {
    ir,
    schema: this.schema,
  };
}
```

---

## SQL Subclass Integration

### getData with resolver (per-page)

The SQL subclass narrows the resolver to `SqlStandardMetadataResolver`, calls `resolve()`, and appends contributions to the SELECT clause. Metadata columns are extracted separately from the result, keeping existing `rowData` extraction untouched:

```ts
async getData(
  ir: StandardDataFetchAndTransformIR,
  resolver?: StandardMetadataResolver<unknown>,
): Promise<GetRowsResponse> {
  const sql = this.buildSQL(ir);

  // Narrow to SQL resolver and get contributions
  const sqlResolver = resolver as SqlStandardMetadataResolver | undefined;
  const metadataContributions = sqlResolver?.resolve({
    ir, schema: this.schema, table: this.table,
  }) ?? [];
  const metadataSelect = metadataContributions.map(s => `${s.sql} AS "${s.alias}"`);

  // Inject metadata expressions into the query
  const fullSql = metadataSelect.length > 0
    ? this.injectMetadataSelect(sql, metadataSelect)
    : sql;

  const rows = await this.dataSource.execute(fullSql);

  // Existing data extraction unchanged
  const rowData = this.toColumnMajor(rows, outputColumns);
  const totalRowCount = Number(rows[0].__total__);

  // Extract metadata columns separately
  const metadata: Record<string, any[]> | undefined =
    metadataContributions.length > 0
      ? Object.fromEntries(metadataContributions.map(c => [c.alias, rows.map(r => r[c.alias])]))
      : undefined;

  return { rowData, totalRowCount, ...(metadata && { metadata }) };
}
```

### buildResolverInput override

Injects `dataSource` for the global resolver:

```ts
protected buildResolverInput(
  ir: StandardDataFetchAndTransformIR,
): StandardMetadataResolverInput {
  return {
    ir,
    schema: this.schema,
    dataSource: this.dataSource,
  };
}
```

### Constructor

```ts
class SqlStandardTableDataModel extends StandardTableDataModel {
  constructor(
    dataSchema: DataSchema[],
    dataSource: SqlDataSource,
    config: Partial<StandardTableConfig> = {},
    metadataPlumber?: StandardMetadataPlumber,
  ) {
    super(dataSchema, config, metadataPlumber);
    this.dataSource = dataSource;
    this.table = dataSource.table;
  }
}
```

---

## Metadata Projection

The DataModel projects internal metadata (column-level cache + visible page-level cache) into `ViewModelMetadata` aligned with the current contiguous data block.

Projection is coordinate translation only. The DataModel does not interpret `meta`; it only rewrites internal coordinates into ViewModel coordinates:

- Column metadata: `colIdx` → `colIndex` (identity — column indexes are the same)
- Page row metadata: page-local `rowIdx` → block-relative `rowIndex` = `pageStartInBlock + rowIdx`
- Page cell metadata: page-local `rowIdx` + `colIdx` → block-relative `rowIndex` + `colIndex`

For example, if the ViewModel block starts with 10 rows from page A and then continues into page B, page B row `5` becomes ViewModel row `15`. A page-scoped cell metadata item:

```ts
{ rowIdx: 5, colIdx: 4, meta: { quality: "missing" } }
```

becomes:

```ts
{ colIndex: 4, rowIndex: 15, meta: { quality: "missing" } }
```

Implementation:

```ts
private projectMetadata(params: FlattenedDataViewModelParams): Partial<ViewModelMetadata> {
  const metadata: Partial<ViewModelMetadata> = {};

  // Column metadata → valueColumns
  if (this.columnMetadata) {
    metadata.valueColumns = this.columnMetadata.map(col => ({
      colIndex: col.colIdx,
      meta: col.meta,
    }));
  }

  // Page metadata → valueRows + valueCells
  const valueRows: ValueRowMetadata[] = [];
  const valueCells: ValueCellMetadata[] = [];

  let blockRowOffset = 0;
  this.walkVisiblePages((page) => {
    if (page.metadata?.rows) {
      for (const row of page.metadata.rows) {
        valueRows.push({
          rowIndex: blockRowOffset + row.rowIdx,
          meta: row.meta,
        });
      }
    }
    if (page.metadata?.cells) {
      for (const cell of page.metadata.cells) {
        valueCells.push({
          colIndex: cell.colIdx,
          rowIndex: blockRowOffset + cell.rowIdx,
          meta: cell.meta,
        });
      }
    }
    blockRowOffset += page.rowCount;
  });

  if (valueRows.length > 0) metadata.valueRows = valueRows;
  if (valueCells.length > 0) metadata.valueCells = valueCells;

  return metadata;
}
```

`walkVisiblePages` iterates the same contiguous page block that `#flatten` walks. This ensures the row offset calculation is consistent with the data block.

---

## Page Eviction

When a page is evicted, `page.data` is set to `null`. Page metadata follows the same lifecycle:

```ts
#evictPage(page: PageNode): void {
  page.data = null;
  page.metadata = undefined;  // NEW
  for (const [, expanded] of page.expandedRows) {
    for (const childPage of expanded.pages) {
      this.#evictPage(childPage);
    }
  }
}
```

---

## GroupBy Interaction

When `groupBy` is active, the standard table has nested page trees. At facet levels (depth < groupBy.length), pages contain group rows with aggregated measures. At leaf level, pages contain individual data rows.

Metadata resolution works the same at every level — the resolver contributes to the `getData` call for each page (including group-level pages). The resolver can use `ir.groupPath` to determine the context (e.g., "these are country-level groups" vs "these are leaf rows under USA > California").

Column metadata is resolved once at the top level and shared across all depths.

---

## Dry Run 1: Flat table with cell quality and column profile

Plumber:

```ts
interface QualityMetadataConfig {
  profile: boolean;
  quality: { fields: string[] };
}

function createQualityPlumber(rules: ValidationRule[]): StandardMetadataPlumber {
  return (ir: StandardDataFetchAndTransformIR) => {
    const config = ir.metadata as QualityMetadataConfig | undefined;
    return {
      // Global resolver: runs separate SQL for column stats
      globalResolver: {
        async resolve({ ir, dataSource }: StandardMetadataResolverInput): Promise<StandardRawMetadata> {
          if (!config?.profile) return {};
          const stats: Record<string, any> = {};
          for (const field of ir.project) {
            const [row] = await dataSource!.execute(`
              SELECT MIN("${field}") AS min_val, MAX("${field}") AS max_val,
                     COUNT(*) AS total, COUNT("${field}") AS non_null
              FROM "${dataSource!.table}"
            `);
            stats[field] = row;
          }
          return { stats };
        },
      },
      // Global reshaper: converts raw SQL stats into StandardColumnMetadata[]
      globalReshaper: {
        reshape({ ir, raw }: StandardGlobalMetadataReshaperInput): StandardColumnMetadata[] {
          const stats = (raw as { stats: Record<string, any> }).stats;
          if (!stats) return [];
          const columns: StandardColumnMetadata[] = [];
          for (let colIdx = 0; colIdx < ir.project.length; colIdx++) {
            const row = stats[ir.project[colIdx]];
            if (!row) continue;
            columns.push({
              colIdx,
              meta: {
                min: row.min_val, max: row.max_val,
                total: Number(row.total),
                missing: Number(row.total) - Number(row.non_null),
              },
            });
          }
          return columns;
        },
      },
      // Resolver: contributes per-cell SQL to each page query
      resolver: {
        resolve({ ir, table }: SqlStandardMetadataResolverInput): SqlSelectExpression[] {
          if (!config?.quality) return [];
          return config.quality.fields.map(field => ({
            alias: `__meta__${field}__null`,
            sql: `CASE WHEN "${field}" IS NULL THEN 1 ELSE 0 END`,
          }));
        },
      } as SqlStandardMetadataResolver,
      // Reshaper: converts page raw metadata into PageMetadata
      reshaper: {
        reshape({ ir, pageMetadata }: StandardMetadataReshaperInput): PageMetadata {
          const cells: StandardPageCellMetadata[] = [];
          for (const field of config?.quality?.fields ?? []) {
            const colIdx = ir.project.indexOf(field);
            if (colIdx === -1) continue;
            const nullFlags = pageMetadata[`__meta__${field}__null`];
            if (!nullFlags) continue;
            for (let rowIdx = 0; rowIdx < nullFlags.length; rowIdx++) {
              if (nullFlags[rowIdx] === 1) {
                cells.push({ rowIdx, colIdx, meta: { quality: "missing" } });
              }
            }
          }
          return { cells };
        },
      },
    };
  };
}
```

Usage:

```ts
const model = new SqlStandardTableDataModel(
  schema, dataSource, { pageSize: 5 }, createQualityPlumber(rules),
);

const params = await model.getViewModelData({
  startRow: 0,
  endRow: 10,
  groupPath: [],
  groupBy: [],
  project: ["name", "email", "age"],
  sort: [],
  filter: [],
  metadata: { profile: true, quality: { fields: ["email", "age"] } },
});
```

Total rows: 12, page size: 5, so 3 page slots: [0-5), [5-10), [10-12).

**Plumber called**: returns `{ globalResolver, resolver, reshaper }`.

**Bootstrap**: fetch page 0. The resolver contributes:

```sql
SELECT "name", "email", "age", COUNT(*) OVER() AS __total__,
  CASE WHEN "email" IS NULL THEN 1 ELSE 0 END AS "__meta__email__null",
  CASE WHEN "age" IS NULL THEN 1 ELSE 0 END AS "__meta__age__null"
FROM "table" LIMIT 5 OFFSET 0
```

Page 0 data stored in `pages[0].data`. Raw metadata columns extracted into `response.metadata`:

```ts
{
  "__meta__email__null": [0, 0, 1, 0, 0],
  "__meta__age__null":   [0, 0, 0, 0, 1],
}
```

`reshaper.reshape()` called with `pageMetadata` → produces page metadata:

```ts
{ page: { cells: [
  { rowIdx: 2, colIdx: 1, meta: { quality: "missing" } },  // email null at row 2
  { rowIdx: 4, colIdx: 2, meta: { quality: "missing" } },  // age null at row 4
]}}
```

Stored in `pages[0].metadata`.

**Column metadata**: missing. Global resolver runs separate query:

```sql
SELECT MIN("name") AS min_val, MAX("name") AS max_val, COUNT(*) AS total, COUNT("name") AS non_null FROM "table"
-- ... same for email, age
```

`globalReshaper.reshape()` called with raw → produces column metadata:

```ts
{ columns: [
  { colIdx: 0, meta: { total: 12, missing: 0 } },
  { colIdx: 1, meta: { total: 12, missing: 2 } },
  { colIdx: 2, meta: { total: 12, missing: 1, min: 18, max: 65 } },
]}
```

Stored in `this.columnMetadata`.

**Page 1 fetch**: same pattern — resolver contributions ride along, metadata extracted, reshaper produces page metadata.

**Projection**: contiguous block = page 0 + page 1 (10 rows). Column metadata → `valueColumns`. Page 0 cells at offset 0, page 1 cells at offset 5 → `valueCells`.

---

## Dry Run 2: Scroll triggers new page fetch, column metadata cached

User scrolls down:

```ts
const params = await model.getViewModelData({
  startRow: 5, endRow: 12,
  groupPath: [], groupBy: [],
  project: ["name", "email", "age"],
  sort: [], filter: [],
  metadata: { profile: true, quality: { fields: ["email", "age"] } },
});
```

**Plumber called**: returns `{ globalResolver, resolver, reshaper }` (lightweight closures).

**IR unchanged** — no reset.

**Column metadata**: already cached. Global resolver not called.

**Page fetch**: page 1 already loaded (has data + metadata). Page 2 (rows 10-12) needed. `getData(fetchIR, resolver)` fetches data + metadata together. Reshaper produces page 2 metadata. Stored in `pages[2].metadata`.

**Projection**: contiguous block = page 1 + page 2 (7 rows, offset 5). Column metadata same as before.

---

## Dry Run 3: IR changes, all metadata invalidated

User changes sort:

```ts
const params = await model.getViewModelData({
  startRow: 0, endRow: 10,
  groupPath: [], groupBy: [],
  project: ["name", "email", "age"],
  sort: [{ field: "age", direction: "asc" }],
  filter: [],
  metadata: { profile: true, quality: { fields: ["email", "age"] } },
});
```

**IR changed** (sort changed). `this.pages = []`, `this.columnMetadata = undefined`.

All metadata re-resolved from scratch. Column metadata re-fetched via global resolver. Page metadata re-fetched per page via resolver contributions in `getData`.

---

## Dry Run 4: Local page-wise resolver (no SQL contributions)

For cases where page metadata is computed entirely from the page data (no extra SQL needed), the resolver returns no contributions. The reshaper computes metadata from `rowData` directly:

```ts
function createLocalQualityPlumber(rules: Map<string, (v: any) => boolean>): StandardMetadataPlumber {
  return (ir: StandardDataFetchAndTransformIR) => {
    return {
      // No globalResolver — no column metadata needed
      // No resolver — no SQL contributions needed
      reshaper: {
        reshape({ ir, pageMetadata, rowData }: StandardMetadataReshaperInput): PageMetadata {
          // pageMetadata is undefined (no resolver contributions)
          // Compute from rowData directly
          const cells: StandardPageCellMetadata[] = [];
          for (let col = 0; col < rowData.length; col++) {
            const field = ir.project[col];
            const validate = rules.get(field);
            if (!validate) continue;
            for (let row = 0; row < (rowData[col]?.length ?? 0); row++) {
              const value = rowData[col][row];
              if (value === null || value === undefined || value === "") {
                cells.push({ rowIdx: row, colIdx: col, meta: { quality: "missing" } });
              } else if (!validate(value)) {
                cells.push({ rowIdx: row, colIdx: col, meta: { quality: "mismatched" } });
              }
            }
          }
          return { cells };
        },
      },
    };
  };
}
```

In this case `getData` is called without a resolver, so the page query has no metadata SELECT expressions. `GetRowsResponse.metadata` is undefined. The reshaper still runs and computes from `rowData`.

This requires a small adjustment in `getViewModelData` — the reshaper should be called even when `response.metadata` is undefined, as long as the plumbing has a reshaper:

```ts
if (plumbing?.reshaper && !req.page.metadata) {
  req.page.metadata = plumbing.reshaper.reshape({
    ir: fetchIR,
    pageMetadata: response.metadata ?? {},
    rowData: response.rowData,
    schema: this.schema,
  });
}
```

---

## What This Does Not Cover

- **Lazy metadata loading independent of data loading**: Metadata is always resolved alongside or after data. A separate `loadMetadata()` method is not planned.
- **Metadata for grouped facet rows**: When `groupBy` is active, facet-level pages contain group rows. The resolver can contribute expressions for group-level queries, and the reshaper can produce metadata for group rows. Facet-specific metadata (e.g., profile bar in group header) would use `rowFacets` or `columnFacets` entries in `ViewModelMetadata`.
- **Cross-page metadata**: Metadata that spans multiple pages (e.g., "the 3rd row overall is flagged") must be resolved per-page with page-local coordinates.
- **Metadata-only updates**: There is no `updateMetadata` method. Metadata updates flow through `getViewModelData` alongside data.

---

## Implementation Steps

### Step 1: Add types

Files:
- `packages/grid/src/datamodel/types.ts`

Add:
- `metadata?: unknown` to `StandardDataFetchAndTransformIR`
- `metadata?: Record<string, any[]>` to `GetRowsResponse`
- `metadata?: PageMetadata` to `PageNode`
- `StandardRawMetadata`
- `StandardMetadataResolverInput`, `StandardGlobalMetadataResolver`
- `StandardMetadataResolver<T>`
- `SqlStandardMetadataResolverInput`, `SqlStandardMetadataResolver`
- `StandardGlobalMetadataReshaperInput`, `StandardGlobalMetadataReshaper`
- `StandardMetadataReshaperInput`, `StandardMetadataReshaper`
- `StandardColumnMetadata`, `StandardPageRowMetadata`, `StandardPageCellMetadata`
- `PageMetadata`
- `StandardMetadataPlumbing`, `StandardMetadataPlumber`

### Step 2: Update getData signature

Files:
- `packages/grid/src/datamodel/standard-table-datamodel.ts`
- `packages/grid/src/datamodel/sql-standard-table-datamodel.ts`

Update:
- Abstract `getData` gains optional `resolver` param (per-page, same as pivot)
- SQL subclass narrows resolver to `SqlStandardMetadataResolver`, appends metadata SELECT, extracts metadata columns into response

### Step 3: Add plumber hooks to StandardTableDataModel

Files:
- `packages/grid/src/datamodel/standard-table-datamodel.ts`

Add:
- `metadataPlumber?: StandardMetadataPlumber` private field
- `columnMetadata?: StandardColumnMetadata[]` field
- Constructor parameter for plumber
- `resolveGlobalMetadata(ir, plumbing)` private method
- `buildResolverInput(ir)` protected method (hook for SQL subclass)
- `projectMetadata(params)` private method
- Reset `columnMetadata` when IR changes
- Call plumber in `getViewModelData`
- Resolve global metadata in parallel with page fetches
- Reshape page metadata from `GetRowsResponse.metadata`
- Evict page metadata when page is evicted

### Step 4: Add SQL subclass integration

Files:
- `packages/grid/src/datamodel/sql-standard-table-datamodel.ts`

Add:
- Constructor parameter for plumber (pass to super)
- Override `buildResolverInput` to inject `dataSource`
- Handle resolver in `getData`

### Step 5: Export new types

Files:
- `packages/grid/src/index.ts`

### Step 6: Add tests

Core tests:
- No plumber: `getViewModelData` returns params without metadata
- globalResolver: column metadata resolved and cached
- resolver: SQL contributions ride along with getData, metadata in response
- Reshaper: produces correct cache types from global and page raw
- Column metadata cached: second call skips global resolution
- Page metadata on PageNode: metadata stored alongside data
- IR change resets column metadata and page metadata
- Page eviction clears metadata
- Multi-page projection: metadata from multiple pages projected with correct offsets
- Local reshaper: computes page metadata from rowData without resolver
- `ir.metadata` absent: plumber not called
