import * as duckdb from "@duckdb/duckdb-wasm";
import * as arrow from "apache-arrow";
import { SqlFlatTableDataModel } from "./sql-flat-table-datamodel";
import { FlatTableConfig, GridData, Schema } from "./types";
import { schemaToSqlType } from "./sql-datamodel";
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
    await instance.loadData(gridData.data);

    return instance;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async loadData(data: any[][]): Promise<void> {
    const numRows = data[0]?.length ?? 0;
    if (numRows === 0) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const columns: Record<string, any> = {};
    for (let c = 0; c < this.dataSchema.length; c++) {
      const s = this.dataSchema[c];
      if (s.type === "measure") {
        columns[s.name] = new Float64Array(data[c]);
      } else {
        columns[s.name] = data[c];
      }
    }

    const table = arrow.tableFromArrays(columns);
    await this.wasmConn.insertArrowTable(table, { name: this.table, create: false });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected runSQL(sql: string): Promise<Record<string, any>[]> {
    return this.wasmConn.query(sql).then((result) => result.toArray().map((row) => row.toJSON()));
  }
}
