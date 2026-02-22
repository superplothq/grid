import { GridDataModel } from "./grid-datamodel";
import {
  DimSpec,
  FacetQuery,
  Filter,
  IR,
  MeasureSchema,
  RawDataFromIR,
  Schema,
} from "./types";

/*
 * SqlDataModel translates an IR (DimSpec tree + measures) into a single SQL query.
 *
 * The core idea: each DimSpec node becomes a CTE that produces a dimension table,
 * and these CTEs compose into each other following the tree structure:
 *
 *   simple("region")           → CTE: SELECT "region" FROM T GROUP BY "region"
 *   hierarchy("region","city") → CTE: SELECT "region","city" FROM T GROUP BY "region","city"
 *   cross(A, B)                → CTE: SELECT * FROM <A_cte> CROSS JOIN <B_cte>
 *   concat(A, B)               → CTE: SELECT ... FROM <A_cte> UNION ALL SELECT ... FROM <B_cte>
 *
 * The final CTE is the complete dimension grid. The query LEFT JOINs this grid with the
 * source table and aggregates measures, producing one row per dimension combination
 * (with NULLs for missing combos — a natural result of LEFT JOIN).
 *
 * Example: cross(simple("region"), simple("dept")), measures=[sum(revenue)]
 *
 *   WITH __d__0 AS (SELECT "region", MIN(rowid) AS "__ord__0" FROM T GROUP BY "region"),
 *        __d__1 AS (SELECT "dept", MIN(rowid) AS "__ord__1" FROM T GROUP BY "dept"),
 *        __d__2 AS (SELECT * FROM __d__0 CROSS JOIN __d__1)
 *   SELECT __d__2."region", __d__2."dept", SUM(T."revenue") AS "revenue"
 *   FROM __d__2 LEFT JOIN T ON T."region"=__d__2."region" AND T."dept"=__d__2."dept"
 *   GROUP BY __d__2."region", __d__2."dept"
 *   ORDER BY MIN(__d__2."__ord__0"), MIN(__d__2."__ord__1")
 *
 * Concat is special: children may have different fields, so they get aliased to shared
 * column names (__c__0, __c__1, ...) with NULL padding for shorter branches. A synthetic
 * __src__ column tracks which branch each row came from, enabling conditional JOIN logic:
 *
 *   ON ("__src__0" = '0:dept' AND T."dept" = _grid."__c__0")
 *   OR ("__src__0" = '1:channel' AND T."channel" = _grid."__c__0")
 *
 * Ordering: each leaf CTE captures MIN(rowid) as an __ord__ column, preserving insertion
 * order from the source table. Concat adds an __src__ ordering column so branches appear
 * in definition order. The final ORDER BY follows the tree traversal order, ensuring
 * the result is in row-major order (row dims first, then col dims).
 */
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

  async getData(branch: IR): Promise<RawDataFromIR> {
    const { dimSpec, measures } = branch;

    if (dimSpec.type === "none") {
      const measureSelect = measures.map(m => {
        const agg = m.aggregation.toUpperCase();
        return `${agg}("${m.field}") AS "${m.field}"`;
      });
      const sql = `SELECT ${measureSelect.join(", ")} FROM "${this.table}"`;
      const rows = await this.runSQL(sql);
      const columns = measures.map(m => m.field);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any[][] = columns.map(col => rows.map(r => r[col]));
      return { columns, data };
    }

    const counter = { n: 0 };
    const srcCounter = { n: 0 };
    const concatFieldCounter = { n: 0 };
    const cteResult = this.generateCTEs(dimSpec, counter, srcCounter, concatFieldCounter);
    const gridCte = cteResult.cteName;

    const allCTEs = cteResult.ctes;
    const dimFields = cteResult.fields;
    const srcColumns = cteResult.srcColumns;

    const dimSelect = dimFields.map(f => `${gridCte}."${f}"`);
    const measureSelect = measures.map(m => {
      const agg = m.aggregation.toUpperCase();
      return `${agg}(T."${m.field}") AS "${m.field}"`;
    });

    const selectClause = [...dimSelect, ...measureSelect].join(", ");

    const joinConditions = this.buildJoinConditions(dimSpec, gridCte, cteResult);
    const joinClause = joinConditions.length > 0 ? ` ON ${joinConditions.join(" AND ")}` : " ON 1=1";

    const groupByParts = [...dimSelect];
    for (const src of srcColumns) {
      groupByParts.push(`${gridCte}."${src}"`);
    }
    const groupByClause = groupByParts.length > 0 ? ` GROUP BY ${groupByParts.join(", ")}` : "";

    // orderExprs preserves insertion order from the source table.
    // "ord" exprs are __ord__ columns (MIN(rowid) from leaf CTEs). They're not in the GROUP BY,
    // so they need MIN() wrapping to satisfy SQL aggregation rules.
    // "src" exprs are __src__ columns from concat — already in the GROUP BY, so used directly.
    // e.g. cross(simple("region"), concat(simple("dept"), simple("channel"))) →
    //   ORDER BY MIN(__d__4."__ord__0"), __d__4."__src__0", MIN(__d__4."__cord__0")
    //   (by region, then concat branch, then value within branch)
    const orderParts: string[] = [];
    for (const oe of cteResult.orderExprs) {
      if (oe.type === "src") {
        orderParts.push(`${gridCte}."${oe.expr}"`);
      } else {
        orderParts.push(`MIN(${gridCte}."${oe.expr}")`);
      }
    }
    const orderByClause = orderParts.length > 0 ? ` ORDER BY ${orderParts.join(", ")}` : "";

    const sql = `WITH ${allCTEs.join(",\n     ")}\nSELECT ${selectClause}\nFROM ${gridCte}\nLEFT JOIN "${this.table}" T${joinClause}${groupByClause}${orderByClause}`;

    const rows = await this.runSQL(sql);
    const columns = [...dimFields, ...measures.map(m => m.field)];
    if (srcColumns.length > 0) {
      columns.push(...srcColumns);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any[][] = columns.map((col, i) => {
      if (i < dimFields.length) {
        return rows.map(r => r[col] == null ? null : String(r[col]));
      }
      if (i >= dimFields.length + measures.length) {
        return rows.map(r => r[col] == null ? null : String(r[col]));
      }
      return rows.map(r => r[col]);
    });

    return { columns, data };
  }

  // Recursively walks the DimSpec tree and produces CTE definitions in dependency order.
  // Returns a CTEResult where:
  //   cteName — the root CTE (the one getData LEFT JOINs against)
  //   ctes    — flat list of all CTE definitions, leaves first, root last
  //
  // e.g. cross(simple("region"), simple("dept")) →
  //   cteName: "__d__2"
  //   ctes: [
  //     '__d__0 AS (SELECT "region", ... GROUP BY "region")',   -- leaf
  //     '__d__1 AS (SELECT "dept", ... GROUP BY "dept")',       -- leaf
  //     '__d__2 AS (SELECT * FROM __d__0 CROSS JOIN __d__1)',   -- root
  //   ]
  //
  // The remaining fields (fields, orderExprs, srcColumns, concatInfos) describe the
  // root CTE's output shape — what columns it produces and how to join/order against them.
  private generateCTEs(
    spec: DimSpec,
    counter: { n: number },
    srcCounter: { n: number },
    concatFieldCounter: { n: number },
  ): CTEResult {
    switch (spec.type) {
    case "simple": {
      const name = `__d__${counter.n++}`;
      const ordCol = `__ord__${counter.n - 1}`;
      const cte = `${name} AS (SELECT "${spec.field}", MIN(rowid) AS "${ordCol}" FROM "${this.table}" GROUP BY "${spec.field}")`;
      return {
        cteName: name,
        ctes: [cte],
        fields: [spec.field],
        orderExprs: [{ type: "ord", expr: ordCol }],
        srcColumns: [],
        concatInfos: [],
      };
    }

    case "hierarchy": {
      const name = `__d__${counter.n++}`;
      const ordCol = `__ord__${counter.n - 1}`;
      const fieldList = spec.fields.map(f => `"${f}"`).join(", ");
      const cte = `${name} AS (SELECT ${fieldList}, MIN(rowid) AS "${ordCol}" FROM "${this.table}" GROUP BY ${fieldList})`;
      return {
        cteName: name,
        ctes: [cte],
        fields: [...spec.fields],
        orderExprs: [{ type: "ord", expr: ordCol }],
        srcColumns: [],
        concatInfos: [],
      };
    }

    case "cross": {
      const childResults = spec.children.map(c => this.generateCTEs(c, counter, srcCounter, concatFieldCounter));
      const allCTEs: string[] = [];
      const allFields: string[] = [];
      const allOrderExprs: OrderExpr[] = [];
      const allSrcColumns: string[] = [];
      const allConcatInfos: ConcatInfo[] = [];

      for (const child of childResults) {
        allCTEs.push(...child.ctes);
        allFields.push(...child.fields);
        allOrderExprs.push(...child.orderExprs);
        allSrcColumns.push(...child.srcColumns);
        allConcatInfos.push(...child.concatInfos);
      }

      if (childResults.length === 1) {
        return childResults[0];
      }

      const gridName = `__d__${counter.n++}`;
      const joinParts = childResults.map(c => c.cteName).join(" CROSS JOIN ");
      const gridCte = `${gridName} AS (SELECT * FROM ${joinParts})`;
      allCTEs.push(gridCte);

      return {
        cteName: gridName,
        ctes: allCTEs,
        fields: allFields,
        orderExprs: allOrderExprs,
        srcColumns: allSrcColumns,
        concatInfos: allConcatInfos,
      };
    }

    case "concat": {
      const childResults = spec.children.map(c => this.generateCTEs(c, counter, srcCounter, concatFieldCounter));

      const maxFields = Math.max(
        ...childResults.map(c => c.fields.length)
      );
      const cfBase = concatFieldCounter.n;
      concatFieldCounter.n += maxFields;
      const concatFields = Array.from({ length: maxFields }, (_, i) => `__c__${cfBase + i}`);

      const srcCol = this.srcColName(srcCounter.n);
      srcCounter.n++;
      const cordCol = `__cord__${srcCounter.n - 1}`;

      const concatName = `__d__${counter.n++}`;
      const unionParts: string[] = [];

      const concatInfo: ConcatInfo = { srcColumn: srcCol, branches: [] };

      for (let ci = 0; ci < childResults.length; ci++) {
        const childResult = childResults[ci];

        const srcValue = `${ci}:${childResult.fields.join(",")}`;
        const fieldMap: Record<string, string> = {};
        const selectParts: string[] = [`'${srcValue}' AS "${srcCol}"`];

        for (let fi = 0; fi < maxFields; fi++) {
          if (fi < childResult.fields.length) {
            selectParts.push(`${childResult.cteName}."${childResult.fields[fi]}" AS "${concatFields[fi]}"`);
            fieldMap[concatFields[fi]] = childResult.fields[fi];
          } else {
            selectParts.push(`NULL AS "${concatFields[fi]}"`);
          }
        }

        const ordExpr = childResult.orderExprs.length > 0 ? childResult.orderExprs[0].expr : "0";
        selectParts.push(`${ordExpr} AS "${cordCol}"`);

        unionParts.push(`SELECT ${selectParts.join(", ")} FROM ${childResult.cteName}`);
        concatInfo.branches.push({ srcValue, fieldMap });
      }

      const cte = `${concatName} AS (\n       ${unionParts.join("\n       UNION ALL\n       ")}\n     )`;

      return {
        cteName: concatName,
        ctes: [...childResults.flatMap(c => c.ctes), cte],
        fields: concatFields,
        orderExprs: [{ type: "src", expr: srcCol }, { type: "ord", expr: cordCol }],
        srcColumns: [srcCol],
        concatInfos: [concatInfo],
      };
    }
    default:
      throw new Error(`Unexpected DimSpec type: ${(spec as DimSpec).type}`);
    }
  }

  private buildJoinConditions(
    spec: DimSpec,
    gridCte: string,
    cteResult: CTEResult,
  ): string[] {
    if (cteResult.concatInfos.length === 0) {
      return cteResult.fields.map(f => `T."${f}" = ${gridCte}."${f}"`);
    }

    const nonConcatFields: string[] = [];
    const concatInfos = cteResult.concatInfos;

    this.collectNonConcatFields(spec, cteResult, nonConcatFields);

    const conditions: string[] = [];
    for (const f of nonConcatFields) {
      conditions.push(`T."${f}" = ${gridCte}."${f}"`);
    }

    if (concatInfos.length === 1) {
      const info = concatInfos[0];
      const orParts = info.branches.map(b => {
        const eqParts = [`${gridCte}."${info.srcColumn}" = '${b.srcValue}'`];
        for (const [alias, orig] of Object.entries(b.fieldMap)) {
          eqParts.push(`T."${orig}" = ${gridCte}."${alias}"`);
        }
        return `(${eqParts.join(" AND ")})`;
      });
      conditions.push(`(\n    ${orParts.join("\n    OR ")}\n  )`);
    } else {
      const combos = this.cartesianBranches(concatInfos);
      const orParts = combos.map(combo => {
        const eqParts: string[] = [];
        for (let i = 0; i < combo.length; i++) {
          const info = concatInfos[i];
          const branch = combo[i];
          eqParts.push(`${gridCte}."${info.srcColumn}" = '${branch.srcValue}'`);
          for (const [alias, orig] of Object.entries(branch.fieldMap)) {
            eqParts.push(`T."${orig}" = ${gridCte}."${alias}"`);
          }
        }
        return `(${eqParts.join(" AND ")})`;
      });
      conditions.push(`(\n    ${orParts.join("\n    OR ")}\n  )`);
    }

    return conditions;
  }

  private collectNonConcatFields(
    spec: DimSpec,
    cteResult: CTEResult,
    result: string[],
  ): void {
    switch (spec.type) {
    case "simple":
      result.push(spec.field);
      break;
    case "hierarchy":
      result.push(...spec.fields);
      break;
    case "cross":
      for (const child of spec.children) {
        this.collectNonConcatFields(child, cteResult, result);
      }
      break;
    case "concat":
      break;
    case "none":
      break;
    }
  }

  private cartesianBranches(concatInfos: ConcatInfo[]): ConcatBranch[][] {
    if (concatInfos.length === 0) return [[]];
    const [first, ...rest] = concatInfos;
    const restCombos = this.cartesianBranches(rest);
    const result: ConcatBranch[][] = [];
    for (const branch of first.branches) {
      for (const combo of restCombos) {
        result.push([branch, ...combo]);
      }
    }
    return result;
  }

  protected getAggregation(fieldName: string): string {
    const col = this.schema.find((s) => s.name === fieldName);
    if (col && col.type === "measure") {
      return (col as MeasureSchema).aggregateFn ?? "sum";
    }
    return "sum";
  }
}

interface ConcatBranch {
  srcValue: string;
  fieldMap: Record<string, string>;
}

interface ConcatInfo {
  srcColumn: string;
  branches: ConcatBranch[];
}

interface OrderExpr {
  type: "ord" | "src";
  expr: string;
}

interface CTEResult {
  cteName: string;
  ctes: string[];
  fields: string[];
  orderExprs: OrderExpr[];
  srcColumns: string[];
  concatInfos: ConcatInfo[];
}
