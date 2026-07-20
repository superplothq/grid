import { createContext, useContext } from "react";
import type { StandardTableDataModel } from "@superplot/grid";
import type { StandardDataFetchAndTransformIR, SortEntry, ScalarFilter, ColumnRangeValues } from "@superplot/grid";
import type Grid from "@superplot/grid/renderer";

export interface GridConfig {
  enableSorting?: boolean;
  enableFiltering?: boolean;
  theme?: string;
}

export interface DataModelContextValue {
  model: StandardTableDataModel;
  ir: StandardDataFetchAndTransformIR;
  gridConfig: GridConfig;
  grid: Grid;
  sortAction?: (entries: SortEntry[]) => Promise<void>;
  filterAction?: (filters: ScalarFilter[]) => Promise<void>;
  getRangeOfColumn?: (field: string) => Promise<ColumnRangeValues>;
  expandAction?: (selectPath: string[]) => Promise<void>;
  collapseAction?: (selectPath: string[]) => Promise<void>;
}

export const DataModelContext = createContext<DataModelContextValue | null>(null);

export function useDataModelContext(): DataModelContextValue {
  const ctx = useContext(DataModelContext);
  if (!ctx) throw new Error("DataModelContext not found. Provide it via contextWrapper in useFlatGrid.");
  return ctx;
}
