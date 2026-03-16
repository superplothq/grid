# Web Components — Surrounding UI Layer

The grid renderer is pure TS and framework-agnostic. The surrounding UI (toolbar, filters, config panels, etc.) should also remain framework-agnostic by using Web Components. This keeps the library usable from React, Vue, Angular, Solid, Svelte, or vanilla JS without shipping a framework runtime.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  Surrounding UI (Web Components)                     │
│  <grid-toolbar>, <grid-filter>, <grid-column-panel>  │
├──────────────────────────────────────────────────────┤
│  Grid Renderer (pure TS)                             │
│  Grid + PivotDataViewModel / FlattenedDataViewModel  │
└──────────────────────────────────────────────────────┘

Optional thin framework wrappers:
  packages/grid-react    (~20 lines per component)
  packages/grid-vue      (mostly unnecessary — Vue handles custom elements natively)
  packages/grid-angular  (mostly unnecessary — Angular handles custom elements natively)
```

## Communication contract

There are four channels between the consumer and a web component:

| Direction | Mechanism | Data types | Example |
|-----------|-----------|------------|---------|
| In | HTML attributes | Strings only | `<grid-filter field="revenue">` |
| In | JS property setters | Any JS type | `el.filter = { type: "scalar", ... }` |
| In | Slots | DOM nodes | `<grid-filter><my-checkbox slot="checkbox" /></grid-filter>` |
| Out | CustomEvent | Any (via `detail`) | `dispatchEvent(new CustomEvent("filter-change", { detail }))` |

### When to use which (inbound)

- **Attributes** — simple strings and flags: `field="revenue"`, `disabled`
- **Properties** — objects, arrays, config: `el.filter = { op: "gt", value: 100 }`
- **Slots** — consumer wants to inject their own UI (a custom checkbox, a branded button, etc.)

### Slots — composability without framework coupling

Slots let consumers project their own framework-rendered DOM into the web component:

```html
<grid-filter field="revenue">
  <my-react-checkbox slot="checkbox" />
</grid-filter>
```

Inside the web component template:
```html
<div class="filter-row">
  <slot name="checkbox"><input type="checkbox" /></slot>   <!-- fallback if no slot provided -->
  <span id="label"></span>
</div>
```

The slotted content stays in the light DOM (owned by the consumer's framework). The web component owns the shadow DOM around it. Neither side knows about the other.

### Render callbacks — for dynamic/repeated content

When the web component renders a list of items and each item needs custom UI (e.g. a filter value list with custom checkboxes), slots don't scale. Use a property-based render callback:

```ts
class GridFilterList extends HTMLElement {
  #renderItem: ((value: string, container: HTMLElement) => void) | null = null;

  set renderItem(fn: (value: string, container: HTMLElement) => void) {
    this.#renderItem = fn;
    this.#refresh();
  }

  #refresh() {
    for (const value of this.#values) {
      const row = document.createElement("div");
      if (this.#renderItem) {
        this.#renderItem(value, row);
      } else {
        row.textContent = value;
      }
      this.shadowRoot!.appendChild(row);
    }
  }
}
```

React consumer mounts into the provided container:
```tsx
el.renderItem = (value, container) => {
  createRoot(container).render(<Checkbox label={value} />);
};
```

### Pattern summary

| Pattern | Use case |
|---------|----------|
| Slots | Static composition — toolbar buttons, header content, single custom widget |
| Render callbacks | Repeated/dynamic content — custom cell renderers, list items |
| Properties | Data — objects, arrays, config |
| Attributes | Simple strings/flags |

## Example component: `<grid-filter>`

```ts
const template = document.createElement("template");
template.innerHTML = `
  <style>
    :host { display: block; }
    .filter-row { display: flex; gap: 8px; align-items: center; }
    select, input { height: 28px; border: 1px solid var(--border, #ddd); border-radius: 4px; padding: 0 8px; }
    input { flex: 1; }
    button { height: 28px; padding: 0 12px; border-radius: 4px; border: 1px solid var(--border, #ddd); cursor: pointer; }
    button.primary { background: var(--accent, #0055d4); color: white; border: none; }
  </style>
  <div class="filter-row">
    <select id="op">
      <option value="contains">contains</option>
      <option value="eq">equals</option>
      <option value="startsWith">starts with</option>
      <option value="gt">&gt;</option>
      <option value="lt">&lt;</option>
    </select>
    <input id="value" type="text" placeholder="Filter value..." />
    <button class="primary" id="apply">Apply</button>
    <button id="clear">Clear</button>
  </div>
`;

