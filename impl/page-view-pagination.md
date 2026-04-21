# Page View Pagination — Implementation Plan

## Overview

Add page-by-page viewing alongside infinite scroll. All pagination logic lives inside `useFlatGrid` — it owns the model, IR, viewmodel, and already handles all data-fetching paths (initial load, scroll, sort, expand/collapse). PageView is just another mode of the same hook.

`<PageView />` is a dumb UI component that reads pagination state from `useFlatGrid` and calls `goToPage`.

```tsx
const { bindings, pageView, loading, error, fetchPage } = useFlatGrid({
  dataSource: ds,
  schema,
  config,
  ir,
  enablePageView: true,
  displayPageSize: 50,
  facetDefs: { ... },
});

return (
  <div>
    {pageView && <PageView {...pageView} />}
    <DataGrid
      {...bindings}
      layout="flat"
      onViewDataEmpty={({ startRow, endRow }) => fetchPage(startRow, endRow)}
    />
  </div>
);
```

---

## Architecture

### Current `useFlatGrid` data flow

All data-fetching paths already converge in `useFlatGrid`:

1. **Initial load:** `useEffect` calls `model.getViewModelData(ir)` → `applyResult(result)`
2. **Infinite scroll:** `fetchPage(startRow, endRow)` calls `model.getViewModelData(pageIR)` → `applyResult(result)`
3. **Sort:** `<Sort />` calls `model.getViewModelData({...ir, sort})` → `viewModel.updateData(result)` → `render(viewModel)`
4. **Expand/Collapse:** `GroupedRowHeaderRenderer` calls `model.expandAndGetData(select)` → `viewModel.updateData(result)` → `render(viewModel)`

Paths 1-2 go through `applyResult`. Paths 3-4 bypass it — they update the viewmodel directly from within cell renderers.

### Page view integration point: `applyResult`

`applyResult` is the single place where `useFlatGrid` creates/updates the viewmodel. When `enablePageView` is true, `applyResult` intercepts the result and overrides pagination fields:

```
model.getViewModelData(ir) → result
                                ↓
                          applyResult(result)
                                ↓
                     if enablePageView:
                       result.offsetTop = 0
                       result.totalRows = result.data[0]?.length ?? 0
                                ↓
                     viewModel.updateData(result)
```

**Problem:** Sort and expand/collapse don't go through `applyResult` — they call `viewModel.updateData` directly from cell renderers. When page view is active, those updates would have wrong `offsetTop` and `totalRows`.

**Solution:** Route all data updates through `useFlatGrid` by making sort and expand/collapse call back into the hook instead of updating the viewmodel directly. This is the key refactor.

### Centralizing data updates

Currently, `<Sort />` and `GroupedRowHeaderRenderer` hold their own fetch-and-update logic. With page view, we need `useFlatGrid` to control the final viewmodel update.

**Approach:** `useFlatGrid` exposes action functions that cell renderers call instead of doing their own fetch+update:

```typescript
// Exposed by useFlatGrid, passed via DataModelContext
sortAction: (newSortEntries: SortEntry[]) => Promise<void>;
expandAction: (selectPath: string[]) => Promise<void>;
collapseAction: (selectPath: string[]) => Promise<void>;
```

These functions:
1. Call the appropriate datamodel method
2. Apply page-view transforms if needed (offsetTop=0, totalRows, reset to page 0 on sort)
3. Call `applyResult` → update viewmodel → redraw

`<Sort />` becomes: read sort state from metaState, compute new entries, call `sortAction(entries)`. No direct `model.getViewModelData` call.

`GroupedRowHeaderRenderer` becomes: call `expandAction(selectPath)` or `collapseAction(selectPath)`. No direct `model.expandAndGetData` call.

This centralizes all data flow through `useFlatGrid`, making page view a simple interception layer.

---

## What Already Exists

