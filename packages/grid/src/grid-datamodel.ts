import { GridDataViewModel } from "./renderer/grid-data-viewmodel";
import {
  AxisExpr,
  DimSpec,
  FacetQuery,
  IR,
  Measure,
  MeasureSchema,
  PivotConfig,
  RawDataFromIR,
  Schema,
} from "./types";

/*
 * Cartesian product (×). Each child becomes a facet level; all combinations are enumerated.
 *
 *   cross("Quarter", "Product")  →  Quarter × Product
 *
 *   ┌─────────────────────────────────────────────────────────────────┐
 *   │    Qtr1          │    Qtr2          │    Qtr3          │ Qtr4  │
 *   ├────┬─────┬───┬───┼────┬─────┬───┬───┼────┬─────┬───┬───┼─ ...  │
 *   │Cof │Espr │H.T│Tea│Cof │Espr │H.T│Tea│Cof │Espr │H.T│Tea│      │
 *   └────┴─────┴───┴───┴────┴─────┴───┴───┴────┴─────┴───┴───┴─ ...  ┘
 *
 *   cross("Quarter", "Profit")  →  Quarter × Profit (ordinal × measure)
 *
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │       Qtr1       │       Qtr2       │       Qtr3       │  Qtr4  │
 *   ├──────────────────┼──────────────────┼──────────────────┼────────┤
 *   │ Profit ──────▶   │ Profit ──────▶   │ Profit ──────▶   │  ...   │
 *   └──────────────────┴──────────────────┴──────────────────┴────────┘
 */
export function cross(...args: AxisExpr[]): AxisExpr {
  return { type: "cross", children: args };
}

/*
 * Union (+). Values from all children are placed side by side on the same level.
 *
 *   concat("Quarter", "Product")  →  Quarter + Product
 *
 *   ┌────┬────┬────┬────┬────┬─────┬──────┬────┐
 *   │Qtr1│Qtr2│Qtr3│Qtr4│Cof │Espr │H.Tea │Tea │
 *   └────┴────┴────┴────┴────┴─────┴──────┴────┘
 *
 *   concat("Profit", "Sales")  →  Profit + Sales (measure + measure)
 *
 *   ┌──────────────────┬──────────────────┐
 *   │ Profit ──────▶   │ Sales ──────▶    │
 *   └──────────────────┴──────────────────┘
 *
 */
export function concat(...args: AxisExpr[]): AxisExpr {
  return { type: "concat" as const, children: args };
}

/*
 * Grouped hierarchy (/). Multiple fields form a single grouped level where
 * children are nested under their parent — only observed combinations appear.
 *
 *   hierarchy("Quarter", "Month")  →  Quarter / Month
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │    Qtr1      │       Qtr2       │    Qtr3      │    Qtr4    │
 *   ├────┬────┬────┼────┬─────┬───────┼────┬────┬────┼────┬───┬───┤
 *   │Jan │Feb │Mar │Apr │ May │  Jun  │Jul │Aug │Sep │Oct │Nov│Dec│
 *   └────┴────┴────┴────┴─────┴───────┴────┴────┴────┴────┴───┴───┘
 *
 * Unlike cross (which enumerates all possible combinations), hierarchy only
 * produces combos that actually exist in the data.
 */
export function hierarchy(...fields: string[]): AxisExpr {
  return { type: "hierarchy", fields };
}

export function dimSpecFields(spec: DimSpec): string[] {
  switch (spec.type) {
  case "none": return [];
  case "simple": return [spec.field];
  case "hierarchy": return spec.fields;
  case "cross": {
    const result: string[] = [];
    for (const child of spec.children) {
      result.push(...dimSpecFields(child));
    }
    return result;
  }
  // Concat UNION ALL requires all branches to have the same column count, so shorter branches
  // get NULL-padded to the max. Original field names differ across branches, so they're aliased
  // to __c__0, __c__1, ... For example, concat(hierarchy("region","country"), "department"):
  //   hierarchy has 2 fields, simple has 1 → max is 2 → returns ["__c__0", "__c__1"]
  //   SQL: SELECT "region" AS __c__0, "country" AS __c__1 ... UNION ALL SELECT "department" AS __c__0, NULL AS __c__1 ...
  case "concat": {
    const maxFields = Math.max(...spec.children.map(c => dimSpecFields(c).length));
    return Array.from({ length: maxFields }, (_, i) => `__c__${i}`);
  }
  }
}

