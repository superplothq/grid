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
