import { useContext } from "react";
import { DataSourceContext, type DataSourceContextValue } from "./DataSourceProvider";

export function useDataSource(): DataSourceContextValue {
  const ctx = useContext(DataSourceContext);
  if (!ctx) {
    throw new Error("useDataSource must be used within a <DataSourceProvider>");
  }
  return ctx;
}