| Component | File | Status |
|-----------|------|--------|
| `FlatTableDataModel.getViewModelData(ir)` | `grid/src/datamodel/flat-table-datamodel.ts` | Done |
| `FlatTableDataModel.expandAndGetData(select)` | `grid/src/datamodel/flat-table-datamodel.ts` | Done |
| `FlatTableDataModel.collapseAndGetData(select)` | `grid/src/datamodel/flat-table-datamodel.ts` | Done |
| `FlattenedDataViewModel.updateData(params)` | `grid/src/renderer/flattened-data-viewmodel.ts` | Done |
| `totalRows` / `offsetTop` on `GridDataViewModel` | `grid/src/renderer/grid-data-viewmodel.ts` | Done |
| `model.topLevelRowCount` (full dataset row count) | `grid/src/datamodel/flat-table-datamodel.ts:241` | Done |
| `model.computeTotalLogicalRows()` (includes expanded) | `grid/src/datamodel/flat-table-datamodel.ts:587` | Done |
| `applyResult` in `useFlatGrid` | `frameworks/src/react/data/useFlatGrid.ts:136` | Done |
| `fetchPage` in `useFlatGrid` | `frameworks/src/react/data/useFlatGrid.ts:216` | Done |
| `DataModelContext` (provides `model`, `ir`, `grid`) | `frameworks/src/react/components/DataModelContext.tsx` | Done |
| `<Sort />` component | `frameworks/src/react/components/Sort.tsx` | Done |
| `GroupedRowHeaderRenderer` | `frameworks/src/react/components/GroupedRowHeaderRenderer.tsx` | Done |

---

## What Needs to Be Built

### Step 1: Add page view options to `useFlatGrid`

**File:** `packages/frameworks/src/react/data/useFlatGrid.ts`

```typescript
export interface UseFlatGridOptions {
  // ... existing
  enablePageView?: boolean;
  displayPageSize?: number; // defaults to config.pageSize
}
```

Add page view state tracking inside the hook:

```typescript
const [currentPage, setCurrentPage] = useState(0);
const [datasetTotalRows, setDatasetTotalRows] = useState(0);
```

Both are React state so that any change triggers a re-render of the host component, which recomputes the `pageView` return value and causes `<PageView />` to re-render with updated props.

`currentPage` alone is not sufficient — expand/collapse change `datasetTotalRows` (and therefore `totalPages`) without changing `currentPage`. If `datasetTotalRows` were derived inline from `model.computeTotalLogicalRows()` during render, expand/collapse actions that don't change `currentPage` would not trigger a re-render, leaving `<PageView />` with stale `totalPages` and `datasetTotalRows`.

Every data action (`goToPageWithSize`, `sortAction`, `expandAction`, `collapseAction`) updates `datasetTotalRows` via `setDatasetTotalRows(model.computeTotalLogicalRows())` after the fetch completes.

`enablePageView` and `displayPageSize` are treated as immutable for the hook instance. Changing page size at runtime is done via `setDisplayPageSize`, not by re-rendering with new props.

---

### Step 2: Intercept `applyResult` for page view

**File:** `packages/frameworks/src/react/data/useFlatGrid.ts`

When `enablePageView` is true, `applyResult` overrides pagination fields before updating the viewmodel.

**Important:** Do not mutate `rawResult` directly. The existing code stores `rawResult` in `lastRawResultRef` (line 137 of `useFlatGrid.ts`) before transformation. This cached raw result is reused by `applyTransform`/`resetTransform`. Mutating it would corrupt the cache — subsequent transform operations would see `offsetTop=0` and `totalRows=pageRowCount` instead of the real model values, breaking re-application.

```typescript
const applyResult = useCallback((rawResult: FlattenedDataViewModelParams) => {
  lastRawResultRef.current = rawResult;
  const result = transformResultRef.current ? transformResultRef.current(rawResult) : rawResult;

  // ... existing column transform logic (produces `data`) ...

  // Clone before overriding — never mutate rawResult or result in-place
  const viewResult = enablePageView
    ? { ...result, data, offsetTop: 0, totalRows: data[0]?.length ?? 0 }
    : { ...result, data };

  // ... existing viewmodel create/update logic, using viewResult instead of result ...
}, []);
```

