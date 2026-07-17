# Flat Table Sorting — Implementation Plan

## Overview

Add sorting support to the flat table (DataGrid) pipeline. The data layer already handles sorting — `SqlFlatTableDataModel.buildOrderClause()` generates SQL ORDER BY, `StandardDataFetchAndTransformIR.sort` flows through the pipeline, and cache invalidation on sort change works. This plan covers the UI layer: showing sort icons in column headers, handling user interaction, and wiring sort changes back to the data.

---

## Architecture

Column headers in the flat table are rendered by the **column facet track renderer** (`FacetCellRenderer` / `FC<FacetCellProps>`). The corner cells are rendered by the header renderer — sort icons do NOT go there.

```
User clicks sort icon in column header (track renderer)
  → reads current sort from viewModel.metaState
  → computes new sort entries
  → writes new sort to viewModel.metaState (visual state)
  → gets model + ir from DataModelContext
  → calls model.getViewModelData({...ir, sort: newSort})
  → calls viewModel.updateData(result)
  → calls render(viewModel)
```

**Key design decisions:**
- Sort icon is placed in the column facet **track renderer** (not header renderer)
- `FacetCellProps` already has `viewModel` + `render` — no core type changes needed for sorting
- Sort visual state lives in `viewModel.metaState`
- `model` + `ir` are provided via a general-purpose `DataModelContext` (not sort-specific — reusable for filtering, etc.)
- `enableSorting` on `UseFlatGridOptions` controls whether the default sort track renderer is installed
- `schema` is derivable from `viewModel.schema` + `index` in the track renderer — no new props needed on `FacetCellProps`

---

## What Already Exists

| Component | File | Status |
|-----------|------|--------|
| `SortEntry` type | `grid/src/datamodel/types.ts` | Done |
| `StandardDataFetchAndTransformIR.sort` field | `grid/src/datamodel/types.ts` | Done |
| `SqlFlatTableDataModel.buildOrderClause()` | `grid/src/datamodel/sql-flat-table-datamodel.ts` | Done |
| Cache invalidation on sort change | `grid/src/datamodel/flat-table-datamodel.ts:85-96` | Done |
| `useFlatGrid` reacts to IR changes | `frameworks/src/react/data/useFlatGrid.ts:143-162` | Done |
| Expanded child rows inherit sort | `flat-table-datamodel.ts:173` (`sort: ir.sort`) | Done |
| `FacetCellProps` has `viewModel` + `render` | `frameworks/src/react/types.ts` | Done |
| Playground sort-dropdown UI | `playground/src/sort-dropdown.tsx` | Done (reference) |

---

## What Needs to Be Built

### Step 1: Pass schema to viewmodel in `useFlatGrid`

**Files:** `packages/frameworks/src/react/data/useFlatGrid.ts`

`useFlatGrid` already receives `schema: DataSchema[]` as an option. The viewmodel plumbing already exists (`FlattenedDataViewModelParams.schema`, `FlattenedDataViewModel.schema`, `GridDataViewModel.schema`) but is never wired up. Just pass `schema` through when constructing/updating the viewmodel in `applyResult`:

```typescript
vmRef.current = new FlattenedDataViewModel({
  ...result,
  data,
  options: vmOptions,
  schema,
});
```

The track renderer can then access column metadata via `viewModel.schema[index]`.

---

### Step 2: Add `DataModelContext`

**Files:** New file `packages/frameworks/src/react/components/DataModelContext.tsx`

A general-purpose React context that provides access to the datamodel and current IR. Not sort-specific — reusable for any interactive feature (filtering, etc.).

```typescript
import { createContext } from "react";
import type { FlatTableDataModel } from "grid/dist/index";
import type { StandardDataFetchAndTransformIR } from "grid/dist/index";

export interface DataModelContextValue {
  model: FlatTableDataModel;
  ir: StandardDataFetchAndTransformIR;
}

export const DataModelContext = createContext<DataModelContextValue | null>(null);
```

The consumer provides `DataModelContext.Provider` via the existing `contextWrapper` option on `useFlatGrid`. This wraps all React roots rendered by the adapter, giving track renderers access to the model and IR.

---

### Step 3: `<Sort />` component + default column track renderer

**Files:**
- New file `packages/frameworks/src/react/components/Sort.tsx`
- New file `packages/frameworks/src/react/components/SortableColumnRenderer.tsx`

#### `<Sort />` — composable building block

A small React component that renders a sort icon and handles sort interaction. It is **not** a full cell renderer — it's a building block that can be composed into any custom column renderer alongside `<Filter />` or other UI.

**Props:**

```typescript
interface SortProps {
  schema: DataSchema;
  viewModel: GridDataViewModel;
  render: (vm: GridDataViewModel) => void;
}
```

- `schema` — column metadata (passed explicitly by the parent, not derived internally)
- `viewModel` — for reading/writing sort state in `metaState`
- `render` — to trigger re-render after sort change
- Gets `model` + `ir` from `DataModelContext`