interface AxisIR {
  dimSpec: DimSpec;
  measures: Measure[];
}


function buildInvertedIndex(facetSpace: (string | null)[][]): Map<string, number> {
  const index = new Map<string, number>();
  const numPositions = facetSpace[0]?.length ?? 0;
  for (let i = 0; i < numPositions; i++) {
    const key = facetSpace.map(level => level[i] ?? "").join("\0");
    index.set(key, i);
  }
  return index;
}

/*
 * This is the entry point to using grid. GridDataModel converts data to GridDataViewmodel and feed it to renderer.
 *
 * Grid datamodel does not contain any data processing logic. For any data ops like (filtering / sorting / grouping) it
 * assumes upstream to provide functionality.
 *
 * Any DataSource like fetch apis / wasm databases will extend this class to implement the required operations.
 *
 * Data is in column major format (for n rows)
 * ```
 * {
 *   columns: [product, area, price]
 *   data: [
 *     [...], // n product
 *     [...], // n area
 *     [...], // n price
 *   ]
 * }
 * ```
 */
export abstract class GridDataModel {
  static readonly SRC_COL_PREFIX = "__src__";

  protected schema: Schema[];
  protected table: string;
  private schemaIndex: Map<string, number>;

  constructor(schema: Schema[], table: string) {
    this.schema = schema;
    this.table = table;
    this.schemaIndex = new Map(schema.map((s, i) => [s.name, i]));
  }

  // Concat operations produce synthetic columns to track which branch each row belongs to.
  // Given a source table:
  //
  //   dept        | channel | revenue
  //   ------------|---------|--------
  //   Electronics | Online  | 100
  //   Apparel     | Retail  | 200
  //
  // concat(simple("dept"), simple("channel")) produces:
  //
  //   __src__0 | __c__0
  //   ---------|------------
  //   dept     | Electronics
  //   dept     | Apparel
  //   channel  | Online
  //   channel  | Retail
  //
  // __src__0 disambiguates rows so that values from different branches are not mixed up
  // during facet extraction. Override in subclasses to customize the naming.
  protected srcColName(n: number): string {
    return `${GridDataModel.SRC_COL_PREFIX}${n}`;
  }

  protected isSrcCol(name: string): boolean {
    return name.startsWith(GridDataModel.SRC_COL_PREFIX);
  }

  private extractFacetSpace(
    result: RawDataFromIR,
    startCol: number,
    count: number,
    numResultRows: number,
  ): (string | null)[][] {
    const srcColIndices: number[] = [];
    for (let i = 0; i < result.columns.length; i++) {
      if (this.isSrcCol(result.columns[i])) srcColIndices.push(i);
    }

    const seen = new Set<string>();
    const facets: (string | null)[][] = Array.from({ length: count }, () => []);

    for (let r = 0; r < numResultRows; r++) {
      const key: string[] = [];
      for (let d = startCol; d < startCol + count; d++) {
        key.push(result.data[d][r] ?? null);
      }
      for (const si of srcColIndices) {
        key.push(String(result.data[si][r] ?? ""));
      }
      const keyStr = key.join("\0");
      if (seen.has(keyStr)) continue;
      seen.add(keyStr);
      for (let d = 0; d < count; d++) {
        facets[d].push(result.data[startCol + d][r]);
      }
    }
    return facets;
  }

  abstract resolveFacetValues(query: FacetQuery): Promise<string[][]>;

  /*
   * Subclasses interpret the IR to fetch aggregated data. A SQL-based subclass generates CTEs from
   * the DimSpec tree and runs a single query; an in-memory subclass could evaluate the same IR
   * using array operations.
   *
   * The returned RawDataFromIR must be in column-major format: `data[i]` is the full column array
   * for `columns[i]`. Dimension columns come first (in tree-traversal order of the DimSpec),
   * followed by measure columns. Rows must be ordered by the DimSpec's natural ordering so that
   * the caller can extract facet spaces directly from the result.
   *
   *   { columns: ["region", "department", "revenue"],
   *     data: [
   *       ["NA", "NA", "EU", "EU"],         // region
   *       ["Elec", "App", "Elec", "App"],   // department
   *       [8150, 1670, 5650, 1730]           // revenue (measure)
   *     ] }
   */
  abstract getData(ir: IR): Promise<RawDataFromIR>;

