import { DuckDBWasmDataModel, DuckDBWasmBundles } from "./duckdb-wasm-datamodel";
import { GridData, Schema } from "./types";
import type { AsyncDuckDB, AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";

// @ts-expect-error - static create() intentionally has a different signature than DuckDBWasmDataModel.create()
export class BrowserInMemoryDataModel extends DuckDBWasmDataModel {
  private constructor(
    schema: Schema[],
    table: string,
    wasmDb: AsyncDuckDB,
    wasmConn: AsyncDuckDBConnection,
  ) {
    super(schema, table, wasmDb, wasmConn);
  }

  static async create(gridData: GridData, bundles?: DuckDBWasmBundles): Promise<BrowserInMemoryDataModel> {
    const schema: Schema[] = gridData.columns.map((col) => {
      if (typeof col === "string") {
        return { name: col, displayName: col, type: "dimension" as const };
      }
      return col;
    });

    const tableName = "data";
    const { db, conn } = await DuckDBWasmDataModel.createWasmResources(schema, tableName, bundles);
    const instance = new BrowserInMemoryDataModel(schema, tableName, db, conn);
    await instance.loadData(gridData.data, gridData.replace);
    return instance;
  }
}
