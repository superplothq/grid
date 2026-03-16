# Flat Table Pipeline: DataModel → FlattenedDataViewModel → GroupedRowLayout

## Overview

The flat table pipeline is a separate path from the pivot pipeline. It renders individual rows (not aggregated) with optional row grouping and expand/collapse.

```
DataModel  ──→  FlattenedDataViewModel  ──→  GroupedRowLayout
(your code)     (renderer contract)          (draws cells)
```

**DataModel** is responsible for loading, storing, and flattening data into arrays that the viewmodel can render. `SqlFlatTableDataModel` is the built-in implementation — it takes a `SqlDataSource` dependency (e.g., `DuckDBWasmDataSource` for browser, `DuckDBDataSource` for Node.js) and generates SQL for grouped/paginated data fetching. The datasource is shared across grids via ref counting.

**FlattenedDataViewModel** is the bridge contract between data and renderer. It holds a column-major data array, a single-level row facet array, and a packed metadata byte array encoding each row's depth, leaf status, and expansion state.

**GroupedRowLayout** extends `StandardLayout` to render flat rows with depth-based indentation and expand/collapse UI, instead of the merged multi-level row facets used by pivot.

---

## How it differs from pivot

| Aspect | Pivot | Flat Table |
|---|---|---|
| Row facets | Multi-level (`FacetData = string[][]`) | Single-level (`(string \| null)[]`) |
| Row metadata | None | `Uint8Array` with depth/leaf/expanded bits |
| Data cells | Aggregated (SUM, COUNT, etc.) | Individual row values |
| Layout | `StandardLayout` with merged cells | `GroupedRowLayout` with indentation |
| ViewModel | `PivotDataViewModel` | `FlattenedDataViewModel` |
| DataModel | `SqlPivotDataModel` + `SqlDataSource` | `SqlFlatTableDataModel` + `SqlDataSource` |

---

## Stage 1: DataModel → FlattenedDataViewModel

### Output: Flattened tree in depth-first order

The datamodel takes tabular data + a groupBy config (or server responses) and flattens the grouped hierarchy into three parallel arrays in depth-first traversal order:

**Source data (tree):**

```
▼ Engineering
   ▼ Frontend
      Alice    $120k
      Bob      $115k
   ▼ Backend
      Carol    $130k
      Dave     $125k
      Eve      $140k
▼ Sales
   ▼ Direct
      Frank    $95k
      Grace    $88k
   ▶ Partner (collapsed)
```

**Flattened arrays:**

```
rowFacet:  ["Engineering", "Frontend", "Alice", "Bob", "Backend", "Carol", "Dave", "Eve", "Sales", "Direct", "Frank", "Grace", "Partner"]

rowMeta:   [group-d0-exp, group-d1-exp, leaf-d2, leaf-d2, group-d1-exp, leaf-d2, leaf-d2, leaf-d2, group-d0-exp, group-d1-exp, leaf-d2, leaf-d2, group-d1-col]

data:      [[null, null, 120000, 115000, null, 130000, 125000, 140000, null, null, 95000, 88000, null]]
```

Group rows typically have `null` data values (or aggregated summaries). Leaf rows have actual cell values.

### Row metadata encoding

Each row's metadata is packed into a single byte in a `Uint8Array`:

```
Bit layout:  [depth:4][leaf:1][expanded:1][unused:2]

Bits 7-4  (DEPTH_MASK = 0xF0):  Hierarchy depth (0-15)
Bit  3    (LEAF_MASK  = 0x08):  1 = leaf row (no children)
Bit  2    (EXPAND_MASK = 0x04): 1 = expanded, 0 = collapsed
```

Use `createRowMeta(depth, isLeaf, isExpanded)` to construct:

```typescript
createRowMeta(0, false, true)   // depth 0 group, expanded  → 0x04
createRowMeta(1, false, true)   // depth 1 group, expanded  → 0x14
createRowMeta(2, true, false)   // depth 2 leaf             → 0x28
createRowMeta(1, false, false)  // depth 1 group, collapsed → 0x10
```

### Constructing the viewmodel