  /*
   * Transforms a user-facing AxisExpr tree into an axis-agnostic AxisIR (DimSpec + Measure[]).
   *
   * AxisExpr is a high-level description mixing dimensions and measures (e.g. cross("region", "revenue")).
   * buildAxisIR separates them: dimensions become a DimSpec tree describing how to build the
   * dimensional subquery (simple, hierarchy, cross, concat), and measures are collected into a flat list.
   *
   *   "region"                          → dimSpec: simple("region"),              measures: []
   *   "revenue"                         → dimSpec: none,                          measures: [sum(revenue)]
   *   cross("region", "revenue")        → dimSpec: cross([simple("region")]),     measures: [sum(revenue)]
   *   hierarchy("region","country")     → dimSpec: hierarchy(["region","country"]), measures: []
   *   concat("revenue","cost")          → dimSpec: none,                          measures: [sum(revenue), sum(cost)]
   *   concat("department","channel")    → dimSpec: concat([simple(..), simple(..)]), measures: []
   *
   * The DimSpec tree drives SQL generation / in memory data operation: The upstrem needs to support how to decode the
   * table algebra operator like concat, cross, hierarchy etc.
   */
  buildAxisIR(expr: AxisExpr): AxisIR {
    if (typeof expr === "string") {
      const col = this.schema[this.schemaIndex.get(expr)!];
      if (!col) throw new Error(`Column name not found. You have added ${expr} in row/column config but it's not found in schema.`
        + `Fields in schemas are ${Array.from(this.schemaIndex.keys()).join(", ")}. This is likely a typo.`);
      if (col.type === "measure") {
        // TODO instead of adding default aggregation funciton here - merge with default config on top level of execution
        const aggregation = (col as MeasureSchema).aggregateFn ?? "sum";
        return { dimSpec: { type: "none" }, measures: [{ field: expr, aggregation }] };
      }
      return { dimSpec: { type: "simple", field: expr }, measures: [] };
    }

    if (expr.type === "hierarchy") {
      return { dimSpec: { type: "hierarchy", fields: expr.fields }, measures: [] };
    }

    if (expr.type === "cross") {
      const childIRs = expr.children.map(c => this.buildAxisIR(c));
      const dimChildren: DimSpec[] = [];
      const measures: Measure[] = [];
      for (const child of childIRs) {
        if (child.dimSpec.type !== "none") {
          dimChildren.push(child.dimSpec);
        }
        measures.push(...child.measures);
      }
      const dimSpec: DimSpec = dimChildren.length === 0
        ? { type: "none" }
        : { type: "cross", children: dimChildren };
      return { dimSpec, measures };
    }

    // concat
    const childIRs = expr.children.map(c => this.buildAxisIR(c));
    const dimChildren: DimSpec[] = [];
    const measures: Measure[] = [];
    for (const child of childIRs) {
      dimChildren.push(child.dimSpec);
      measures.push(...child.measures);
    }
    const dimSpec: DimSpec = dimChildren.some(d => d.type !== "none")
      ? { type: "concat", children: dimChildren }
      : { type: "none" };
    return { dimSpec, measures };
  }

