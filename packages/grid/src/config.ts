export interface GridConfig {
  defaultCellHeight: number;
  defaultCellWidth: number;
  overscan: number;
  layoutType: "standard" | string;
  rendererType: "standard" | string;
}

export const defaultConfig: GridConfig = {
  defaultCellHeight: 19,
  defaultCellWidth: 60,
  overscan: 2,
  layoutType: "standard",
  rendererType: "standard"
};
