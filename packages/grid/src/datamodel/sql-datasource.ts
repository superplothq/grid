import * as arrow from "apache-arrow";
import { DataSource, SqlColumnType } from "./datasource";

let tableCounter = 0;
function generateTableName(): string {
  return `__ds__${tableCounter++}`;
}

function buildCreateTableDDL(table: string, columns: Map<string, SqlColumnType>): string {
  const colDefs: string[] = [];
  for (const [name, type] of columns) {
    colDefs.push(`"${name}" ${type}`);
  }
  return `CREATE TABLE "${table}" (${colDefs.join(", ")})`;
}

export abstract class SqlDataSource implements DataSource<string> {
  table!: string;
  protected refCount = 1;

  abstract execute(sql: string): Promise<Record<string, any>[]>;

  async loadData(opts: {
    table?: string;
    columns: Map<string, SqlColumnType>;
    data: any[][];
  }): Promise<void> {
    this.table = opts.table ?? generateTableName();

    const ddl = buildCreateTableDDL(this.table, opts.columns);
    await this.execute(ddl);

    const numRows = opts.data[0]?.length ?? 0;
    if (numRows === 0) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const columns: Record<string, any> = {};
    let colIdx = 0;
    for (const [name, type] of opts.columns) {
      if (type === "DOUBLE") {
        columns[name] = new Float64Array(opts.data[colIdx]);
      } else {
        columns[name] = opts.data[colIdx];
      }
      colIdx++;
    }

    const arrowTable = arrow.tableFromArrays(columns);
    await this.insertArrowTable(arrowTable, this.table);
  }

  protected abstract insertArrowTable(table: arrow.Table, name: string): Promise<void>;

  addRef(): void {
    this.refCount++;
  }

  abstract release(): Promise<void>;
}