  async getViewModelData(config: PivotConfig): Promise<GridDataViewModel> {
    const [colIR, rowIR] = [config.columns, config.rows].map(e => this.buildAxisIR(e));
    const [colDimCount, rowDimCount] = [colIR, rowIR].map(ir => dimSpecFields(ir.dimSpec).length);
    const measures = [...rowIR.measures, ...colIR.measures];

    // The upstream (SQL / data layer) has no concept of rows vs columns — it only sees dimensions
    // and measures. We combine both axes into a single DimSpec (row dims as left child, col dims
    // as right child) so the server executes one query. After results come back, we use
    // rowDimCount/colDimCount to split the result columns back into row and col facet spaces.
    let combinedDimSpec: DimSpec;
    if (rowIR.dimSpec.type !== "none" && colIR.dimSpec.type !== "none") {
      combinedDimSpec = { type: "cross", children: [rowIR.dimSpec, colIR.dimSpec] };
    } else if (rowIR.dimSpec.type !== "none") {
      combinedDimSpec = rowIR.dimSpec;
    } else if (colIR.dimSpec.type !== "none") {
      combinedDimSpec = colIR.dimSpec;
    } else {
      combinedDimSpec = { type: "none" };
    }

    const result = await this.getData({ dimSpec: combinedDimSpec, measures });
    const totalDimCount = rowDimCount + colDimCount;
    const numResultRows = result.data[0]?.length ?? 0;

    // The result's dimension columns follow the DimSpec tree traversal order. Since we always
    // construct combinedDimSpec as cross(rowDimSpec, colDimSpec), row dims occupy columns
    // 0..rowDimCount and col dims occupy rowDimCount..rowDimCount+colDimCount. We extract
    // each axis's facet space by slicing the corresponding column range.
    const [colFacetSpace, rowFacetSpace] = [[rowDimCount, colDimCount], [0, rowDimCount]]
      .map(([startCol, colCount]) => colCount > 0 ? this.extractFacetSpace(result, startCol, colCount, numResultRows) : []);

    // colFacetSpace/rowFacetSpace contain only dimension facet levels (no measures).
    // Here we expand each dimension position by repeating it once per measure, and append
    // a new facet level with the measure names.
    // e.g. baseFacets=[["Elec","Apparel"]], measures=[revenue,cost] →
    //   [["Elec","Elec","Apparel","Apparel"], ["revenue","cost","revenue","cost"]]
    // If there are no dimensions (dimCount=0), the facet is just the measure names.
    const [fullColFacets, fullRowFacets] = ([
      [colFacetSpace, colDimCount, colIR.measures],
      [rowFacetSpace, rowDimCount, rowIR.measures],
    ] as [(string | null)[][], number, Measure[]][]).map(([baseFacets, dimCount, measures]) => {
      if (measures.length > 0 && dimCount > 0) {
        const numBasePositions = baseFacets[0]?.length ?? 1;
        const measureLevel: (string | null)[] = [];
        const expandedLevels: (string | null)[][] = baseFacets.map(() => []);
        for (let i = 0; i < numBasePositions; i++) {
          for (const m of measures) {
            for (let level = 0; level < baseFacets.length; level++) {
              expandedLevels[level].push(baseFacets[level][i]);
            }
            measureLevel.push(m.field);
          }
        }
        return [...expandedLevels, measureLevel];
      } else if (dimCount === 0 && measures.length > 0) {
        return [measures.map(m => m.field)];
      }
      return baseFacets;
    });

    const [colIndex, rowIndex] = [fullColFacets, fullRowFacets].map(facets => buildInvertedIndex(facets));

    // Row + column facets are prepared, setup to prepare value cells.
    // This is the final part of reshapin the table
    const numCols = fullColFacets[0].length;
    const numRows = fullRowFacets[0].length;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any[][] = [];
    for (let c = 0; c < numCols; c++) {
      data.push(new Array(numRows).fill(null));
    }

    // From the table returned by upstream (flat table in column-major format) -> reshaped table
    // Following is value cell extraction.
    for (let r = 0; r < numResultRows; r++) {
      const [colDimParts, rowKeyParts] = [[rowDimCount, totalDimCount], [0, rowDimCount]].map(([start, end]) => {
        const parts: string[] = [];
        for (let d = start; d < end; d++) {
          parts.push(result.data[d][r] ?? null);
        }
        return parts;
      });

      for (let mi = 0; mi < measures.length; mi++) {
        const value = result.data[totalDimCount + mi][r];

        const [colIdx, rowIdx] = ([
          [colDimParts, colIR.measures.length > 0, colIndex],
          [rowKeyParts, rowIR.measures.length > 0, rowIndex],
        ] as [string[], boolean, Map<string, number>][]).map(([dimParts, hasMeasures, index]) => {
          const key = [...dimParts];
          if (hasMeasures) key.push(measures[mi].field);
          return index.get(key.join("\0"));
        });

        if (colIdx !== undefined && rowIdx !== undefined) {
          data[colIdx][rowIdx] = value;
        }
      }
    }

    return new GridDataViewModel(data, fullColFacets, fullRowFacets);
  }
}
