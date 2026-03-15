import * as duckdb from "@duckdb/duckdb-wasm";
import { FlatTableDataModel } from "./flat-table-datamodel";
import { FlatTableConfig, GetRowsIR, GetRowsResponse, GridData, MeasureSchema, Schema, SortEntry } from "./types";
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

export class DuckDBWasmFlatTableDataModel extends FlatTableDataModel {
  private wasmDb: duckdb.AsyncDuckDB;
  private wasmConn: duckdb.AsyncDuckDBConnection;
  private table: string;
  private dataSchema: Schema[];

  private constructor(
    config: FlatTableConfig,
    dataSchema: Schema[],
    table: string,
    wasmDb: duckdb.AsyncDuckDB,
    wasmConn: duckdb.AsyncDuckDBConnection,
  ) {
    super(config);
    this.dataSchema = dataSchema;
    this.table = table;
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
      const row: any[] = [];
      for (let c = 0; c < numCols; c++) {
        row.push(data[c][r]);
      }
      await stmt.query(...row);
    }
    await stmt.close();
  }

  async getData(ir: GetRowsIR): Promise<GetRowsResponse> {
    const sql = this.buildSQL(ir);
    const rows = await this.runSQL(sql);

    if (rows.length === 0) {
      return { rowData: ir.project.map(() => []), totalRowCount: 0 };
    }

    const totalRowCount = rows[0].__total__ as number;
    const depth = ir.select.length;
    const isGroupLevel = depth < ir.groupBy.length;
    const groupField = isGroupLevel ? ir.groupBy[depth] : null;

    const outputColumns = isGroupLevel
      ? [groupField!, "__count__", ...ir.project.filter((p) => p !== groupField)]
      : ir.project;

    const rowData = this.toColumnMajor(rows, outputColumns);

    return { rowData, totalRowCount };
  }

  private buildSQL(ir: GetRowsIR): string {
    const depth = ir.select.length;
    const isGroupLevel = depth < ir.groupBy.length;
    const whereClauses: string[] = [];

    for (let i = 0; i < ir.select.length; i++) {
      const field = ir.groupBy[i];
      const value = ir.select[i];
      whereClauses.push(`"${field}" = '${this.escapeSQL(String(value))}'`);
    }

    if (ir.filter) {
      for (const f of ir.filter) {
        whereClauses.push(this.buildFilterClause(f));
      }
    }

    const whereStr = whereClauses.length > 0 ? ` WHERE ${whereClauses.join(" AND ")}` : "";

    if (isGroupLevel) {
      const groupField = ir.groupBy[depth];
      const measureExprs: string[] = [];
      const measureFields = ir.project.filter((p) => p !== groupField);

      for (const field of measureFields) {
        const def = this.config.schema.find((d) => d.name === field);
        const agg = (def as MeasureSchema)?.aggregateFn ?? "sum";
        measureExprs.push(`${agg.toUpperCase()}("${field}") AS "${field}"`);
      }

      const selectParts = [
        `"${groupField}"`,
        "COUNT(*) AS __count__",
        ...measureExprs,
        "COUNT(*) OVER() AS __total__",
      ];

      const orderParts = this.buildOrderClause(ir.sort, groupField, true);

      return `SELECT ${selectParts.join(", ")} FROM "${this.table}"${whereStr} GROUP BY "${groupField}"${orderParts} LIMIT ${ir.endRow - ir.startRow} OFFSET ${ir.startRow}`;
    }

    const selectParts = [
      ...ir.project.map((p) => `"${p}"`),
      "COUNT(*) OVER() AS __total__",
    ];

    const orderParts = this.buildOrderClause(ir.sort, null, false);

    return `SELECT ${selectParts.join(", ")} FROM "${this.table}"${whereStr}${orderParts} LIMIT ${ir.endRow - ir.startRow} OFFSET ${ir.startRow}`;
  }

  private buildOrderClause(sort: SortEntry[], groupField: string | null, isGroupLevel: boolean): string {
    if (!sort || sort.length === 0) {
      if (groupField) return ` ORDER BY "${groupField}"`;
      return "";
    }

    const parts: string[] = [];
    for (const s of sort) {
      if (s.direction === "noop") continue;
      if (isGroupLevel && s.by) {
        const def = this.config.schema.find((d) => d.name === s.by);
        const agg = (def as MeasureSchema)?.aggregateFn ?? "sum";
        parts.push(`${agg.toUpperCase()}("${s.by}") ${s.direction.toUpperCase()}`);
      } else {
        parts.push(`"${s.field}" ${s.direction.toUpperCase()}`);
      }
    }

    return parts.length > 0 ? ` ORDER BY ${parts.join(", ")}` : "";
  }

  private buildFilterClause(f: { field: string; op: string; value: any }): string {
    switch (f.op) {
    case "eq": return `"${f.field}" = '${this.escapeSQL(String(f.value))}'`;
    case "neq": return `"${f.field}" != '${this.escapeSQL(String(f.value))}'`;
    case "gt": return `"${f.field}" > ${f.value}`;
    case "lt": return `"${f.field}" < ${f.value}`;
    case "gte": return `"${f.field}" >= ${f.value}`;
    case "lte": return `"${f.field}" <= ${f.value}`;
    case "in": return `"${f.field}" IN (${(f.value as string[]).map((v) => `'${this.escapeSQL(String(v))}'`).join(", ")})`;
    case "not_in": return `"${f.field}" NOT IN (${(f.value as string[]).map((v) => `'${this.escapeSQL(String(v))}'`).join(", ")})`;
    case "contains": return `"${f.field}" LIKE '%${this.escapeSQL(String(f.value))}%'`;
    case "doesNotContain": return `"${f.field}" NOT LIKE '%${this.escapeSQL(String(f.value))}%'`;
    case "startsWith": return `"${f.field}" LIKE '${this.escapeSQL(String(f.value))}%'`;
    case "endsWith": return `"${f.field}" LIKE '%${this.escapeSQL(String(f.value))}'`;
    case "empty": return `"${f.field}" IS NULL`;
    case "notEmpty": return `"${f.field}" IS NOT NULL`;
    case "between": return `"${f.field}" BETWEEN ${(f.value as number[])[0]} AND ${(f.value as number[])[1]}`;
    default: return "1=1";
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toColumnMajor(rows: Record<string, any>[], columns: string[]): any[][] {
    const filtered = columns.filter((c) => c !== "__total__");
    const result: any[][] = filtered.map(() => []);
    for (const row of rows) {
      for (let i = 0; i < filtered.length; i++) {
        result[i].push(row[filtered[i]]);
      }
    }
    return result;
  }

  private runSQL(sql: string): Promise<Record<string, any>[]> {
    return this.wasmConn.query(sql).then((result) => result.toArray().map((row) => row.toJSON()));
  }

  private escapeSQL(value: string): string {
    return value.replace(/'/g, "''");
  }
}