This ensures **every** data path (initial load, fetchPage, sort, expand) gets the page-view overrides, because they all go through `applyResult`. The raw model result is preserved unmodified in `lastRawResultRef`.

---

### Step 3: Add `goToPage` and page view return values

**File:** `packages/frameworks/src/react/data/useFlatGrid.ts`

```typescript
export interface PageViewState {
  currentPage: number;
  totalPages: number;
  displayPageSize: number;
  datasetTotalRows: number;
  loading: boolean;
  goToPage: (page: number) => Promise<void>;
  setDisplayPageSize: (size: number) => void;
}

export interface UseFlatGridResult {
  bindings: GridBindings;
  viewModel: FlattenedDataViewModel | null;
  gridRef: React.RefObject<DataGridHandle>;
  loading: boolean;
  error: Error | null;
  fetchPage: (startRow: number, endRow: number) => Promise<void>;
  applyTransform: (colIndex: number, fn: TransformFn) => void;
  resetTransform: (colIndex: number) => void;
  pageView: PageViewState | null; // null when enablePageView is false
}
```

`goToPageWithSize` is the shared internal helper. `goToPage` and `setDisplayPageSize` both delegate to it:

```typescript
const [activePageSize, setActivePageSize] = useState(displayPageSize ?? modelRef.current?.pageSize ?? DEFAULT_PAGE_SIZE);

const goToPageWithSize = useCallback(async (page: number, pgSize: number) => {
  const model = modelRef.current;
  if (!model || !irRef.current) return;
  const total = model.computeTotalLogicalRows();
  if (total === 0) {
    // Empty dataset — update state but skip fetch
    setCurrentPage(0);
    setDatasetTotalRows(0);
    return;
  }
  const totalPages = Math.ceil(total / pgSize);
  if (page < 0 || page >= totalPages) return;

  setCurrentPage(page);
  const startRow = page * pgSize;
  const endRow = Math.min(startRow + pgSize, total);

  inFlightCountRef.current++;
  setPageLoadingInProgress(true);
  try {
    const pageIR: GetRowsIR = { ...irRef.current, startRow, endRow };
    const result = await model.getViewModelData(pageIR);
    applyResult(result);
    setDatasetTotalRows(model.computeTotalLogicalRows());
    gridRef.current?.grid.scheduleDraw();
  } finally {
    inFlightCountRef.current--;
    if (inFlightCountRef.current === 0) setPageLoadingInProgress(false);
  }
}, [applyResult]);

const goToPage = useCallback(async (page: number) => {
  goToPageWithSize(page, activePageSize);
}, [goToPageWithSize, activePageSize]);

const setDisplayPageSizeFn = useCallback((newSize: number) => {
  setActivePageSize(newSize);
  setCurrentPage(0);
  goToPageWithSize(0, newSize);
}, [goToPageWithSize]);
```

Build the `pageView` return value:

```typescript
const totalPages = Math.max(1, Math.ceil(datasetTotalRows / activePageSize));

const pageView: PageViewState | null = enablePageView ? {
  currentPage,
  totalPages,
  displayPageSize: activePageSize,
  datasetTotalRows,
  loading: pageLoadingInProgress,
  goToPage,
  setDisplayPageSize: setDisplayPageSizeFn,
} : null;
```

---

### Step 4: Handle sort + page view interaction

**File:** `packages/frameworks/src/react/data/useFlatGrid.ts`

When `enablePageView` is true, expose a `sortAction` that resets to page 0:

```typescript
const sortAction = useCallback(async (newSortEntries: SortEntry[]) => {
  const model = modelRef.current;
  if (!model || !irRef.current) return;

  if (enablePageView) {
    setCurrentPage(0);
  }

  const startRow = enablePageView ? 0 : irRef.current.startRow;
  const endRow = enablePageView ? activePageSize : irRef.current.endRow;

  inFlightCountRef.current++;
  setPageLoadingInProgress(true);
  try {
    const sortIR: GetRowsIR = { ...irRef.current, sort: newSortEntries, startRow, endRow };
    const result = await model.getViewModelData(sortIR);
    applyResult(result);
    if (enablePageView) setDatasetTotalRows(model.computeTotalLogicalRows());
    gridRef.current?.grid.scheduleDraw();
  } finally {
    inFlightCountRef.current--;
    if (inFlightCountRef.current === 0) setPageLoadingInProgress(false);
  }
}, [applyResult, enablePageView, activePageSize]);
```

