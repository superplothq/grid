# Facet Rendering & Cell Layout

The renderer is driven entirely by `GridDataViewModel`. Any consumer that wants to render a grid must populate this view model with the correct facet and data arrays.

`GridDataViewModel` holds **column facets** `(string | null)[][]`, optional **row facets** `(string | null)[][]`, and **value cells** as column-major 2D arrays. The renderer calls `getSlice(x0, y0, x1, y1)` to get the visible portion for virtualized rendering.

## Ragged Dimension Spanning via Null Values

Facet arrays use `null` to signal "this level does not apply." A facet entry like `["Region", null, null]` means the item exists only at level 0 and should visually span across levels 1 and 2. This is how the view model represents ragged (non-uniform depth) dimension spaces.

`getSlice()` preserves these nulls in the returned `SliceResult`. The renderer uses them to compute **secondary spans** — how many facet levels a single cell covers. For row facets this becomes a colspan (cell stretches rightward); for column facets it becomes a rowspan (cell stretches downward).

## Hierarchy via Value Merging

The view model drives hierarchy through repeated values across consecutive items in the facet arrays. When consecutive rows/columns share the same facet value at a given level (and the same ancestor path above it), the renderer merges them into a single cell with a **primary span**.

The hierarchical path is the sequence of facet values from level 0 down to the current level. Two items merge only when their full path matches, they are consecutive, and they have the same null shape (secondary span). This prevents false merges across gaps or across items with different depth structures.

Basic usage of data-viewmodel ([test cases](packages/grid/src/renderer/grid-data-viewmodel.test.ts)).


### Example

Given a view model with 3 facet levels and 8 items:

```
i=0  ["l0_0",  null,   null ]
i=1  ["l0_0", "l1_0",  "a"  ]
i=2  ["l0_0", "l1_0",  "b"  ]
i=3  ["l0_0", "l1_0",  "b"  ]
i=4  ["l0_0", "l1_1",  null ]
i=5  ["l0_0", "l1_1",  "c"  ]
i=6  ["l0_1",  null,   null ]
i=7  ["l0_2",  null,   null ]
```

Rendered as row facets:

```
       level0     level1     level2
      ┌──────────────────────────────┐
  0   │ l0_0      (→ span=3)         │   ← nulls at level1,2 → spans across 3 levels
      │──────────┬───────────────────│
  1   │ l0_0     │ l1_0     │  a     │
  2   │          │(↓ span=3)│  b     │   ← same value "l1_0" across rows 1-3 → merged
  3   │          │          │  b     │   ← same value "b" across rows 2-3 → merged
      │          │──────────┼────────│
  4   │(↓ span=5)│ l1_1  (→ span=2)  │   ← null at level2 → spans across 2 levels
      │          │──────────┬────────│
  5   │          │ l1_1     │  c     │
      │──────────┴──────────┴────────│
  6   │ l0_1      (→ span=3)         │
      │──────────────────────────────│
  7   │ l0_2      (→ span=3)         │
      └──────────────────────────────┘
```

- `l0_0` at i=0 has **secondary span 3** (covers all 3 levels) because levels 1 and 2 are null.
- `l0_0` at level 0 has **primary span 5** (rows 1–5) — the rows where it appears with deeper children. Row 0 is a separate cell because its null shape differs (span 3 vs span 1).
- `"b"` at level 2 has **primary span 2** (rows 2–3, same value and same ancestor path).

## View Model Options & Type Renames

### VTrackDef (formerly ColDef)

`VTrackDef` defines per-column rendering configuration for data cells (value tracks). Each entry can specify a custom `renderer`, `cellHeight`, `sampleData` for measurement, and a `colSize` auto-sizing strategy. Passed via `GridDataViewModelOptions.vTrackDefs`.

```ts
interface VTrackDef<T = any> {
  renderer?: CellRenderer<T>;
  cellHeight?: number;
  sampleData?: T;
  colSize?: ColAutoSizeConfig;
}
```

The view model normalizes these into `ResolvedVTrackDef[]` (accessed via `viewModel.vTrackDefs`), filling in `textRenderer` as the default renderer and `{ strategy: "max-cell" }` as the default col size.

### FacetDef

`FacetDef` defines per-level configuration for facet rendering. Each facet level (row or column) gets its own definition with:

- `text` — label shown in corner header cells (e.g. "department", "region")
- `trackRenderer` — renders facet data cells (the values along the axis)
- `headerRenderer` — renders corner header cells (intersection of row/column facet headers)
- `meta` — optional `FacetMeta` with `projectionState` and `projectedValues`
- `pseudo` — marks a level as synthetic (e.g. measure-name level), suppresses header rendering

```ts
interface FacetDef {
  text: string;
  headerRenderer: FacetHeaderRenderer;
  trackRenderer: FacetCellRenderer;
  meta?: FacetMeta;
  pseudo?: boolean;
}
```

Consumers provide `Partial<FacetDef>[]` — the view model normalizes each entry, filling in defaults: `text` → `""`, `trackRenderer` → `defaultFacetRenderer`, `headerRenderer` → `defaultFacetHeaderRenderer`.

### GridDataViewModelOptions

```ts
interface GridDataViewModelOptions {
  vTrackDefs?: VTrackDef[];
  facetDefs?: {
    row: Partial<FacetDef>[];
    col: Partial<FacetDef>[];
    axis: 'row' | 'col';
  };
}
```

The `axis` property indicates where measures are placed (`'row'` or `'col'`), which drives corner cell spanning logic. Defaults to `'col'` when not provided.

## Corner Cell Rendering (Facet Headers)

Corner cells sit at the intersection of row facet columns and column facet rows. Previously rendered as empty, they now display facet header labels using the `headerRenderer` from each `FacetDef`.

The layout depends on the `axis` property:

### axis = 'col' (measures on columns)

Column facet headers dominate. Each column facet level gets a full row spanning all row-facet columns. Row facet headers share the last row, one per column.

```
         rowFacet0    rowFacet1
        ┌────────────────────────┐
  col0  │ colFacetDefs[0].text   │   ← colspan = numRowFacetLevels
        │ (spans all cols)       │
        ├────────────┬───────────┤
  col1  │ rowDef[0]  │ rowDef[1] │   ← last row: one header per row facet level
        │ .text      │ .text     │
        └────────────┴───────────┘
```

### axis = 'row' (measures on rows)

Row facet headers dominate. Each row facet level gets a full column spanning all column-facet rows. Column facet headers share the last column, one per row.

```
         rowFacet0    rowFacet1
        ┌────────────┬───────────┐
  col0  │ rowDef[0]  │ colDef[0] │
        │ .text      │ .text     │
        │ (rowspan=  ├───────────┤
  col1  │  all rows) │ colDef[1] │   ← last col: one header per col facet level
        │            │ .text     │
        └────────────┴───────────┘
```

Facet levels marked with `pseudo: true` skip header content rendering.

## Projection State per Facet Level

`GridDataViewModel` exposes per-level projection state via `facetDefs`, accessed as `viewModel.facetDefs` which returns `{ row: FacetDef[], col: FacetDef[], axis: 'row' | 'col' }`. Each entry's optional `meta` field carries a `FacetMeta` with `projectionState` and `projectedValues`, telling the renderer whether expand/collapse UI should be shown for that facet level.

The four states:

| State | Meaning |
|---|---|
| `PROJECTION_NOT_CONFIGURED` | No projection on this axis — the axis was configured as a bare `AxisExpr` without a `projection` field. |
| `NOT_PROJECTED` | Projection is configured but this level is fully collapsed (no values are open). |
| `SOME_PROJECTED` | Some values at this level are open. `projectedValues` contains the set of open values. |
| `PROJECTED` | All values at this level are open (wildcard `"*"`). |

The state is computed by walking the `DimensionalProjectionPath[]` linked list one level at a time, merging open values across all paths at each level. The measure-name level (if present) is excluded — it is not a dimension and has no projection state.

## Meta State

`GridDataViewModel` exposes a `metaState` object for storing arbitrary key-value state scoped by namespace. Any consumer with access to the view model — external components, facet cell renderers, data cell renderers, layout code — can read and write state through this API.

```ts
viewModel.metaState.set(namespace, key, value);  // set a key in namespace
viewModel.metaState.get(namespace);               // get full state for namespace → Record<string, any> | undefined
viewModel.metaState.clear(namespace, key);         // clear a single key from namespace
viewModel.metaState.clear(namespace);              // clear entire namespace
```

## Data Flow

```
GridDataViewModel.getSlice()
  → SliceResult { columnFacets, rowFacets, data }
    → computeMerges() → MergeState[] { level, start, spanPrimary, spanSecondary }
      → CSS Grid placement with span syntax
```

Value cells occupy the grid area after the facet headers — row facet levels take the leftmost columns, column facet levels take the topmost rows.
