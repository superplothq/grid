# Pivot Data Pipeline: Config → IR → SQL → GridDataViewModel

## Overview

The pivot grid's data pipeline has four stages:

```
PivotConfig  ──→  IR  ──→  getData()  ──→  GridDataViewModel
                           (SQL or custom)
```

**PivotConfig** is the user-facing configuration — it describes what goes on rows and columns using a table algebra DSL that mixes dimensions and measures freely.

**IR** (Intermediate Representation) is a clean separation of concerns — dimensions are expressed as a `DimSpec` tree, and measures are a flat list. The IR is axis-agnostic; it has no concept of rows vs columns. It tells you "what data to fetch" without caring about presentation.

**getData()** takes the IR and produces a flat table. The built-in implementation generates SQL via a `SqlDataSource`, but you can implement your own data processing layer here.

**GridDataViewModel** is the final 2D pivot grid — data is reshaped from the flat table into a matrix with row facets, column facets, and data cells.

---

## Stage 1: Config → IR

### The Table Algebra

A `PivotConfig` has two axes — `rows` and `columns`. Each axis is described using `AxisExpr`, a recursive expression type with three operators and a leaf:

```typescript
type AxisExpr =
  | string                                    // leaf: a field name (dimension or measure)
  | { type: "cross"; children: AxisExpr[] }   // Cartesian product (×)
  | { type: "concat"; children: AxisExpr[] }  // Union (+)
  | { type: "hierarchy"; fields: string[] };  // Grouped hierarchy
```

**What each operator means visually:**

**cross** — Cartesian product. Every combination of the children appears. Creates nested header levels.

```
cross("Quarter", "Product")

┌───────────────────────────────────────────────────┐
│     Q1              │     Q2              │  Q3 …  │
├────┬─────┬───┬──────┼────┬─────┬───┬──────┼────────┤
│Cof │Espr │H.T│ Tea  │Cof │Espr │H.T│ Tea  │  …     │
```

**concat** — Union. Values from all children are placed side by side on the same level.

```
concat("Quarter", "Product")

┌────┬────┬────┬────┬────┬─────┬──────┬────┐
│ Q1 │ Q2 │ Q3 │ Q4 │Cof │Espr │H.Tea │Tea │
```

**hierarchy** — Grouped nesting. Only observed combinations appear (unlike cross which enumerates all).

```
hierarchy("Region", "Country")

┌──────────────────────┬─────────────────┐
│   North America      │   Europe        │
├──────┬───────────────┼─────┬───────────┤
│ USA  │ Canada        │ UK  │ Germany   │
```

**Leaf string** — If the field is a dimension, it becomes a grouping level. If it's a measure, it becomes an aggregated value (using the aggregation function from the schema, defaulting to `sum`).

### How Config becomes IR

The IR separates dimensions from measures:

```typescript
interface IR {
  dimSpec: DimSpec;     // tree of dimensional groupings
  measures: Measure[];  // flat list of aggregations
}
```

The `DimSpec` mirrors the AxisExpr tree structure, but with measures extracted out:

```typescript
type DimSpec =
  | { type: "none" }                                                         // no dimensions (measures-only)
  | { type: "simple"; field: string }                                        // single dimension
  | { type: "hierarchy"; fields: string[]; segments?: HierarchySegment[] }   // grouped hierarchy
  | { type: "cross"; children: DimSpec[]; segments?: CrossSegment[] }        // Cartesian product
  | { type: "concat"; children: DimSpec[] };                                 // union
```

The transformation rules are:

| AxisExpr | DimSpec | Measures |
|---|---|---|
| `"region"` (dimension field) | `{ type: "simple", field: "region" }` | `[]` |
| `"revenue"` (measure field) | `{ type: "none" }` | `[{ field: "revenue", aggregation: "sum" }]` |
| `hierarchy("region", "country")` | `{ type: "hierarchy", fields: ["region", "country"] }` | `[]` |
| `cross("department", "revenue")` | `{ type: "cross", children: [simple("department")] }` | `[sum(revenue)]` |
| `concat("revenue", "cost")` | `{ type: "none" }` | `[sum(revenue), sum(cost)]` |
| `concat("department", "channel")` | `{ type: "concat", children: [simple("department"), simple("channel")] }` | `[]` |

The key insight: measures are always **pulled out** into the flat list. Within a `cross`, measure children disappear from the DimSpec (they contribute `{ type: "none" }` which gets dropped). Within a `concat` of all measures, the entire DimSpec becomes `"none"`.

### Merging the two axes

Since the data layer has no concept of rows vs columns, the two per-axis IRs are merged into a single IR:

- Row DimSpec and Column DimSpec are wrapped in a `cross(rowDimSpec, colDimSpec)`
- All measures from both axes are combined into one list
- If one axis has no dimensions, the merge just uses the other axis's DimSpec

The merged IR is what `getData()` receives.

### Dimensional Projection (Drill-down)

Projection controls which parts of a hierarchy are expanded and which are collapsed. Without projection, a hierarchy shows all levels. With projection, different values can be at different depths.

Each axis can optionally carry projection state:

```typescript
type AxisConfig = {
  expr: AxisExpr;
  projection?: DimensionalProjectionPath[];
};

interface DimensionalProjectionPath {
  open: string[] | "*";          // which values are expanded at this level (* = all)
  next?: DimensionalProjectionPath;  // expansion state at the next level
}
```

**What projection does to the IR:** It adds `segments` to hierarchy and cross nodes. Each segment represents a partition of the data at a different grouping depth.

**Example — hierarchy("region", "country", "city") with projection `[{ open: "*", next: { open: ["USA"] } }]`:**

This means: "expand all regions to show countries, and expand USA further to show cities."

The resulting hierarchy DimSpec gets two segments:

```
segments: [
  // Segment 1: USA rows — grouped all the way to city
  { groupBy: ["region", "country", "city"],
    filter: { pass: [{ field: "country", values: ["USA"] }], fail: [] } },

  // Segment 2: Non-USA rows — grouped only to country
  { groupBy: ["region", "country"],
    filter: { pass: [], fail: [{ field: "country", values: ["USA"] }] } },
]
```

The data layer must produce a UNION of these segments — one query per segment with different GROUP BY depths and WHERE filters — then combine the results. Fields beyond a segment's groupBy depth should be NULL.

**Example — projection `[]` (empty array, fully collapsed):**

```
segments: [{ groupBy: ["region"] }]
```

Only the first level is shown. Country and city columns still appear in the output but are NULL.

**Cross segments** work similarly for cross nodes. When a projection path goes through a cross, it controls how many children of that cross are visible for different values:

```
segments: [
  { visibleChildren: 2, filter: { pass: [{ field: "department", values: ["Electronics"] }], fail: [] } },
  { visibleChildren: 1, filter: { pass: [], fail: [{ field: "department", values: ["Electronics"] }] } },
]
```

This means: for Electronics, show 2 children (e.g. department + channel); for others, show only 1 child (just department). Invisible children get NULL columns.

---

## DataSource Layer

The SQL pipeline is backed by a **DataSource** abstraction that decouples the database engine from the datamodel. This enables multiple grids to share a single data store.

```
DataSource<T> (interface)         — generic: execute, addRef, release
└── SqlDataSource (abstract)      — implements DataSource<string>, adds loadData + table
    ├── DuckDBDataSource          — Node.js duckdb
    └── DuckDBWasmDataSource      — Browser WASM duckdb
```

**`DataSource<T>`** is the generic contract. `execute(req: T)` runs a query and returns rows. `addRef()`/`release()` manage a ref count so N grids can share one datasource — the engine is disposed only when the last consumer releases.

**`SqlDataSource`** narrows to `DataSource<string>` (SQL strings). It provides a concrete `loadData()` method that takes a `Map<string, SqlColumnType>` and column-major data arrays, builds a `CREATE TABLE` DDL, converts data to an Arrow table, and inserts it via an engine-specific `insertArrowTable()`. Subclasses only implement `execute()`, `insertArrowTable()`, and `release()`.

**`SqlColumnType`** = `"VARCHAR" | "INTEGER" | "DOUBLE" | "TIMESTAMP"`. Callers pass explicit SQL types — the datasource has no knowledge of `Schema`. For TIMESTAMP columns, callers should pass ISO 8601 strings (e.g., `new Date(...).toISOString()`); DuckDB handles the VARCHAR → TIMESTAMP cast implicitly.

### Usage

```typescript
// Create a shared datasource
const ds = await DuckDBWasmDataSource.create();
const columns = new Map([["region", "VARCHAR"], ["revenue", "DOUBLE"]]);
await ds.loadData({ columns, data: [regionArray, revenueArray] });

// Create datamodels that share the datasource
const pivotModel = new SqlPivotDataModel(schema, ds);
ds.addRef();
const flatModel = new SqlFlatTableDataModel(config, schema, ds);

// Release when done — engine disposed at refCount 0
await ds.release();
await ds.release();
```

`SqlPivotDataModel` and `SqlFlatTableDataModel` are concrete classes that take a `SqlDataSource` as a constructor dependency. They reference `dataSource.table` for SQL generation and call `dataSource.execute(sql)` to run queries.

---

## Stage 2: IR → SQL

