# React Binding for Grid

## Goal

Create a React binding layer (`packages/frameworks/src/react/`) that lets developers use the grid from React applications. The grid's rendering lifecycle stays in full control — React wraps the lifecycle and provides component-based column/cell definitions, but never owns cell DOM.

## Architecture Overview

```
Developer's React App (single createRoot at top)
  └── <DataGrid>  (React component — lifecycle wrapper)
        ├── Toolbar / Sort / Search / Filters  (React, outside shadow DOM)
        └── <div ref>  (mount point for imperative Grid)
              └── Grid instance (owns its own DOM, shadow DOM, cell pooling)
                    └── Cells rendered by adapter:
                          React FC definition → compiled to native CellRenderer
```

---

## Part 1: Changes Required in Renderer

### 1.1 CellManager — `onRelease` callback

**File:** `packages/grid/src/renderer/cell-manager.ts`

Currently, when a cell scrolls out of view, `endFrame()` calls `#release(cell)` which resets `innerHTML`, styles, dataset and pushes to pool. There is no notification that a cell is being recycled.

For React cell renderers, we need to unmount the React root before the cell's DOM is cleared. Without this, React roots become orphaned (memory leak, stale state).

**Change:** Add an optional `onRelease` callback to CellManager.

```ts
export default class CellManager {
  #pool: HTMLElement[] = [];
  #activeCells: Map<string, HTMLElement> = new Map();
  #usedKeys: Set<string> = new Set();
  onRelease: ((key: string, cell: HTMLElement) => void) | null = null;  // NEW

  // ...

  endFrame(): HTMLElement[] {
    const toRemove: HTMLElement[] = [];
    for (const [key, cell] of this.#activeCells) {
      if (!this.#usedKeys.has(key)) {
        toRemove.push(cell);
        this.onRelease?.(key, cell);   // NEW — notify before reset
        this.#release(cell);
        this.#activeCells.delete(key);
      }
    }
    return toRemove;
  }
}
```

This is a minimal, backwards-compatible change. When `onRelease` is null (default), behaviour is identical to today.

### 1.2 Grid — expose layout's `cellManager`

**File:** `packages/grid/src/renderer/index.ts`

The React adapter needs to register the `onRelease` callback on the cell manager. Currently, the cell manager is internal to the layout.

**Option A (preferred):** Expose a method on Grid that accepts the callback:

```ts
// on Grid class
setCellReleaseHandler(handler: (key: string, cell: HTMLElement) => void): void {
  this.#layout.cellManager.onRelease = handler;
}
```

**Option B:** Expose the cell manager directly (less encapsulated, but simpler):

```ts
get cellManager(): CellManager { return this.#layout.cellManager; }
```

### 1.3 Grid — expose `scheduleDraw`

The `scheduleDraw` method from the portal demo (batches multiple draw calls via `queueMicrotask`) is useful and should be kept. External UI actions (sort button click, filter change) will call `scheduleDraw()` rather than `draw()` directly, avoiding redundant renders when multiple state changes happen in the same tick.

This was already prototyped in the previous demo diff. Promote it to a permanent public method.

### 1.4 No other renderer changes needed

The core rendering pipeline (`beginFrame → acquire → renderer → endFrame`), cell pooling, virtual scrolling, shadow DOM — all remain untouched. The React binding works entirely through the existing extension points:
- `VTrackDef.renderer` for data cells
- `FacetDef.trackRenderer` / `FacetDef.headerRenderer` for facet cells
- `PVerticalFixture` / `PHorizontalFixture` for fixtures
- Grid events (`renderComplete`, `selectionAdded`, etc.)

---

## Part 2: Cell Renderers — The Adapter

### 2.1 Problem Statement

Grid's `CellRenderer<T>` signature is:

```ts
(data: T, ctx: { container: HTMLElement }) => string | HTMLElement | HTMLElement[]
```

Developers want to write React components:

```tsx
const ScoreCell: React.FC<CellProps> = ({ value }) => (
  <span className="pill">{value.toFixed(2)}</span>
);
```

We need to bridge these two worlds without portals and without `forceUpdate`.

### 2.2 Solution: `createRoot` per Cell Key

The adapter maintains a `Map<string, Root>` keyed by cell key (e.g., `data-5-12`).

When the grid calls the native renderer for a cell:

1. **First render (cell newly visible):** Create a container `<div>`, call `createRoot(container)`, call `root.render(<Component ...props />)`. Return the container.
2. **Re-render (cell still visible, content dirty from scroll):** The grid calls the renderer again with new data. The adapter finds the existing root for this key and calls `root.render(<Component ...newProps />)` into the same container. Return the container.
3. **Cell recycled (scrolled out):** The `onRelease` callback fires. The adapter calls `root.unmount()` and deletes the entry from the map.

