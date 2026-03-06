# Filtering

## Overview

Filtering narrows the data before (dimensions) or after (measures) aggregation. Dimension filters are applied as early as possible — in the leaf CTEs — to shrink the facet space before cross joins. Measure filters are applied at the very end via a wrapping CTE around the final aggregated query.

```
PivotConfig.filter → getIR() resolves → ScalarFilter → DimSpec.filter (WHERE in leaf CTEs)
                                                      → Measure.filter (wrapping CTE)
                                       → TupleFilter  → hierarchy.filter (if fields covered)
                                                      → cross.filter (WHERE on cross-join CTE)
```

Filters on `PivotConfig` apply to both row and column `getData` calls — column facet space is naturally narrowed by the same filters.

**Constraint**: Filters only apply to fields that are on an axis (row or column dimension, or a measure). A filter on a field not present in any axis is silently ignored — since the field is aggregated out, filtering on it has no meaningful effect on the pivot result.

---

## API

### Adding filters to a pivot config

Pass a `filter` array on `PivotConfig`:

```typescript
const config: PivotConfig = {
  rows: "region",
  columns: cross("department", "revenue"),
  filter: [
    { type: "scalar", field: "region", op: "eq", value: "North America" },
  ],
};
const vm = await model.getViewModel(config);
```

The viewmodel returned will have narrowed facets and data. In this example, `vm.rowFacets` will only contain `["North America"]` instead of `["North America", "Europe"]`.

### Filter types

`Filter` is a discriminated union with `type` field:

```typescript
export interface ScalarFilter {
  type: "scalar";
  field: string;
  op: 'eq' | 'neq' | 'in' | 'not_in'
    | 'gt' | 'lt' | 'gte' | 'lte'
    | 'between'
    | 'contains' | 'doesNotContain' | 'startsWith' | 'endsWith'
    | 'before' | 'after'
    | 'empty' | 'notEmpty';
  value: string | string[] | number | number[] | null;
}

export interface TupleFilter {
  type: "tuple";
  fields: string[];
  op: "in" | "not_in";
  value: (string | number)[][];
}

export type Filter = ScalarFilter | TupleFilter;
```

`ScalarFilter` targets a single field. `TupleFilter` expresses correlated multi-field filters — `(field1, field2) IN ((...), (...))` — needed for tree checkbox UIs where selecting "Brazil/Football" should not also include "Brazil/Basketball".

`filter` is optional on `PivotConfig`. When omitted or empty, no filtering is applied.

```typescript
export interface PivotConfig {
  rows: AxisExpr | AxisConfig;
  columns: AxisExpr | AxisConfig;
  filter?: Filter[];
  sort?: SortEntry[];
}
```

### Operators by variable type

**Measure** (`FacetDef.type = 'measure'`): `gt`, `lt`, `gte`, `lte`, `eq`, `neq`, `between`, `empty`, `notEmpty`

**Nominal dimension** (`FacetDef.subtype = 'nominal'`): `contains`, `doesNotContain`, `eq`, `neq`, `startsWith`, `endsWith`, `in`, `empty`, `notEmpty`

**Temporal dimension** (`FacetDef.subtype = 'temporal'`): `eq`, `neq`, `before`, `after`, `between`, `empty`, `notEmpty`

Temporal values use ISO 8601 strings.

