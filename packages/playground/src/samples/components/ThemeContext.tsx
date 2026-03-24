import React, { createContext, useContext } from "react";

export type Theme = "light" | "dark";
const ThemeContext = createContext<Theme>("light");
export const ThemeProvider = ThemeContext.Provider;
export const useTheme = (): Theme => useContext(ThemeContext);
