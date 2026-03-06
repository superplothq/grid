import { GridDataModel } from "./grid-datamodel";
import {
  CrossSegment,
  DimSpec,
  FacetQuery,
  Filter,
  IR,
  MeasureSchema,
  RawDataFromIR,
  ScalarFilter,
  Schema,
  SegmentFilter,
  SortEntry,
  TupleFilter,
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
function filterToWhere(filter: SegmentFilter): string {
  const parts: string[] = [];
  for (const c of filter.pass) {
    const valList = c.values.map(v => `'${v}'`).join(",");
    parts.push(`"${c.field}" IN (${valList})`);
  }
  if (filter.fail.length > 0) {
    const failParts = filter.fail.map(c => {
      const valList = c.values.map(v => `'${v}'`).join(",");
      return `COALESCE("${c.field}" IN (${valList}), FALSE)`;
    });
    parts.push(`NOT (${failParts.join(" AND ")})`);
  }
  return parts.join(" AND ");
}

function filterToWhereQualified(filter: SegmentFilter, fieldToCte: Map<string, string>): string {
  const parts: string[] = [];
  for (const c of filter.pass) {
    const valList = c.values.map(v => `'${v}'`).join(",");
    const cte = fieldToCte.get(c.field);
    const fieldRef = cte ? `${cte}."${c.field}"` : `"${c.field}"`;
    parts.push(`${fieldRef} IN (${valList})`);
  }
  if (filter.fail.length > 0) {
    const failParts = filter.fail.map(c => {
      const valList = c.values.map(v => `'${v}'`).join(",");
      const cte = fieldToCte.get(c.field);
      const fieldRef = cte ? `${cte}."${c.field}"` : `"${c.field}"`;
      return `COALESCE(${fieldRef} IN (${valList}), FALSE)`;
    });
    parts.push(`NOT (${failParts.join(" AND ")})`);
  }
  return parts.join(" AND ");
}

export abstract class SqlDataModel extends GridDataModel {
  protected constructor(schema: Schema[], table: string) {
    super(schema, table);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected abstract runSQL(sql: string): Promise<Record<string, any>[]>;

  private buildTupleFilterClause(tf: TupleFilter): string {
    const cols = `(${tf.fields.map(f => `"${f}"`).join(", ")})`;
    const tuples = tf.value.map(t =>
      `(${t.map(v => typeof v === "number" ? String(v) : `'${v}'`).join(", ")})`
    ).join(", ");
    const op = tf.op === "in" ? "IN" : "NOT IN";
    return `${cols} ${op} (${tuples})`;
  }

  private buildFilterClause(f: ScalarFilter): string {
    const col = `"${f.field}"`;
    switch (f.op) {
    case "eq": return `${col} = '${f.value}'`;
    case "neq": return `${col} != '${f.value}'`;
    case "in": return `${col} IN (${(f.value as string[]).map(v => `'${v}'`).join(",")})`;
    case "not_in": return `${col} NOT IN (${(f.value as string[]).map(v => `'${v}'`).join(",")})`;
    case "gt": return `${col} > ${f.value}`;
    case "lt": return `${col} < ${f.value}`;
    case "gte": return `${col} >= ${f.value}`;
    case "lte": return `${col} <= ${f.value}`;
    case "between": { const v = f.value as number[]; return `${col} BETWEEN ${v[0]} AND ${v[1]}`; }
    case "contains": return `${col} LIKE '%${f.value}%'`;
    case "doesNotContain": return `${col} NOT LIKE '%${f.value}%'`;
    case "startsWith": return `${col} LIKE '${f.value}%'`;
    case "endsWith": return `${col} LIKE '%${f.value}'`;
    case "before": return `${col} < '${f.value}'`;
    case "after": return `${col} > '${f.value}'`;
    case "empty": return `${col} IS NULL`;
    case "notEmpty": return `${col} IS NOT NULL`;
    }
  }

  private buildWhereClause(filters?: Filter[]): string {
    if (!filters || filters.length === 0) return "";
    const scalarFilters: ScalarFilter[] = [];
    const tupleFiltersList: TupleFilter[] = [];
    for (const f of filters) {
      if (f.type === "tuple") {
        tupleFiltersList.push(f);
      } else {
        scalarFilters.push(f);
      }
    }
    const fieldClauses: string[] = [];
    if (scalarFilters.length > 0) {
      const byField = new Map<string, ScalarFilter[]>();
      for (const f of scalarFilters) {
        let arr = byField.get(f.field);
        if (!arr) { arr = []; byField.set(f.field, arr); }
        arr.push(f);
      }
      for (const [, group] of byField) {
        if (group.length === 1) {
          fieldClauses.push(this.buildFilterClause(group[0]));
        } else {
          fieldClauses.push(`(${group.map(f => this.buildFilterClause(f)).join(" OR ")})`);
        }
      }
    }
    for (const tf of tupleFiltersList) {
      fieldClauses.push(this.buildTupleFilterClause(tf));
    }
    if (fieldClauses.length === 0) return "";
    return " WHERE " + fieldClauses.join(" AND ");
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

    const measureFilters = measures.filter(m => m.filter.length > 0);

    if (dimSpec.type === "none") {
      const measureSelect = measures.map(m => {
        const agg = m.aggregation.toUpperCase();
        return `${agg}("${m.field}") AS "${m.field}"`;
      });
      let sql = `SELECT ${measureSelect.join(", ")} FROM "${this.table}"`;
      if (measureFilters.length > 0) {
        const allFilters = measureFilters.flatMap(m => m.filter);
        const mWhere = this.buildWhereClause(allFilters);
        sql = `WITH __result__ AS (${sql})\nSELECT * FROM __result__${mWhere}`;
      }
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
    if (branch.sort) {
      orderParts.push(...this.buildSortOrderParts(branch.sort, gridCte, cteResult));
    } else {
      for (const oe of cteResult.orderExprs) {
        if (oe.type === "src") {
          orderParts.push(`${gridCte}."${oe.expr}"`);
        } else {
          orderParts.push(`MIN(${gridCte}."${oe.expr}")`);
        }
      }
    }
    const orderByClause = orderParts.length > 0 ? ` ORDER BY ${orderParts.join(", ")}` : "";

    let sql = `WITH ${allCTEs.join(",\n     ")}\nSELECT ${selectClause}\nFROM ${gridCte}\nLEFT JOIN "${this.table}" T${joinClause}${groupByClause}${orderByClause}`;
    if (measureFilters.length > 0) {
      const allMFilters = measureFilters.flatMap(m => m.filter);
      const mWhere = this.buildWhereClause(allMFilters);
      sql = `WITH ${allCTEs.join(",\n     ")},\n     __result__ AS (SELECT ${selectClause}\nFROM ${gridCte}\nLEFT JOIN "${this.table}" T${joinClause}${groupByClause}${orderByClause})\nSELECT * FROM __result__${mWhere}`;
    }
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

  private buildSortOrderParts(sort: SortEntry[], gridCte: string, cteResult: CTEResult): string[] {
    const parts: string[] = [];
    const dimFieldsAccum: string[] = [];

    for (const entry of sort) {
      dimFieldsAccum.push(entry.field);
      const partitionFields = dimFieldsAccum.map(f => `${gridCte}."${f}"`).join(", ");

      if (entry.direction === "noop") {
        const ordCol = this.findOrdColForField(entry.field, cteResult);
        parts.push(`MIN(MIN(${gridCte}."${ordCol}")) OVER (PARTITION BY ${partitionFields})`);
      } else if (!entry.by) {
        parts.push(`${gridCte}."${entry.field}" ${entry.direction.toUpperCase()}`);
      } else {
        const agg = this.getAggregation(entry.by);
        parts.push(`SUM(${agg.toUpperCase()}(T."${entry.by}")) OVER (PARTITION BY ${partitionFields}) ${entry.direction.toUpperCase()}`);
      }
    }

    return parts;
  }

  private findOrdColForField(field: string, cteResult: CTEResult): string {
    const ordCol = cteResult.fieldToOrdCol.get(field);
    if (ordCol) return ordCol;
    for (const oe of cteResult.orderExprs) {
      if (oe.type === "ord") return oe.expr;
    }
    return field;
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
      const whereClause = this.buildWhereClause(spec.filter);
      const cte = `${name} AS (SELECT "${spec.field}", MIN(rowid) AS "${ordCol}" FROM "${this.table}"${whereClause} GROUP BY "${spec.field}")`;
      return {
        cteName: name,
        ctes: [cte],
        fields: [spec.field],
        orderExprs: [{ type: "ord", expr: ordCol }],
        srcColumns: [],
        concatInfos: [],
        nullableFields: [],
        fieldToOrdCol: new Map([[spec.field, ordCol]]),
      };
    }

    case "hierarchy": {
      const name = `__d__${counter.n++}`;
      const ordCol = `__ord__${counter.n - 1}`;

      if (!spec.segments) {
        const fieldList = spec.fields.map(f => `"${f}"`).join(", ");
        const dimFilterWhere = this.buildWhereClause(spec.filter);
        const cte = `${name} AS (SELECT ${fieldList}, MIN(rowid) AS "${ordCol}" FROM "${this.table}"${dimFilterWhere} GROUP BY ${fieldList})`;
        const fieldToOrdCol = new Map(spec.fields.map(f => [f, ordCol] as const));
        return {
          cteName: name,
          ctes: [cte],
          fields: [...spec.fields],
          orderExprs: [{ type: "ord", expr: ordCol }],
          srcColumns: [],
          concatInfos: [],
          nullableFields: [],
          fieldToOrdCol,
        };
      }

      const unionParts: string[] = [];
      const nullableSet = new Set<string>();
      // When multiple segments exist (e.g. selectively opening Sales and Engineering),
      // each segment produces rows via UNION ALL sharing the same __ord__ column (MIN(rowid)).
      // If the source data cycles (Sales, Engineering, Sales, Engineering, ...),
      // the global ORDER BY MIN(__ord__) interleaves children from different parents.
      // To fix this, we add __sord__ = MIN(MIN(rowid)) OVER (PARTITION BY parent_field),
      // which groups all children under their parent while preserving natural data order.
      const hasMultipleSegments = spec.segments.length > 1;
      const segOrdCol = `__sord__${counter.n - 1}`;

      for (const seg of spec.segments) {
        const groupFields = seg.groupBy;
        const nullFields = spec.fields.filter(f => !groupFields.includes(f));
        for (const nf of nullFields) nullableSet.add(nf);

        const selectParts = [
          ...groupFields.map(f => `"${f}"`),
          ...nullFields.map(f => `CAST(NULL AS VARCHAR) AS "${f}"`),
          `MIN(rowid) AS "${ordCol}"`,
        ];
        if (hasMultipleSegments) {
          const parentField = spec.fields[0];
          selectParts.push(`MIN(MIN(rowid)) OVER (PARTITION BY "${parentField}") AS "${segOrdCol}"`);
        }
        const groupByList = groupFields.map(f => `"${f}"`).join(", ");

        const whereParts: string[] = [];
        if (seg.filter) {
          whereParts.push(filterToWhere(seg.filter));
        }
        const dimWhere = this.buildWhereClause(spec.filter);
        if (dimWhere) whereParts.push(dimWhere.replace(" WHERE ", ""));
        const whereClause = whereParts.length > 0 ? ` WHERE ${whereParts.join(" AND ")}` : "";

        unionParts.push(`SELECT ${selectParts.join(", ")} FROM "${this.table}"${whereClause} GROUP BY ${groupByList}`);
      }

      const cte = unionParts.length === 1
        ? `${name} AS (${unionParts[0]})`
        : `${name} AS (\n       ${unionParts.join("\n       UNION ALL\n       ")}\n     )`;

      const orderExprs: OrderExpr[] = [];
      if (hasMultipleSegments) {
        orderExprs.push({ type: "ord", expr: segOrdCol });
      }
      orderExprs.push({ type: "ord", expr: ordCol });

      const fieldToOrdCol = new Map(spec.fields.map(f => [f, ordCol] as const));
      return {
        cteName: name,
        ctes: [cte],
        fields: [...spec.fields],
        orderExprs,
        srcColumns: [],
        concatInfos: [],
        nullableFields: [...nullableSet],
        fieldToOrdCol,
      };
    }

    case "cross": {
      const childResults = spec.children.map(c => this.generateCTEs(c, counter, srcCounter, concatFieldCounter));

      if (spec.segments) {
        return this.generateCrossSegmentCTEs(spec.segments, childResults, counter);
      }

      const allCTEs: string[] = [];
      const allFields: string[] = [];
      const allOrderExprs: OrderExpr[] = [];
      const allSrcColumns: string[] = [];
      const allConcatInfos: ConcatInfo[] = [];
      const allNullableFields: string[] = [];
      const allFieldToOrdCol = new Map<string, string>();

      for (const child of childResults) {
        allCTEs.push(...child.ctes);
        allFields.push(...child.fields);
        allOrderExprs.push(...child.orderExprs);
        allSrcColumns.push(...child.srcColumns);
        allConcatInfos.push(...child.concatInfos);
        allNullableFields.push(...(child.nullableFields || []));
        for (const [f, o] of child.fieldToOrdCol) allFieldToOrdCol.set(f, o);
      }

      if (childResults.length === 1) {
        return { ...childResults[0], nullableFields: allNullableFields };
      }

      const gridName = `__d__${counter.n++}`;
      const joinParts = childResults.map(c => c.cteName).join(" CROSS JOIN ");
      const filterWhere = this.buildWhereClause(spec.filter);
      const gridCte = `${gridName} AS (SELECT * FROM ${joinParts}${filterWhere})`;
      allCTEs.push(gridCte);

      return {
        cteName: gridName,
        ctes: allCTEs,
        fields: allFields,
        orderExprs: allOrderExprs,
        srcColumns: allSrcColumns,
        concatInfos: allConcatInfos,
        nullableFields: allNullableFields,
        fieldToOrdCol: allFieldToOrdCol,
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
      const cordBase = `__cord__${srcCounter.n - 1}`;

      const maxOrdExprs = Math.max(...childResults.map(c => c.orderExprs.length), 1);
      const cordCols = Array.from({ length: maxOrdExprs }, (_, i) => `${cordBase}_${i}`);

      const concatName = `__d__${counter.n++}`;
      const unionParts: string[] = [];

      const concatInfo: ConcatInfo = { srcColumn: srcCol, branches: [] };

      for (let ci = 0; ci < childResults.length; ci++) {
        const childResult = childResults[ci];
        const childNullable = new Set(childResult.nullableFields || []);

        const srcValue = `${ci}:${childResult.fields.join(",")}`;
        const fieldMap: Record<string, string> = {};
        const selectParts: string[] = [`'${srcValue}' AS "${srcCol}"`];

        for (let fi = 0; fi < maxFields; fi++) {
          if (fi < childResult.fields.length) {
            selectParts.push(`${childResult.cteName}."${childResult.fields[fi]}" AS "${concatFields[fi]}"`);
            fieldMap[concatFields[fi]] = childResult.fields[fi];
          } else {
            selectParts.push(`CAST(NULL AS VARCHAR) AS "${concatFields[fi]}"`);
          }
        }

        for (let oi = 0; oi < maxOrdExprs; oi++) {
          const ordExpr = oi < childResult.orderExprs.length ? childResult.orderExprs[oi].expr : "0";
          selectParts.push(`${ordExpr} AS "${cordCols[oi]}"`);
        }

        unionParts.push(`SELECT ${selectParts.join(", ")} FROM ${childResult.cteName}`);
        concatInfo.branches.push({ srcValue, fieldMap, nullableFields: childNullable });
      }

      const cte = `${concatName} AS (\n       ${unionParts.join("\n       UNION ALL\n       ")}\n     )`;

      return {
        cteName: concatName,
        ctes: [...childResults.flatMap(c => c.ctes), cte],
        fields: concatFields,
        orderExprs: [
          { type: "src" as const, expr: srcCol },
          ...cordCols.map(c => ({ type: "ord" as const, expr: c })),
        ],
        srcColumns: [srcCol],
        concatInfos: [concatInfo],
        nullableFields: [],
        fieldToOrdCol: new Map(),
      };
    }
    default:
      throw new Error(`Unexpected DimSpec type: ${(spec as DimSpec).type}`);
    }
  }

  private generateCrossSegmentCTEs(
    segments: CrossSegment[],
    childResults: CTEResult[],
    counter: { n: number },
  ): CTEResult {
    const allChildCTEs: string[] = childResults.flatMap(c => c.ctes);
    const allFields: string[] = childResults.flatMap(c => c.fields);
    const allOrderExprs: OrderExpr[] = childResults.flatMap(c => c.orderExprs);
    const allSrcColumns: string[] = childResults.flatMap(c => c.srcColumns);
    const allConcatInfos: ConcatInfo[] = childResults.flatMap(c => c.concatInfos);
    const allNullableFields: string[] = childResults.flatMap(c => c.nullableFields || []);
    const allFieldToOrdCol = new Map<string, string>();
    for (const child of childResults) {
      for (const [f, o] of child.fieldToOrdCol) allFieldToOrdCol.set(f, o);
    }

    const fieldToChildCte = new Map<string, string>();
    for (const child of childResults) {
      for (const f of child.fields) {
        fieldToChildCte.set(f, child.cteName);
      }
    }

    if (segments.length === 1 && !segments[0].filter) {
      const seg = segments[0];
      const visibleResults = childResults.slice(0, seg.visibleChildren);
      const nullResults = childResults.slice(seg.visibleChildren);
      const nullFieldsList = nullResults.flatMap(c => c.fields);
      for (const f of nullFieldsList) allNullableFields.push(f);

      const nullOrdParts = nullResults.flatMap(c => c.orderExprs.filter(oe => oe.type !== "src").map(oe => `0 AS "${oe.expr}"`));
      const nullSrcParts = nullResults.flatMap(c => c.srcColumns.map(s => `CAST(NULL AS VARCHAR) AS "${s}"`));
      const nullPadParts = [
        ...nullFieldsList.map(f => `CAST(NULL AS VARCHAR) AS "${f}"`),
        ...nullOrdParts,
        ...nullSrcParts,
      ];

      if (visibleResults.length === 1 && nullPadParts.length > 0) {
        const wrapName = `__d__${counter.n++}`;
        const wrapCte = `${wrapName} AS (SELECT ${visibleResults[0].cteName}.*, ${nullPadParts.join(", ")} FROM ${visibleResults[0].cteName})`;
        allChildCTEs.push(wrapCte);
        return {
          cteName: wrapName,
          ctes: allChildCTEs,
          fields: allFields,
          orderExprs: allOrderExprs,
          srcColumns: allSrcColumns,
          concatInfos: allConcatInfos,
          nullableFields: allNullableFields,
          fieldToOrdCol: allFieldToOrdCol,
        };
      }

      if (visibleResults.length > 1) {
        const gridName = `__d__${counter.n++}`;
        const joinParts = visibleResults.map(c => c.cteName).join(" CROSS JOIN ");
        if (nullPadParts.length > 0) {
          const gridCte = `${gridName} AS (SELECT ${joinParts.split(" CROSS JOIN ").map(n => `${n}.*`).join(", ")}, ${nullPadParts.join(", ")} FROM ${joinParts})`;
          allChildCTEs.push(gridCte);
        } else {
          const gridCte = `${gridName} AS (SELECT * FROM ${joinParts})`;
          allChildCTEs.push(gridCte);
        }
        return {
          cteName: gridName,
          ctes: allChildCTEs,
          fields: allFields,
          orderExprs: allOrderExprs,
          srcColumns: allSrcColumns,
          concatInfos: allConcatInfos,
          nullableFields: allNullableFields,
          fieldToOrdCol: allFieldToOrdCol,
        };
      }

      return {
        cteName: visibleResults[0]?.cteName ?? childResults[0].cteName,
        ctes: allChildCTEs,
        fields: allFields,
        orderExprs: allOrderExprs,
        srcColumns: allSrcColumns,
        concatInfos: allConcatInfos,
        nullableFields: allNullableFields,
        fieldToOrdCol: allFieldToOrdCol,
      };
    }

    const unionParts: string[] = [];

    for (const seg of segments) {
      const visibleResults = childResults.slice(0, seg.visibleChildren);
      const nullResults = childResults.slice(seg.visibleChildren);

      for (const child of nullResults) {
        for (const f of child.fields) {
          if (!allNullableFields.includes(f)) allNullableFields.push(f);
        }
      }

      const selectParts: string[] = [];
      for (const child of visibleResults) {
        for (const f of child.fields) {
          selectParts.push(`${child.cteName}."${f}"`);
        }
      }
      for (const child of nullResults) {
        for (const f of child.fields) {
          selectParts.push(`CAST(NULL AS VARCHAR) AS "${f}"`);
        }
      }
      for (const child of visibleResults) {
        for (const oe of child.orderExprs) {
          if (oe.type === "src") continue;
          selectParts.push(`${child.cteName}."${oe.expr}"`);
        }
      }
      for (const child of nullResults) {
        for (const oe of child.orderExprs) {
          if (oe.type === "src") continue;
          selectParts.push(`0 AS "${oe.expr}"`);
        }
      }
      for (const child of visibleResults) {
        for (const src of child.srcColumns) {
          selectParts.push(`${child.cteName}."${src}"`);
        }
      }
      for (const child of nullResults) {
        for (const src of child.srcColumns) {
          selectParts.push(`CAST(NULL AS VARCHAR) AS "${src}"`);
        }
      }

      const fromCtes = visibleResults.map(c => c.cteName);
      const fromClause = fromCtes.length > 1 ? fromCtes.join(" CROSS JOIN ") : fromCtes[0];

      let whereClause = "";
      if (seg.filter) {
        whereClause = ` WHERE ${filterToWhereQualified(seg.filter, fieldToChildCte)}`;
      }

      unionParts.push(`SELECT ${selectParts.join(", ")} FROM ${fromClause}${whereClause}`);
    }

    const wrapName = `__d__${counter.n++}`;
    const cte = unionParts.length === 1
      ? `${wrapName} AS (${unionParts[0]})`
      : `${wrapName} AS (\n       ${unionParts.join("\n       UNION ALL\n       ")}\n     )`;
    allChildCTEs.push(cte);

    return {
      cteName: wrapName,
      ctes: allChildCTEs,
      fields: allFields,
      orderExprs: allOrderExprs,
      srcColumns: allSrcColumns,
      concatInfos: allConcatInfos,
      nullableFields: allNullableFields,
      fieldToOrdCol: allFieldToOrdCol,
    };
  }

  private buildJoinConditions(
    spec: DimSpec,
    gridCte: string,
    cteResult: CTEResult,
  ): string[] {
    const nullableSet = new Set(cteResult.nullableFields || []);

    if (cteResult.concatInfos.length === 0) {
      return cteResult.fields.map(f => {
        if (nullableSet.has(f)) {
          return `(T."${f}" = ${gridCte}."${f}" OR ${gridCte}."${f}" IS NULL)`;
        }
        return `T."${f}" = ${gridCte}."${f}"`;
      });
    }

    const nonConcatFields: string[] = [];
    const concatInfos = cteResult.concatInfos;

    this.collectNonConcatFields(spec, cteResult, nonConcatFields);

    const conditions: string[] = [];
    for (const f of nonConcatFields) {
      if (nullableSet.has(f)) {
        conditions.push(`(T."${f}" = ${gridCte}."${f}" OR ${gridCte}."${f}" IS NULL)`);
      } else {
        conditions.push(`T."${f}" = ${gridCte}."${f}"`);
      }
    }

    if (concatInfos.length === 1) {
      const info = concatInfos[0];
      const orParts = info.branches.map(b => {
        const eqParts = [`${gridCte}."${info.srcColumn}" = '${b.srcValue}'`];
        for (const [alias, orig] of Object.entries(b.fieldMap)) {
          if (b.nullableFields.has(orig)) {
            eqParts.push(`(T."${orig}" = ${gridCte}."${alias}" OR ${gridCte}."${alias}" IS NULL)`);
          } else {
            eqParts.push(`T."${orig}" = ${gridCte}."${alias}"`);
          }
        }
        return `(${eqParts.join(" AND ")})`;
      });
      // __src__ is always a literal string in a standalone concat, so this IS NULL branch is
      // unreachable there. It matters when a concat is nested inside a cross with segments —
      // the cross-segment CTE pads __src__ columns with CAST(NULL AS VARCHAR) for branches
      // that don't participate in the concat, and this guard ensures those rows still join.
      orParts.push(`${gridCte}."${info.srcColumn}" IS NULL`);
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
            if (branch.nullableFields.has(orig)) {
              eqParts.push(`(T."${orig}" = ${gridCte}."${alias}" OR ${gridCte}."${alias}" IS NULL)`);
            } else {
              eqParts.push(`T."${orig}" = ${gridCte}."${alias}"`);
            }
          }
        }
        return `(${eqParts.join(" AND ")})`;
      });
      // Same as the single-concat case: __src__ columns are never NULL in a standalone concat,
      // but cross-segment CTEs can pad them with NULL for non-participating branches.
      const allSrcNull = concatInfos.map(info => `${gridCte}."${info.srcColumn}" IS NULL`).join(" AND ");
      orParts.push(`(${allSrcNull})`);
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
  nullableFields: Set<string>;
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
  nullableFields: string[];
  fieldToOrdCol: Map<string, string>;
}
