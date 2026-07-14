// Shared, minimalistic toolbar chrome reused across samples. It is theme
// adaptive without knowing the theme: every color is derived from the inherited
// text color (`currentColor`) via `color-mix`, so borders and fills stay subtle
// and legible in both light and dark mode.

const BORDER = "color-mix(in srgb, currentColor 20%, transparent)";

// Small, consistent control chrome shared by the select and the buttons.
const CONTROL =
  "font:inherit;font-size:12px;line-height:1;height:26px;box-sizing:border-box;" +
  `color:inherit;border-radius:6px;border:1px solid ${BORDER};`;

// The toolbar container: a compact bar with its own subtle surface and border so
// it reads as a component distinct from the grid below it.
export function createToolbar(): HTMLElement {
  const bar = document.createElement("div");
  bar.style.cssText =
    "display:flex;gap:6px;align-items:center;padding:6px 8px;font:inherit;" +
    `border-radius:8px;border:1px solid ${BORDER};` +
    "background:color-mix(in srgb, currentColor 4%, transparent);";
  return bar;
}

export function toolbarSelect(options: string[], value: string): HTMLSelectElement {
  const select = document.createElement("select");
  select.style.cssText = `${CONTROL}padding:0 6px;background:transparent;cursor:pointer;`;
  for (const option of options) {
    const el = document.createElement("option");
    el.value = option;
    el.textContent = option;
    select.appendChild(el);
  }
  select.value = value;
  return select;
}

export function toolbarColorInput(value: string): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "color";
  input.value = value;
  input.style.cssText = "width:26px;height:26px;padding:0;border:none;background:none;cursor:pointer;border-radius:26px;";
  return input;
}

export function toolbarButton(label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.style.cssText = `${CONTROL}padding:0 10px;cursor:pointer;background:color-mix(in srgb, currentColor 6%, transparent);`;
  return button;
}
