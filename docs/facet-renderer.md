# Custom Facet Renderers

Facet cells (row and column track cells) and facet header cells (corner cells) default to plain text. The `FacetCellRenderer` and `FacetHeaderRenderer` APIs let you customize what renders inside these cells — add icons, badges, structured layouts, or any custom DOM.

## What it enables

- Custom markup in row and column facet track cells
- Custom markup in corner header cells (e.g., sort icons, filter buttons)
- Structured cell layout with left/content/right slots
- Different renderers per facet level (not just per axis)
- Access to the full facet path so renderers can vary by hierarchy depth or ancestry

## API

### Types

```ts
// Track cell renderer — renders facet values along the axis
type FacetCellRenderer<T = string> = (
  data: T,
  dataCtx: FacetDataContext,
  ctx: FacetRendererContext
) => FacetCellContent | El;

// Header cell renderer — renders corner header labels
type FacetHeaderRenderer = (
  text: string,
  ctx: FacetHeaderContext
) => FacetCellContent | El;

// Context about the facet track cell being rendered
interface FacetDataContext {
  viewModel: GridDataViewModel; // the current view model instance
  path: (string | null)[];  // full facet path from root to deepest level for this item
  level: number;            // which facet level this cell belongs to
  index: number;            // position index within the visible slice
}

// Context about the header cell being rendered
interface FacetHeaderContext {
  viewModel: GridDataViewModel;
  axis: "row" | "col";
  level: number;
}

// Renderer context with actions
interface FacetRendererContext {
  render: (viewModel: GridDataViewModel) => void; // trigger a full re-render with the given view model
}

// Return a simple value (string, HTMLElement, or HTMLElement[])
// or a structured object with slots:
interface FacetCellContent {
  left?: El;      // optional left slot (e.g., icon)
  content: El;    // main content
  right?: El;     // optional right slot (e.g., action button)
}

type El = HTMLElement | HTMLElement[] | string;
```

### Usage

Renderers are configured per facet level via `facetDefs` in `GridDataViewModelOptions`:

```ts
const viewModel = new GridDataViewModel(data, columnFacets, rowFacets, {
  facetDefs: {
    row: [
      { text: "region", trackRenderer: myRowRenderer },
      { text: "country", trackRenderer: myRowRenderer },
    ],
    col: [
      { text: "department", trackRenderer: myColRenderer, headerRenderer: myHeaderRenderer },
    ],
    axis: "col",
  },
});
```

Each entry in the `row`/`col` arrays is a `Partial<FacetDef>` — all fields are optional. The view model fills defaults: `text` → `""`, `trackRenderer` → `defaultFacetRenderer`, `headerRenderer` → `defaultFacetHeaderRenderer`. The arrays are auto-sized to match the data dimensions, so omitted entries get full defaults.

### Examples

**Simple string return** (equivalent to default behavior):

```ts
const renderer: FacetCellRenderer = (data) => {
  return data == null ? "" : String(data);
};
```

**Adding an icon based on hierarchy level**:

```ts
const renderer: FacetCellRenderer = (data, ctx) => {
  const icon = document.createElement("span");
  icon.textContent = ctx.level === 0 ? "📁" : "📄";

  return {
    left: icon,
    content: String(data),
  };
};
```

**Using the full path for contextual rendering**:

```ts
const renderer: FacetCellRenderer = (data, ctx) => {
  // ctx.path gives the full hierarchy: e.g., ["Electronics", "Laptops", "Gaming"]
  // ctx.level tells you which level this cell is at
  // ctx.path[ctx.level] === data
  const depth = ctx.level;
  const span = document.createElement("span");
  span.style.paddingLeft = `${depth * 8}px`;
  span.textContent = String(data);
  return span;
};
```

**Structured layout with action button**:

```ts
const renderer: FacetCellRenderer = (data, ctx) => {
  const btn = document.createElement("button");
  btn.textContent = "▶";
  btn.onclick = () => console.log("Clicked", ctx.path);

  return {
    left: btn,
    content: String(data),
  };
};
```

**Header renderer with sort icon**:

```ts
const headerRenderer: FacetHeaderRenderer = (text, ctx) => {
  const icon = document.createElement("span");
  icon.textContent = "↕";
  icon.style.cursor = "pointer";

  return {
    content: text,
    right: icon,
  };
};
```

## Event listeners and async state

Renderers are called on every render. The grid replaces old cell DOM with fresh elements each time, so any listeners attached to those elements are discarded along with them. This is the same model as React — elements are ephemeral, handlers are attached directly, and the framework does not manage async handler lifecycles.

### Attaching listeners

Attach listeners directly on the elements you create. An in-flight async handler continues executing even after its source element is removed from the DOM — JS does not cancel async functions when their source element is detached.

### State must live in the view model

Since the renderer is called fresh on each render, any state it reads must be stored in the view model's `metaState` (see [facet-layout.md](facet-layout.md#meta-state)). The view model is accessible via `dataCtx.viewModel` and re-render can be triggered via `rCtx.render()`.

Use `dataCtx.level` and `dataCtx.index` to construct a namespace unique to each facet cell:

```ts
const colFacetRenderer: FacetCellRenderer = (data, dataCtx, rCtx) => {
  const isLeaf = dataCtx.level === dataCtx.path.length - 1;
  const ns = `col-facet:${dataCtx.level}:${dataCtx.index}`;
  const state = dataCtx.viewModel.metaState.get(ns);
  const isLoading = state?.loading === true;

  const icon = svgBtnIcon("chevron-right");

  icon.onclick = async () => {
    if (isLoading) return;
    dataCtx.viewModel.metaState.set(ns, "loading", true);
    rCtx.render(dataCtx.viewModel);

    await datamodel.generateViewModel(config);

    dataCtx.viewModel.metaState.clear(ns);
    rCtx.render(dataCtx.viewModel);
  };

  if (!isLeaf) {
    return {
      left: isLoading ? loadingIcon() : icon,
      content: String(data ?? ""),
    };
  }

  return {
    left: svgIcon("arrow-down", 10),
    content: String(data ?? ""),
    right: svgIcon("filter", 10),
  };
};
```

This matches how React handles the same scenario: async `onClick` handlers survive component re-renders because `setState` (analogous to `rCtx.render()`) is a stable operation that targets component identity, not DOM nodes.

## DOM structure

Both `FacetCellRenderer` and `FacetHeaderRenderer` produce the same DOM structure.

When a renderer returns a plain `El` (string, HTMLElement, or array), the cell contains:

```html
<span class="content">...rendered content...</span>
```

When a renderer returns a `FacetCellContent` object with slots, the cell contains:

```html
<div class="f-cell-con">
  <div>...left...</div>           <!-- only if left is provided -->
  <div class="content">...content...</div>
  <div>...right...</div>          <!-- only if right is provided -->
</div>
```