```
Timeline for a single cell:

  scroll into view           scroll (content dirty)        scroll out of view
       │                            │                            │
       ▼                            ▼                            ▼
  createRoot(div)             root.render(newProps)        root.unmount()
  root.render(props)          (React reconciles)           delete from map
  return div                  return same div
```

### 2.3 Why Not Portals

Portals (`createPortal`) render into a target node but are part of the parent React tree. This means:
- Every portal re-renders when the parent re-renders (the `forceUpdate` problem)
- Portal count equals visible cells → parent reconciliation touches all of them on every scroll
- Portal targets can be destroyed by grid's `endFrame` before React processes the portal removal

`createRoot` creates an independent React tree per cell. Each root reconciles independently — no parent tree involvement. The app's top-level root is completely unaffected.

### 2.4 Implementation: `ReactCellAdapter`

```
packages/frameworks/src/react/renderer-adapter.ts
```

```ts
class ReactCellAdapter {
  #roots: Map<string, { root: Root; container: HTMLElement }> = new Map();
  #componentMap: Map<number, React.FC<CellProps>> = new Map();  // colIndex → component
  #contextWrapper?: React.FC<{ children: React.ReactNode }>;    // optional context bridge

  // Called by Grid's VTrackDef.renderer
  createNativeRenderer(colIndex: number, Component: React.FC<CellProps>): CellRenderer<any> {
    this.#componentMap.set(colIndex, Component);

    return (data: any, ctx: { container: HTMLElement }) => {
      const key = /* derive from ctx or data */;
      let entry = this.#roots.get(key);

      if (!entry) {
        const container = document.createElement("div");
        container.style.display = "contents";
        const root = createRoot(container);
        entry = { root, container };
        this.#roots.set(key, entry);
      }

      const element = this.#contextWrapper
        ? <this.#contextWrapper><Component value={data} /></this.#contextWrapper>
        : <Component value={data} />;

      entry.root.render(element);
      return entry.container;
    };
  }

  // Called by CellManager.onRelease
  handleCellRelease(key: string): void {
    const entry = this.#roots.get(key);
    if (entry) {
      entry.root.unmount();
      this.#roots.delete(key);
    }
  }

  // Called on Grid unmount
  dispose(): void {
    for (const [, entry] of this.#roots) {
      entry.root.unmount();
    }
    this.#roots.clear();
  }
}
```

### 2.5 Cell Key Derivation

The grid already generates deterministic cell keys: `data-{absoluteColIndex}-{absoluteRowIndex}` for data cells, and similar patterns for facet cells (visible in `renderDataCells` at standard-layout.ts:1594). The `onRelease` callback receives this same key, so the adapter can match them exactly.

However, the native `CellRenderer` signature `(data, ctx)` does not currently include the cell key. Extend `RendererContext` to include it:

```ts
export interface RendererContext {
  container: HTMLElement;
  key?: string;  // NEW — cell key from CellManager
}
```

This requires a one-line change in `renderDataCells` where the renderer is called. It's backwards-compatible — existing renderers that don't use `key` are unaffected.

### 2.6 Facet Cell Renderers

Facet renderers have a different signature:

```ts
type FacetCellRenderer = (data: string, dataCtx: FacetDataContext, ctx: FacetRendererContext) => FacetCellContent | El
```

The adapter creates a parallel `createNativeFacetRenderer` that works the same way — `createRoot` per facet cell key, unmount on release. The facet cell key follows the pattern `row-facet-{level}-{index}` or `col-facet-{level}-{index}` (visible in the layout rendering code).

The same `onRelease` mechanism handles cleanup for both data and facet cells since CellManager doesn't distinguish between cell types.

### 2.7 Context Bridge

Since each cell root is an independent React tree, it won't inherit context from the app's root (theme, i18n, store, etc.).

The adapter accepts an optional `contextWrapper`:

```tsx
<DataGrid
  contextWrapper={({ children }) => (
    <ThemeProvider theme={myTheme}>
      <StoreProvider store={myStore}>
        {children}
      </StoreProvider>
    </ThemeProvider>
  )}
>
```

Every cell root wraps its content with this wrapper. This is a standard pattern (AG Grid calls it `reactiveCustomComponents`).

---

## Part 3: Fixtures

### 3.1 Current Fixture System

Fixtures are UI elements pinned to grid edges (top/bottom/left/right). They participate in the grid's render cycle:

```ts
abstract class PVerticalFixture {
  abstract getCellsToRender(viewModel, fixtureViewModel, sliceData): { nodesToAppend: HTMLElement[] };
  abstract headerCells(ctx: HeaderCellContext): HTMLElement | string | null;
  get colSize(): ColAutoSizeConfig;
}

abstract class PHorizontalFixture {
  abstract getHeight(): number;
  abstract getCellsToRender(viewModel, fixtureViewModel, sliceData): { nodesToAppend: HTMLElement[] };
}
```

