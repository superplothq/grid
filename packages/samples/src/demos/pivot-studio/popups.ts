import type { ScalarFilter, SortEntry } from "@superplot/grid";
import { FIELDS } from "./data";

// Lightweight, theme-adaptive popups for the corner sort/filter icons. A single
// layer owns at most one open popup and closes it on outside click; the popup is
// a child of the demo host so it inherits the --ps-* chrome variables, and uses
// fixed positioning off the anchor's rect so it floats over the scrolling grid.

const MEASURE_LABEL = new Map(FIELDS.filter(f => f.kind === "measure").map(f => [f.name, f.label]));
const DIM_LABEL = new Map(FIELDS.map(f => [f.name, f.label]));

export interface PopupLayer {
  open: (anchor: HTMLElement, build: (box: HTMLElement, close: () => void) => void) => void;
  close: () => void;
  dispose: () => void;
}

export function createPopupLayer(host: HTMLElement): PopupLayer {
  let overlay: HTMLElement | null = null;

  const close = (): void => {
    overlay?.remove();
    overlay = null;
  };

  const open = (anchor: HTMLElement, build: (box: HTMLElement, done: () => void) => void): void => {
    close();
    const rect = anchor.getBoundingClientRect();

    overlay = document.createElement("div");
    overlay.className = "ps-popup-overlay";
    overlay.addEventListener("mousedown", e => {
      if (e.target === overlay) close();
    });

    const box = document.createElement("div");
    box.className = "ps-popup";
    box.style.top = `${rect.bottom + 6}px`;
    box.style.left = `${Math.max(8, rect.left - 40)}px`;

    build(box, close);
    overlay.append(box);
    host.append(overlay);
  };

  return { open, close, dispose: close };
}

export function openSortPopup(
  layer: PopupLayer,
  anchor: HTMLElement,
  field: string,
  current: SortEntry | undefined,
  onApply: (entry: SortEntry | null) => void,
): void {
  layer.open(anchor, (box, close) => {
    const title = document.createElement("div");
    title.className = "ps-popup-title";
    title.textContent = `Sort ${DIM_LABEL.get(field) ?? field}`;
    box.append(title);

    const addOption = (text: string, active: boolean, apply: () => void): void => {
      const row = document.createElement("button");
      row.className = "ps-popup-option";
      if (active) row.classList.add("active");
      row.textContent = text;
      row.addEventListener("click", () => {
        apply();
        close();
      });
      box.append(row);
    };

    const isActive = (direction: "asc" | "desc", by?: string): boolean =>
      current?.direction === direction && (current?.by ?? undefined) === by;

    addOption("Value  A → Z", isActive("asc"), () => onApply({ field, direction: "asc" }));
    addOption("Value  Z → A", isActive("desc"), () => onApply({ field, direction: "desc" }));

    const divider = document.createElement("div");
    divider.className = "ps-popup-divider";
    box.append(divider);

    for (const [name, label] of MEASURE_LABEL) {
      addOption(`${label}  ▲ low → high`, isActive("asc", name), () => onApply({ field, direction: "asc", by: name }));
      addOption(`${label}  ▼ high → low`, isActive("desc", name), () => onApply({ field, direction: "desc", by: name }));
    }

    const clearDivider = document.createElement("div");
    clearDivider.className = "ps-popup-divider";
    box.append(clearDivider);
    addOption("Clear sort", false, () => onApply(null));
  });
}

export function openFilterPopup(
  layer: PopupLayer,
  anchor: HTMLElement,
  field: string,
  distinctValues: string[] | null,
  current: ScalarFilter | undefined,
  onApply: (filter: ScalarFilter | null) => void,
): void {
  layer.open(anchor, (box, close) => {
    const title = document.createElement("div");
    title.className = "ps-popup-title";
    title.textContent = `Filter ${DIM_LABEL.get(field) ?? field}`;
    box.append(title);

    if (distinctValues === null) {
      const loading = document.createElement("div");
      loading.className = "ps-popup-loading";
      loading.textContent = "Loading values…";
      box.append(loading);
      return;
    }

    const selected = new Set<string>(
      current && current.op === "in" && Array.isArray(current.value)
        ? (current.value as string[])
        : distinctValues,
    );

    const search = document.createElement("input");
    search.type = "text";
    search.className = "ps-popup-search";
    search.placeholder = "Search…";
    box.append(search);

    const list = document.createElement("div");
    list.className = "ps-popup-list";
    box.append(list);

    const renderList = (): void => {
      list.innerHTML = "";
      const term = search.value.trim().toLowerCase();
      for (const value of distinctValues) {
        if (term && !value.toLowerCase().includes(term)) continue;
        const row = document.createElement("label");
        row.className = "ps-popup-check";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = selected.has(value);
        cb.addEventListener("change", () => {
          if (cb.checked) selected.add(value);
          else selected.delete(value);
        });
        const span = document.createElement("span");
        span.textContent = value;
        row.append(cb, span);
        list.append(row);
      }
    };
    search.addEventListener("input", renderList);
    renderList();

    const actions = document.createElement("div");
    actions.className = "ps-popup-actions";

    const allBtn = document.createElement("button");
    allBtn.className = "ps-popup-link";
    allBtn.textContent = "All";
    allBtn.addEventListener("click", () => {
      distinctValues.forEach(v => selected.add(v));
      renderList();
    });

    const noneBtn = document.createElement("button");
    noneBtn.className = "ps-popup-link";
    noneBtn.textContent = "None";
    noneBtn.addEventListener("click", () => {
      selected.clear();
      renderList();
    });

    const apply = document.createElement("button");
    apply.className = "ps-popup-apply";
    apply.textContent = "Apply";
    apply.addEventListener("click", () => {
      if (selected.size === 0 || selected.size === distinctValues.length) {
        onApply(null);
      } else {
        onApply({ type: "scalar", field, op: "in", value: Array.from(selected) });
      }
      close();
    });

    actions.append(allBtn, noneBtn, apply);
    box.append(actions);
  });
}
