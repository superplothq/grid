# Row Facet & Fixture Resize — Implementation Plan

## Overview

Add drag-to-resize support for row facet tracks and vertical fixtures. Today only data columns (column facet leaf cells) are resizable. This plan extends resize to row facet header cells and fixtures, and restructures `colsWidth` into a left/center/right model to cleanly support pinned columns in the future.

---

## Architecture

### Current state

Track layout order in CSS grid:
```
left-fixtures | row-facet-tracks | data-columns | right-fixtures
```

`colsWidth` is a flat array indexed by global column position. Fixtures and data columns are **measured** (via `cellsToMeasure` → `indices`), but only data columns support **override** (via resize). Row facet track slots exist in the index space but are never written to — their width comes from CSS `max-content`.

Resize handles exist only on column facet cells (`buildAndPlaceFacetCell` with `resizeHandle: true`). The resize handler in `Grid.#setupResizeHandler()` only looks for `[data-cell-type='column-facet']` parents.

### Target state

```
left-fixtures | row-facet-tracks | left-pinned (future) | data-columns | right-pinned (future) | right-fixtures
```

Restructure `colsWidth` into three regions so each uses zero-based indices:

```ts
colsWidth: {
  left: {   // left fixtures + row facet tracks + left-pinned (future)
    indices: number[];
    override: number[];
  };
  center: { // data columns (scrollable)
    indices: number[];
    override: number[];
  };
  right: {  // right-pinned (future) + right fixtures
    indices: number[];
    override: number[];
  };
}
```

Resize handles on row facet header cells (corner cells in column-facet rows that align above row facet tracks).

---

## Step-by-step plan

### Step 1: Restructure `colsWidth` in `standard-layout.ts`

**File:** `packages/grid/src/renderer/standard-layout.ts`

Replace the flat `colsWidth` (line ~118):
```ts
// Before
colsWidth: { indices: number[]; override: number[] } = { indices: [], override: [] };

// After
colsWidth: {
  left: { indices: number[]; override: number[] };
  center: { indices: number[]; override: number[] };
  right: { indices: number[]; override: number[] };
} = {
  left: { indices: [], override: [] },
  center: { indices: [], override: [] },
  right: { indices: [], override: [] },
};
```

Left region index mapping (zero-based within `left`):
- `0..fixtures.left.length - 1` → left fixtures
- `fixtures.left.length..fixtures.left.length + numRowFacetLevels - 1` → row facet tracks

Right region index mapping (zero-based within `right`):
- `0..fixtures.right.length - 1` → right fixtures

Center region: `0..numDataCols - 1` → data columns (zero-based, no offset math)

### Step 2: Add `getColumnWidth` helpers that resolve from the right region

**File:** `packages/grid/src/renderer/standard-layout.ts`

Replace the single `getColumnWidth(index)` (line ~458) with a single region-aware method:

```ts
getColumnWidth(region: "left" | "center" | "right", index: number): number {
  return this.colsWidth[region].override[index]
    ?? this.colsWidth[region].indices[index]
    ?? this.config.defaultCellWidth;
}
```

All callers updated to pass the region explicitly.

### Step 3: Update `getColWidthTillIdx` and horizontal viewmodel calculations

**File:** `packages/grid/src/renderer/standard-layout.ts`

Update `getColWidthTillIdx` and the two `calculateHorizontalViewModel*` methods (~lines 586-710) to use region helpers:

- Left fixture width: sum of `getColumnWidth("left", 0..fixtures.left.length-1)`
- Row facet track width: sum of `getColumnWidth("left", fixtures.left.length..fixtures.left.length+numRowFacetLevels-1)`
- Data column width: sum of `getColumnWidth("center", 0..numVisibleCols-1)`
- Right fixture width: sum of `getColumnWidth("right", 0..fixtures.right.length-1)`

`calcNumVisibleColumns` (line ~472) simplifies — no more `fixedTrackCount` offset, just iterate `getColumnWidth("center", startCol + count)`.

### Step 4: Update `#autosizeCells` to write to correct region

**File:** `packages/grid/src/renderer/standard-layout.ts`

The `sizeKey` values in `#cellsToMeasure` currently use global indices. Change `CellToMeasure` to include a region tag:

```ts
interface CellToMeasure {
  cell: HTMLElement;
  sizeKey: number;
  region: "left" | "center" | "right";
}
```

Then `#autosizeCells` writes to `this.colsWidth[region].indices[sizeKey]`.

Update all places that push to `#cellsToMeasure`:
- Corner/left-fixture header cells (line ~1081): `region: "left"`, `sizeKey: hCol` (already zero-based within left)
- Column facet cells (line ~1181): `region: "center"`, `sizeKey: colIndex` (data-column-relative, zero-based)
- Right fixture header cells (line ~1113): `region: "right"`, `sizeKey: fi` (fixture-relative)
- Row facet track cells: `region: "left"`, `sizeKey: fixtures.left.length + level`

### Step 5: Update grid template generation

**File:** `packages/grid/src/renderer/standard-layout.ts`

In `getGridTemplate` (line ~825), the static strategy already iterates fixtures/facets/tracks separately — this works as-is.