Fixtures use the same `CellManager` as the main grid — they call `cellManager.acquire(key)` and return elements that the layout appends. They are fully part of the render cycle.

### 3.2 React Fixture Approach

For React fixtures, we use the same `createRoot` adapter pattern. Create abstract base classes that wrap the fixture protocol:

```ts
// packages/frameworks/src/react/fixtures.ts

class ReactVerticalFixture extends PVerticalFixture {
  #adapter: ReactCellAdapter;
  #component: React.FC<FixtureCellProps>;

  getCellsToRender(viewModel, fixtureViewModel, sliceData) {
    // For each visible row, render the React component into a cell
    // acquired from cellManager, using the adapter's createRoot pattern
  }
}
```

Developer API:

```tsx
<DataGrid>
  <Fixture
    position="left"
    cell={RowCheckbox}
    header={SelectAllCheckbox}
    colSize={{ strategy: "fixed-width", widthInPx: 32 }}
  />
  <Fixture position="top" cell={FilterBar} height={32} />
</DataGrid>
```

- `cell` — React component called per visible row (vertical fixtures) or per visible column (horizontal fixtures). Participates in cell pooling via `createRoot` per key, same as data cell renderers.
- `header` — React component for the fixture's header cell. Only applies to vertical (left/right) fixtures. Called once per render cycle.
- The `<Fixture>` component is declarative config only. It doesn't render anything itself — `DataGrid` reads it and instantiates the appropriate `ReactVerticalFixture` or `ReactHorizontalFixture`.

### 3.3 Fixture ViewModel

Some fixtures need data that is separate from the grid's `GridDataViewModel`. For example, a bottom fixture showing column aggregates (mean, median, sum) — this data is computed once and comes from an entirely different source than the cell data.

The `<Fixture>` accepts an optional `data` prop for this:

```tsx
<Fixture
  position="bottom"
  cell={ColumnStatsRow}
  data={columnStatsViewModel}  // any shape — passed through to the cell component as-is
  height={28}
/>
```

The `cell` component receives it as a prop:

```tsx
const ColumnStatsRow: React.FC<FixtureCellProps> = ({ colIndex, data }) => {
  const stats = data as ColumnStats;  // the fixture's own viewmodel
  return <span>{stats.columns[colIndex].mean.toFixed(2)}</span>;
};
```

This keeps the fixture self-contained — grid's data pipeline doesn't need to know about fixture-specific viewmodels. The `data` prop is opaque to `DataGrid`; it just passes it through to the adapter which forwards it to the component.

When the fixture's viewmodel changes, the consumer updates the prop and calls `grid.scheduleDraw()` (or the `<DataGrid>` wrapper detects the prop change and schedules the draw automatically).

> **Note:** The underlying `PFixture` protocol does not yet support a separate viewmodel — this will need to be added to the renderer alongside the React binding work. The fixture base class would store the external viewmodel and make it available during `getCellsToRender`.

### 3.4 Fixture Lifecycle

Fixtures follow the same cell pooling as regular cells. The `onRelease` callback handles cleanup for fixture cells too — the key prefix distinguishes them (e.g., `fixture-left-0-{rowIndex}`).

### 3.4 State Coordination Between Fixture Header and Cells

Fixture headers and cells often need shared state. For example, a checkbox column where:
- Each cell row has a checkbox (checked/unchecked)
- The header shows `[✓]` (all selected), `[-]` (partial), or `[ ]` (none)
- Clicking header toggles all; clicking a cell toggles one

Since each cell and the header are independent React roots, React state inside one root cannot propagate to others. **Shared state that affects the grid must go through `MetaState`** (see Part 3.5).

The flow:

```
Header click "select all"
  → update MetaState (e.g., metaState.set("checkbox", "allSelected", true))
  → grid.scheduleDraw()
  → Grid re-renders all visible cells
  → Each cell's renderer is called → adapter calls root.render() with fresh props
  → Cell component reads from MetaState → renders as checked

Cell click (toggle one)
  → update MetaState (e.g., metaState.set("checkbox", `row-${rowIndex}`, toggled))
  → grid.scheduleDraw()
  → Grid re-renders header + all visible cells
  → Header reads MetaState → computes partial/all/none → renders [-]
```

Both `cell` and `header` components receive `metaState` and `scheduleDraw` as props:

```tsx
interface FixtureCellProps {
  rowIndex: number;
  metaState: MetaState;
  scheduleDraw: () => void;
}

interface FixtureHeaderProps {
  metaState: MetaState;
  scheduleDraw: () => void;
}
```

### 3.5 State Management Rules

There are two kinds of state in a `<DataGrid>` application. Which one to use depends on whether the state affects grid-rendered content or not.

**Grid-affecting state → `MetaState` + `scheduleDraw()`**

