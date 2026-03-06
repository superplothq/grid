# Sorting Feature

## What We're Building

Row sorting for the pivot grid. Users specify `sort` on `PivotConfig` to reorder rows without affecting column order. Two sort modes:

- **Alphabetical** — sort by dimension value: `{ field: "region", direction: "asc" }`
- **By measure** — sort by aggregated measure: `{ field: "region", direction: "desc", by: "revenue" }` (uses the measure's configured aggregate function, e.g. SUM)

Both can be mixed in the same sort list.

## Key Design Decisions

### Column facet space is always derived independently

Column facet order must never change due to row sorting. `getViewModelData` calls `getData` separately with just the column dimSpec (no measures, no sort) to get column facets in natural CTE order. Row facet space is still extracted from the main query's iteration order (which reflects sort).

### Sort is resolved at `getIR` level

`getIR()` takes the user's `config.sort` (which may only mention some row dims) and produces a fully resolved list — one entry per row dim field. Unsorted dims are padded with `direction: "noop"`. This means `getData` receives a complete ordered list and just maps entries to SQL without needing row/col awareness.

### `"noop"` direction

Internal-only sort direction meaning "keep natural insertion order." Uses a window function `MIN(MIN(__ord__)) OVER (PARTITION BY <dims up to this level>)` to group at the correct level. The window is necessary because hierarchy nodes share a single `__ord__` column across all their fields — a plain `MIN(__ord__)` would sort at the finest granularity instead of the intended level.

### sql-datamodel has no row/col concept

`SqlDataModel.getData` only knows about dimensions, measures, and sort entries. It generates SQL from the resolved sort list. The row/col split is entirely handled by `GridDataModel.getViewModelData`.

### `fieldToOrdCol` on CTEResult

Maps each dimension field to its `__ord__` column name. Needed because the mapping isn't 1:1 — a hierarchy shares one `__ord__` across all its fields. Used by `findOrdColForField` (noop sort) to look up the correct ordering column.

## Sort SQL Generation

For each resolved sort entry:

- **`"noop"`** — `MIN(MIN(gridCte."__ord__X")) OVER (PARTITION BY <dims accumulated so far>)`
- **`"asc"/"desc"` without `by`** (alphabetical) — `gridCte."field" ASC/DESC`
- **`"asc"/"desc"` with `by`** (measure sort) — `SUM(AGG(T."measure")) OVER (PARTITION BY <dims accumulated so far>) ASC/DESC`

Column dim ordering is not included in the sort ORDER BY since column facets are computed separately.

## Files Changed

### `packages/grid/src/types.ts`
- Added `SortDirection` (`"asc" | "desc" | "noop"`), `SortEntry` (`field`, `direction`, `by?`)
- Added `sort?: SortEntry[]` to `PivotConfig` and `IR`

### `packages/grid/src/grid-datamodel.ts`
- `getIR()`: resolves `config.sort` into fully resolved list with noop padding
- `getViewModelData()`: calls `getData` separately for column facet space; row facets still via `extractFacetSpace`

### `packages/grid/src/sql-datamodel.ts`
- `getData()`: delegates to `buildSortOrderParts` when sort is present
- `buildSortOrderParts()`: maps resolved sort entries to SQL ORDER BY expressions
- `findOrdColForField()`: looks up `__ord__` column via `fieldToOrdCol`
- `fieldToOrdCol` added to `CTEResult`, populated in all `generateCTEs` cases

### `packages/grid/src/datamodel.data.test.ts`
- `sqlStr()` returns `sqls[0]` (main query) since column facet query is now a second call

### `packages/grid/src/datamodel.table-algebra.test.ts`
- 7 new tests: alphabetical asc/desc, measure sort asc/desc, hierarchy with noop + measure sort, mixed alphabetical + measure multi-level sort, cross row dims with sort

## Example

```typescript
const config: PivotConfig = {
  rows: hierarchy("region", "country"),
  columns: cross("department", "revenue"),
  sort: [
    { field: "region", direction: "asc" },                     // alphabetical
    { field: "country", direction: "desc", by: "revenue" },    // by SUM(revenue)
  ],
};
```

Resolved sort: `[{ field: "region", direction: "asc" }, { field: "country", direction: "desc", by: "revenue" }]`

SQL ORDER BY:
```sql
ORDER BY
  gridCte."region" ASC,
  SUM(SUM(T."revenue")) OVER (PARTITION BY gridCte."region", gridCte."country") DESC
```

Result: regions in alphabetical order, within each region countries sorted by total revenue descending.
