import {Theme} from "./types";
import {registerTheme} from "./registry";

export const lightTheme: Theme = {
  cellPaddingY: 6,
  cellPaddingX: 10,
  verticalBorderWidth: 1,
  verticalBorderColor: "#ccd0da",
  horizontalBorderWidth: 1,
  horizontalBorderColor: "#ccd0da",
  fontSize: 12,
  columnFacetBackgroundColor: "#e6e9ef",
  columnFacetFontWeight: 500,
  columnFacetTextColor: "#5c5f77",
  rowFacetBackgroundColor: "#eff1f5",
  valueTextColor: "#4c4f69",
  valueBackgroundColor: "#eff1f5",
};

export const darkTheme: Theme = {
  cellPaddingY: 6,
  cellPaddingX: 10,
  verticalBorderWidth: 1,
  verticalBorderColor: "#414559",
  horizontalBorderWidth: 1,
  horizontalBorderColor: "#414559",
  fontSize: 12,
  columnFacetBackgroundColor: "#292c3c",
  columnFacetFontWeight: 500,
  columnFacetTextColor: "#cdd6f4",
  rowFacetBackgroundColor: "#303446",
  valueTextColor: "#c6d0f5",
  valueBackgroundColor: "#303446",
};

registerTheme("light", lightTheme);
registerTheme("dark", darkTheme);