The dynamic strategy (line ~849) uses `repeat(..., max-content)` — also works as-is since it's count-based. Override widths flow into rendering through `colSize` on track/facet defs → `placeCellInDom` applies `style.width` on cells → `max-content` resolves to the explicit cell width. The same mechanism will work for row facet tracks once `commit()` persists to `facetDefs.row[level].colSize`.

No changes needed to template generation itself.

### Step 6: Add resize handles to row facet header cells

**File:** `packages/grid/src/renderer/standard-layout.ts`

First, extract the resize handle creation from `buildAndPlaceFacetCell` (line ~415-417) into a shared helper:

```ts
protected appendResizeHandle(cell: HTMLElement): void {
  const handle = document.createElement("span");
  handle.className = "resize-handle";
  cell.appendChild(handle);
}
```

Update `buildAndPlaceFacetCell` to call `this.appendResizeHandle(cell)` instead of inline creation.

Then in the corner cell rendering loop (around lines 1040-1085), at the last column-facet level (`hRow === numColFacetLevels - 1`), each `hCol` is an individual cell for either a fixture or row facet header. Add a resize handle to row facet header cells:

```ts
if (hCol >= numLeftFixtures && hCol < numLeftVFixedTrack) {
  this.appendResizeHandle(cell);
  cell.dataset.cellActionResize = "1";
  cell.dataset.cellRegion = "left";
  cell.dataset.rowFacetLevel = String(hCol - numLeftFixtures);
}
```

Column facet cells (in `buildAndPlaceFacetCell`) similarly get tagged when `resizeHandle: true`:
```ts
cell.dataset.cellActionResize = "1";
cell.dataset.cellRegion = "center";
```

### Step 7: Extend `#setupResizeHandler()` in `index.ts`

**File:** `packages/grid/src/renderer/index.ts`

The current `mousedown` handler (line ~168) uses `getHeaderCell` to find `[data-cell-type='column-facet']`. Replace with a generic resize target lookup using the `data-cell-action-resize` / `data-cell-region` attributes:

```ts
const getResizeTarget = (target: EventTarget | null): HTMLElement | null => {
  if (!(target instanceof HTMLElement)) return null;
  return target.closest<HTMLElement>("[data-cell-action-resize='1']");
};
```

In `mousedown`, read the region from the target cell:
```ts
const cell = getResizeTarget(e.target);
if (!cell) return;
const region = cell.dataset.cellRegion as "left" | "center" | "right";
```

- If `region === "center"`: existing column facet logic (find leaf columns, distribute delta)
- If `region === "left"`: single track, direct resize. Read `rowFacetLevel` from dataset, call `this.#layout.changeRowFacetTrackWidth(level)`

### Step 8: Add `changeRowFacetTrackWidth`

**File:** `packages/grid/src/renderer/standard-layout.ts`

`changeLeafColWidth` (line ~1730) currently:
1. Finds cells via `#getLeafColCells` using `data-hix` and `data-cclix` selectors
2. Commits via `this.data!.setColSize(colIdx - numRowFacetLevels, ...)` and `this.colsWidth.override[colIdx]`

Create a parallel `changeRowFacetTrackWidth(level: number)` method:

```ts
changeRowFacetTrackWidth(level: number) {
  // Find all cells in this row facet track:
  // - The header/corner cell: [data-cell-region='left'][data-row-facet-level='${level}']
  // - Row facet data cells: [data-cell-type='row-facet'][data-row-facet-level='${level}']
  //   (for pivot: multiple levels exist; for grouped-row: single level)

  // Same byDelta/byAbsValue/commit/cancel pattern as changeLeafColWidth
  //
  // Important: row facet cells and corner cells use explicit `style.left` from
  // `fixedLeftVTrackPositions`, and data cells use `--offset-x` for transform.
  // During live drag, in addition to updating `style.width` on the resized track,
  // `byDelta` must also:
  //   1. Shift `style.left` on all left-region cells to the right of the resized
  //      track (subsequent row facet tracks, corner cells) by the width delta
  //   2. Update `--offset-x` on the grid container so data cell transform stays
  //      in sync with the new left-region total width
  //
  // On commit, `draw()` recalculates `fixedLeftVTrackPositions` and `offsetX`
  // from the persisted override, making everything authoritative again.

  // On commit:
  //   this.colsWidth.left.override[this.#fixtures.left.length + level] = finalWidth;
  //   this.data!.facetDefs.row[level].colSize = { strategy: "fixed-width", widthInPx: finalWidth };
}
```

Cell lookup for row facet tracks — new helper:
```ts
#getRowFacetTrackCells(level: number): { headerCell: HTMLElement | null; cells: HTMLElement[] } {
  const headerCell = this.#con.querySelector<HTMLElement>(
    `[data-cell-region='left'][data-row-facet-level='${level}']`
  );
  // For pivot: row facet cells at this specific level
  const dataCells = Array.from(this.#con.querySelectorAll<HTMLElement>(
    `[data-cell-type='row-facet'][data-row-facet-level='${level}']`
  ));
  return { headerCell, cells: headerCell ? [headerCell, ...dataCells] : dataCells };
}
```