Add `sortAction` to `DataModelContext`:

```typescript
// DataModelContext.tsx
export interface DataModelContextValue {
  model: FlatTableDataModel;
  ir: GetRowsIR;
  gridConfig: GridConfig;
  grid: Grid;
  sortAction?: (entries: SortEntry[]) => Promise<void>; // NEW
}
```

---

### Step 5: Refactor `<Sort />` to use `sortAction`

**File:** `packages/frameworks/src/react/components/Sort.tsx`

When `sortAction` is available in context, delegate to it. Otherwise, fall back to the current direct fetch (backwards compatible).

```typescript
const { model, ir, sortAction } = useDataModelContext();

const handleClick = useCallback(async (e: React.MouseEvent) => {
  // ... existing sort entry computation (unchanged) ...

  viewModel.metaState.set(SORT_META_NS, "entries", newEntries);

  if (sortAction) {
    await sortAction(newEntries);
  } else {
    // existing direct fetch path (unchanged)
    const result = await model.getViewModelData({ ...ir, sort: newEntries });
    (viewModel as FlattenedDataViewModel).updateData(result);
    render(viewModel);
  }
}, [model, ir, viewModel, render, field, direction, sortAction]);
```

---

### Step 6: Handle expand/collapse + page view interaction

**File:** `packages/frameworks/src/react/data/useFlatGrid.ts`

Same pattern as sort: expose `expandAction` and `collapseAction` via context.

```typescript
const expandAction = useCallback(async (selectPath: string[]) => {
  const model = modelRef.current;
  if (!model) return;

  const result = await model.expandAndGetData(selectPath);

  if (enablePageView) {
    // Expand changes totalLogicalRows. Re-fetch the current page window so the
    // viewmodel contains exactly the rows for this page (expanded children included).
    const total = model.computeTotalLogicalRows();
    setDatasetTotalRows(total);
    const startRow = currentPage * activePageSize;
    const endRow = Math.min(startRow + activePageSize, total);
    const pageIR: GetRowsIR = { ...irRef.current!, startRow, endRow };
    const pageResult = await model.getViewModelData(pageIR);
    applyResult(pageResult);
  } else {
    applyResult(result);
  }

  gridRef.current?.grid.scheduleDraw();
}, [applyResult, enablePageView, currentPage, activePageSize]);

const collapseAction = useCallback(async (selectPath: string[]) => {
  const model = modelRef.current;
  if (!model) return;

  const result = await model.collapseAndGetData(selectPath);

  if (enablePageView) {
    // Collapse reduces totalLogicalRows. Clamp currentPage if it now exceeds
    // the last page, then re-fetch the correct page window.
    const total = model.computeTotalLogicalRows();
    setDatasetTotalRows(total);
    const totalPages = Math.max(1, Math.ceil(total / activePageSize));
    const clampedPage = Math.min(currentPage, totalPages - 1);
    if (clampedPage !== currentPage) {
      setCurrentPage(clampedPage);
    }
    const startRow = clampedPage * activePageSize;
    const endRow = Math.min(startRow + activePageSize, total);
    const pageIR: GetRowsIR = { ...irRef.current!, startRow, endRow };
    const pageResult = await model.getViewModelData(pageIR);
    applyResult(pageResult);
  } else {
    applyResult(result);
  }

  gridRef.current?.grid.scheduleDraw();
}, [applyResult, enablePageView, currentPage, activePageSize]);
```

Add to `DataModelContext`:

```typescript
export interface DataModelContextValue {
  model: FlatTableDataModel;
  ir: GetRowsIR;
  gridConfig: GridConfig;
  grid: Grid;
  sortAction?: (entries: SortEntry[]) => Promise<void>;
  expandAction?: (selectPath: string[]) => Promise<void>;   // NEW
  collapseAction?: (selectPath: string[]) => Promise<void>;  // NEW
}
```