class GridFilter extends HTMLElement {
  #field = "";
  #filter: ScalarFilter | null = null;

  static get observedAttributes() { return ["field"]; }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot!.appendChild(template.content.cloneNode(true));

    this.shadowRoot!.getElementById("apply")!.addEventListener("click", () => {
      const op = (this.shadowRoot!.getElementById("op") as HTMLSelectElement).value;
      const value = (this.shadowRoot!.getElementById("value") as HTMLInputElement).value;
      this.#filter = { type: "scalar", field: this.#field, op, value };
      this.dispatchEvent(new CustomEvent("filter-change", { detail: this.#filter, bubbles: true }));
    });

    this.shadowRoot!.getElementById("clear")!.addEventListener("click", () => {
      (this.shadowRoot!.getElementById("value") as HTMLInputElement).value = "";
      this.#filter = null;
      this.dispatchEvent(new CustomEvent("filter-change", { detail: null, bubbles: true }));
    });
  }

  // --- Property setters (complex data in) ---
  get field() { return this.#field; }
  set field(v: string) { this.#field = v; }

  get filter() { return this.#filter; }
  set filter(v: ScalarFilter | null) {
    this.#filter = v;
    const opEl = this.shadowRoot!.getElementById("op") as HTMLSelectElement;
    const valEl = this.shadowRoot!.getElementById("value") as HTMLInputElement;
    if (v) { opEl.value = v.op; valEl.value = String(v.value ?? ""); }
    else { opEl.selectedIndex = 0; valEl.value = ""; }
  }

  // --- Attribute → property bridge (simple strings in) ---
  attributeChangedCallback(name: string, _old: string, val: string) {
    if (name === "field") this.field = val;
  }
}

customElements.define("grid-filter", GridFilter);
```

## Framework consumption

### Vanilla JS
```js
const filter = document.createElement("grid-filter");
filter.field = "revenue";
filter.addEventListener("filter-change", (e) => console.log(e.detail));
container.appendChild(filter);
```

### React (needs thin wrapper because React doesn't bridge props to properties)
```tsx
// packages/grid-react/src/GridFilter.tsx
export function GridFilter({ field, filter, onFilterChange }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    const handler = (e) => onFilterChange?.(e.detail);
    el.addEventListener("filter-change", handler);
    return () => el.removeEventListener("filter-change", handler);
  }, [onFilterChange]);
  useEffect(() => { ref.current.filter = filter ?? null; }, [filter]);
  return <grid-filter ref={ref} field={field} />;
}
```

### Vue (works directly)
```vue
<grid-filter :field="field" @filter-change="onFilterChange" />
```

### Angular (works directly)
```html
<!-- add CUSTOM_ELEMENTS_SCHEMA to the module -->
<grid-filter [field]="'revenue'" (filter-change)="onFilterChange($event)"></grid-filter>
```

### Solid (works directly)
```tsx
<grid-filter prop:field="revenue" on:filter-change={(e) => console.log(e.detail)} />
```

## Framework wrapper packages

React is the only framework that needs a wrapper (it doesn't bridge props→properties or listen to CustomEvents natively). The wrapper for each component is ~15-20 lines.

For Vue, Angular, Solid, Svelte — custom elements work out of the box. Optional wrapper packages can be provided for better TypeScript DX (typed props/events) but are not functionally required.

Proposed package structure:
```
packages/grid                  ← core renderer + web components (pure TS)
packages/grid-react            ← thin React wrappers
packages/grid-vue              ← optional, for typed props/events
packages/grid-angular          ← optional, for typed props/events
```
