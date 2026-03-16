import duckdb from "duckdb";
import { SqlFlatTableDataModel } from "./sql-flat-table-datamodel";
import { FlatTableConfig, Schema } from "./types";
import { schemaToSqlType, schemaToPlaceholder } from "./sql-pivot-datamodel";

export class DuckDBFlatTableDataModel extends SqlFlatTableDataModel {
  private db: duckdb.Database;
  private conn: duckdb.Connection;

  protected constructor(config: FlatTableConfig, dataSchema: Schema[], table: string, db: duckdb.Database, conn: duckdb.Connection) {
    super(config, dataSchema, table);
    this.db = db;
    this.conn = conn;
  }

  static async create(config: FlatTableConfig, dataSchema: Schema[], table: string): Promise<DuckDBFlatTableDataModel> {
    const db = new duckdb.Database(":memory:");
    const conn = new duckdb.Connection(db);

    const colDefs = dataSchema.map((s) => `"${s.name}" ${schemaToSqlType(s)}`);
    const ddl = `CREATE TABLE "${table}" (${colDefs.join(", ")})`;

    await new Promise<void>((resolve, reject) => {
      conn.run(ddl, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });

    return new DuckDBFlatTableDataModel(config, dataSchema, table, db, conn);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async loadData(data: any[][]): Promise<void> {
    const numCols = this.dataSchema.length;
    const numRows = data[0]?.length ?? 0;
    if (numRows === 0) return;

    const placeholders = this.dataSchema.map((s) =>
      schemaToPlaceholder(s, new Map())
    ).join(", ");
    const sql = `INSERT INTO "${this.table}" VALUES (${placeholders})`;

    const stmt = await new Promise<duckdb.Statement>((resolve, reject) => {
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
