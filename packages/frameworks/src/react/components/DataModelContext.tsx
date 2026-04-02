import { createContext, useContext } from "react";
import type { FlatTableDataModel } from "grid/dist/index";
import type { GetRowsIR } from "grid/dist/index";

export interface GridConfig {
  enableSorting?: boolean;
}

export interface DataModelContextValue {
  model: FlatTableDataModel;
  ir: GetRowsIR;
  gridConfig: GridConfig;
}

export const DataModelContext = createContext<DataModelContextValue | null>(null);

export function useDataModelContext(): DataModelContextValue {
  const ctx = useContext(DataModelContext);
  if (!ctx) throw new Error("DataModelContext not found. Provide it via contextWrapper in useFlatGrid.");
  return ctx;
}