Refactor `GroupedRowHeaderRenderer` to use `expandAction`/`collapseAction` when available, same pattern as Sort.

**Expand does NOT reset to page 0.** When user expands a row on page 3, they stay on page 3. The expanded children appear within the current page's row budget. `totalPages` recalculates because `computeTotalLogicalRows()` now includes the children.

---

### Step 7: `<PageView />` — dumb UI component

**File:** New file `packages/frameworks/src/react/components/PageView.tsx`

Takes `PageViewState` as props, renders pagination controls. Zero data-fetching logic.

**Layout:**

```
Page Size: [10 ▼]     1 to 10 of 110     |<  <  Page 1 of 11  >  >|
```

Three sections in a single row:
1. **Page size selector** — `<select>` dropdown with options `[10, 25, 50, 100]`. Changing it calls `setDisplayPageSize(newSize)` which resets to page 0 and re-fetches.
2. **Row range** — "{startItem} to **{endItem}** of **{totalRows}**"
3. **Page navigation** — first (`|<`), prev (`<`), "Page **{current}** of **{total}**", next (`>`), last (`>|`)

```typescript
import React from "react";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export interface PageViewProps {
  currentPage: number;
  totalPages: number;
  displayPageSize: number;
  datasetTotalRows: number;
  loading: boolean;
  goToPage: (page: number) => Promise<void>;
  setDisplayPageSize: (size: number) => void;
}

export const PageView: React.FC<PageViewProps> = ({
  currentPage,
  totalPages,
  displayPageSize,
  datasetTotalRows,
  loading,
  goToPage,
  setDisplayPageSize,
}) => {
  const empty = datasetTotalRows === 0;
  const startItem = empty ? 0 : currentPage * displayPageSize + 1;
  const endItem = Math.min((currentPage + 1) * displayPageSize, datasetTotalRows);
  const isFirst = currentPage === 0;
  const isLast = currentPage >= totalPages - 1;

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "24px",
      padding: "8px 12px",
      fontSize: "13px",
      color: "#333",
    }}>
      {/* Page size selector */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <span>Page Size:</span>
        <select
          value={displayPageSize}
          onChange={(e) => setDisplayPageSize(Number(e.target.value))}
          disabled={loading}
          style={{ padding: "2px 4px", fontSize: "13px" }}
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>{size}</option>
          ))}
        </select>
      </div>

      {/* Row range */}
      <span>
        {startItem} to <b>{endItem}</b> of <b>{datasetTotalRows}</b>
      </span>

      {/* Page navigation */}
      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
        <NavButton label="|<" disabled={isFirst || loading} onClick={() => goToPage(0)} />
        <NavButton label="<" disabled={isFirst || loading} onClick={() => goToPage(currentPage - 1)} />
        <span style={{ margin: "0 8px" }}>
          Page <b>{currentPage + 1}</b> of <b>{totalPages}</b>
        </span>
        <NavButton label=">" disabled={isLast || loading} onClick={() => goToPage(currentPage + 1)} />
        <NavButton label=">|" disabled={isLast || loading} onClick={() => goToPage(totalPages - 1)} />
      </div>
    </div>
  );
};

const NavButton: React.FC<{ label: string; disabled: boolean; onClick: () => void }> = ({ label, disabled, onClick }) => (
  <button
    disabled={disabled}
    onClick={onClick}
    style={{
      background: "none",
      border: "none",
      cursor: disabled ? "default" : "pointer",
      color: disabled ? "#ccc" : "#333",
      fontSize: "13px",
      padding: "4px 6px",
      lineHeight: 1,
    }}
  >
    {label}
  </button>
);
```

---

### Step 8: Initial load with page view

**File:** `packages/frameworks/src/react/data/useFlatGrid.ts`

When `enablePageView` is true, the initial `useEffect` should fetch only the first page:

