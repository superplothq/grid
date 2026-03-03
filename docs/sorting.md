# Sorting

## Overview

Sorting operates on the **aggregated flat data** — after GROUP BY and aggregation, before reshape into the pivot structure. The reshape step preserves row order, so sorting the flat result directly controls row ordering in the final grid.

```
PivotConfig → IR → getData() (GROUP BY) → flat rows → sort → reshape → GridDataViewModel
```

In SQL-based datamodels, sorting translates to an `ORDER BY` clause on the aggregated query.

---

## Config Shape

```typescript
type SortDirection = 'asc' | 'desc';

interface SortEntry {
  field: string;
  direction: SortDirection;
}

export interface PivotConfig {
  rows: AxisExpr | AxisConfig;
  columns: AxisExpr | AxisConfig;
  sort?: SortEntry[];
}
```

Array order is the sort level order. Entry at index 0 is the outermost sort, last entry is the innermost.

---

## Constraints

- If a measure appears in the sort, it must be the **last** entry.
- Dimensions in the sort define grouping boundaries; the measure sorts within the innermost group.

---

## Multilevel Sorting

Given `sort = [{ field: 'Region', direction: 'asc' }, { field: 'Category', direction: 'asc' }, { field: 'Revenue', direction: 'desc' }]`:

1. Rows are first ordered by Region ascending
2. Within each Region, ordered by Category ascending
3. Within each Region+Category group, ordered by Revenue descending

SQL equivalent:

```sql
SELECT region, category, SUM(revenue) AS revenue
FROM table
GROUP BY region, category
ORDER BY region ASC, category ASC, revenue DESC
```

---

## Single Measure Sort (n=1)

When sort has only a measure (`sort = [{ field: 'Revenue', direction: 'desc' }]`), each row is treated independently — no dimensional grouping, flat sort by that measure value.

---

## Future Considerations

- Column axis sorting — sort column headers by aggregated values. If needed, the config can be namespaced (`sort: { rows?: SortEntry[], columns?: SortEntry[] }`).