```typescript
import { FlattenedDataViewModel, createRowMeta } from "grid";

const viewModel = new FlattenedDataViewModel(
  data,           // any[][] — column-major: data[colIndex][rowIndex]
  columnFacets,   // FacetData — level-major column headers
  rowFacet,       // (string | null)[] — one label per row
  rowMeta,        // Uint8Array — packed depth/leaf/expanded per row
  options         // GridDataViewModelOptions — track defs, facet defs, etc.
);

grid.data = viewModel;
grid.draw();
```

---

## Stage 2: FlattenedDataViewModel (the contract)

### What the viewmodel holds

```typescript
class FlattenedDataViewModel extends GridDataViewModel {
  // Inherited from GridDataViewModel:
  //   data: any[][]         — column-major cell values
  //   columnFacets: FacetData
  //   numRows, numCols

  // Flat-specific:
  #rowFacet: (string | null)[]   — one label per row
  #rowMeta: Uint8Array           — packed metadata per row
}
```

### Key properties

```typescript
numRowFacetLevels: number   // always 1 (or 0 if no rowFacet)
rowFacets: FacetData        // wraps #rowFacet in a single-element array
```

Unlike `PivotDataViewModel` which can have multiple row facet levels (one per dimension in the row axis), `FlattenedDataViewModel` always has exactly one level — the flattened group/row label.

### getSlice — the renderer interface

```typescript
getSlice(x0: number, y0: number, x1: number, y1: number): FlatSliceResult
```

Returns the visible window of data plus row metadata:

```typescript
interface FlatSliceResult extends BaseSliceResult {
  rowFacets: (string | null)[];   // labels for rows y0..y1
  rowMeta: FlatRowMeta[];         // unpacked metadata for rows y0..y1
}

interface FlatRowMeta {
  depth: number;        // 0-15, hierarchy level
  isLeaf: boolean;      // true = data row, false = group row
  isExpanded: boolean;  // true = children visible below
}
```

### Expand/collapse mutations

```typescript
expand(rowIndex: number): void       // sets EXPAND_MASK bit
collapse(rowIndex: number): void     // clears EXPAND_MASK bit
toggleExpand(rowIndex: number): void  // XORs EXPAND_MASK bit
```

These mutate the `rowMeta` byte in-place. They only flip the bit — **they do not add or remove child rows from the arrays**. The application is responsible for rebuilding the flattened arrays when the visible tree changes (e.g., via `updateData()`).

### Updating data

```typescript
updateData(
  data: any[][],
  columnFacets: FacetData,
  rowFacet?: (string | null)[],
  rowMeta?: Uint8Array,
  options?: GridDataViewModelOptions
): void
```

Replaces all data in-place. Used when the tree structure changes (expand/collapse causes re-flatten) or when new data arrives.

---

## Stage 3: GroupedRowLayout (the renderer)

### How it extends StandardLayout

`GroupedRowLayout` overrides one method: `renderRowFacets()`. Everything else — column facets, data cells, scrolling, virtualization, cell pooling — is inherited from `StandardLayout`.

### Render flow

```
scroll event
  → calculateViewModel()           // inherited: maps scroll position to [y0, y1) row range
  → getSlice(x0, y0, x1, y1)       // gets visible data + metadata
  → render()
    → renderRowFacets()             // OVERRIDDEN: flat rows with indentation
    → renderDataCells()             // inherited: grid cells
    → renderColumnFacets()          // inherited: column headers
```

### How renderRowFacets uses the metadata

For each visible row `j` in the slice:

```
meta = sliceData.rowMeta[j]
label = sliceData.rowFacets[j]

indentation:  left = depthPosition + meta.depth * 16px
box-shadow:   extends cell leftward to cover indentation gap
CSS variable: --depth = meta.depth (available to custom renderers)
```

The custom `trackRenderer` receives a context with `flatMeta: { depth, isLeaf, isExpanded }`, so renderers can draw expand/collapse icons, style group rows differently from leaf rows, etc.

### Visual result

