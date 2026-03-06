import duckdb from "duckdb";
import {SqlDataModel, schemaToSqlType, schemaToPlaceholder} from "./sql-datamodel";
import {
  Schema,
} from "./types";

export class DuckDBDataModel extends SqlDataModel {
  protected db: duckdb.Database;
  protected conn: duckdb.Connection;

  protected constructor(schema: Schema[], table: string, db: duckdb.Database, conn: duckdb.Connection) {
    super(schema, table);
    this.db = db;
    this.conn = conn;
  }

  // TODO if the table already exists, `CREATE TABLE` statement will throw an error. Decide among -
  //      CREATE OR REPLACE TABLE
  //      CREATE TABLE IF NOT EXISTS
  //      or current behavior
  static async create(schema: Schema[], table: string): Promise<DuckDBDataModel> {
    const db = new duckdb.Database(":memory:");
    const conn = new duckdb.Connection(db);

    // TODO ability to define duckdb specific schema from outside
    const colDefs = schema.map((s) => `"${s.name}" ${schemaToSqlType(s)}`);
    const ddl = `CREATE TABLE "${table}" (${colDefs.join(", ")})`;

    await new Promise<void>((resolve, reject) => {
      conn.run(ddl, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });

    return new DuckDBDataModel(schema, table, db, conn);
  }

  async loadData(data: any[][], replace: Map<string, Map<string, string>> = new Map()): Promise<void> {
    const numCols = this.schema.length;
    const numRows = data[0]?.length ?? 0;
    if (numRows === 0) return;

    const stmt = await new Promise<duckdb.Statement>((resolve, reject) => {
      const placeholders = this.schema.map((s) =>
        schemaToPlaceholder(s, replace.get(s.name) ?? new Map())
      ).join(", ");
      const sql = `INSERT INTO "${this.table}" VALUES (${placeholders})`;
      this.conn.prepare(sql, (err: Error | null, stmt: duckdb.Statement) => {
        if (err) reject(err);
        else resolve(stmt);
      });
    });

    for (let r = 0; r < numRows; r++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row: any[] = [];
      for (let c = 0; c < numCols; c++) {
        row.push(data[c][r]);
      }
      await new Promise<void>((resolve, reject) => {
        stmt.run(...row, (err: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    await new Promise<void>((resolve, reject) => {
      stmt.finalize((err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected runSQL(sql: string): Promise<Record<string, any>[]> {
    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.conn.all(sql, (err: Error | null, rows: Record<string, any>[]) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
}
