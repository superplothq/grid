import { Theme } from "./types";
import { getTheme, registerTheme } from "./registry";

export const lightTheme: Theme = {
  cellPaddingY: 7,
  cellPaddingX: 12,
  fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
  verticalBorderWidth: 1,
  verticalBorderColor: "#ececee",
  horizontalBorderWidth: 1,
  horizontalBorderColor: "#ececee",
  fontSize: 12,
  fontWeight: "normal",
  columnFacetBackgroundColor: "#fafafa",
  columnFacetFontWeight: 600,
  columnFacetTextColor: "#52525b",
  rowFacetBackgroundColor: "#fcfcfd",
  valueTextColor: "#27272a",
  valueBackgroundColor: "#ffffff",
  facetHeaderBackgroundColor: "#fafafa",
  facetHeaderFontColor: "#71717a",
  facetHeaderFontSize: 12,
  facetHeaderFontWeight: 600,
  dataLeftBorderWidth: 1,
  dataLeftBorderColor: "#dcdce0",
  dataTopBorderWidth: 1,
  dataTopBorderColor: "#dcdce0",
  errOverlayBackgroundColor: "rgba(255, 255, 255, 0.92)",
  errOverlayTextColor: "#dc2626",
  highlightBaseColor: "#3b82f6",
  hoverColorMixPercentage: 10,
};

export const darkTheme: Theme = {
  cellPaddingY: 7,
  cellPaddingX: 12,
  fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
  verticalBorderWidth: 1,
  verticalBorderColor: "#26262b",
  horizontalBorderWidth: 1,
  horizontalBorderColor: "#26262b",
  fontSize: 12,
  fontWeight: "normal",
  columnFacetBackgroundColor: "#18181b",
  columnFacetFontWeight: 600,
  columnFacetTextColor: "#d4d4d8",
  rowFacetBackgroundColor: "#141417",
  valueTextColor: "#e4e4e7",
  valueBackgroundColor: "#101013",
  facetHeaderBackgroundColor: "#18181b",
  facetHeaderFontColor: "#a1a1aa",
  facetHeaderFontSize: 12,
  facetHeaderFontWeight: 600,
  dataLeftBorderWidth: 1,
  dataLeftBorderColor: "#3a3a41",
  dataTopBorderWidth: 1,
  dataTopBorderColor: "#3a3a41",
  errOverlayBackgroundColor: "rgba(16, 16, 19, 0.92)",
  errOverlayTextColor: "#f87171",
  highlightBaseColor: "#60a5fa",
  hoverColorMixPercentage: 14,
};

registerTheme("light", lightTheme);
registerTheme("dark", darkTheme);

/** Writes a registered theme onto an element as CSS custom properties, camelCase keys becoming `--kebab-case`. */
export function applyThemeTokens(el: HTMLElement, name: string): void {
  const theme = getTheme(name);
  if (!theme) return;
  for (const [key, value] of Object.entries(theme)) {
    const cssVar = "--" + key.replace(/[A-Z]/g, m => "-" + m.toLowerCase());
    el.style.setProperty(cssVar, String(value));
  }
}
