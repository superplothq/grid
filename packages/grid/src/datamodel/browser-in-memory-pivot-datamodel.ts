import { DuckDBWasmPivotDataModel, DuckDBWasmBundles } from "./duckdb-wasm-pivot-datamodel";
import { GridData, Schema } from "./types";
import type { AsyncDuckDB, AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";

// @ts-expect-error - static create() intentionally has a different signature than DuckDBWasmPivotDataModel.create()
export class BrowserInMemoryPivotDataModel extends DuckDBWasmPivotDataModel {
  private constructor(
    schema: Schema[],
    table: string,
    wasmDb: AsyncDuckDB,
    wasmConn: AsyncDuckDBConnection,
  ) {
    super(schema, table, wasmDb, wasmConn);
  }

  static async create(gridData: GridData, bundles?: DuckDBWasmBundles): Promise<BrowserInMemoryPivotDataModel> {
    const schema: Schema[] = gridData.columns.map((col) => {
      if (typeof col === "string") {
        return { name: col, displayName: col, type: "dimension" as const };
      }
      return col;
    });

    const tableName = "data";
    const { db, conn } = await DuckDBWasmPivotDataModel.createWasmResources(schema, tableName, bundles);
    const instance = new BrowserInMemoryPivotDataModel(schema, tableName, db, conn);
    await instance.loadData(gridData.data, gridData.replace);
    return instance;
  }
}
