# Column Sizing

## Overview

Column sizing controls how columns determine their width. The strategy is configured per-track via `colSize` on `VTrackDef` (data columns) and `FacetDef` (row facets).

---

## Strategies

### `max-cell` (default)

Each column is sized to fit its widest cell content. Horizontal scrolling and column virtualization are active.

```typescript
{ strategy: "max-cell" }
```

### `fixed-width`

The column is given an explicit pixel width, optionally constrained by min/max bounds.

```typescript
{ strategy: "fixed-width", widthInPx: 200 }
{ strategy: "fixed-width", minWidthInPx: 100, maxWidthInPx: 300 }
```

### `static` (fit container)

Columns use CSS grid-native sizing (`fr`, `%`, `px`) and fit within the container. Horizontal scrolling and column virtualization are disabled.

```typescript
{ strategy: "static", width: 2, unit: "fr" }
{ strategy: "static", width: 150, unit: "px" }
{ strategy: "static", width: 25, unit: "%" }
```

**Key rule:** When **any** column (data track or row facet) uses `static`, **all** columns are coerced to static. Non-static columns default to `1fr`.

---

## Config Shape

```typescript
type ColAutoSizeConfig =
  | { strategy: "max-cell"; excludeColumnFacets?: boolean }
  | { strategy: "fixed-width"; widthInPx?: number; maxWidthInPx?: number; minWidthInPx?: number; excludeColumnFacets?: boolean }
  | { strategy: "static"; width: number; unit: "%" | "fr" | "px"; excludeColumnFacets?: boolean };
```

### Where `colSize` can be set

| Track type | Config location | Default |
|---|---|---|
| Data columns | `VTrackDef.colSize` | `{ strategy: "max-cell" }` |
| Row facets | `FacetDef.colSize` | `{ strategy: "max-cell" }` |

---

## Example

```typescript
const viewModel = dataModel.getViewModelData({
  vTrackDefs: [
    { colSize: { strategy: "static", width: 2, unit: "fr" } },
    { colSize: { strategy: "static", width: 100, unit: "px" } },
    // remaining columns default to 1fr (coerced by static rule)
  ],
  facetDefs: {
    row: [
      { colSize: { strategy: "static", width: 200, unit: "px" } },
    ],
    col: [],
    axis: "col",
  },
});
```
