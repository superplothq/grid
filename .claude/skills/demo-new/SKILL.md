---
name: demo-new
description: Create a grid demo from reference image(s) + a requirement. Intake images, list their aspects, take best guesses, ask clarifying questions (especially interactivity), brief the implementation, then build it viewmodel-only with light/dark theme counterparts that follow the page theme. Demos live inside packages/samples (self-contained, no mdx) and are viewable on an unlinked /grid/demos dev route. Use for "/demo-new" or when the user asks to recreate a grid/table from screenshots or a design.
---

# Create a new demo from reference images

A demo **faithfully recreates a reference grid (shown in one or more images) using
the grid's API**. Demos live **inside `packages/samples`** (same package, same
`SampleModule` mount contract) but are distinct from samples: self-contained data,
no mdx page, no `conversation.json`, and NOT in the docs sidebar/gallery. They are
destined for the web home page (a separate, future task); until then they are
listed on an **unlinked `/grid/demos` dev route** - a known URL for devs,
deliberately not wired into site nav.

## Where demos live

Demos reuse **`packages/samples`** - there is no separate package. They sit
alongside samples but carry none of the docs concerns:

```
packages/samples/src/
  types.ts            # DemoEntry { title, description, load } (load returns a SampleModule)
  demos-registry.ts   # export const demos: Record<string, DemoEntry>  (dynamic import())
  index.ts            # also exports { demos } and the DemoEntry type
  runtime/            # shared helpers (mount, theme) - the SAME ones samples use
  demos/
    <id>/
      demo.ts         # export function mount(el): () => void
      data.ts         # data generator (if it earns its own file)
      reference/      # the reference image(s), committed for provenance
```

Rules carried over from samples: kebab-case id = directory name = registry key;
never import from a sibling demo or sample (only `../../runtime`, `grid`, and own
files); deep-import `grid/dist/renderer`; grid-only dependency (no framework, no
DuckDB); TypeScript strict, ESM. The mount contract is `mount(el) => cleanup` -
demos generate their own data, so the `SampleContext` arg is unused: declare
`mount(el)` with one param (a one-arg function still satisfies `SampleModule`). Do
NOT add a demo to `src/samples/index.mdx` (the gallery) or give it a
`conversation.json`.

**Web listing (plain routes under `/grid/demos`, no fumadocs):**

- `packages/web/app/grid/demos/page.tsx` - lists all demos from the `demos`
  registry (title + description, each linking to `/grid/demos/<id>`).
- `packages/web/app/grid/demos/[id]/page.tsx` - renders one demo; uses Next 16
  typed route props (`PageProps<'/grid/demos/[id]'>`, `await props.params`) and
  `generateStaticParams` from the registry keys (required by the static export).
- `packages/web/components/demos/demo-host.tsx` - `'use client'`; dynamic-imports
  `demos[id].load()` and runs `mount` in an effect with strict-mode-safe cleanup,
  and imports `grid/dist/grid.css`. Mirror `components/docs/sample-demo.tsx`.
- `samples` is already in `transpilePackages`, so there is **no `next.config.mjs`
  change**.
- `/grid/demos` is a **known, unlinked dev route** - do NOT wire it into site
  nav/hero/footer or `lib/site-config.ts`. The marketing `/grid/#demos` showcase
  is a separate thing; leave it intact.

**Bootstrap:** if `demos-registry.ts` / the `DemoEntry` type / the `/grid/demos`
route do not exist yet, create them as part of the first demo: add `DemoEntry` to
`src/types.ts`, create `src/demos-registry.ts`, export `demos` + `DemoEntry` from
`src/index.ts`, and add the three web files above. Reuse samples' existing
`runtime/theme.ts` and `runtime/mount.ts` (do not copy them). On later invocations
just add the demo directory + a `demos-registry.ts` entry.

## Hard rules (apply throughout)

1. **No DataSource / DataModel.** Never use `DuckDBWasmDataSource`,
   `SqlPivotDataModel`, `SqlFlatTableDataModel`, etc. unless the user explicitly
   asks. The pipeline for demos is: **generate data -> build viewmodel params ->
   construct ONE viewmodel -> `grid.data = vm; grid.draw()`**, then push every later
   change back through `vm.updateData(params)` (see rule 5), never a fresh instance.
