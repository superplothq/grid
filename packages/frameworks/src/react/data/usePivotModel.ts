import { useRef } from "react";
import { SqlPivotDataModel } from "grid/dist/index";
import { useDataSource } from "./useDataSource";

export function usePivotModel(): SqlPivotDataModel {
  const { dataSource, schema } = useDataSource();
  const modelRef = useRef<SqlPivotDataModel | null>(null);

  if (!modelRef.current) {
    modelRef.current = new SqlPivotDataModel(schema, dataSource);
  }

  return modelRef.current;
}
