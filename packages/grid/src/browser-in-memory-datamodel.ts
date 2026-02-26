import {DuckDBWasmDataModel, DuckDBWasmBundles} from "./duckdb-wasm-datamodel";
import {GridData, Schema} from "./types";

// @ts-expect-error - static create() intentionally has a different signature than DuckDBWasmDataModel.create()
export class BrowserInMemoryDataModel extends DuckDBWasmDataModel {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private constructor(
    schema: Schema[],
    table: string,
    wasmDb: any,
    wasmConn: any,
  ) {
    super(schema, table, wasmDb, wasmConn);
  }

  static async create(gridData: GridData, bundles: DuckDBWasmBundles): Promise<BrowserInMemoryDataModel> {
    const schema: Schema[] = gridData.columns.map((col) => {
      if (typeof col === "string") {
        return {name: col, displayName: col, type: "dimension" as const};
      }
      return col;
    });

    const tableName = "data";
    const parent = await DuckDBWasmDataModel.create(schema, tableName, bundles);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const instance = new BrowserInMemoryDataModel(
      schema,
      tableName,
      (parent as any).wasmDb,
      (parent as any).wasmConn,
    );

    await instance.loadData(gridData.data);

    return instance;
  }
}
