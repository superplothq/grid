import { useRef } from "react";
import { SqlFlatTableDataModel } from "grid/dist/index";
import type { FlatTableConfig } from "grid/dist/index";
import { useDataSource } from "./useDataSource";

export function useFlatModel(config: FlatTableConfig): SqlFlatTableDataModel {
  const { dataSource, schema } = useDataSource();
  const modelRef = useRef<SqlFlatTableDataModel | null>(null);

  if (!modelRef.current) {
    modelRef.current = new SqlFlatTableDataModel(config, schema, dataSource);
  }

  return modelRef.current;
}