Any state that needs to be reflected inside grid-rendered cells (data cells, facet cells, fixture cells/headers) must live in `MetaState`. This is because each cell is an independent React root — React state in one root is invisible to others. `MetaState` is grid-scoped, survives across render cycles, and is accessible to all renderers.

Examples:
- Checkbox selection state (header ↔ cell coordination)
- Cell expand/collapse state (the `EvaluationRenderer` pattern from the demo)
- Row highlight / active state driven by fixtures
- Any state where one cell's action must visually affect other cells

Pattern: component updates MetaState → calls `scheduleDraw()` → grid re-renders → all visible renderers read fresh MetaState.

**Grid-external state → React state (useState, context, etc.)**

State that lives outside the grid's rendered cells — toolbar configuration, sort order, filter config, search query — is standard React state. The grid acts as a pure component with respect to this state: React rebuilds the ViewModel when state changes, passes it to grid, and calls `scheduleDraw()`.

Examples:
- Sort configuration (which column, asc/desc)
- Active filters
- Search query
- Column visibility toggles
- Pagination cursor

Pattern: React state change → update existing ViewModel (`viewModel.updateData(...)`) → `grid.scheduleDraw()`. The grid doesn't know or care about the sort/filter logic — it just renders whatever data the ViewModel contains.

**Summary:**

| State affects... | Store in | Trigger redraw via |
|---|---|---|
| Content inside grid cells | `MetaState` | `grid.scheduleDraw()` |
| ViewModel shape (sort, filter, data) | React state | `viewModel.updateData(...)` → `grid.scheduleDraw()` |
| Toolbar / external UI only | React state | Normal React re-render (grid untouched) |

---

## Part 4: External UI (Toolbar, Sort, Search, Filters)

### 4.1 Positioning

External UI (sort controls, search bar, filter dropdowns) lives **outside** the grid's shadow DOM, as React siblings of the grid mount point:

```tsx
// Inside <DataGrid> render
<div className="datagrid-wrapper">
  <Toolbar />           {/* React — outside shadow DOM */}
  <div ref={gridRef} /> {/* Grid mounts here — has shadow DOM */}
</div>
```

This is safe because:
- These elements are fully owned by React — no lifecycle conflict
- They don't participate in the grid's cell pooling or render cycle
- They're not inside shadow DOM, so standard CSS applies

### 4.2 External UI → Grid Communication (Actions)

When external UI triggers an action (user clicks "Sort by Name", types in search box, toggles a filter):

```
React state change (e.g., setSortConfig)
  → useEffect or callback
    → update the existing ViewModel (viewModel.updateData(...) with sorted/filtered data)
    → call grid.scheduleDraw()
```

`scheduleDraw()` (not `draw()`) is important here. If a single user action triggers multiple state changes (e.g., clearing a filter and applying a sort), `scheduleDraw` batches them into one render via `queueMicrotask`.

The flow is strictly one-directional per action:

```
  React state → ViewModel update → grid.scheduleDraw() → Grid renders
```

React does NOT re-render in response to grid rendering. There is no `forceUpdate`, no `renderComplete → setState` loop. React only re-renders when its own state changes (toolbar state, sort indicator, etc.).

### 4.3 Grid → External UI Communication (Events)

Grid emits events that external UI may need to react to:

| Event | Use Case |
|---|---|
| `renderComplete` | Update status bar ("showing rows 1-50 of 10,000") |
| `selectionAdded` / `selectionRemoved` | Update selection-dependent toolbar buttons |
| `viewDataEmpty` | Trigger data loading (pagination / infinite scroll) |

The `<DataGrid>` wrapper subscribes to these in `useEffect` and exposes them as React callbacks:

```tsx
<DataGrid
  onRenderComplete={({ y0, y1 }) => setVisibleRange([y0, y1])}
  onSelectionChange={(selections) => setHasSelection(selections.length > 0)}
  onViewDataEmpty={({ startRow, endRow }) => loadMoreData(startRow, endRow)}
/>
```

Inside DataGrid:

```ts
useEffect(() => {
  const unsubs = [
    grid.on("renderComplete", onRenderComplete),
    grid.on("selectionAdded", onSelectionChange),
  ];
  return () => unsubs.forEach(u => u());
}, [grid, onRenderComplete, onSelectionChange]);
```

These callbacks update React state, which triggers React re-renders — but only for the toolbar/status components, never for cells. Cells are entirely grid-managed.

### 4.4 Redraw Triggers Summary

| Trigger | Who Initiates | What Happens |
|---|---|---|
| Scroll | Grid (wheel/scroll listener) | Grid re-renders via RAF. React untouched. |
| Sort/Filter click | React (toolbar) | React updates state → `viewModel.updateData(...)` → `grid.scheduleDraw()` |
| Column resize | Grid (mouse handler) | Grid re-renders. React untouched. |
| Selection | Grid (click/keyboard) | Grid re-renders + emits event → React toolbar may update |
| Data load | React (fetch complete) | `viewModel.updateData(...)` → `grid.scheduleDraw()` |
| Window resize | Browser | ResizeObserver → `grid.scheduleDraw()` |