```typescript
useEffect(() => {
  const model = modelRef.current;
  if (!model) return;
  let cancelled = false;
  setLoading(true);
  setError(null);

  const initialIR = enablePageView
    ? { ...ir, startRow: 0, endRow: displayPageSize ?? model.pageSize }
    : ir;

  model.getViewModelData(initialIR).then((result) => {
    if (cancelled) return;
    applyResult(result);
    setLoading(false);
  }).catch((err: unknown) => {
    if (!cancelled) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setLoading(false);
    }
  });

  return () => { cancelled = true; };
}, [ir, applyResult]);
// Note: enablePageView and displayPageSize are intentionally omitted from deps.
// They are immutable for the hook instance — changing page size at runtime goes
// through setDisplayPageSize (which calls goToPageWithSize), not by re-rendering
// with new props.
```

---

### Step 9: `fetchPage` no-ops in page-view mode

**File:** `packages/frameworks/src/react/data/useFlatGrid.ts`

In page-view mode, the viewmodel has `offsetTop=0` and `totalRows=pageRowCount`. If `viewDataEmpty` fires (unlikely but possible after expand), its payload contains page-local coordinates (e.g. `{startRow: 0, endRow: 10}`), not dataset-global ones. Passing those to `fetchPage` would fetch the wrong dataset range and desynchronize `currentPage`.

Fix: `fetchPage` returns early when `enablePageView` is true. All page navigation goes through `goToPage`.

```typescript
const fetchPage = useCallback(async (startRow: number, endRow: number) => {
  if (enablePageView) return; // page-view owns navigation; ignore viewDataEmpty
  const model = modelRef.current;
  if (!model || !irRef.current) return;
  // ... existing fetchPage logic unchanged ...
}, [applyResult, enablePageView]);
```

The consumer can still wire `onViewDataEmpty` to `fetchPage` unconditionally — it's a no-op in page-view mode. This avoids requiring the consumer to conditionally omit the prop.

---

### Step 10: `totalRows` — `topLevelRowCount` vs `computeTotalLogicalRows`

Two counts matter:

- **`model.topLevelRowCount`**: Top-level rows only (e.g. 500 group rows). Does NOT include expanded children.
- **`model.computeTotalLogicalRows()`**: All visible logical rows including expanded children (e.g. 500 groups + 300 expanded children = 800).

For "paginate all rows including children" (default, like AG Grid Mode 2):
- `datasetTotalRows = model.computeTotalLogicalRows()`
- Page 3 shows logical rows 150-199, which may include a mix of group rows and expanded children.

