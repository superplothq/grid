import { registerTheme } from "@superplot/grid/renderer";
import type { Theme } from "@superplot/grid/renderer";
import type { GridThemeName } from "../../runtime/theme";

// A dedicated Tableau-flavoured theme pair (cool slate neutrals, a muted blue
// accent) plus the palette that paints the demo's own chrome — panels, editors,
// badges, popups — so everything switches with the page theme in lock-step.

const base = {
  cellPaddingY: 3,
  cellPaddingX: 12,
  fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
  verticalBorderWidth: 1,
  horizontalBorderWidth: 1,
  fontSize: 12,
  fontWeight: "normal",
  columnFacetFontWeight: 600,
  facetHeaderFontSize: 12,
  facetHeaderFontWeight: 600,
  dataLeftBorderWidth: 1,
  dataTopBorderWidth: 1,
};

// Ayu Light — warm neutrals, muted gold/orange accent, blue entities.
const pivotStudioLight: Theme = {
  ...base,
  verticalBorderColor: "#d5d8da",
  horizontalBorderColor: "#d5d8da",
  columnFacetBackgroundColor: "#f1f2f3",
  columnFacetTextColor: "#5c6166",
  rowFacetBackgroundColor: "#f6f7f8",
  valueTextColor: "#5c6166",
  valueBackgroundColor: "#fcfcfc",
  facetHeaderBackgroundColor: "#eceeef",
  facetHeaderFontColor: "#787b80",
  dataLeftBorderColor: "#b9bdc0",
  dataTopBorderColor: "#b9bdc0",
  errOverlayBackgroundColor: "rgba(252, 252, 252, 0.92)",
  errOverlayTextColor: "#e65050",
};

// Ayu Dark — deep #0B0E14 base, gold accent, warm off-white text.
const pivotStudioDark: Theme = {
  ...base,
  verticalBorderColor: "#1b212a",
  horizontalBorderColor: "#1b212a",
  columnFacetBackgroundColor: "#0f131a",
  columnFacetTextColor: "#bfbdb6",
  rowFacetBackgroundColor: "#0d1017",
  valueTextColor: "#bfbdb6",
  valueBackgroundColor: "#0b0e14",
  facetHeaderBackgroundColor: "#11151c",
  facetHeaderFontColor: "#8a9199",
  dataLeftBorderColor: "#2a313c",
  dataTopBorderColor: "#2a313c",
  errOverlayBackgroundColor: "rgba(11, 14, 20, 0.92)",
  errOverlayTextColor: "#f07178",
};

export const THEME_LIGHT = "pivot-studio-light";
export const THEME_DARK = "pivot-studio-dark";

let registered = false;
export function registerThemes(): void {
  if (registered) return;
  registerTheme(THEME_LIGHT, pivotStudioLight);
  registerTheme(THEME_DARK, pivotStudioDark);
  registered = true;
}

export interface ChromePalette {
  surface: string;
  panel: string;
  raised: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  accent: string;
  accentSoft: string;
  dimBadgeBg: string;
  dimBadgeText: string;
  measBadgeBg: string;
  measBadgeText: string;
  inputBg: string;
  hover: string;
  popupBg: string;
  popupShadow: string;
  error: string;
  ok: string;
  up: string;
  down: string;
}

export const PALETTES: Record<GridThemeName, ChromePalette> = {
  // Ayu Light
  light: {
    surface: "#fcfcfc",
    panel: "#f3f4f5",
    raised: "#eceeef",
    border: "#e1e3e4",
    borderStrong: "#cbd0d2",
    text: "#5c6166",
    textMuted: "#8a9199",
    accent: "#ff9940",
    accentSoft: "rgba(255, 153, 64, 0.14)",
    dimBadgeBg: "rgba(57, 158, 230, 0.14)",
    dimBadgeText: "#399ee6",
    measBadgeBg: "rgba(250, 141, 62, 0.16)",
    measBadgeText: "#e07b1f",
    inputBg: "#ffffff",
    hover: "rgba(255, 153, 64, 0.10)",
    popupBg: "#ffffff",
    popupShadow: "0 8px 28px rgba(92, 97, 102, 0.16)",
    error: "#e65050",
    ok: "#6ca300",
    up: "#86b300",
    down: "#e65050",
  },
  // Ayu Dark
  dark: {
    surface: "#0b0e14",
    panel: "#0f131a",
    raised: "#151a22",
    border: "#1c222b",
    borderStrong: "#2c333e",
    text: "#bfbdb6",
    textMuted: "#6c7380",
    accent: "#e6b450",
    accentSoft: "rgba(230, 180, 80, 0.16)",
    dimBadgeBg: "rgba(89, 194, 255, 0.16)",
    dimBadgeText: "#59c2ff",
    measBadgeBg: "rgba(230, 180, 80, 0.18)",
    measBadgeText: "#e6b450",
    inputBg: "#0d1017",
    hover: "rgba(230, 180, 80, 0.10)",
    popupBg: "#0f131a",
    popupShadow: "0 8px 28px rgba(0, 0, 0, 0.5)",
    error: "#f07178",
    ok: "#aad94c",
    up: "#aad94c",
    down: "#f07178",
  },
};

// Push the chrome palette onto a host element as CSS custom properties so the
// demo's stylesheet and inline styles can reference them and repaint on theme
// switch by re-applying with the new mode.
export function applyChromeVars(host: HTMLElement, mode: GridThemeName): void {
  const p = PALETTES[mode];
  for (const [key, value] of Object.entries(p)) {
    host.style.setProperty("--ps-" + key.replace(/[A-Z]/g, m => "-" + m.toLowerCase()), value);
  }
}
