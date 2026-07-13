import Grid, { LayoutType } from "grid/dist/renderer";

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
