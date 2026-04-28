import { StandardTableDataModel } from "./standard-table-datamodel";
import { SqlDataSource } from "./sql-datasource";
import { DataSchema, DatePartScalarFilter, ColumnRangeValues, StandardTableConfig, GetRowsIR, GetRowsResponse, ScalarFilter, SortEntry } from "./types";

export class SqlStandardTableDataModel extends StandardTableDataModel {
  protected table: string;
  protected dataSource: SqlDataSource;

  constructor(config: Partial<StandardTableConfig>, dataSchema: DataSchema[], dataSource: SqlDataSource) {
    super(dataSchema, config);
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
    const depth = ir.groupPath.length;
    const isGroupLevel = depth < ir.groupBy.length;
    const groupField = isGroupLevel ? ir.groupBy[depth] : null;

    const measureCols = ir.project.filter((p) => {
      if (p === groupField) return false;
      const def = this.getColumn(p);
      return def && def.aggregateFn;
    });
    const outputColumns = isGroupLevel
      ? [groupField!, ...measureCols]
      : ir.project;

    const rowData = this.toColumnMajor(rows, outputColumns);

    return { rowData, totalRowCount };
  }

  async getRangeOfColumn(field: string): Promise<ColumnRangeValues> {
    const schema = this.getColumn(field);

    if (schema.type === "measure") {
      const sql = `SELECT MIN("${field}") AS min_val, MAX("${field}") AS max_val FROM "${this.table}"`;
      const rows = await this.dataSource.execute(sql);
      return { type: "range", min: Number(rows[0].min_val), max: Number(rows[0].max_val) };
    }

    if (schema.subtype === "temporal") {
      const sql = `SELECT MIN("${field}") AS min_val, MAX("${field}") AS max_val FROM "${this.table}"`;
      const rows = await this.dataSource.execute(sql);
      return { type: "temporal", min: String(rows[0].min_val), max: String(rows[0].max_val) };
    }

    const sql = `SELECT DISTINCT "${field}" FROM "${this.table}" ORDER BY "${field}"`;
    const rows = await this.dataSource.execute(sql);
    return { type: "categorical", values: rows.map((r) => String(r[field])) };
  }

  private buildSQL(ir: GetRowsIR): string {
    const depth = ir.groupPath.length;
    const isGroupLevel = depth < ir.groupBy.length;
    const whereClauses: string[] = [];

    for (let i = 0; i < ir.groupPath.length; i++) {
      const field = ir.groupBy[i];
      const value = ir.groupPath[i];
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
        const def = this.getColumn(field);
        if (!def.aggregateFn) continue;
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
        const def = this.getColumn(s.by);
        const agg = def.aggregateFn ?? "sum";
        parts.push(`${agg.toUpperCase()}("${s.by}") ${s.direction.toUpperCase()}`);
      } else if (isGroupLevel) {
        if (s.field === groupField) {
          parts.push(`"${s.field}" ${s.direction.toUpperCase()}`);
        } else {
          const def = this.getColumn(s.field);
          if (def.aggregateFn) {
            parts.push(`${def.aggregateFn.toUpperCase()}("${s.field}") ${s.direction.toUpperCase()}`);
          }
        }
      } else {
        parts.push(`"${s.field}" ${s.direction.toUpperCase()}`);
      }
    }

    if (parts.length > 0) return ` ORDER BY ${parts.join(", ")}`;
    if (groupField) return ` ORDER BY "${groupField}"`;
    return "";
  }

  private buildFilterClause(f: ScalarFilter): string {
    if (f.subtype === "date") {
      return this.buildDatePartFilterClause(f as DatePartScalarFilter);
    }

    switch (f.op) {
    case "eq": return `"${f.field}" = '${this.escapeSQL(String(f.value))}'`;
    case "neq": return `"${f.field}" != '${this.escapeSQL(String(f.value))}'`;
    case "gt": return `"${f.field}" > ${f.value}`;
    case "lt": return `"${f.field}" < ${f.value}`;
    case "gte": return `"${f.field}" >= ${f.value}`;
    case "lte": return `"${f.field}" <= ${f.value}`;
    case "in": {
      const vals = f.value as string[];
      if (vals.length === 0) return "1=0";
      return `"${f.field}" IN (${vals.map((v) => `'${this.escapeSQL(String(v))}'`).join(", ")})`;
    }
    case "not_in": {
      const vals = f.value as string[];
      if (vals.length === 0) return "1=1";
      return `"${f.field}" NOT IN (${vals.map((v) => `'${this.escapeSQL(String(v))}'`).join(", ")})`;
    }
    case "contains": return `"${f.field}" LIKE '%${this.escapeSQL(String(f.value))}%'`;
    case "doesNotContain": return `"${f.field}" NOT LIKE '%${this.escapeSQL(String(f.value))}%'`;
    case "startsWith": return `"${f.field}" LIKE '${this.escapeSQL(String(f.value))}%'`;
    case "endsWith": return `"${f.field}" LIKE '%${this.escapeSQL(String(f.value))}'`;
    case "empty": return `"${f.field}" IS NULL`;
    case "notEmpty": return `"${f.field}" IS NOT NULL`;
    case "before": return `"${f.field}" < '${this.escapeSQL(String(f.value))}'`;
    case "after": return `"${f.field}" > '${this.escapeSQL(String(f.value))}'`;
    case "between": return `"${f.field}" BETWEEN '${this.escapeSQL(String((f.value as (string | number)[])[0]))}' AND '${this.escapeSQL(String((f.value as (string | number)[])[1]))}'`;
    default: return "1=1";
    }
  }

  private buildDatePartFilterClause(f: DatePartScalarFilter): string {
    const extract = `EXTRACT(${f.part} FROM "${f.field}")`;
    switch (f.op) {
    case "eq": return `${extract} = ${f.value}`;
    case "neq": return `${extract} != ${f.value}`;
    case "gt": return `${extract} > ${f.value}`;
    case "lt": return `${extract} < ${f.value}`;
    case "gte": return `${extract} >= ${f.value}`;
    case "lte": return `${extract} <= ${f.value}`;
    case "between": return `${extract} BETWEEN ${(f.value as number[])[0]} AND ${(f.value as number[])[1]}`;
    case "in": return `${extract} IN (${(f.value as number[]).join(", ")})`;
    case "not_in": return `${extract} NOT IN (${(f.value as number[]).join(", ")})`;
    case "empty": return `"${f.field}" IS NULL`;
    case "notEmpty": return `"${f.field}" IS NOT NULL`;
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