The built-in SQL layer translates the IR into a single SQL query using CTEs. The strategy is:

1. Each DimSpec leaf becomes a CTE that selects distinct values from the source table
2. Composite nodes (cross, concat) become CTEs that combine their children's CTEs
3. The final query LEFT JOINs the complete dimension grid with the source table and aggregates measures

### CTE generation by DimSpec type

**simple** — Select distinct values of the field:

```sql
-- simple("region")
__d__0 AS (
  SELECT "region", MIN(rowid) AS "__ord__0"
  FROM "data" GROUP BY "region"
)
```

`MIN(rowid)` captures insertion order for the ORDER BY clause.

**hierarchy** — Same as simple, but groups by all fields:

```sql
-- hierarchy("region", "country")
__d__0 AS (
  SELECT "region", "country", MIN(rowid) AS "__ord__0"
  FROM "data" GROUP BY "region", "country"
)
```

**hierarchy with segments** (from projection) — UNION ALL of segments with different GROUP BY depths:

```sql
-- hierarchy("region", "country", "city") with segments for "expand USA to city, others to country"
__d__0 AS (
  SELECT "region", "country", "city", MIN(rowid) AS "__ord__0"
  FROM "data" WHERE "country" IN ('USA')
  GROUP BY "region", "country", "city"
  UNION ALL
  SELECT "region", "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0"
  FROM "data" WHERE NOT (COALESCE("country" IN ('USA'), FALSE))
  GROUP BY "region", "country"
)
```

Each segment queries at its own depth. Columns beyond the segment's depth are NULL-padded.

**cross** — CROSS JOIN of children's CTEs:

```sql
-- cross(simple("region"), simple("department"))
__d__0 AS (SELECT "region", MIN(rowid) AS "__ord__0" FROM "data" GROUP BY "region"),
__d__1 AS (SELECT "department", MIN(rowid) AS "__ord__1" FROM "data" GROUP BY "department"),
__d__2 AS (SELECT * FROM __d__0 CROSS JOIN __d__1)
```

**cross with segments** (from projection) — UNION ALL of cross joins with different numbers of visible children:

```sql
-- For Electronics: cross join department × product × channel (2 visible children)
-- For others: just department × product (1 visible child, channel is NULL)
__d__3 AS (
  SELECT ... FROM __d__1 CROSS JOIN __d__2
  WHERE __d__1."department" IN ('Electronics')
  UNION ALL
  SELECT ..., CAST(NULL AS VARCHAR) AS "channel", ...
  FROM __d__1
  WHERE NOT (COALESCE(__d__1."department" IN ('Electronics'), FALSE))
)
```

**concat** — UNION ALL with aliased columns and source tags:

```sql
-- concat(simple("department"), simple("channel"))
__d__0 AS (SELECT "department", MIN(rowid) AS "__ord__0" FROM "data" GROUP BY "department"),
__d__1 AS (SELECT "channel", MIN(rowid) AS "__ord__1" FROM "data" GROUP BY "channel"),
__d__2 AS (
  SELECT '0:department' AS "__src__0", "department" AS "__c__0", __ord__0 AS "__cord__0_0"
  FROM __d__0
  UNION ALL
  SELECT '1:channel' AS "__src__0", "channel" AS "__c__0", __ord__1 AS "__cord__0_0"
  FROM __d__1
)
```

Since concat children may have different field names, they get aliased to shared positional columns (`__c__0`, `__c__1`, ...). A `__src__0` tag tracks which branch each row came from.

### Final query assembly

The root CTE is the complete dimension grid. The final query:

```sql
WITH <all CTEs>
SELECT <dimension fields from grid>, <aggregated measures from source>
FROM <grid CTE>
LEFT JOIN "data" T ON <join conditions>
GROUP BY <dimension fields>
ORDER BY <ordering expressions>
```

**JOIN conditions** match grid dimension values to source table values. For concat columns, the join is conditional on the `__src__` tag:

```sql
-- Simple field join:
T."region" = grid."region"

-- Nullable field (from projection):
T."country" = grid."country" OR grid."country" IS NULL

-- Concat field join:
(__src__0 = '0:department' AND T."department" = grid."__c__0")
OR (__src__0 = '1:channel' AND T."channel" = grid."__c__0")
```

**LEFT JOIN** ensures all dimension combinations appear in the output. Missing data naturally becomes NULL — this is how empty cells in the pivot appear.

**ORDER BY** uses `MIN(__ord__)` expressions (preserving source insertion order) and `__src__` columns (preserving concat branch order).

---

## Stage 3: Data Return Format

`getData()` must return a `PivotRawDataFromSource`:

```typescript
interface PivotRawDataFromSource {
  columns: string[];   // column names
  data: any[][];       // column-major: data[columnIndex][rowIndex]
}
```

The columns must be ordered: **dimension fields first** (in DimSpec tree traversal order), **then measure fields**. If there are concat `__src__` columns, they go after the measures.

Data is column-major — `data[0]` is the full array of values for the first column, `data[1]` for the second, etc.

Dimension values should be strings (or null for projected/collapsed levels). Measure values should be numbers (or null for missing combinations).

The framework takes this flat table and reshapes it into a 2D pivot grid: it splits dimensions back into row/column axes, extracts facet spaces, expands measures into facet levels, and builds the `GridDataViewModel`.

---

## End-to-End Example

### Source data (simplified)

| region | department | channel | revenue |
|---|---|---|---|
| North America | Electronics | Online | 6450 |
| North America | Electronics | Retail | 1700 |
| North America | Apparel | Online | 550 |
| North America | Apparel | Retail | 630 |
| North America | Apparel | Wholesale | 490 |
| Europe | Electronics | Online | 2700 |
| Europe | Electronics | Retail | 2200 |
| Europe | Electronics | Wholesale | 750 |
| Europe | Apparel | Online | 680 |
| Europe | Apparel | Retail | 1050 |

### Config

```typescript
const config: PivotConfig = {
  rows: "region",
  columns: cross("department", "revenue"),
};
```

"Show regions on rows, departments on columns, with revenue as the measure."

### Step 1: Config → IR

Row axis: `"region"` is a dimension → `dimSpec: simple("region")`, `measures: []`

Column axis: `cross("department", "revenue")` → "department" is a dimension, "revenue" is a measure. The measure gets pulled out. → `dimSpec: cross([simple("department")])`, `measures: [sum(revenue)]`

Merged: wrap both dimSpecs in a cross:

```
IR = {
  dimSpec: cross(simple("region"), cross([simple("department")])),
  measures: [{ field: "revenue", aggregation: "sum" }]
}
```

### Step 2: IR → SQL

Each leaf becomes a CTE, cross nodes become CROSS JOINs:

```sql
WITH
  __d__0 AS (SELECT "region", MIN(rowid) AS "__ord__0" FROM "data" GROUP BY "region"),
  __d__1 AS (SELECT "department", MIN(rowid) AS "__ord__1" FROM "data" GROUP BY "department"),
  __d__2 AS (SELECT * FROM __d__0 CROSS JOIN __d__1)
SELECT __d__2."region", __d__2."department", SUM(T."revenue") AS "revenue"
FROM __d__2
LEFT JOIN "data" T
  ON T."region" = __d__2."region" AND T."department" = __d__2."department"
GROUP BY __d__2."region", __d__2."department"
ORDER BY MIN(__d__2."__ord__0"), MIN(__d__2."__ord__1")
```

### Step 3: Flat result

The query returns:

| region | department | revenue |
|---|---|---|
| North America | Electronics | 8150 |
| North America | Apparel | 1670 |
| Europe | Electronics | 5650 |
| Europe | Apparel | 1730 |

In column-major format:

```
columns: ["region", "department", "revenue"]
data: [
  ["North America", "North America", "Europe", "Europe"],
  ["Electronics", "Apparel", "Electronics", "Apparel"],
  [8150, 1670, 5650, 1730]
]
```

### Step 4: Reshape into GridDataViewModel

The framework knows "region" came from rows (1 row dim) and "department" came from columns (1 col dim).

It extracts facet spaces:
- Row facets: `[["North America", "Europe"]]`
- Col facets: `[["Electronics", "Apparel"]]`

Since the column axis also has a measure, it expands the col facets with a measure level:
- Col facets: `[["Electronics", "Apparel"], ["revenue", "revenue"]]`

Then it places each row of the flat result into the 2D grid:

```
data = [
  [8150, 5650],     // col 0: Electronics/revenue
  [1670, 1730]      // col 1: Apparel/revenue
]
```

### Final rendered grid

```
                  Electronics    Apparel
                  revenue        revenue
North America     8150           1670
Europe            5650           1730
```

### Same example with concat instead of cross

If we change the config to use concat:

```typescript
columns: cross(concat("department", "channel"), "revenue")
```

Now the column axis shows department values AND channel values side by side (not crossed):

```
                  Electronics  Apparel  Online  Retail  Wholesale
                  revenue      revenue  revenue revenue revenue
North America     8150         1670     7000    2330    490
Europe            5650         1730     3380    3250    750
```

The IR would have a `concat` inside the `cross`, and the SQL would use `__src__0` tags and `__c__0` aliased columns with conditional JOIN logic to aggregate department and channel values independently.
