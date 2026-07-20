import { createContext, type FC, type ReactNode } from "react";
import type { SqlDataSource, ColumnMetadata } from "@superplot/grid";
import type { DataSchema } from "@superplot/grid";

export interface DataSourceContextValue {
  dataSource: SqlDataSource;
  columns: ColumnMetadata[];
  schema: DataSchema[];
}

export const DataSourceContext = createContext<DataSourceContextValue | null>(null);

export interface DataSourceProviderProps {
  dataSource: SqlDataSource;
  columns: ColumnMetadata[];
  schema: DataSchema[];
  children: ReactNode;
}

export const DataSourceProvider: FC<DataSourceProviderProps> = ({ dataSource, columns, schema, children }) => {
  return (
    <DataSourceContext.Provider value={{ dataSource, columns, schema }}>
      {children}
    </DataSourceContext.Provider>
  );
};
