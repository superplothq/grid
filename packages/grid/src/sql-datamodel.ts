import {GridDataModel} from "./grid-datamodel";
import {
  Schema,
  MeasureSchema,
  Filter,
  FacetQuery,
  PivotQuery,
  PivotGroupResult,
  ROLLUP_MARKER,
} from "./types";

export abstract class SqlDataModel extends GridDataModel {
  protected constructor(schema: Schema[], table: string) {
    super(schema, table);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected abstract runSQL(sql: string): Promise<Record<string, any>[]>;

  private buildWhereClause(filters?: Filter[]): string {
    if (!filters || filters.length === 0) return "";
    const clauses = filters.map(f => {
      const col = `"${f.field}"`;
      switch (f.op) {
      case "eq": return `${col} = '${f.value}'`;
      case "neq": return `${col} != '${f.value}'`;
      case "in": return `${col} IN (${(f.value as string[]).map(v => `'${v}'`).join(",")})`;
      case "not_in": return `${col} NOT IN (${(f.value as string[]).map(v => `'${v}'`).join(",")})`;
      }
    });
    return " WHERE " + clauses.join(" AND ");
  }

  async resolveFacetValues(query: FacetQuery): Promise<string[][]> {
    const where = this.buildWhereClause(query.filters);

    if (query.mode === "distinct") {
      const result: string[][] = [];
      for (const field of query.fields) {
        const sql = `SELECT "${field}" FROM "${this.table}"${where} GROUP BY "${field}" ORDER BY MIN(rowid)`;
        const rows = await this.runSQL(sql);
        result.push(rows.map(r => String(r[field])));
      }
      return result;
    }

    // mode === "group"
    const fieldList = query.fields.map(f => `"${f}"`).join(", ");
    const sql = `SELECT ${fieldList} FROM "${this.table}"${where} GROUP BY ${fieldList} ORDER BY MIN(rowid)`;
    const rows = await this.runSQL(sql);
    return query.fields.map(f => rows.map(r => String(r[f])));
  }

  async getData(query: PivotQuery): Promise<PivotGroupResult[]> {
    const results: PivotGroupResult[] = [];

    for (const group of query.groups) {
      const allFilters = [...(query.filters ?? []), ...(group.filters ?? [])];
      const where = this.buildWhereClause(allFilters.length > 0 ? allFilters : undefined);

      if (group.groupingSets) {
        results.push(await this.getGroupingSetsData(group, where));
        continue;
      }

      const dimSelect = group.dimensions.map(d => `"${d}"`);
      const measureSelect = group.measures.map(m => {
        const agg = m.aggregation.toUpperCase();
        return `${agg}("${m.field}") AS "${m.field}"`;
      });

      const selectClause = [...dimSelect, ...measureSelect].join(", ");
      const groupByClause = group.dimensions.length > 0
        ? ` GROUP BY ${dimSelect.join(", ")}`
        : "";

      const orderBy = group.dimensions.length > 0 ? " ORDER BY MIN(rowid)" : "";
      const sql = `SELECT ${selectClause} FROM "${this.table}"${where}${groupByClause}${orderBy}`;
      const rows = await this.runSQL(sql);

      const columns = [...group.dimensions, ...group.measures.map(m => m.field)];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any[][] = columns.map((col, i) => {
        if (i < group.dimensions.length) {
          return rows.map(r => String(r[col]));
        }
        return rows.map(r => r[col]);
      });

      results.push({ columns, data });
    }

    return results;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async getGroupingSetsData(group: PivotQuery["groups"][0], where: string): Promise<PivotGroupResult> {
    const dims = group.dimensions;
    const dimSelect = dims.map(d => `"${d}"`);
    const measureSelect = group.measures.map(m => {
      const agg = m.aggregation.toUpperCase();
      return `${agg}("${m.field}") AS "${m.field}"`;
    });

    const groupingExpr = `GROUPING(${dimSelect.join(", ")}) AS "_grp"`;
    const selectClause = [...dimSelect, groupingExpr, ...measureSelect].join(", ");
    const sets = group.groupingSets!.map(set =>
      set.length === 0 ? "()" : `(${set.map(d => `"${d}"`).join(", ")})`
    ).join(", ");
    const groupByClause = ` GROUP BY GROUPING SETS (${sets})`;

    const sql = `SELECT ${selectClause} FROM "${this.table}"${where}${groupByClause} ORDER BY MIN(rowid)`;
    const rows = await this.runSQL(sql);

    const columns = [...dims, ...group.measures.map(m => m.field)];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any[][] = columns.map(() => []);

    for (const row of rows) {
      const grp = Number(row["_grp"]);
      const allRolledUp = grp === (1 << dims.length) - 1;

      for (let i = 0; i < dims.length; i++) {
        if (grp & (1 << (dims.length - 1 - i))) {
          data[i].push(allRolledUp && i === 0 ? ROLLUP_MARKER : "");
        } else {
          data[i].push(String(row[dims[i]]));
        }
      }

      for (let i = 0; i < group.measures.length; i++) {
        data[dims.length + i].push(row[group.measures[i].field]);
      }
    }

    return { columns, data };
  }

  protected getAggregation(fieldName: string): string {
    const col = this.schema.find((s) => s.name === fieldName);
    if (col && col.type === "measure") {
      return (col as MeasureSchema).aggregateFn ?? "sum";
    }
    return "sum";
  }
}
