import { LayoutFixtureClasses } from "./types";

export interface GridConfig {
  defaultCellHeight: number;
  defaultCellWidth: number;
  overscan: number;
  enableResizeUI: boolean;
  fixtures: LayoutFixtureClasses;
  theme: string;
  columnAutosizingStrategyOnScroll: "dynamic" | "max-seen";
  dataFetchDebounceMs: number;
}

export const defaultConfig: GridConfig = {
  defaultCellHeight: 19,
  defaultCellWidth: 50,
  overscan: 2,
  enableResizeUI: true,
  theme: "light",
  columnAutosizingStrategyOnScroll: "max-seen",
  dataFetchDebounceMs: 150,
  fixtures: {
    top: [],
    left: [],
    bottom: [],
    right: [],
  },
};
