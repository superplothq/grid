import * as duckdb from "@duckdb/duckdb-wasm";
import * as arrow from "apache-arrow";
import { SqlDataSource } from "./sql-datasource";

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

export class DuckDBWasmDataSource extends SqlDataSource {
  private wasmDb: duckdb.AsyncDuckDB;
  private wasmConn: duckdb.AsyncDuckDBConnection;

  private constructor(wasmDb: duckdb.AsyncDuckDB, wasmConn: duckdb.AsyncDuckDBConnection) {
    super();
    this.wasmDb = wasmDb;
    this.wasmConn = wasmConn;
  }

  static async create(bundles: DuckDBWasmBundles = DEFAULT_BUNDLES): Promise<DuckDBWasmDataSource> {
    const bundle = await duckdb.selectBundle({
      mvp: { mainModule: bundles.mvp.mainModule, mainWorker: bundles.mvp.mainWorker },
      eh: bundles.eh ? { mainModule: bundles.eh.mainModule, mainWorker: bundles.eh.mainWorker } : undefined,
    });

    const worker = new Worker(bundle.mainWorker!);
    // TODO: enable console logging only for dev mode
    // const logger = new duckdb.ConsoleLogger();
    const logger = new duckdb.VoidLogger();
    const db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

    const conn = await db.connect();

    return new DuckDBWasmDataSource(db, conn);
  }

  execute(sql: string): Promise<Record<string, any>[]> {
    return this.wasmConn.query(sql).then(result => result.toArray().map(row => row.toJSON()));
  }

  protected async insertArrowTable(table: arrow.Table, name: string): Promise<void> {
    await this.wasmConn.insertArrowTable(table, { name, create: false });
  }

  async release(): Promise<void> {
    this.refCount--;
    if (this.refCount <= 0) {
      await this.wasmConn.close();
      await this.wasmDb.terminate();
    }
  }
}
