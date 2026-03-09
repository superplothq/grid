export interface GridConfig {
  defaultCellHeight: number;
  defaultCellWidth: number;
  overscan: number;
  enableResizeUI: boolean;
  theme: string;
  stickyRowGroup: boolean;
}

export const defaultConfig: GridConfig = {
  defaultCellHeight: 19,
  defaultCellWidth: 50,
  overscan: 2,
  enableResizeUI: true,
  stickyRowGroup: true,
  theme: "light",
};
