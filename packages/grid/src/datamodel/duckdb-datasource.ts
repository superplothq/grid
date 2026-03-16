import duckdb from "duckdb";
import * as arrow from "apache-arrow";
import { SqlDataSource } from "./sql-datasource";

export class DuckDBDataSource extends SqlDataSource {
  private db: duckdb.Database;
  private conn: duckdb.Connection;

  private constructor(db: duckdb.Database, conn: duckdb.Connection) {
    super();
    this.db = db;
    this.conn = conn;
  }

  static create(): DuckDBDataSource {
    const db = new duckdb.Database(":memory:");
    const conn = new duckdb.Connection(db);
    return new DuckDBDataSource(db, conn);
  }

  execute(sql: string): Promise<Record<string, any>[]> {
    return new Promise((resolve, reject) => {
      this.conn.all(sql, (err: Error | null, rows: Record<string, any>[]) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  protected async insertArrowTable(table: arrow.Table, name: string): Promise<void> {
    const numCols = table.schema.fields.length;
    const numRows = table.numRows;
    if (numRows === 0) return;

    const placeholders = table.schema.fields.map(() => "?").join(", ");
    const sql = `INSERT INTO "${name}" VALUES (${placeholders})`;

    const stmt = await new Promise<duckdb.Statement>((resolve, reject) => {
      this.conn.prepare(sql, (err: Error | null, stmt: duckdb.Statement) => {
        if (err) reject(err);
        else resolve(stmt);
      });
    });

    for (let r = 0; r < numRows; r++) {
      const row: any[] = [];
      for (let c = 0; c < numCols; c++) {
        row.push(table.getChildAt(c)?.get(r));
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

  async release(): Promise<void> {
    this.refCount--;
    if (this.refCount <= 0) {
      await new Promise<void>((resolve, reject) => {
        this.db.close((err: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }
}
