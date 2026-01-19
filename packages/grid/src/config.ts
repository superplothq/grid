export interface GridConfig {
  virtualize: "both" | "row" | "column" | "none",
}

export const defaultConfig: GridConfig = {
  virtualize: "none",
};