### Step 9: Add `data-row-facet-level` to pivot row facet cells

**File:** `packages/grid/src/renderer/standard-layout.ts` — `renderRowFacets` (line ~1360)

Currently pivot row facet cells have `cell.dataset.cellType = "row-facet"` but no level indicator. Add:
```ts
cell.dataset.rowFacetLevel = String(merge.level);
```

This is needed for `#getRowFacetTrackCells` to select cells by level.

### Step 10: Handle grouped-row layout

**File:** `packages/grid/src/renderer/grouped-row-layout.ts`

The resize handle on the header cell is already handled by the corner cell loop in `StandardLayout` (Step 6) — no separate logic needed in `GroupedRowLayout`.

The only change: add `data-row-facet-level="0"` to row facet data cells in `GroupedRowLayout.renderRowFacets`, so `#getRowFacetTrackCells` can find them:
```ts
cell.dataset.rowFacetLevel = "0";
```

Special consideration: grouped-row facet cells use `left` positioning and `box-shadow` for indentation (line ~29, 48). When width changes, these values don't need updating — the CSS grid track width change flows through naturally. The `left` and `box-shadow` are relative to depth, not track width.

### Step 11: Persist row facet track width on commit

**File:** `packages/grid/src/renderer/standard-layout.ts`

In `changeRowFacetTrackWidth.commit()`:
```ts
commit: (): number => {
  const finalWidth = resizeState.currentWidth;
  this.colsWidth.left.override[this.#fixtures.left.length + level] = finalWidth;
  // Persist to facet def so it survives re-renders
  this.data!.facetDefs.row[level].colSize = { strategy: "fixed-width", widthInPx: finalWidth };
  cleanup();
  return finalWidth;
}
```

### Step 12: Update `changeLeafColWidth` for new `colsWidth` structure

**File:** `packages/grid/src/renderer/standard-layout.ts`

In the existing `changeLeafColWidth.commit()` (line ~1800):
```ts
// Before
this.colsWidth.override[colIdx] = finalWidth;

// After — colIdx here is still the global index from data-hix
// Convert to center-region index:
const centerIdx = colIdx - this.#fixtures.left.length - this.data!.numRowFacetLevels;
this.colsWidth.center.override[centerIdx] = finalWidth;
```

Similarly update `setColSize` call — it already subtracts `numRowFacetLevels`, so that part stays.

### Step 13: Double-click autofit for row facet tracks

**File:** `packages/grid/src/renderer/index.ts`

In the `dblclick` handler (line ~240), use the same `getResizeTarget` + region dispatch:
```ts
const cell = getResizeTarget(e.target);
if (!cell) return;
const region = cell.dataset.cellRegion as "left" | "center" | "right";

if (region === "left") {
  const level = parseInt(cell.dataset.rowFacetLevel!, 10);
  this.#layout.autofitRowFacetTrackWidth(level);
  this.draw();
} else if (region === "center") {
  // existing column autofit logic
}
```

Add `autofitRowFacetTrackWidth(level)` to `standard-layout.ts` — mirrors `autofitLeafColWidth`:
```ts
autofitRowFacetTrackWidth(level: number): void {
  const { headerCell, cells } = this.#getRowFacetTrackCells(level);
  if (!headerCell) return;
  for (const cell of [headerCell, ...cells]) {
    cell.style.width = "";
    cell.style.minWidth = "";
    cell.style.maxWidth = "";
  }
  const contentWidth = headerCell.getBoundingClientRect().width;
  const ctrl = this.changeRowFacetTrackWidth(level);
  ctrl.byAbsValue(contentWidth);
  ctrl.commit();
}
```

---

## Migration notes

- The `getColumnWidth(globalIndex)` shim allows incremental migration. Callers can be updated to use region-specific helpers one at a time.
- `data-hix` and `data-cclix` attributes on column facet / data cells remain unchanged — they still use the global index. The conversion to center-region index happens at the boundary (commit, width lookup).
- The `TODO[1]` comments in the codebase (about `rowFacetAdjustment`) can be cleaned up as part of this work since the region split eliminates the confusing offset.

## Files touched

| File | Changes |
|------|---------|
| `packages/grid/src/renderer/standard-layout.ts` | Restructure `colsWidth`, add region helpers, extract `appendResizeHandle`, add resize handles to row facet headers, add `changeRowFacetTrackWidth`, add `#getRowFacetTrackCells`, update `#autosizeCells`, update all `getColumnWidth` callers |
| `packages/grid/src/renderer/index.ts` | Extend `#setupResizeHandler` for row-facet-header targets, add dblclick handler |
| `packages/grid/src/renderer/grouped-row-layout.ts` | Add `data-row-facet-level="0"` to grouped-row facet cells |
| `packages/grid/src/renderer/types.ts` | Add `region` to `CellToMeasure` |

## Not in scope

- Left/right pinned column support (future — the `colsWidth` structure accommodates it)
- Fixture column resize (same pattern as row facet tracks but lower priority)
- Row height resize (horizontal direction — separate concern)
