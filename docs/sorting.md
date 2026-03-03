# Sorting

## Overview

Sorting operates on the **aggregated flat data** — after GROUP BY and aggregation, before reshape into the pivot structure. The reshape step preserves row order, so sorting the flat result directly controls row ordering in the final grid.

```
PivotConfig → IR → getData() (GROUP BY + ORDER BY) → flat rows → reshape → GridDataViewModel
```

In SQL-based datamodels, sorting translates to an `ORDER BY` clause on the aggregated query.

Column facet order is always independent of row sorting — column facets are derived from a separate query on the column dimSpec alone.

---

## Config Shape

```typescript
type SortDirection = 'asc' | 'desc';

interface SortEntry {
  field: string;          // row dimension field to sort by
  direction: SortDirection;
  by?: string;            // measure field — triggers measure sort instead of alphabetical
}

export interface PivotConfig {
  rows: AxisExpr | AxisConfig;
  columns: AxisExpr | AxisConfig;
  sort?: SortEntry[];
}
```

Array order is the sort level order. Entry at index 0 is the outermost sort, last entry is the innermost.

---

## Sort Modes

### Alphabetical sort (no `by`)

Sorts by the dimension value itself.

```typescript
sort: [{ field: "region", direction: "asc" }]
// SQL: ORDER BY region ASC
```

See test: `datamodel.table-algebra.test.ts` — "rows=region, columns=cross(department, revenue), sort region asc"

### Measure sort (with `by`)

Sorts by the aggregated value of the measure specified in `by`. Uses a window function to compute the aggregate at the correct grouping level.

```typescript
sort: [{ field: "region", direction: "desc", by: "revenue" }]
// SQL: ORDER BY SUM(SUM(T."revenue")) OVER (PARTITION BY region) DESC
```

See test: `datamodel.table-algebra.test.ts` — "rows=region, columns=cross(department, revenue), sort region by revenue desc"

### Mixing both in the same sort list

Alphabetical and measure sort entries can be freely mixed.

```typescript
sort: [
  { field: "region", direction: "asc" },                  // alphabetical
  { field: "country", direction: "desc", by: "revenue" }, // measure sort
]
```

See test: `datamodel.table-algebra.test.ts` — "rows=hierarchy(region, country), columns=cross(department, revenue), sort region asc + country by revenue desc"

---

## Internal: `"noop"` Direction

When the user's `sort` array doesn't mention every row dimension, `getIR()` pads the resolved sort list with `{ direction: "noop" }` entries for the missing dims. This preserves natural insertion order at those levels using a window function: `MIN(MIN(__ord__)) OVER (PARTITION BY <dims up to this level>)`.

Example: `rows = hierarchy("region", "country")`, `sort = [{ field: "country", direction: "desc", by: "revenue" }]`
Resolved: `[{ field: "region", direction: "noop" }, { field: "country", direction: "desc", by: "revenue" }]`

See test: `datamodel.table-algebra.test.ts` — "rows=hierarchy(region, country), columns=cross(department, revenue), sort country by revenue desc (region noop)"

---

## Future Considerations

- Column axis sorting — sort column headers by aggregated values. If needed, the config can be namespaced (`sort: { rows?: SortEntry[], columns?: SortEntry[] }`).