The SQL layer is transparent to type — it maps operator to SQL without knowing whether the field is a measure, dimension, temporal, or nominal. Type-aware validation (e.g., don't allow `startsWith` on a measure) is the consumer/UI layer's responsibility.

### Multiple filters — OR within field, AND across fields

Multiple scalar filters on the **same field** are ORed. Filters on **different fields** are ANDed. Tuple filters are each ANDed independently.

```typescript
filter: [
  { type: "scalar", field: "region", op: "eq", value: "North America" },
  { type: "scalar", field: "region", op: "eq", value: "Europe" },
  { type: "scalar", field: "revenue", op: "gt", value: 1000 },
]
// SQL: (region = 'North America' OR region = 'Europe') AND revenue > 1000
```

### `value` by operator

| Operator | `value` type | Example |
|---|---|---|
| `eq`, `neq` | `string \| number` | `{ type: "scalar", op: "eq", value: "USA" }` |
| `in`, `not_in` | `string[]` | `{ type: "scalar", op: "in", value: ["USA", "UK"] }` |
| `gt`, `lt`, `gte`, `lte` | `number` | `{ type: "scalar", op: "gt", value: 5000 }` |
| `between` | `number[]` (2 elements) | `{ type: "scalar", op: "between", value: [1000, 5000] }` |
| `contains`, `doesNotContain`, `startsWith`, `endsWith` | `string` | `{ type: "scalar", op: "contains", value: "America" }` |
| `before`, `after` | `string` (ISO 8601) | `{ type: "scalar", op: "after", value: "2024-01-01" }` |
| `empty`, `notEmpty` | `null` (ignored) | `{ type: "scalar", op: "empty", value: null }` |

---

## Usage examples

### Dimension filter — narrow row facets

```typescript
const config: PivotConfig = {
  rows: "region",
  columns: cross("department", "revenue"),
  filter: [{ type: "scalar", field: "region", op: "eq", value: "North America" }],
};
// Result: rowFacets = [["North America"]], columnFacets unchanged
// The leaf CTE for region gets: WHERE "region" = 'North America'
```

### Dimension filter — narrow column facets

```typescript
const config: PivotConfig = {
  rows: "region",
  columns: cross("department", "revenue"),
  filter: [{ type: "scalar", field: "department", op: "eq", value: "Electronics" }],
};
// Result: rowFacets unchanged, columnFacets = [["Electronics"], ["revenue"]]
// The leaf CTE for department gets: WHERE "department" = 'Electronics'
```

### Measure filter — exclude rows by aggregated value

```typescript
const config: PivotConfig = {
  rows: "country",
  columns: cross("department", "revenue"),
  filter: [{ type: "scalar", field: "revenue", op: "gt", value: 2000 }],
};
// Result: only (country, department) combos where SUM(revenue) > 2000 appear.
// Combos below the threshold have null values in the pivot — if ALL combos
// for a country are filtered out, that country is excluded from rowFacets.
// SQL: wraps the aggregated query in __result__ CTE, applies WHERE "revenue" > 2000
```

### Hierarchy filter

```typescript
const config: PivotConfig = {
  rows: hierarchy("region", "country"),
  columns: "revenue",
  filter: [{ type: "scalar", field: "region", op: "eq", value: "Europe" }],
};
// Result: rowFacets = [["Europe", "Europe"], ["UK", "Germany"]]
// The filter lands on the hierarchy node (since hierarchy is the leaf —
// there is no deeper simple node for "region"). The leaf CTE gets:
// WHERE "region" = 'Europe'
```

### Combined dimension + measure filter

```typescript
const config: PivotConfig = {
  rows: hierarchy("region", "country"),
  columns: cross("department", "revenue"),
  filter: [
    { type: "scalar", field: "region", op: "eq", value: "North America" },
    { type: "scalar", field: "department", op: "eq", value: "Electronics" },
    { type: "scalar", field: "revenue", op: "gte", value: 2000 },
  ],
};
// region AND department filters narrow leaf CTEs (pre-aggregation).
// revenue filter wraps the result CTE (post-aggregation).
```

### `in` operator

```typescript
const config: PivotConfig = {
  rows: "region",
  columns: cross("department", "revenue"),
  filter: [{ type: "scalar", field: "department", op: "in", value: ["Electronics"] }],
};
// Equivalent to eq for single value, but works with multiple values:
// filter: [{ type: "scalar", field: "department", op: "in", value: ["Electronics", "Apparel"] }]
// SQL: "department" IN ('Electronics','Apparel')
```

### Tuple filter — correlated multi-field filtering

```typescript
const config: PivotConfig = {
  rows: hierarchy("region", "country"),
  columns: cross("department", "revenue"),
  filter: [{
    type: "tuple",
    fields: ["region", "department"],
    op: "in",
    value: [["North America", "Electronics"], ["Europe", "Apparel"]],
  }],
};
// Only these combos appear: NA×Electronics and EU×Apparel.
// Without tuple filtering, a scalar "in" on region + department would produce
// all 4 combos (NA×Elec, NA×App, EU×Elec, EU×App) — over-selecting.
// SQL: ("region", "department") IN (('North America', 'Electronics'), ('Europe', 'Apparel'))
```

### Tuple filter on hierarchy

```typescript
const config: PivotConfig = {
  rows: hierarchy("region", "country"),
  columns: "revenue",
  filter: [{
    type: "tuple",
    fields: ["region", "country"],
    op: "in",
    value: [["North America", "USA"], ["Europe", "Germany"]],
  }],
};
// Only USA (under NA) and Germany (under EU) appear.
// The tuple filter lands on the hierarchy node since both fields are within it.
```

### Tuple `not_in` — exclude specific combos

```typescript
const config: PivotConfig = {
  rows: hierarchy("region", "country"),
  columns: "revenue",
  filter: [{
    type: "tuple",
    fields: ["region", "country"],
    op: "not_in",
    value: [["North America", "USA"], ["Europe", "Germany"]],
  }],
};
// Excludes USA and Germany, keeps Canada and UK.
// SQL: ("region", "country") NOT IN (('North America', 'USA'), ('Europe', 'Germany'))
```

### Scalar + tuple combined

```typescript
const config: PivotConfig = {
  rows: hierarchy("region", "country"),
  columns: cross("department", "revenue"),
  filter: [
    { type: "scalar", field: "department", op: "eq", value: "Electronics" },
    { type: "tuple", fields: ["region", "country"], op: "in", value: [["North America", "USA"], ["Europe", "UK"]] },
  ],
};
// Scalar narrows department to Electronics (leaf CTE WHERE).
// Tuple narrows to USA and UK only (hierarchy CTE WHERE).
// Both are ANDed.
```

---

## Internals

### IR resolution (`getIR` / `buildAxisIR`)

`getIR()` separates `PivotConfig.filter` into:
- `fieldFilterMap: Map<string, ScalarFilter[]>` — scalar filters grouped by field
- `tupleFilters: TupleFilter[]` — collected separately

Both are passed to `buildAxisIR()`, which attaches filters to nodes during construction:

- **`simple` node**: `filter = fieldFilterMap.get(field) || []` (scalar only)
- **`hierarchy` node**: collects scalar filters for any of its fields, plus any tuple filter whose fields are all within the hierarchy's fields
- **`cross` node**: attaches tuple filters that span multiple children (fields not coverable by any single child). Every recursive call receives the full `tupleFilters` list — if a single child covers all a tuple filter's fields, that child's recursion handles it, so the cross skips it to avoid duplication.
- **`Measure`**: `filter = fieldFilterMap.get(field) || []` (scalar only)

Tuple filters that span both axes (row + column) are attached to the combined cross DimSpec built in `getIR()`.

`filter` is a mandatory field on `DimSpec.simple`, `DimSpec.hierarchy`, `DimSpec.cross`, and `Measure` — always `[]` when no filters are present.

```typescript
export type DimSpec =
  | { type: "none" }
  | { type: "simple"; field: string; filter: Filter[] }
  | { type: "hierarchy"; fields: string[]; segments?: HierarchySegment[]; filter: Filter[] }
  | { type: "cross"; children: DimSpec[]; segments?: CrossSegment[]; filter: Filter[] }
  | { type: "concat"; children: DimSpec[] };

export interface Measure {
  field: string;
  aggregation: AggregateFn;
  filter: ScalarFilter[];
}
```

### SQL generation (`sql-datamodel.ts`)

#### Dimension filters — leaf CTE WHERE clauses

Applied in `generateCTEs` at `simple` and `hierarchy` nodes:

```sql
-- simple("region") with filter region = 'North America'
__d__0 AS (
  SELECT "region", MIN(rowid) AS "__ord__0"
  FROM table
  WHERE "region" = 'North America'
  GROUP BY "region"
)
```

For hierarchy with segments (dimensional projection), the dimension filter WHERE is ANDed with the existing segment filter WHERE.

#### Tuple filters — cross-join CTE WHERE clauses

Applied in `generateCTEs` at `cross` nodes when `spec.filter` contains tuple filters:

```sql
-- cross(hierarchy("region", "country"), simple("department"))
-- with tuple filter (region, department) IN (('NA', 'Electronics'), ('EU', 'Apparel'))
__d__0 AS (SELECT "region", "country", MIN(rowid) AS "__ord__0" FROM table GROUP BY "region", "country"),
__d__1 AS (SELECT "department", MIN(rowid) AS "__ord__1" FROM table GROUP BY "department"),
__d__2 AS (
  SELECT * FROM __d__0 CROSS JOIN __d__1
  WHERE ("region", "department") IN (('NA', 'Electronics'), ('EU', 'Apparel'))
)
```

#### Measure filters — wrapping CTE

Applied after the final aggregated query. The entire query becomes a `__result__` CTE, with the outer SELECT applying the measure filter:

```sql
WITH ...,
  __result__ AS (
    SELECT __d__2."region", __d__2."dept", SUM(T."revenue") AS "revenue"
    FROM __d__2
    LEFT JOIN table T ON ...
    GROUP BY ...
    ORDER BY ...
  )
SELECT * FROM __result__
WHERE "revenue" > 1000
```

#### `buildWhereClause` — operator to SQL mapping

Handles both scalar and tuple filters. Scalar filters use the existing OR-within-field, AND-across-fields logic. Tuple filters each produce a `(f1, f2) IN ((...), (...))` clause. All clauses are ANDed together.

| Operator | SQL |
|---|---|
| `eq` | `field = value` |
| `neq` | `field != value` |
| `in` | `field IN (values)` |
| `not_in` | `field NOT IN (values)` |
| `gt` | `field > value` |
| `lt` | `field < value` |
| `gte` | `field >= value` |
| `lte` | `field <= value` |
| `between` | `field BETWEEN value[0] AND value[1]` |
| `contains` | `field LIKE '%value%'` |
| `doesNotContain` | `field NOT LIKE '%value%'` |
| `startsWith` | `field LIKE 'value%'` |
| `endsWith` | `field LIKE '%value'` |
| `before` | `field < value` |
| `after` | `field > value` |
| `empty` | `field IS NULL` |
| `notEmpty` | `field IS NOT NULL` |
| tuple `in` | `(f1, f2) IN ((v1, v2), ...)` |
| tuple `not_in` | `(f1, f2) NOT IN ((v1, v2), ...)` |