---

## Part 5: Event System

### 5.1 Current Events

Grid forwards layout events and adds its own:

**Layout events** (emitted by StandardLayout):
- `renderComplete` — `{ x0, y0, x1, y1 }` — viewport bounds after render
- `viewDataEmpty` — `{ startRow, endRow }` — viewport extends beyond loaded data
- `debug_perf:metrics` — render performance data

**Grid events** (emitted by Grid class):
- `selectionAdded` — selection was added
- `selectionRemoved` — selection was removed

All events are emitted asynchronously via `setTimeout(..., 0)`.

### 5.2 React Binding Event Strategy

The `<DataGrid>` component maps grid events to React callback props:

```tsx
interface DataGridProps {
  // ... data, columns, etc.
  onRenderComplete?: (viewport: { x0: number; y0: number; x1: number; y1: number }) => void;
  onSelectionChange?: (payload: SelectionPayload) => void;
  onViewDataEmpty?: (payload: { startRow: number; endRow: number }) => void;
}
```

Implementation uses stable refs to avoid re-subscribing on every render:

```ts
const callbackRef = useRef(onRenderComplete);
callbackRef.current = onRenderComplete;

useEffect(() => {
  return grid.on("renderComplete", (payload) => callbackRef.current?.(payload));
}, [grid]);
```

### 5.3 Imperative Handle

For advanced use cases, expose the Grid instance via `useImperativeHandle`:

```tsx
interface DataGridHandle {
  grid: Grid;
  scrollTo: (axis: "row" | "column", index: number) => void;
  selectCell: (row: number, col: number) => void;
  clearSelections: () => void;
  draw: () => void;
}

// Usage
const gridRef = useRef<DataGridHandle>(null);
<DataGrid ref={gridRef} ... />

// Later
gridRef.current.scrollTo("row", 500);
```

---

## Part 6: File Structure & Public API

### 6.1 Files

```
packages/frameworks/src/react/
  index.ts              — public exports
  DataGrid.tsx          — main wrapper component
  Fixture.tsx           — fixture definition (declarative, renders nothing)
  renderer-adapter.ts   — createRoot bridge for cell/facet renderers
  fixture-adapter.ts    — React fixture base classes
  types.ts              — CellProps, DataGridProps, DataGridHandle, etc.
```

### 6.2 Consumer API

```tsx
import { DataGrid, Fixture } from "frameworks/react";

function App() {
  const gridRef = useRef<DataGridHandle>(null);

  const handleSort = useCallback((sortConfig: SortConfig) => {
    const sorted = applySortToData(rawData, sortConfig);
    // Update existing viewmodel in place — don't create a new one
    gridRef.current.viewModel.updateData(sorted.data, sorted.columnFacets, sorted.rowFacets, sorted.rowMeta);
    gridRef.current.scheduleDraw();
  }, [rawData]);

  return (
    <div>
      <SortToolbar onSort={handleSort} />
      <DataGrid
        ref={gridRef}
        data={viewModel}
        theme="my-theme"
        onSelectionChange={handleSelection}
        onViewDataEmpty={loadMore}
      >
        <Fixture position="left" cell={RowNumbers} />
      </DataGrid>
    </div>
  );
}
```

---

## Part 7: Multi-Framework Portability

### 7.1 Layered Architecture

The design separates into three layers, where only the top two are framework-specific:

```
┌─────────────────────────────────────────────────┐
│  Layer 3: Framework wrapper  (~200 lines)       │
│  <DataGrid>, lifecycle hooks,                    │
│  event forwarding, imperative handle            │
├─────────────────────────────────────────────────┤
│  Layer 2: Cell mount/unmount bridge (~50 lines) │
│  "How does framework X render into / tear down  │
│   from an HTMLElement the grid provides?"        │
├─────────────────────────────────────────────────┤
│  Layer 1: Framework-agnostic (existing)         │
│  Grid, CellManager, StandardLayout, VTrackDef,  │
│  FacetDef, events, fixtures, cell pooling       │
└─────────────────────────────────────────────────┘
```

Layer 1 is the entire existing grid — unchanged across frameworks. The renderer changes (`onRelease`, `key` in `RendererContext`, `scheduleDraw`) all live in Layer 1 and benefit every framework adapter equally.

### 7.2 Framework-Specific Mapping

The only thing that differs per framework is how you mount/unmount a component into a grid-managed HTMLElement:

| Operation | React | Vue 3 | Svelte 5 | Solid |
|---|---|---|---|---|
| Mount into cell | `createRoot(el).render(<C/>)` | `createApp(C, props).mount(el)` | `mount(C, { target: el })` | `render(() => <C/>, el)` |
| Update props | `root.render(<C newProps/>)` | `app.$forceUpdate()` or reactive props | Reactive by default | Reactive by default |
| Unmount from cell | `root.unmount()` | `app.unmount()` | `unmount(component)` | `dispose()` return value |
| Wrapper component | `useEffect` + `useRef` | `onMounted` + `ref()` | `onMount` + `$effect` | `onMount` + `let ref` |
| Event forwarding | Callback props + `useRef` | `emit()` | `createEventDispatcher` | Props |

### 7.3 What This Means in Practice

To add Vue support, you would:

1. **Copy** `renderer-adapter.ts` → `renderer-adapter-vue.ts` (~50 lines) — swap `createRoot`/`root.render`/`root.unmount` for `createApp`/`app.mount`/`app.unmount`
2. **Rewrite** `DataGrid.tsx` → `DataGrid.vue` (~200 lines) — same logic (mount Grid in `onMounted`, sync props, forward events), different lifecycle hooks
3. **Zero changes** to Grid core, CellManager, StandardLayout, or any Layer 1 code

File structure per framework:

```
packages/frameworks/src/react/     ← ~250 lines total
packages/frameworks/src/vue/       ← ~250 lines total (hypothetical)
packages/frameworks/src/svelte/    ← ~250 lines total (hypothetical)
```

### 7.4 Shared Infrastructure

The `onRelease` callback, `RendererContext.key`, and `scheduleDraw` are the only renderer changes needed — and they're framework-agnostic. Once these land, any framework adapter can be built without touching the grid core again.

---

## Part 8: Data Layer — DataSource, DataModel, and ViewModel Lifecycle

### 8.1 Problem

The grid's data pipeline has three layers:

```
DataSource (SQL engine, async)
  → DataModel (schema + query logic: PivotConfig or GetRowsIR → data)
    → ViewModel (column-major data + facets, bridge to renderer)
      → Grid (renders via getSlice)
```

Currently, every playground component manually wires these layers: create DataSource, load data, create DataModel, build IR/config, call `getViewModelData()`, create ViewModel, attach to Grid, handle pagination events. This is ~80 lines of repeated boilerplate per component.

The React binding should provide composable hooks that manage this lifecycle while keeping each layer independently usable.

### 8.2 Architecture: Three Composable Layers

```
┌────────────────────────────────────────────────────────────┐
│  Layer C: <DataGrid data={viewModel}>                      │
│  Pure renderer wrapper — takes a ViewModel, renders grid   │
├────────────────────────────────────────────────────────────┤
│  Layer B: useGridData(model, config)                       │
│  Bridge hook — calls getViewModelData(), manages ViewModel │
│  lifecycle (create once, updateData on config changes)     │
├────────────────────────────────────────────────────────────┤
│  Layer A: <DataSourceProvider> + useDataSource()           │
│  Thin context wrapper — distributes an already-created     │
│  DataSource to children                                    │
└────────────────────────────────────────────────────────────┘
```

Each layer is independently useful:
- Use Layer A alone to share a DataSource across multiple grids
- Use Layer B alone for ViewModel management (skip the provider, pass your own model)
- Use Layer C alone with a manually-created ViewModel (no hooks needed)

### 8.3 Layer A: DataSource Provider

A thin context wrapper that distributes an already-created DataSource. The consumer creates and configures the DataSource themselves using the full API — the Provider has no creation logic and mirrors no DataSource methods.

```tsx
interface DataSourceContextValue {
  dataSource: SqlDataSource;
  columns: ColumnMetadata[];
  schema: DataSchema[];
}
```

```tsx
// Consumer creates DataSource themselves — full API access, any future methods
const ds = await DuckDBWasmDataSource.create();
const columns = await ds.loadDataFromURL({ url, type: "csv", schema, replace });
// ...any future ds.someNewMethod() — no binding changes needed

<DataSourceProvider dataSource={ds} columns={columns} schema={schema}>
  {children}
</DataSourceProvider>
```

```tsx
// In any child:
const { dataSource, columns, schema } = useDataSource();
```

**Why the consumer creates the DataSource, not the Provider:**
- DataSource APIs grow over time (`loadDataFromURL`, `loadData`, future methods). Mirroring them as Provider props means the binding must update every time a new method is added.
- Some consumers need custom setup (multiple loads, preprocessing, artificial delays for testing).
- The Provider's only job is distribution — making the same DataSource available to all children without prop drilling.

**Typical bootstrap pattern:**

