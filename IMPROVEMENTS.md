claude --resume e0020c1e-c117-49cd-9aa3-f43c8a9b2804

❯ what are the things for which core is supposed to provide api but didn't that made code more lengthy / difficult
1 skill available

Good question — this is the real API-gap list, drawn from where I actually wrote lengthy workarounds. Ordered by how much pain each caused.

High impact — these genuinely bloated the code

1. No concrete "column fixture" helper. To get a pinned checkbox gutter and a pinned action button, I hand-wrote two full PVerticalFixture subclasses that reimplement the grid's internal row-placement conventions: gridRow = numColFacetLevels + j + 1, sticky offset, placeCellInDom pooling, data-croix tagging, first/last edge classes, width via header measurement. The core ships only the abstract PFixture/PVerticalFixture — zero concrete implementations. A ColumnFixture({ side, width, header: fn, cell: (row,i)=>… }) would have turned ~60 lines of internals-mirroring per fixture into ~5. This was the single biggest source of length.

2. Selection model doesn't fit real selection. There is grid.selectRowByDataIndex / selectCellByDataIndex / SelectionRuleStore / selectAll(predicate) — but it's keyed by row index and paints a fixed blue .selection-overlay. For "checkbox selection, styled my way, keyed by a stable id, surviving sort/pagination," none of it applies. I rebuilt selection from scratch: a metaState namespace, isSelected/setSelected/selectedCount/toggleRow/setAllOnPage, the checkbox fixture, select-all with indeterminate, and the row wash. A selection model keyed by row id with a caller-supplied cell renderer + change events would have deleted most of that.

3. Fixture width ignores colSize. PVerticalFixture has a colSize setter, but for non-static fixtures the layout derives width only from the measured header cell — colSize is silently ignored. So to pin the action column to 64px I set min/max width on the header cell and the per-row cells by hand. An API that just honors colSize on a fixture (like it does on columns) would remove that.

4. static colSize disables horizontal scroll; there's no "fixed width + scroll". The moment any column is static, the whole grid goes fit-to-container and horizontal scroll dies. To get fixed-width columns that still scroll, I had to abuse clamped-width with min===max. The naming is a trap and the capability ("this column is exactly N px, content beyond the viewport scrolls") has no honest API.

Medium — repeated boilerplate a hook would kill

5. Renderers get a cell value, not the row. ValueCellDataContext is { viewModel, rowIndex, colIndex, rawValue } — no row object. Rich cells (avatar+name+company from several fields) forced me to shove the entire Row into every column's data array (data: columns.map(() => rows)) so each renderer could read sibling fields. A row-aware render hook (or passing the row) would remove that hack.

6. No row-level style / background hook. To wash selected rows I set background in every column renderer via base() and in both fixtures. There's no rowStyle(rowIndex) / row decorator, so per-row visual state is re-applied cell-by-cell everywhere.

7. No hover API. No built-in row hover state, event, or CSS hook. I built delegated pointermove → toggle a class over [data-croix] cells + an injected stylesheet using !important (needed only because cell backgrounds are inline). All of that would be one flag/event in core.

8. No per-column alignment — data or header. VTrackDef has valueFormatter but no align; custom cells inherit .custom-rendered { justify-content:center }, so I reset alignment in every renderer. And headers can't be aligned at all (.col-facet centers content; my align field was inert) — that's the dead-code you caught. A align/headerAlign per column that the layout actually applies is the obvious missing knob.

9. The shared header renderer has no stable column identity. The header trackRenderer receives dataCtx.index, which is slice-relative under horizontal virtualization. I had to smuggle a stable key through columnFacets and look it up. A stable column key/id in the header context is the natural API.

Defensible for a headless core, but a helper would still help

10. No sort / pagination / loading primitives. I own the sort comparator + updateData, the whole pager (page math, slicing, buttons), and the loading overlay (wrapper, spinner, token guard). A headless core legitimately punts these — but even a documented pagination/loading convention (or wiring the existing viewDataEmpty lazy-load event to a page fetch) would cut boilerplate.

11. metaState is raw and untyped. It's a bare Map<string, Record<string,any>>. I wrote typed isSelected/setSelected/toggle… wrappers per namespace by hand. Typed, id-keyed selection/toggle helpers on top of it would help. (And metadata — the structured sibling — is position-indexed, so it's useless for id-scoped state, which is why everything went into metaState.)