2. **Classify the table shape first** and initialize the matching viewmodel:
   - **Flat table** (plain rows, one header row): `new Grid({}, el, "flat")` +
     `FlattenedDataViewModel` with one row per record (all depth 0, all leaves).
   - **Grouped table** (rows nested under expandable/collapsible group headers,
     still one flat column band): `new Grid({}, el, "flat")` +
     `FlattenedDataViewModel` with packed row metadata (depth / leaf / expanded
     bits) - see `createRowMeta` from `grid/dist/renderer` and
     `rowsToGroupedFlatParams` in `packages/samples/src/runtime/shaping.ts` as a
     reference implementation.
   - **Pivot table** (row facets on the left AND multi-level column facets on
     top, aggregated cells at intersections): `new Grid({}, el, "pivot")` +
     `PivotDataViewModel` - see `rowsToPivotParams` in samples' `shaping.ts`.

   If the images are ambiguous (e.g. grouped vs pivot), make it a clarifying
   question with your best guess - do not silently guess.
3. **Every custom theme ships as a light + dark pair** and the grid must switch
   automatically with the page theme. See [Theming](#theming).
4. **Sample data must look real.** See [Data](#data).
5. **One persistent viewmodel; interaction state in `metaState`.** Construct the
   viewmodel once and keep it. On a data change (sort, page, filter,
   expand/collapse) recompute params and call `vm.updateData(params)` then
   `grid.data = vm; grid.draw()` - do NOT build a new viewmodel per change (the
   viewmodel is long-lived, and `updateData` is the pattern used across the
   codebase - `frameworks/.../Sort.tsx`, `Filter.tsx`, `useFlatGrid`). Interaction /
   UI state (selection, per-row verdicts/toggles, contacted, expanded set) lives in
   `vm.metaState` - a namespaced KV store (`set(ns,key,val)`/`get(ns)`/`clear`) that
   **persists across `updateData`** - keyed by a **stable row id, never a row
   index** (indices shuffle on sort/paginate). Renderers read it back via
   `dataCtx.viewModel.metaState.get(ns)?.[id]`. Do NOT confuse `metaState`
   (free-form KV, keyable by id) with `viewModel.metadata` (position-indexed,
   for data-derived facts like per-column min/max). A redraw that doesn't change
   the row set (selection/toggle) is just `grid.draw()` - it re-renders content.
6. **Anything pinned that isn't a data column is a fixture, not a column.**
   Selection-checkbox gutters and row action buttons (and row-number gutters,
   freeze panes, total rows) are grid-managed UI, not data - render them with a
   left/right `PVerticalFixture` (or top/bottom horizontal) registered via
   `GridConfig.fixtures`, so they stay **pinned** while data columns scroll under
   them. Do NOT model them as ordinary value columns (they would scroll away). See
   [Grid API gotchas](#gotchas).

## Step 1: intake

The user provides **one or more reference images** and a **demo requirement**
(what the demo should show). Multiple images are usually panned screenshots of
one grid too large for a single capture - reconstruct the full grid from them:
use overlapping rows/columns to stitch the pieces, and treat the union as the
single reference. If images or the requirement are missing, ask before anything
else. If there is no image at all (purely described demo), run the same process
on the description.

Also confirm the **demo id** (kebab-case) and a one-line **title/description**
for the listing page.

## Step 2: list every aspect of the reference

Read all images carefully and produce a numbered **aspect inventory** - the
complete list of things the reference shows across every image. This list is the
demo's living checklist: every later decision, question, and iteration is
tracked against it. The categories below are examples, not an exhaustive set -
capture whatever the reference actually shows, and if it has something outside
these, add it as its own aspect rather than dropping or forcing it. Cover at
least:

- **Shape**: flat / grouped / pivot (per hard rule 2), row + column counts
  visible across all images, frozen/facet regions.
- **Columns**: names, order, data types, alignment, widths (proportions), any
  header affixes/icons.
- **Grouping/faceting**: group keys, nesting depth, subtotal/total rows,
  expand/collapse affordances visible.
- **Fixtures**: grid-managed tracks that share the grid's layout and lifecycle
  (unlike surrounding chrome) - horizontal (top/bottom) or vertical (left/right,
  which can sit between the column facets and data cells), pinned or scroll-synced
  per implementation, holding anything (row-number gutters, freeze panes,
  aggregation/status bands are common cases). See the fixtures doc +
  `packages/grid/src/renderer/fixture-proto.ts`.
- **Formatting**: number/currency/percent/date formats, locale hints.
- **Visual encodings**: colors used for emphasis (thresholds, heat bars, badges,
  pills, sparklines), zebra striping, borders, density (padding), typography.
- **Components around the grid**: pagination controls, toolbars, menus, search
  boxes, filter chips, legends, titles - anything outside the grid surface that
  the demo must also recreate.
- **Custom renderers**: cells that the default renderer cannot produce - custom
  column-header cells (sorting/searching icons, menus), custom row-facet cells,
  custom data-cell renderers (badges, bars, avatars, links).
- **Theme**: are the images light or dark? What accent palette do they use?
- **Implied interactions**: anything that *hints* at interactivity (sort arrows,
  chevrons, checkboxes, resize handles, selection highlight, pagination) - these
  become questions in step 3, never assumptions.

Show this inventory to the user as part of the next step.

## Step 3: clarifying questions (before any code)

For everything the images and requirement cannot answer, first **take a best
guess by looking at the images** (what would a designer most likely intend?),
then ask with the AskUserQuestion tool, presenting your best guess as the
recommended option so the user can just confirm. Always cover:

1. **Interactivity** - the images cannot show interaction, so explicitly
   double-check it. Walk the implied-interaction items from the inventory and
   ask which should actually work: sorting, expand/collapse, row/column/cell
   selection, column resize, hover effects, pagination, search, menus. State
   your best guess for each and what you'd build.
2. **Ambiguous shape or encodings** - grouped vs pivot, what a color means, what
   an unclear column contains - each with your best guess.
3. **Data domain** - confirm the business domain for generated data if not
   obvious from the images.

Do not start implementing until these are answered.

## Step 4: implementation brief

Before writing code, post a short brief mapping each inventory aspect to how it
will be implemented - functional/conceptual level, not code. For each aspect
name the grid mechanism, e.g.:

- shape -> which viewmodel + layout ("grouped table -> flat layout,
  `FlattenedDataViewModel` with rowMeta depth bits" - construct it **once** and
  update it in place via `updateData()` on every change, never a fresh instance;
  hard rule 5),
- currency column -> column formatter,
- red/green threshold -> cell renderer / metadata visual,
- sort icon in header -> custom column-header renderer + click handler (identify
  the column by its stable key, not slice index - see gotchas),
- selection checkbox / row action button -> a **pinned fixture** (`PVerticalFixture`),
  NOT a value column (hard rule 6); its per-row state lives in `metaState` by id,
- pagination bar -> demo-owned chrome component below the grid mount; page change ->
  `updateData()` with the new page slice,
- row-number gutter / freeze pane / persistent total row -> a fixture registered
  via `GridConfig.fixtures` (grid owns its lifecycle),
- dark navy header -> custom theme pair (see below),
- expand/collapse -> row click handler that recomputes params and calls
  `vm.updateData(...)` with flipped expanded bits; the expanded/selected state lives
  in `vm.metaState` keyed by id (persists across updateData).

Find the concrete APIs by reading reference implementations, in this order:
1. existing demos in `packages/samples/src/demos/` and samples in
   `packages/samples/src/samples/` (closest patterns: formatters, cell
   renderers, heat bars, selection, resize, grouping),
2. `packages/grid/src/renderer/` source (`types.ts` for `Theme` and cell/column
   types, `grid-config.ts`, viewmodel classes),
3. `docs/pivot-data-pipeline.md` / `docs/flat-table-pipeline.md`,
4. `packages/playground/src/` for interaction wiring ideas (but never copy its
   DataSource usage into a demo).

Get the user's go-ahead and then implement.

## Step 5: implement

Write `demo.ts` top-down: grid construction + data load first, helpers under a
`/* ===== utils ===== */` separator. The demo owns its chrome: `mount` lays out
its own UI (surrounding components from the inventory, a fixed-height scrollable
grid mount with its own border/radius). Cleanup must be real (remove mounts,
disconnect observers, cancel pending work) - web dev runs React strict mode and
will double-mount. Register the demo in `demos-registry.ts`.

### Theming {#theming}

- If the reference matches the built-in look, sync the built-in themes: apply
  the page's current theme and re-apply on switch (the `syncGridTheme` pattern
  in `packages/samples/src/runtime/theme.ts`, shared with samples:
  resolve `"light" | "dark"` from `html[data-theme]` falling back to
  `prefers-color-scheme`, push the theme's tokens onto
  `grid.trackSurfaceContainer` as CSS custom properties, re-apply via a
  MutationObserver on `data-theme` + a media-query listener).
- If the reference needs its own palette, create a **theme pair**: complete
  `Theme` objects (shape in `packages/grid/src/renderer/types.ts`, examples in
  `themes.ts`) for **both** light and dark, even if the images show only one
  mode. Derive the missing counterpart sensibly (keep the accent hue, invert the
  neutrals, keep contrast ratios comparable to the built-in pair). Register both
  (`registerTheme("<id>-light", ...)`, `registerTheme("<id>-dark", ...)`) and
  sync page theme -> your counterpart with the same observer pattern. If a
  second demo needs this, hoist `syncCustomGridTheme(grid, lightName, darkName)`
  into `runtime/theme.ts`.
- Demo chrome outside the grid (toolbars, pagination, legends, menus) must also
  be theme-adaptive: derive colors from `currentColor` / the applied theme
  tokens - never hardcode one mode's colors.
- **Verify both modes** before calling it done (step 6).

### Data {#data}

- Generate **realistic-looking data** that matches the reference's domain: real
  product/city/person-style names, plausible magnitudes, correlated values
  (revenue > cost, dates in sensible ranges), the same order of magnitude as the
  numbers visible in the images. No `foo`/`Item 1`/lorem placeholders.
- Generate in the demo with a deterministic generator (seeded or table-driven)
  so the demo renders identically on every load and the visible rows can be made
  to *match the reference's rows* where practical.
- Enough rows to demonstrate scrolling/virtualization/pagination if the demo
  needs it.

### Interactivity

Implement exactly the interactions confirmed in step 3. Hold **one** viewmodel for
the demo's life. For data changes (sort, filter, page, expand/collapse) recompute
params and call `vm.updateData(params); grid.data = vm; grid.draw()` - do not
construct a new viewmodel (hard rule 5). Per-row interaction state (selection,
verdicts, toggles, expanded) lives in `vm.metaState` keyed by a **stable row id** so
it survives sort and pagination; renderers read it back. View-level state (current
page, sort, pageSize) can stay in demo variables. State that doesn't change the row
set (a selection/toggle) only needs `grid.draw()` (full content re-render), not
`updateData`.

### Grid API gotchas {#gotchas}

Verified pitfalls - hitting these produces silent wrong behavior, so check them:

- **Horizontal scroll & column sizing.** Never use `colSize` strategy `"static"`:
  the moment ANY column (or fixture) is static, the layout switches to
  fit-to-container mode and horizontal scroll is gone. To scroll a wide table, size
  columns with `"max-cell"` (content width) and `"clamped-width"` with
  `minWidthInPx === maxWidthInPx` to pin a fixed width while keeping the scrolling
  code path. Mixing those two is fine; `static` is the trap.
- **Custom header renderer keys by facet value, not index.** A single shared header
  `trackRenderer` serves every column. Identify each column by the stable key you
  put in `columnFacets` (e.g. `columns.map(c => c.key)`), looked up per call - NOT
  by `dataCtx.index`, which is slice-relative and desyncs headers from data under
  horizontal virtualization. Guard the empty facet-header cell (value `""` -> return
  early).
- **Header alignment is centered by default and hard to override.** `.col-facet`
  cells center their content, and a `justify-content` on a shrink-wrapped header
  node does nothing. To truly left/right-align a header, make the node `width:100%`.
  Don't add an `align` field that only feeds an inert style - verify alignment in
  the DOM, not by eye.
- **Sticky fixtures need opaque backgrounds.** Any cell a pinned fixture can overlap
  - and the fixture's own cells - must use **opaque** backgrounds. Mix row tints
  (hover/selected) against the surface token
  (`color-mix(in srgb, <accent> N%, var(--value-background-color))`), never against
  `transparent`, or the columns scrolling under the pinned fixture bleed through.
- **Fixture column width comes from the measured header cell**, not `colSize`
  (ignored for non-static fixtures). To pin a fixture's width, set `min/max` width on
  its header cell (via `ctx.cell` in `headerCell`) and on its per-row cells.
- **A `PVerticalFixture` is instantiated by the grid** with a fixed `(config, con,
  cellManager)` signature. Define the fixture class **inside `mount`** so it closes
  over the demo's state (selection, current page rows, handlers); place per-row cells
  at `gridRow = numColFacetLevels + j + 1`, set `data-croix` so hover/selection still
  match, and read `metaState`/`currentRows` by id.

## Step 6: verify

- `bun --filter samples types:check` must pass.
- View the demo at `/grid/demos/<id>` (Next 16 allows one dev server per project - if
  the dev server is busy, use `bun --filter web build` +
  `node packages/web/serve-out.mjs`; do not start a second dev server).
- Compare against the reference images aspect-by-aspect using the step 2
  inventory; note deliberate deviations.
- Toggle the page theme and confirm the grid (and demo chrome) switches between
  the light and dark counterparts.
- Exercise every confirmed interaction once.

## Step 7: iterate on further requirements

The user will refine the demo after seeing it. For each follow-up:

1. Restate the change **with respect to the original demo**: which inventory
   aspects it adds, changes, or removes. Append new aspects to the inventory.
2. Check for conflicts with previously confirmed aspects or interactions; if a
   change would regress one, say so and ask which wins.
3. Apply the change, keeping the theme-pair rule (a new color/visual gets both
   light and dark treatments) and the data-realism rule. When **removing** a column
   or feature, sweep the whole chain - the `Row` field, its line in the generator,
   and any now-unused helper/pill/renderer - not just the column entry; leave no
   dead field behind. When **reordering/moving** a column, move its whole def; don't
   duplicate.
4. Re-run step 6 verification for what changed, in both themes.
