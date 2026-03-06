import * as duckdb from "@duckdb/duckdb-wasm";
import {SqlDataModel} from "./sql-datamodel";
import {Schema} from "./types";

export interface DuckDBWasmBundles {
  mvp: { mainModule: string; mainWorker: string };
  eh?: { mainModule: string; mainWorker: string };
}

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

export class DuckDBWasmDataModel extends SqlDataModel {
  protected wasmDb: duckdb.AsyncDuckDB;
  protected wasmConn: duckdb.AsyncDuckDBConnection;

  protected constructor(
    schema: Schema[],
    table: string,
    wasmDb: duckdb.AsyncDuckDB,
    wasmConn: duckdb.AsyncDuckDBConnection,
  ) {
    super(schema, table);
    this.wasmDb = wasmDb;
    this.wasmConn = wasmConn;
  }

  static async create(schema: Schema[], table: string, bundles: DuckDBWasmBundles = DEFAULT_BUNDLES): Promise<DuckDBWasmDataModel> {
    const bundle = await duckdb.selectBundle({
      mvp: {mainModule: bundles.mvp.mainModule, mainWorker: bundles.mvp.mainWorker},
      eh: bundles.eh ? {mainModule: bundles.eh.mainModule, mainWorker: bundles.eh.mainWorker} : undefined,
    });

    // If the worker script is served from a cross-origin CDN, `new Worker(url)` will fail due to
    // same-origin policy. In that case, use a blob workaround with an absolute URL
    // (relative paths don't resolve inside blob workers):
    //   const absoluteUrl = new URL(bundle.mainWorker!, window.location.origin).href;
    //   const workerUrl = URL.createObjectURL(
    //     new Blob([`importScripts("${absoluteUrl}");`], { type: "text/javascript" })
    //   );
    //   const worker = new Worker(workerUrl);
    //   URL.revokeObjectURL(workerUrl);
    const worker = new Worker(bundle.mainWorker!);
    const logger = new duckdb.ConsoleLogger();
    const db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

    const conn = await db.connect();

    const colDefs = schema.map((s) => {
      const sqlType = s.type === "measure" ? "DOUBLE" : "VARCHAR";
      return `"${s.name}" ${sqlType}`;
    });
    const ddl = `CREATE TABLE "${table}" (${colDefs.join(", ")})`;
    await conn.query(ddl);

    return new DuckDBWasmDataModel(schema, table, db, conn);
  }

  protected runSQL(sql: string): Promise<Record<string, any>[]> {
    return this.wasmConn.query(sql).then(result => result.toArray().map(row => row.toJSON()));
  }

  async loadData(data: any[][]): Promise<void> {
    const numCols = this.schema.length;
    const numRows = data[0]?.length ?? 0;
    if (numRows === 0) return;

    const placeholders = this.schema.map(() => "?").join(", ");
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
}
