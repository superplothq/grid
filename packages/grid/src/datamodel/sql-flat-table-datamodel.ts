import { FlatTableDataModel } from "./flat-table-datamodel";
import { SqlDataSource } from "./sql-datasource";
import { DataSchema, FlatTableConfig, GetRowsIR, GetRowsResponse, SortEntry } from "./types";

export class SqlFlatTableDataModel extends FlatTableDataModel {
  protected table: string;
  protected dataSchema: DataSchema[];
  protected dataSource: SqlDataSource;

  constructor(config: FlatTableConfig, dataSchema: DataSchema[], dataSource: SqlDataSource) {
    super(config);
    this.dataSchema = dataSchema;
    this.dataSource = dataSource;
    this.table = dataSource.table;
  }

  async getData(ir: GetRowsIR): Promise<GetRowsResponse> {
    const sql = this.buildSQL(ir);
    const rows = await this.dataSource.execute(sql);

    if (rows.length === 0) {
      return { rowData: ir.project.map(() => []), totalRowCount: 0 };
    }

    const totalRowCount = Number(rows[0].__total__);
    const depth = ir.select.length;
    const isGroupLevel = depth < ir.groupBy.length;
    const groupField = isGroupLevel ? ir.groupBy[depth] : null;

    const measureCols = ir.project.filter((p) => {
      if (p === groupField) return false;
      const def = this.config.schema.find((d) => d.name === p);
      return def && def.aggregateFn;
    });
    const outputColumns = isGroupLevel
      ? [groupField!, ...measureCols]
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

      for (const field of ir.project) {
        if (field === groupField) continue;
        const def = this.config.schema.find((d) => d.name === field);
        if (!def || !def.aggregateFn) continue;
        const agg = def.aggregateFn!;
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
        const agg = def?.aggregateFn ?? "sum";
        parts.push(`${agg.toUpperCase()}("${s.by}") ${s.direction.toUpperCase()}`);
      } else {
        parts.push(`"${s.field}" ${s.direction.toUpperCase()}`);
      }
    }

    return parts.length > 0 ? ` ORDER BY ${parts.join(", ")}` : "";
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any[][] = filtered.map(() => []);
    for (const row of rows) {
      for (let i = 0; i < filtered.length; i++) {
        const val = row[filtered[i]];
        result[i].push(typeof val === "bigint" ? Number(val) : val);
      }
    }
    return result;
  }

  private escapeSQL(value: string): string {
    return value.replace(/'/g, "''");
  }
}