```tsx
function App() {
  const [dsState, setDsState] = useState<
    | { status: "loading" }
    | { status: "ready"; ds: SqlDataSource; columns: ColumnMetadata[]; schema: DataSchema[] }
    | { status: "error"; error: Error }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ds = await DuckDBWasmDataSource.create();
      const columns = await ds.loadDataFromURL({ url: DATA_URL, type: "csv" });
      const schema = columns.map(c => ({ name: c.normColName, type: c.type, subtype: c.subtype }));
      if (!cancelled) setDsState({ status: "ready", ds, columns, schema });
    })().catch(err => {
      if (!cancelled) setDsState({ status: "error", error: err });
    });
    return () => { cancelled = true; };
  }, []);

  if (dsState.status === "loading") return <Spinner />;
  if (dsState.status === "error") return <ErrorDisplay error={dsState.error} />;

  return (
    <DataSourceProvider dataSource={dsState.ds} columns={dsState.columns} schema={dsState.schema}>
      <MyGrid />
    </DataSourceProvider>
  );
}
```

### 8.4 Layer B: `useGridData` — The Core Bridge Hook

Takes a DataModel + config, manages the ViewModel lifecycle, returns the ViewModel + state.

```tsx
// For pivot tables
function usePivotData(
  model: GridPivotDataModel | null,
  config: PivotConfig,
  options?: { facetDefs?: GridDataViewModelOptions["facetDefs"]; vTrackDefs?: VTrackDef[] }
): {
  viewModel: PivotDataViewModel | null;
  loading: boolean;
  error: Error | null;
};

// For flat tables
function useFlatData(
  model: SqlFlatTableDataModel | null,
  ir: GetRowsIR,
  options?: { facetDefs?: GridDataViewModelOptions["facetDefs"]; vTrackDefs?: VTrackDef[] }
): {
  viewModel: FlattenedDataViewModel | null;
  loading: boolean;
  error: Error | null;
  fetchPage: (startRow: number, endRow: number) => Promise<void>;
};
```

**Internal behavior:**

```
config changes (via deps)
  → set loading=true
  → call model.getViewModelData(config)
  → if first result: create new ViewModel (new PivotDataViewModel(result))
  → if subsequent: viewModel.updateData(result)
  → set loading=false
  → ViewModel reference is stable (same object, mutated in place)
```

**Key: ViewModel is created once, updated in place.** The hook stores the ViewModel in a `useRef` and never replaces it. This is critical — the Grid holds a reference to the ViewModel, and recreating it would break the connection.

**Pagination (`useFlatData` only):**

The `fetchPage` callback is wired to `grid.on("viewDataEmpty")` by the consumer:

```tsx
const { viewModel, fetchPage } = useFlatData(model, ir);

<DataGrid
  data={viewModel}
  onViewDataEmpty={({ startRow, endRow }) => fetchPage(startRow, endRow)}
/>
```

Inside `fetchPage`:
1. Calls `model.getViewModelData({ ...ir, startRow, endRow })`
2. Calls `viewModel.updateData(result)`
3. The DataGrid's event handler (Part 5) triggers `grid.scheduleDraw()` automatically after ViewModel update

### 8.5 Layer B Implementation Sketch

```tsx
function usePivotData(
  model: GridPivotDataModel | null,
  config: PivotConfig,
  options?: { facetDefs?: GridDataViewModelOptions["facetDefs"]; vTrackDefs?: VTrackDef[] }
) {
  const vmRef = useRef<PivotDataViewModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!model) return;
    let cancelled = false;
    setLoading(true);

    model.getViewModelData(config).then((result) => {
      if (cancelled) return;

      const vmOptions: GridDataViewModelOptions = {
        ...result.options,
        ...(options?.facetDefs && { facetDefs: options.facetDefs }),
        ...(options?.vTrackDefs && { vTrackDefs: options.vTrackDefs }),
      };

      if (!vmRef.current) {
        vmRef.current = new PivotDataViewModel({
          ...result,
          options: vmOptions,
        });
      } else {
        vmRef.current.updateData({
          ...result,
          options: vmOptions,
        });
      }
      setLoading(false);
    }).catch((err) => {
      if (!cancelled) {
        setError(err);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [model, config]);

  return { viewModel: vmRef.current, loading, error };
}
```

### 8.6 Wiring DataModel Creation

The DataModel sits between DataSource and ViewModel. It wraps a DataSource + schema and knows how to convert config → SQL → results. The consumer creates it once when the DataSource is ready:

```tsx
function MyGrid() {
  const { dataSource, schema } = useDataSource();
  const modelRef = useRef<SqlPivotDataModel | null>(null);
  const [pivotConfig, setPivotConfig] = useState<PivotConfig>(initialConfig);

  // Create model once when DataSource is ready
  if (!modelRef.current) {
    modelRef.current = new SqlPivotDataModel(schema, dataSource);
  }

  const { viewModel, loading } = usePivotData(modelRef.current, pivotConfig);

  return (
    <div>
      <Toolbar onConfigChange={setPivotConfig} />
      {loading && <Spinner />}
      <DataGrid data={viewModel} />
    </div>
  );
}
```

