import * as duckdb from "@duckdb/duckdb-wasm";
import { SqlFlatTableDataModel } from "./sql-flat-table-datamodel";
import { FlatTableConfig, GridData, Schema } from "./types";
import { schemaToSqlType, schemaToPlaceholder } from "./sql-datamodel";
import { DuckDBWasmBundles } from "./duckdb-wasm-datamodel";

const DEFAULT_BUNDLES: DuckDBWasmBundles = {
  mvp: {
    mainModule: new URL("@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm", import.meta.url).href,
    mainWorker: new URL("@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js", import.meta.url).href,
  },
  eh: {
    mainModule: new URL("@duckdb/duckdb-wasm/dist/duckdb-eh.wasm", import.meta.url).href,
    mainWorker: new URL("@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js", import.meta.url).href,
  },
};

export class DuckDBWasmFlatTableDataModel extends SqlFlatTableDataModel {
  private wasmDb: duckdb.AsyncDuckDB;
  private wasmConn: duckdb.AsyncDuckDBConnection;

  private constructor(
    config: FlatTableConfig,
    dataSchema: Schema[],
    table: string,
    wasmDb: duckdb.AsyncDuckDB,
    wasmConn: duckdb.AsyncDuckDBConnection,
  ) {
    super(config, dataSchema, table);
    this.wasmDb = wasmDb;
    this.wasmConn = wasmConn;
  }

  static async create(
    config: FlatTableConfig,
    gridData: GridData,
    bundles: DuckDBWasmBundles = DEFAULT_BUNDLES,
  ): Promise<DuckDBWasmFlatTableDataModel> {
    const dataSchema: Schema[] = gridData.columns.map((col) => {
      if (typeof col === "string") {
        return { name: col, displayName: col, type: "dimension" as const };
      }
      return col;
    });

    const tableName = "data";

    const bundle = await duckdb.selectBundle({
      mvp: { mainModule: bundles.mvp.mainModule, mainWorker: bundles.mvp.mainWorker },
      eh: bundles.eh ? { mainModule: bundles.eh.mainModule, mainWorker: bundles.eh.mainWorker } : undefined,
    });

    const worker = new Worker(bundle.mainWorker!);
    const logger = new duckdb.ConsoleLogger();
    const db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

    const conn = await db.connect();

    const colDefs = dataSchema.map((s) => `"${s.name}" ${schemaToSqlType(s)}`);
    const ddl = `CREATE TABLE "${tableName}" (${colDefs.join(", ")})`;
    await conn.query(ddl);

    const instance = new DuckDBWasmFlatTableDataModel(config, dataSchema, tableName, db, conn);
    await instance.loadData(gridData.data, gridData.replace);

    return instance;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async loadData(data: any[][], replace: Map<string, Map<string, string>> = new Map()): Promise<void> {
    const numCols = this.dataSchema.length;
    const numRows = data[0]?.length ?? 0;
    if (numRows === 0) return;

    const placeholders = this.dataSchema.map((s) =>
      schemaToPlaceholder(s, replace.get(s.name) ?? new Map())
    ).join(", ");
    const sql = `INSERT INTO "${this.table}" VALUES (${placeholders})`;
    const stmt = await this.wasmConn.prepare(sql);

    for (let r = 0; r < numRows; r++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row: any[] = [];
      for (let c = 0; c < numCols; c++) {
        row.push(data[c][r]);
      }
      await stmt.query(...row);
    }
    await stmt.close();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected runSQL(sql: string): Promise<Record<string, any>[]> {
    return this.wasmConn.query(sql).then((result) => result.toArray().map((row) => row.toJSON()));
  }
}
