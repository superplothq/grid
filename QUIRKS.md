# Quirks

A running list of non-obvious behaviours in this codebase - the kind that cost
real debugging time once and shouldn't cost it again. When you lose an hour to a
surprising interaction, add an entry here: symptom first (so it's greppable from
what you'd actually see), then cause, then the fix.

---

## Custom cell renderers must not set `style.cssText` on `ctx.container`

**Symptom.** A grid using a custom cell `renderer` (a `VTrackDef.renderer`, e.g. a
bar or a right-aligned number) renders scrambled on the **first paint** - values
land in the wrong columns, some borders/gridlines are missing, cells look tiled
row-major. Scrolling even a little **fixes it**, and it stays fixed.

**Cause.** The layout positions every cell by writing `grid-column` / `grid-row`
(i.e. `grid-area`) **inline** on the cell element in `placeCellInDom`
(`packages/grid/src/renderer/mixins.ts`). It then hands that *same element* to the
renderer as `ctx.container`. A renderer that does:

```ts
ctx.container.style.cssText = "display:flex;...";   // ❌ replaces ALL inline style
```

wipes the `grid-area` the layout just set. With no explicit grid placement, CSS
grid auto-flows the cell, so the custom cells cascade into wrong positions.

Why only the first paint, and why scrolling heals it:

- **First render** runs with `hintContentDirty` undefined, so `contentDirty` is
  `true` for every cell - the renderer runs on all of them and wipes `grid-area`.
- **On scroll**, reused cells (same key) have `contentDirty === false`, so the
  renderer does **not** re-run, but `placeCellInDom` still runs and re-applies
  `grid-area`. Positions snap back.

This is also why plain text columns never show the bug: the built-in
`textRenderer` sets `ctx.container.style.display = ...` property-by-property and
never touches `cssText`.

**Fix.** In custom renderers, set container styles one property at a time (or with
`Object.assign(ctx.container.style, {...})`) - never assign `cssText` on
`ctx.container`. Creating *new* child elements and setting *their* `cssText` is
fine; the rule is only about the cell element the grid owns.

```ts
const style = ctx.container.style;
style.display = "flex";
style.justifyContent = "flex-end";
style.padding = "...";
```

Seen in: `packages/samples/src/samples/column-properties/cell-renderer.ts`.

---

## `selectAll(...).prop(...)` only reaches data cells through a cell predicate

**Symptom.** You apply a `valueFormatter` (or `cellRenderer`) via the select-all
API on a facet match and expect the data cells under that facet to pick it up:

```ts
grid.selectAll((_dim, value) => value === "Pay").prop({ valueFormatter });   // ❌ no effect on data cells
```

The data cells render unchanged (raw, unformatted). Styling the *header* via the
same facet selection works, so it looks like the rule "took" - but the values
below never format. Adding a second empty cell selection
(`.selectAllCell(() => true).prop({})`) doesn't help either.

**Cause.** A select-all rule carries a list of predicates. `evaluateRulesForDataCell`
(`packages/grid/src/renderer/select-all/evaluate.ts`) **skips any rule that has no
cell predicate**:

```ts
if (cellPreds.length === 0) continue;   // facet-only rules never touch data cells
```

Facet-only rules are meant for facet (header) cells - `evaluateRulesForFacetCell`
handles those and only reads `trackRenderer` / style, never `valueFormatter`. So a
`valueFormatter`/`cellRenderer` prop only reaches data cells when the rule the prop
is attached to also carries a cell predicate. Splitting them across two rules
(formatter on the facet rule, cell predicate on a different empty rule) fails
because each rule is evaluated independently.

**Fix.** Attach the prop to the selection that includes the cell predicate - i.e.
put `.prop({...})` after `.selectAllCell(...)`, not after the facet `selectAll(...)`:

```ts
grid
  .selectAll((_dim, value) => value === "Pay")   // match the facet
  .selectAllCell(() => true)                     // extend onto its data cells
  .prop({ valueFormatter });                     // ✅ formatter now applies
```

The `.selectAllCell(() => true)` is not boilerplate - it is what makes the rule
reach the data cells. (A static `FacetDef.valueFormatter` does apply facet-wide
with no cell predicate, but the dynamic select-all path deliberately does not.)

Seen in: `packages/samples/src/samples/column-formatter/dynamic-locale.ts`.
