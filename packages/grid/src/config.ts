export interface GridConfig {
  // columnContain: "fit-all" | "fit-some",
  // maxColumnWidth: number | "fit-content",
  virtualize: "both" | "row" | "column" | "none",
}

export const defaultConfig: GridConfig = {
  // columnContain: "fit-some",
  // columnContain: "fit-all",
  // maxColumnWidth: "fit-content"
  virtualize: "none",
};
