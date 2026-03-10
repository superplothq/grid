# Fixtures — Dynamic Content Areas on Grid

## What We're Building

Fixtures are peripheral UI elements that can be placed on any of the four sides of the grid (top, bottom, left, right). They allow rendering dynamic content alongside the grid data area — e.g. summary rows, toolbars, row indicators, etc.

A fixture is defined by extending `PFixture` (or its typed subclasses `PVerticalFixture` / `PHorizontalFixture`), and is registered via `GridConfig.fixtures` as constructor classes. The layout instantiates them, computes their viewmodels, and incorporates their dimensions into the grid template and viewport calculations.

### Grid template with fixtures

```
         left fixtures + row facets     data cols     right fixtures
        ┌──────────────────────────┬───────────────┬───────────────┐
 header │       header cells       │  col          │               │
        │                          │  facets       │               │
        ├──────────────────────────┼───────────────┼───────────────┤
 top    │                          │               │               │
fixtures│                          │               │               │
        ├──────────────────────────┼───────────────┼───────────────┤
 data   │  left fix  │  row        │  data         │               │
 rows   │  tures     │  facets     │  cells        │               │
        ├──────────────────────────┼───────────────┼───────────────┤
 bottom │                          │               │               │
fixtures│                          │               │               │
        └──────────────────────────┴───────────────┴───────────────┘
```

Header cells span across left fixtures + row facets. Top fixtures sit below the header row.

### Key design decisions

- Fixture dimensions (width/height) **reduce the viewport** available for the data area — they are not overlays
- Fixture viewmodels are **computed during layout calculation** — top/bottom in `calculateVerticalViewModel`, left/right in `calculateHorizontalViewModel`
- Sizes come from `viewModel()` return values — layout trusts the fixture's declared dimensions
- Grid template tracks for fixtures use `max-content`
- Per-fixture viewmodel is stored alongside the instance as `{ inst, vm }` pairs in `LayoutFixtures`
- `vm` is initially empty (data not available at construction time) and populated during viewmodel calculation

## Files Changed

### `packages/grid/src/renderer/fixture-proto.ts`
- Defines the abstract fixture protocol: `PFixture`, `PVerticalFixture`, `PHorizontalFixture`
- Viewmodel interfaces: `BaseFixtureViewModel`, `BaseVFixtureViewModel` (has `width`), `BaseHFixtureViewModel` (has `height`)
- `getCellsToRender(viewModel, fixtureViewModel, sliceData)` — receives both the layout viewmodel and the fixture's own viewmodel

### `packages/grid/src/renderer/types.ts`
- Added `PFixtureCls` constructor type and `LayoutFixtureClasses` interface (arrays of constructor classes per side)

### `packages/grid/src/renderer/grid-config.ts`
- `GridConfig.fixtures` uses `LayoutFixtureClasses` — user provides fixture constructor classes

### `packages/grid/src/renderer/standard-layout.ts`

**Types:**
- `LayoutFixtures` — stores `{ inst, vm }` pairs per side with proper typing (e.g. left/right use `PVerticalFixture` + `BaseVFixtureViewModel`)
- `ViewModel.fixtures` — exposes computed fixtures to the render pass

**Initialization:**
- `#validateFixtures()` — instantiates fixture classes, validates correct type per side (left/right must be `PVerticalFixture`, top/bottom must be `PHorizontalFixture`), stores with empty `vm`
- `setData()` — propagates data to all fixture instances via `inst.setData(data)`

**Viewport calculation:**
- `calculateVerticalViewModel()` — calls `viewModel()` on top/bottom fixtures, subtracts their heights from `visibleDataHeight`, adds to `totalHeight`
- `calculateHorizontalViewModel()` — calls `viewModel()` on left/right fixtures, subtracts their widths from `visibleDataWidth`, adds to `totalWidth`
- `calculateViewModel()` — passes `this.#fixtures` (now populated with viewmodels) into the returned `ViewModel`

**Grid template:**
- `getGridTemplate()` — adds `max-content` tracks for fixture columns (before row facets / after data cols) and fixture rows (before col facets / after data rows)

**Rendering:**
- All `gridRow` / `gridCol` placements offset by `fixtures.top.length` / `fixtures.left.length` (corner cells, column facets, row facets, data cells, selections)
- After data cells and selections, iterates all fixtures and calls `getCellsToRender(viewModel, vm, sliceData)`, appending their nodes and measurement cells
