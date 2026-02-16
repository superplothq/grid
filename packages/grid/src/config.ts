export const REG_TYPE_LAYOUT = "layout";
export const REG_NAME_STD = "std";


export interface GridConfig {
  defaultCellHeight: number;
  defaultCellWidth: number;
  overscan: number;
  layoutType: string;
  enableResizeUI: boolean;
  enableAnimation: boolean;
  animationDuration: number;
  animationEasing: string;
}

export const defaultConfig: GridConfig = {
  defaultCellHeight: 19,
  defaultCellWidth: 60,
  overscan: 2,
  layoutType: REG_NAME_STD,
  enableResizeUI: true,
  enableAnimation: true,
  animationDuration: 1000,
  // animationEasing: "linear",
  animationEasing: "ease-out",
};