```
┌──────────────────┬────────┬────────┐
│ Name             │ Salary │ Level  │
├──────────────────┼────────┼────────┤
│ ▼ Engineering    │        │        │   depth=0, group, expanded
│   ▼ Frontend     │        │        │   depth=1, group, expanded
│     Alice        │ 120k   │ L5     │   depth=2, leaf
│     Bob          │ 115k   │ L4     │   depth=2, leaf
│   ▼ Backend      │        │        │   depth=1, group, expanded
│     Carol        │ 130k   │ L5     │   depth=2, leaf
│     Dave         │ 125k   │ L5     │   depth=2, leaf
│     Eve          │ 140k   │ L6     │   depth=2, leaf
│ ▼ Sales          │        │        │   depth=0, group, expanded
│   ▼ Direct       │        │        │   depth=1, group, expanded
│     Frank        │  95k   │ L3     │   depth=2, leaf
│     Grace        │  88k   │ L3     │   depth=2, leaf
│   ▶ Partner      │        │        │   depth=1, group, collapsed
└──────────────────┴────────┴────────┘
```

---

## DataSource Layer

`SqlFlatTableDataModel` delegates all SQL execution to a `SqlDataSource`. The datasource owns the database engine, connection, and data loading. Multiple grids (pivot and flat table) can share a single datasource via ref counting.

```
DataSource<T> (interface)         — generic: execute, addRef, release
└── SqlDataSource (abstract)      — implements DataSource<string>, adds loadData + table
    ├── DuckDBDataSource          — Node.js duckdb
    └── DuckDBWasmDataSource      — Browser WASM duckdb
```

### Shared datasource across grids

```typescript
const ds = await DuckDBWasmDataSource.create();
const columns = new Map([["department", "VARCHAR"], ["employee", "VARCHAR"], ["salary", "DOUBLE"]]);
await ds.loadData({ columns, data: [deptArray, empArray, salaryArray] });

// Same datasource backs both grids
const pivotGrid = new SqlPivotDataModel(pivotSchema, ds);
ds.addRef();
const flatGrid = new SqlFlatTableDataModel(flatConfig, flatSchema, ds);

// Release when done — engine disposed at refCount 0
await pivotGrid.release();  // or ds.release()
await flatGrid.release();
```

See `docs/data-pipeline.md` for the full datasource documentation including `SqlColumnType`, `loadData` API, and Arrow/TIMESTAMP handling.

---

## Future: Server-Side Data Loading

For server-side loading with pagination, chunking and fetching belong in the **datamodel layer** — not the viewmodel. The viewmodel remains a thin renderer contract that receives ready-to-render data.

A server-backed flat table datamodel would implement `DataSource<T>` with a custom request type (not SQL strings), delegating to a server API. The same ref counting and lifecycle contract applies.

```
ServerDataSource (implements DataSource<GetRowsRequest>)
  → SqlFlatTableDataModel or a new ServerFlatTableDataModel
    → produces FlattenedDataViewModel for visible window
      → GroupedRowLayout renders it
```

### Chunk-based storage in the datamodel

The datamodel stores rows in fixed-size chunks (e.g., 100 rows each). A cache cap evicts distant chunks to bound memory regardless of total dataset size:

```
DataModel internals:

chunks:  { [chunkIndex: number]: { data: any[][], rowFacet: (string|null)[], rowMeta: Uint8Array } }
totalRowCount: number          // from server, for scrollbar height
maxChunks: number              // memory cap, e.g. 50 chunks = 5000 rows

chunkIndex = Math.floor(rowIndex / chunkSize)
offsetInChunk = rowIndex % chunkSize
```

When the layout requests a viewport range, the datamodel:
1. Checks which chunks cover that range
2. Returns available data, marks missing ranges as loading
3. Triggers async fetch for missing chunks
4. On fetch completion, notifies the layout to re-render

### Render loop with async loading

```
scroll event
  → layout asks datamodel for visible range
  → datamodel assembles viewmodel from cached chunks
  → layout renders (real cells + skeleton placeholders for missing chunks)
  → datamodel fetches missing chunks from server (async)
  → data arrives, datamodel inserts into chunk cache, evicts old chunks
  → datamodel emits "dataAvailable" event
  → layout re-renders with complete data
```

The layout and viewmodel stay synchronous. All async complexity is contained in the datamodel.