**Behavior:**
- Reads current sort state from `viewModel.metaState`
- Renders sort direction indicator (asc/desc/none)
- On click:
  1. Computes new sort entries
  2. Writes new sort to `viewModel.metaState`
  3. Calls `model.getViewModelData({...ir, sort: newSort})`
  4. Calls `viewModel.updateData(result)`
  5. Calls `render(viewModel)`

**Sort behavior rules:**
- **Column not in groupBy (or no groupBy):** Simple sort — asc/desc by the field itself. No `by` needed.
- **Column in groupBy (dimension):** Can sort alphabetically (no `by`) or by a measure (`by: "revenue"`). Multi-sort stacking allowed.
- **Measure column:** Sort by the measure value. Cannot stack with other measure sorts at the same level (replaces existing measure sort).

#### `SortableColumnRenderer` — default column renderer

A default `FC<FacetCellProps>` that composes `<Sort />` with the column name. Installed by `useFlatGrid` when `enableSorting` is true. The consumer can replace it entirely via `facetDefs.col[].trackRenderer`.

```tsx
function SortableColumnRenderer({ value, viewModel, render, index }: FacetCellProps) {
  const schema = viewModel.schema![index];
  return (
    <div>
      <span>{value}</span>
      {schema && <Sort schema={schema} viewModel={viewModel} render={render} />}
    </div>
  );
}
```

#### Consumer composability

Consumers can build custom renderers using `<Sort />` as a building block:

```tsx
function CustomColumnRenderer({ value, viewModel, render, index }: FacetCellProps) {
  const schema = viewModel.schema![index];
  return (
    <div>
      <span>{value}</span>
      {schema && <Sort schema={schema} viewModel={viewModel} render={render} />}
      {schema && <Filter schema={schema} viewModel={viewModel} render={render} />}
    </div>
  );
}
```

---

### Step 4: Add `enableSorting` to `UseFlatGridOptions`

**Files:** `packages/frameworks/src/react/data/useFlatGrid.ts`

```typescript
export interface UseFlatGridOptions {
  // ... existing
  enableSorting?: boolean;
}
```

`enableSorting` controls whether `useFlatGrid` installs the default `SortableColumnRenderer` for column facet defs. `GridBindings` is unchanged.

---

### Step 5: Wire default sort track renderer into `useFlatGrid`

**Files:** `packages/frameworks/src/react/data/useFlatGrid.ts`

When `enableSorting` is true and no custom col `trackRenderer` is provided, `useFlatGrid` installs the default `SortableColumnRenderer` for column facet defs:

```typescript
// In useFlatGrid, when building native facet defs:
if (enableSorting && !facetDefs?.col?.some(d => d.trackRenderer)) {
  // Use default SortableColumnRenderer for col track renderers
}
```

---

### Step 6: Export new types

**Files:** `packages/frameworks/src/react/index.ts`, `packages/grid/src/index.ts`

Export `DataModelContext`, `Sort`, and `SortableColumnRenderer` from frameworks package so consumers can use/compose them.

---

### Step 7: Update playground FlatTable sample

**Files:** `packages/playground/src/samples/components/FlatTable.tsx`

Add sorting to demonstrate the feature:

```typescript
const { bindings, loading, error, fetchPage } = useFlatGrid({
  dataSource: ds,
  schema,
  config,
  ir,
  enableSorting: true,
  contextWrapper: ({ children }) => (
    <DataModelContext.Provider value={{ model: modelRef.current!, ir }}>
      {children}
    </DataModelContext.Provider>
  ),
  // ...
});
```

The consumer provides `DataModelContext` via `contextWrapper`. The default `SortableColumnRenderer` reads from this context to access `model` and `ir` for data fetching.

---

## Implementation Order

1. **Step 1** — Pass schema to viewmodel in `useFlatGrid` (one-liner).
2. **Step 2** — Create `DataModelContext`.
3. **Step 3** — Build `<Sort />` component + `SortableColumnRenderer`.
4. **Step 4 + 5** — Add `enableSorting` to `UseFlatGridOptions` and wire default track renderer.
5. **Step 6** — Exports.
6. **Step 7** — Update playground sample.

Steps 1 and 2 are independent and can be done in parallel.

---

## Edge Cases

- **Sort + pagination:** When sort changes, `FlatTableDataModel` already clears cached pages (line 85-96). Next `getViewModelData` fetches fresh sorted data. Works correctly.
- **Sort + expand/collapse:** Expanded child rows inherit sort from `lastIR.sort` (line 173). On sort change, cache is cleared so expanded state resets. Correct behavior.
- **Empty sort array:** `buildOrderClause` falls back to groupField ordering (or no ORDER BY for ungrouped). No special handling needed.
- **Column not in schema:** Should not happen — track renderer only renders schema columns. No defensive code needed.