**Why not put DataModel creation inside the hook?**
DataModel construction requires schema + DataSource — both come from the Provider. The hook doesn't know about the Provider (it's composable). Also, some consumers may want to customize the model (wrap `getData` with delays/caching as in the playground demos).

### 8.7 Convenience: `useModel` Hook

For the common case where a `<DataSourceProvider>` is present, convenience hooks that read the DataSource from context and create the model. These hooks **only work inside a `<DataSourceProvider>`** — if you skip the Provider, create the model yourself and pass it to `usePivotData(model, config)` / `useFlatData(model, ir)` directly.

```tsx
function usePivotModel(): SqlPivotDataModel | null {
  const { dataSource, schema } = useDataSource();
  const modelRef = useRef<SqlPivotDataModel | null>(null);

  if (!modelRef.current) {
    modelRef.current = new SqlPivotDataModel(schema, dataSource);
  }

  return modelRef.current;
}

function useFlatModel(config: FlatTableConfig): SqlFlatTableDataModel | null {
  const { dataSource, schema } = useDataSource();
  const modelRef = useRef<SqlFlatTableDataModel | null>(null);

  if (!modelRef.current) {
    modelRef.current = new SqlFlatTableDataModel(config, schema, dataSource);
  }

  return modelRef.current;
}
```

This simplifies the consumer to:

```tsx
function MyGrid() {
  const model = usePivotModel();
  const { viewModel, loading } = usePivotData(model, pivotConfig);

  return <DataGrid data={viewModel} />;
}
```

### 8.8 Full Example: Flat Table with Pagination

```tsx
function PaginatedTable() {
  const model = useFlatModel({ schema, pageSize: 100 });
  const [ir, setIR] = useState<GetRowsIR>({
    startRow: 0, endRow: 100,
    select: [], groupBy: ["group"], project: ["value"],
    sort: [], filter: [],
  });

  const { viewModel, loading, fetchPage } = useFlatData(model, ir, {
    facetDefs: { row: [{ trackRenderer: facetRenderer }], col: [{}], axis: "col" },
  });

  return (
    <div>
      {loading && <Spinner />}
      <DataGrid
        data={viewModel}
        layout="flat"
        onViewDataEmpty={({ startRow, endRow }) => fetchPage(startRow, endRow)}
      />
    </div>
  );
}
```

Compare with the current `flat-table.tsx` playground (~120 lines of manual wiring) — this is ~20 lines.

### 8.9 File Structure Update

```
packages/frameworks/src/react/
  index.ts
  DataGrid.tsx
  Fixture.tsx
  renderer-adapter.ts
  fixture-adapter.ts
  types.ts
  data/
    DataSourceProvider.tsx       ← Layer A (thin context wrapper)
    useDataSource.ts            ← Layer A (hook)
    usePivotData.ts             ← Layer B (pivot)
    useFlatData.ts              ← Layer B (flat)
    usePivotModel.ts            ← convenience
    useFlatModel.ts             ← convenience
    index.ts                    ← re-exports
```

### 8.10 Design Principles

1. **Provider is a pass-through** — it holds a DataSource the consumer already created. No creation logic, no mirroring of DataSource APIs. Future DataSource methods require zero binding changes.
2. **ViewModel is stable** — created once, updated via `updateData()`, never replaced. Grid holds a reference to it.
3. **Hooks don't know about Grid** — they manage ViewModel lifecycle only. The `<DataGrid>` component connects ViewModel to Grid.
4. **DataModel is the consumer's concern** — hooks take a model, they don't create one. This keeps them testable and framework-agnostic.
5. **Pagination is a callback, not magic** — `fetchPage` is returned by the hook, wired to `onViewDataEmpty` by the consumer. No hidden subscriptions.
6. **Each layer is independently useful** — skip any layer and the others still work.
7. **Imperative model actions are not yet covered** — some DataModel operations don't map to config changes. For example, flat table `expand/collapse` calls `model.expandData(path)` / `model.collapseData(path)` directly and returns incremental results. These imperative actions bypass the config → hook → ViewModel flow and need their own pattern (e.g., exposing the model + a `refresh` callback, or action-specific hooks). To be designed later.

---

## Summary of Renderer Changes

| Change | File | Impact |
|---|---|---|
| `onRelease` callback on CellManager | `cell-manager.ts` | Minimal — null by default, called before `#release` |
| Expose `setCellReleaseHandler` on Grid | `index.ts` | New public method |
| Add `key` to `RendererContext` | `cell-renderers.ts` + `standard-layout.ts` | Backwards-compatible optional field |
| Promote `scheduleDraw` to public | `index.ts` | Already prototyped in demo diff |

Total: ~15 lines changed in the renderer core. The rest is new code in `packages/frameworks/src/react/`.