For "paginate only top-level rows" (AG Grid Mode 1, future option):
- `datasetTotalRows = model.topLevelRowCount`
- Page 3 shows top-level rows 150-199 and any expanded children inline (children don't count toward page size).
- This is a different IR construction — out of scope for now but the hook can support it later.

**Default uses `computeTotalLogicalRows()`.**

Note: `computeTotalLogicalRows()` changes when rows are expanded/collapsed. This means `totalPages` changes after expand/collapse. The `pageView` return value reflects this automatically because it's computed fresh each render.

---

### Step 11: Export

**File:** `packages/frameworks/src/react/index.ts`

```typescript
export { PageView, type PageViewProps } from "./components/PageView";
```

`PageViewState` is already exported as part of `UseFlatGridResult`.

---

### Step 12: Playground sample

**File:** New file `packages/playground/src/samples/components/PaginatedFlatTable.tsx`

```tsx
const config: FlatTableConfig = { schema, pageSize: 50 };
const ir: GetRowsIR = {
  startRow: 0,
  endRow: 50,
  groupPath: [],
  groupBy: [],
  project: schema.map(s => s.name),
  sort: [],
  filter: [],
};

const { bindings, pageView, loading, error, fetchPage } = useFlatGrid({
  dataSource: ds,
  schema,
  config,
  ir,
  enablePageView: true,
  displayPageSize: 50,
  enableSorting: true,
  facetDefs: { row: [{ text: "" }], col: [{ text: "" }], axis: "col" },
});

return (
  <div>
    {pageView && <PageView {...pageView} />}
    <div style={{ height }}>
      <DataGrid
        {...bindings}
        layout="flat"
        theme={theme}
        onViewDataEmpty={({ startRow, endRow }) => fetchPage(startRow, endRow)}
        // fetchPage is a no-op when enablePageView is true, so this is safe to wire
        // unconditionally. Same pattern as non-paginated grids.
      />
    </div>
  </div>
);
```

---

## Implementation Order

1. **Step 1 + 2** — Add `enablePageView` / `displayPageSize` options, intercept `applyResult`
2. **Step 3 + 8** — Add `goToPage`, `pageView` return value, initial load with page view
3. **Step 4 + 5** — `sortAction` + refactor `<Sort />`
4. **Step 6** — `expandAction` / `collapseAction` + refactor `GroupedRowHeaderRenderer`
5. **Step 7** — Build `<PageView />` UI component
6. **Step 11 + 12** — Export + playground sample

Steps 1-2 are the core. Step 3 is the sort integration. Step 4 is expand/collapse integration. Steps 5-6 are UI + wiring.

---

## Summary of changes by file

| File | Change |
|------|--------|
| `frameworks/src/react/data/useFlatGrid.ts` | Add `enablePageView`, `displayPageSize` options. Add `currentPage` state, `activePageSize` state, `goToPage`, `goToPageWithSize`, `setDisplayPageSize`, `sortAction`, `expandAction`, `collapseAction`. Intercept `applyResult` with clone for offsetTop/totalRows override. `fetchPage` no-ops when `enablePageView`. Build `pageView` return value. Adjust initial load IR. |
| `frameworks/src/react/components/DataModelContext.tsx` | Add `sortAction`, `expandAction`, `collapseAction` to `DataModelContextValue`. |
| `frameworks/src/react/components/Sort.tsx` | Use `sortAction` from context when available (3 lines). |
| `frameworks/src/react/components/GroupedRowHeaderRenderer.tsx` | Use `expandAction`/`collapseAction` from context when available. |
| `frameworks/src/react/components/PageView.tsx` | New file. Dumb UI component — buttons, ellipsis, page info text. |
| `frameworks/src/react/index.ts` | Export `PageView`, `PageViewProps`. |

---

## Edge Cases

- **Sort + page view:** `sortAction` resets `currentPage` to 0 via `setCurrentPage(0)`, fetches page 0 with new sort using `activePageSize` (not `displayPageSize` prop). Cache is cleared by datamodel on sort change.
- **Expand on current page:** User stays on same page. `expandAction` re-fetches the current page window after expand so the viewmodel contains the correct row slice. `computeTotalLogicalRows()` increases → `totalPages` updates via React state re-render.
- **Collapse on current page:** `collapseAction` recomputes `totalPages` after collapse. If `currentPage` now exceeds `totalPages - 1`, clamps to last page via `setCurrentPage`, then re-fetches the clamped page window. Prevents empty/invalid page display.
- **Empty last page:** `endRow = Math.min(startRow + pageSize, datasetTotalRows)` → fewer rows, no blanks.
- **Page size larger than total rows:** 1 page. Prev/Next disabled.
- **Grouped data pagination:** Pages contain a mix of group rows and their expanded children. A group row and its children may span a page boundary — the group header appears on one page, some children on the next. This matches AG Grid Mode 2 behavior.
- **`viewDataEmpty` with page view:** `fetchPage` no-ops when `enablePageView` is true. In page-view mode, `viewDataEmpty` payloads are page-local (not dataset-global) because `offsetTop=0` and `totalRows=pageRowCount`. Passing them to `fetchPage` would fetch wrong ranges. The no-op prevents this.
- **`applyTransform` / `resetTransform` with page view:** Raw model results are preserved unmodified in `lastRawResultRef`. The page-view overrides (`offsetTop=0`, `totalRows`) are applied in a clone during `applyResult`, so re-applying transforms from the cached raw result produces correct values.
- **Consumer using custom `<PageView />`:** Consumer reads `pageView` from `useFlatGrid`, builds their own UI, calls `pageView.goToPage(n)`. The default `<PageView />` is replaceable.