12. Theme tokens are scoped to the grid-content element only. syncGridTheme sets --value-background-color etc. on grid.trackSurfaceContainer, so demo chrome outside the grid (my loader overlay; would also affect toolbars/footers) can't    read the surface color. I had to frost the loader with currentColor + backdrop-filter instead. Exposing  applying them to a wrapper) would let surrounding chrome match exactly.
                                                                                                                                                                                                                                               ---
If I had to name the two that would most improve the next demo: (1) a concrete column-fixture helper and (2) an id-keyed selection model with a custom renderer — those two alone accounted for the bulk of the hand-written plumbing. Want me to write these up as issues (with the specific proposed API signatures), or fold a short "core API gaps

✻ Churned for 1m 32s

❯ can you explain 1? do you mean for dom placement or for interactivity?

Good clarification to pin down: #1 is about DOM placement/rendering mechanics, not interactivity. The inogonal part.

Here's the split.

What the fixture forced me to hand-write (placement)

A normal column is trivial: I hand the grid a renderer(value, dataCtx, ctx) and it does all the placemene visible, pools/recycles the cell DOM, positions each cell in the right grid track, handles verticalvirtualization. I never touch any of that.

A fixture has no such convenience. getCellsToRender drops me down to the raw placement layer, so I re-implement the same machinery the grid already does internally for value columns. That's the bulk of SelectFixture/ContactFixture:

getCellsToRender(viewModel, fixtureViewModel, sliceData) {
  const nodesToAppend = [];
  const numColFacetLevels = this.data.numColFacetLevels;
  const { offset, track, suggestedCls } = fixtureViewModel;
  const n = sliceData.sliceNumRows;
  for (let j = 0; j < n; j++) {
    const row = currentRows[viewModel.y0 + j];          // map visible slice → data row
    if (!row) continue;
    const absoluteRowIndex = numColFacetLevels + viewModel.y0 + j;
    const key = `select-${absoluteRowIndex}`;           // stable pooling key across scroll
    const edge = `${j === n-1 ? "last":""} ${j === 0 ? "first":""}`;
    const [cell, needAppend, contentDirty] = this.placeCellInDom({
      key,
      gridRow: numColFacetLevels + j + 1,               // grid-track math
      gridCol: track,
      cls: `data custom-rendered ${suggestedCls.join(" ")} ${edge}`,
      extraStyles: { left: offset },                    // sticky pinning
    });
    if (contentDirty) {
      cell.style.background = isSelected(row.id) ? ROW_SELECTED_BG : SURFACE;
      cell.replaceChildren(checkbox(...));              // ← the ONLY line I actually care about
      cell.dataset.cellType = "value";
      cell.dataset.croix = String(absoluteRowIndex);    // so hover/selection still match
    }
    needAppend && nodesToAppend.push(cell);
  }
  return { nodesToAppend };
}

Everything except the one replaceChildren(checkbox(...)) line is placement plumbing: the visible-row loo/gridCol track math, placeCellInDom pooling with stable keys, the sticky left offset, data-croix, edgeclasses, the content-dirty guard. It mirrors the grid's own renderDataCells. It's easy to get subtly wrong (pooling keys, virtualization, the numColFacetLevels offset), and I had to reverse-engineer those conventions from the source.

The interactivity is trivial and separate

The checkbox behavior — change → toggleRow(id) → metaState → grid.draw() — is a few lines and lives inside the content I render. I'd write that identically no matter what. The core doesn't need to provide it (and #2, the selection model,
is the interactivity gap — that's a different item).

So the missing API is a placement convenience

A "column fixture" helper that owns all the placement and virtualization, leaving me to supply only the

const selectFixture = columnFixture({
  side: "left",
  width: 46,
  header: (ctx) => selectAllCheckbox(...),      // I return DOM
  cell:   (row, rowIndex) => rowCheckbox(row),  // I return DOM; it wires data-croix, pooling, pinning
});
new Grid({ fixtures: { left: [selectFixture] } }, mount, "flat");

That makes authoring a pinned column as easy as a normal column renderer — which today it very much is nnto the right pinned, pooled, virtualized track"; interactivity I still write myself either way.

So: DOM placement. The gap is that fixtures expose the low-level render loop instead of the same high-let that ordinary columns enjoy.

✻ Brewed for 1m 26
