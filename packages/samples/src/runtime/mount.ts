import Grid, { LayoutType } from "@superplot/grid/renderer";

// Lays out the sample host as a vertical stack (so a toolbar and the grid read as
// separate blocks with the page background showing through the gap) and returns a
// fixed-height, scrollable, bordered mount for the grid. The caller appends it.
export function createGridMount(host: HTMLElement, heightPx: number): HTMLElement {
  host.style.cssText = "display:flex;flex-direction:column;gap:12px;";
  const gridMount = document.createElement("div");
  gridMount.style.cssText =
    `position:relative;height:${heightPx}px;overflow:auto;border-radius:8px;` +
    "border:1px solid color-mix(in srgb, currentColor 15%, transparent);";
  return gridMount;
}

export function createGrid(host: HTMLElement, layout: LayoutType): { grid: Grid; cleanup: () => void } {
  const el = document.createElement("div");
  el.style.cssText = "position:relative;width:100%;height:100%;overflow:auto;";
  host.appendChild(el);
  const grid = new Grid({}, el, layout);
  return {
    grid,
    cleanup: () => {
      host.removeChild(el);
    },
  };
}
