import { createContext, useContext } from "react";
import type { FlatTableDataModel } from "grid/dist/index";
import type { GetRowsIR, SortEntry } from "grid/dist/index";
import type Grid from "grid/dist/renderer";

export interface GridConfig {
  enableSorting?: boolean;
}

export interface DataModelContextValue {
  model: FlatTableDataModel;
  ir: GetRowsIR;
  gridConfig: GridConfig;
  grid: Grid;
  sortAction?: (entries: SortEntry[]) => Promise<void>;
  expandAction?: (selectPath: string[]) => Promise<void>;
  collapseAction?: (selectPath: string[]) => Promise<void>;
}

export const DataModelContext = createContext<DataModelContextValue | null>(null);

export function useDataModelContext(): DataModelContextValue {
  const ctx = useContext(DataModelContext);
  if (!ctx) throw new Error("DataModelContext not found. Provide it via contextWrapper in useFlatGrid.");
  return ctx;
}
