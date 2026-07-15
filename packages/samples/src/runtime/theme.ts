import { getTheme } from "grid/dist/renderer";

export type GridThemeName = "light" | "dark";

// Resolve the grid theme from the host page. Web's docs set `html[data-theme]`;
// when it is unset (e.g. the playground) we follow the OS colour scheme.
export function resolveGridTheme(): GridThemeName {
  const attr = document.documentElement.dataset.theme;
  if (attr === "dark" || attr === "light") return attr;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// Push a registered grid theme's tokens onto the grid's track surface - the same
// element and CSS-variable naming the layout uses when it applies `config.theme`
// once at construction. Doing it here lets us re-apply on the fly. Accepts any
// registered theme name (built-in or a demo's custom pair).
export function applyGridTheme(container: HTMLElement, name: string): void {
  const theme = getTheme(name)!;
  for (const [key, value] of Object.entries(theme)) {
    const cssVar = "--" + key.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
    container.style.setProperty(cssVar, String(value));
  }
}

// Keep a grid's theme in lock-step with the page: apply the current theme now,
// then re-apply whenever `html[data-theme]` flips or, absent that, when the OS
// colour scheme changes. Returns a disposer that detaches both listeners.
export function syncGridTheme(grid: { trackSurfaceContainer: HTMLElement }): () => void {
  const apply = (): void => applyGridTheme(grid.trackSurfaceContainer, resolveGridTheme());
  apply();

  const observer = new MutationObserver(apply);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  const media = matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", apply);

  return () => {
    observer.disconnect();
    media.removeEventListener("change", apply);
  };
}

// Same lock-step behaviour as syncGridTheme, but for a demo that ships its own
// registered theme pair: the page's light mode maps to `lightName`, dark to
// `darkName`. `onApply` runs after each (re)application with the resolved mode so
// the demo can repaint its own chrome (toolbars, panels, popups) to match.
export function syncCustomGridTheme(
  grid: { trackSurfaceContainer: HTMLElement },
  lightName: string,
  darkName: string,
  onApply?: (mode: GridThemeName) => void,
): () => void {
  const apply = (): void => {
    const mode = resolveGridTheme();
    applyGridTheme(grid.trackSurfaceContainer, mode === "dark" ? darkName : lightName);
    onApply?.(mode);
  };
  apply();

  const observer = new MutationObserver(apply);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  const media = matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", apply);

  return () => {
    observer.disconnect();
    media.removeEventListener("change", apply);
  };
}
