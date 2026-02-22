import {GridDataViewModel} from "./renderer/grid-data-viewmodel";
import {
  Schema,
  MeasureSchema,
  AxisExpr,
  AxisConfig,
  DrilldownRule,
  PivotConfig,
  PivotGroup,
  Measure,
  Filter,
  FacetQuery,
  PivotQuery,
  PivotGroupResult,
  RowDef,
  ROLLUP_MARKER,
} from "./types";

/*
 * cross("region", hierarchy("quarter","month")) needs to combine two independently
 * resolved facet spaces into one. That's what this function does — cartesian product.
 *
 * A single facet space is string[][] (column-major: one array per level).
 * This function receives multiple of them — hence string[][][] — one per cross child.
 *
 * Why 3D? Take cross("region", hierarchy("quarter","month")):
 *
 *   spaces[0] = resolveFacetSpace("region")
 *             = [["East","West"]]                          ← 1 level, 2 combos
 *
 *   spaces[1] = resolveFacetSpace(hierarchy("quarter","month"))
 *             = [["Q1","Q1","Q1","Q2","Q2","Q2"],          ← level 0: quarter
 *                ["Jan","Feb","Mar","Apr","May","Jun"]]     ← level 1: month
 *                                                            2 levels, 6 combos
 *
 *   spaces is [ space0, space1 ] — array of spaces — hence string[][][].
 *
 * Output is a single flat facet space (string[][]) with all levels merged
 * and every combination enumerated (2 × 6 = 12 combos, 1 + 2 = 3 levels):
 *
 *   ┌──────────────────────────────────────────────────────────────────────────┐
 *   │ level 0 (region):  ["East","East","East","East","East","East",          │
 *   │                      "West","West","West","West","West","West"]         │
 *   │ level 1 (quarter): ["Q1","Q1","Q1","Q2","Q2","Q2",                     │
 *   │                      "Q1","Q1","Q1","Q2","Q2","Q2"]                     │
 *   │ level 2 (month):   ["Jan","Feb","Mar","Apr","May","Jun",                │
 *   │                      "Jan","Feb","Mar","Apr","May","Jun"]               │
 *   └──────────────────────────────────────────────────────────────────────────┘
 */
function cartesianProduct(spaces: (string | null)[][][]): (string | null)[][] {
  if (spaces.length === 0) return [];
  if (spaces.length === 1) return spaces[0];

  let current = spaces[0];
  for (let s = 1; s < spaces.length; s++) {
    const next = spaces[s];
    const numFieldsCurrent = current.length;
    const numFieldsNext = next.length;
    const numCombosCurrent = current[0]?.length ?? 0;
    const numCombosNext = next[0]?.length ?? 0;
    const totalCombos = numCombosCurrent * numCombosNext;

    const result: (string | null)[][] = [];
    for (let f = 0; f < numFieldsCurrent + numFieldsNext; f++) {
      result.push(new Array(totalCombos));
    }

    let idx = 0;
    for (let i = 0; i < numCombosCurrent; i++) {
      for (let j = 0; j < numCombosNext; j++) {
        for (let f = 0; f < numFieldsCurrent; f++) {
          result[f][idx] = current[f][i];
        }
        for (let f = 0; f < numFieldsNext; f++) {
          result[numFieldsCurrent + f][idx] = next[f][j];
        }
        idx++;
      }
    }

    current = result;
  }

  return current;
}

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

function normalizeAxisConfig(axis: AxisExpr | AxisConfig): AxisConfig {
  if (typeof axis === "object" && "field" in axis) return axis;
  return { field: axis };
}

function splitCrossAndHierarchy(expr: AxisExpr): { crossFields: string[], hierarchyFields: string[] } {
  if (typeof expr === "string") {
    return { crossFields: [], hierarchyFields: [expr] };
  }
  if (expr.type === "hierarchy") {
    return { crossFields: [], hierarchyFields: expr.fields };
  }
  if (expr.type === "cross") {
    const crossFields: string[] = [];
    let hierarchyFields: string[] = [];
    for (const child of expr.children) {
      if (typeof child === "string") {
        crossFields.push(child);
      } else {
        const result = splitCrossAndHierarchy(child);
        crossFields.push(...result.crossFields);
        hierarchyFields = result.hierarchyFields;
      }
    }
    return { crossFields, hierarchyFields };
  }
  return { crossFields: [], hierarchyFields: [] };
}

function normalizeDrilldownRules(fields: string[], rules: DrilldownRule[]): DrilldownRule[] {
  const fieldIndex = new Map(fields.map((f, i) => [f, i]));
  const rulesByLevel = new Map<number, { where: "*" | Record<string, string[]> }[]>();

  for (const rule of rules) {
    const targetIdx = fieldIndex.get(rule.toLevel);
    if (targetIdx === undefined) {
      throw new Error(`Drilldown toLevel "${rule.toLevel}" not found in hierarchy fields: [${fields.join(", ")}]`);
    }

    if (!rulesByLevel.has(targetIdx)) rulesByLevel.set(targetIdx, []);
    rulesByLevel.get(targetIdx)!.push({ where: rule.where });

    if (rule.where !== "*") {
      for (let level = 1; level <= targetIdx - 1; level++) {
        if (!rulesByLevel.has(level)) rulesByLevel.set(level, []);
        const parentWhere: Record<string, string[]> = {};
        for (let fi = 0; fi < level; fi++) {
          const fieldName = fields[fi];
          if ((rule.where as Record<string, string[]>)[fieldName]) {
            parentWhere[fieldName] = (rule.where as Record<string, string[]>)[fieldName];
          }
        }
        rulesByLevel.get(level)!.push({ where: Object.keys(parentWhere).length > 0 ? parentWhere : "*" });
      }
    } else {
      for (let level = 1; level <= targetIdx - 1; level++) {
        if (!rulesByLevel.has(level)) rulesByLevel.set(level, []);
        rulesByLevel.get(level)!.push({ where: "*" });
      }
    }
  }

  if (!rulesByLevel.has(0)) rulesByLevel.set(0, []);
  rulesByLevel.get(0)!.push({ where: "*" });

  const normalized: DrilldownRule[] = [];
  for (const [levelIdx, levelRules] of [...rulesByLevel.entries()].sort((a, b) => a[0] - b[0])) {
    const fieldName = fields[levelIdx];

    if (levelRules.some(r => r.where === "*")) {
      normalized.push({ toLevel: fieldName, where: "*" });
      continue;
    }

    const mergedWhere: Record<string, Set<string>> = {};
    for (const rule of levelRules) {
      const w = rule.where as Record<string, string[]>;
      for (const [field, values] of Object.entries(w)) {
        if (!mergedWhere[field]) mergedWhere[field] = new Set();
        for (const v of values) mergedWhere[field].add(v);
      }
    }

    const where: Record<string, string[]> = {};
    for (const [field, values] of Object.entries(mergedWhere)) {
      where[field] = [...values].sort();
    }

    normalized.push({ toLevel: fieldName, where });
  }

  return normalized;
}

function generateDrilldownBranches(
  crossFields: string[],
  hierarchyFields: string[],
  normalizedRules: DrilldownRule[]
): Branch[] {
  const allRowFields = [...crossFields, ...hierarchyFields];
  const symmetricSets: string[][] = [];
  const filteredDrilldownBranches: { branch: Branch; filters: Filter[] }[] = [];

  for (const rule of normalizedRules) {
    const levelIdx = hierarchyFields.indexOf(rule.toLevel);
    const dims = [...crossFields, ...hierarchyFields.slice(0, levelIdx + 1)];

    if (rule.where === "*") {
      symmetricSets.push(dims);
    } else {
      const padLevels = allRowFields.length - dims.length;
      const filters: Filter[] = [];
      const where = rule.where as Record<string, string[]>;
      for (const [field, values] of Object.entries(where)) {
        filters.push({
          field,
          op: values.length === 1 ? "eq" : "in",
          value: values.length === 1 ? values[0] : values,
        });
      }
      filteredDrilldownBranches.push({
        branch: { dimensions: dims, measures: [], ...(padLevels > 0 ? { padLevels } : {}) },
        filters,
      });
    }
  }

  symmetricSets.unshift(crossFields.length > 0 ? [...crossFields] : []);

  const rowBranches: Branch[] = [];

  if (symmetricSets.length > 0) {
    const unionDims = new Set<string>();
    for (const set of symmetricSets) {
      for (const d of set) unionDims.add(d);
    }
    const gsDims = allRowFields.filter(f => unionDims.has(f));
    const padLevels = allRowFields.length - gsDims.length;
    rowBranches.push({
      dimensions: gsDims,
      measures: [],
      groupingSets: symmetricSets,
      ...(padLevels > 0 ? { padLevels } : {}),
    });
  }

  for (const { branch, filters } of filteredDrilldownBranches) {
    rowBranches.push({ ...branch, filters });
  }

  return rowBranches;
}

function buildDrilldownFacetSpace(
  results: PivotGroupResult[],
  branches: Branch[],
  numFields: number
): { facetSpace: (string | null)[][], rowDefs: (RowDef | undefined)[] } {
  const tupleSet = new Set<string>();
  const tuples: string[][] = [];

  for (let gi = 0; gi < results.length; gi++) {
    const result = results[gi];
    const branch = branches[gi];
    const numRows = result.data[0]?.length ?? 0;
    const numDims = branch.dimensions.length;
    const pad = branch.padLevels ?? 0;

    for (let r = 0; r < numRows; r++) {
      const tuple: string[] = [];
      for (let d = 0; d < numDims; d++) {
        tuple.push(String(result.data[d][r]));
      }
      for (let p = 0; p < pad; p++) {
        tuple.push("");
      }

      const key = tuple.join("\0");
      if (!tupleSet.has(key)) {
        tupleSet.add(key);
        tuples.push(tuple);
      }
    }
  }

  const ordinals: Map<string, number>[] = Array.from({ length: numFields }, () => new Map());
  for (const tuple of tuples) {
    for (let f = 0; f < numFields; f++) {
      if (!ordinals[f].has(tuple[f])) {
        ordinals[f].set(tuple[f], ordinals[f].size);
      }
    }
  }

  tuples.sort((a, b) => {
    for (let i = 0; i < a.length; i++) {
      const oa = a[i] === ROLLUP_MARKER ? -2 : a[i] === "" ? -1 : (ordinals[i].get(a[i]) ?? 0);
      const ob = b[i] === ROLLUP_MARKER ? -2 : b[i] === "" ? -1 : (ordinals[i].get(b[i]) ?? 0);
      if (oa !== ob) return oa - ob;
    }
    return 0;
  });

  const facetSpace: (string | null)[][] = Array.from({ length: numFields }, () => []);
  const rowDefs: (RowDef | undefined)[] = [];
  for (const tuple of tuples) {
    if (tuple[0] === ROLLUP_MARKER) {
      rowDefs.push({ type: "agg", root: true });
    } else if (tuple.some(v => v === "")) {
      rowDefs.push({ type: "agg" });
    } else {
      rowDefs.push(undefined);
    }
    for (let f = 0; f < numFields; f++) {
      facetSpace[f].push(tuple[f] === "" ? null : tuple[f]);
    }
  }

  return { facetSpace, rowDefs };
}

interface Branch {
  dimensions: string[];
  measures: Measure[];
  padLevels?: number;
  filters?: Filter[];
  groupingSets?: string[][];
}

interface ResolvedAxis {
  facetSpace: (string | null)[][];
  branches: Branch[];
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

function buildLookupKey(
  branch: Branch,
  groupResult: PivotGroupResult,
  r: number,
  currentMeasure: Measure | null
): string {
  const keyParts: string[] = [];
  for (const dim of branch.dimensions) {
    const colIdx = groupResult.columns.indexOf(dim);
    const val = String(groupResult.data[colIdx][r]);
    keyParts.push(val);
  }
  for (let p = 0; p < (branch.padLevels ?? 0); p++) {
    keyParts.push("");
  }
  if (currentMeasure) {
    keyParts.push(currentMeasure.field);
  }
  return keyParts.join("\0");
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
  protected schema: Schema[];
  protected table: string;
  private measureFields: Set<string>;

  constructor(schema: Schema[], table: string) {
    this.schema = schema;
    this.table = table;
    this.measureFields = new Set(
      schema.filter(s => s.type === "measure").map(s => s.name)
    );
  }

  abstract resolveFacetValues(query: FacetQuery): Promise<string[][]>;

  abstract getData(query: PivotQuery): Promise<PivotGroupResult[]>;

  private async resolveAxis(expr: AxisExpr): Promise<ResolvedAxis> {
    if (typeof expr === "string") {
      if (this.measureFields.has(expr)) {
        const col = this.schema.find(s => s.name === expr)!;
        // TODO[claude] use a default config to produce default values
        const aggregation = (col as MeasureSchema).aggregateFn ?? "sum";
        return {
          facetSpace: [[expr]],
          branches: [{ dimensions: [], measures: [{ field: expr, aggregation }] }],
        };
      }
      const result = await this.resolveFacetValues({ type: "facet", fields: [expr], mode: "distinct" });
      return {
        facetSpace: result,
        branches: [{ dimensions: [expr], measures: [] }],
      };
    }

    if (expr.type === "hierarchy") {
      const result = await this.resolveFacetValues({ type: "facet", fields: expr.fields, mode: "group" });
      return {
        facetSpace: result,
        branches: [{ dimensions: expr.fields, measures: [] }],
      };
    }

    if (expr.type === "cross") {
      const bareDims = new Map<string, number>();
      for (const child of expr.children) {
        if (typeof child === "string" && !this.measureFields.has(child)) {
          bareDims.set(child, bareDims.size);
        }
      }

      let batchedFacets: string[][] | null = null;
      if (bareDims.size > 1) {
        batchedFacets = await this.resolveFacetValues({ type: "facet", fields: [...bareDims.keys()], mode: "distinct" });
      }

      const childResults: ResolvedAxis[] = [];
      for (const child of expr.children) {
        const batchIdx = typeof child === "string" ? bareDims.get(child) : undefined;
        if (batchedFacets && batchIdx !== undefined) {
          childResults.push({
            facetSpace: [batchedFacets[batchIdx]],
            branches: [{ dimensions: [child as string], measures: [] }],
          });
        } else {
          childResults.push(await this.resolveAxis(child));
        }
      }

      const facetSpace = cartesianProduct(childResults.map(r => r.facetSpace));

      let branches = childResults[0].branches;
      for (let i = 1; i < childResults.length; i++) {
        const next = childResults[i].branches;
        const combined: Branch[] = [];
        for (const a of branches) {
          for (const b of next) {
            const combinedPad = (a.padLevels ?? 0) + (b.padLevels ?? 0);
            combined.push({
              dimensions: [...a.dimensions, ...b.dimensions],
              measures: [...a.measures, ...b.measures],
              ...(combinedPad > 0 ? { padLevels: combinedPad } : {}),
            });
          }
        }
        branches = combined;
      }

      return { facetSpace, branches };
    }

    // concat
    // NOTE: No disambiguation is done here. If two children produce overlapping facet values
    // (e.g. concat("source","channel") where both have "Online"), the caller must ensure
    // uniqueness. To add disambiguation: track seen values per child, and when a collision is
    // detected, qualify the value with a prefix (e.g. "source/Online", "channel/Online") and
    // store the remap on the branch (via a dimRemap field) so buildLookupKey can translate
    // raw data values to the qualified names used in the facet space.
    const childResults: ResolvedAxis[] = [];
    const resolved = await Promise.all(expr.children.map(child => this.resolveAxis(child)));
    childResults.push(...resolved);

    const maxLevels = Math.max(...childResults.map(r => r.facetSpace.length));
    const concatFacets: (string | null)[][] = Array.from({ length: maxLevels }, () => []);

    for (let ci = 0; ci < childResults.length; ci++) {
      const childSpace = childResults[ci].facetSpace;
      const numPositions = childSpace[0]?.length ?? 0;
      for (let j = 0; j < numPositions; j++) {
        for (let level = 0; level < maxLevels; level++) {
          concatFacets[level].push(level < childSpace.length ? childSpace[level][j] : null);
        }
      }
    }

    const allBranches: Branch[] = [];
    for (let ci = 0; ci < childResults.length; ci++) {
      const padLevels = maxLevels - childResults[ci].facetSpace.length;
      for (const branch of childResults[ci].branches) {
        const totalPad = (branch.padLevels ?? 0) + padLevels;
        allBranches.push(totalPad > 0 ? { ...branch, padLevels: totalPad } : branch);
      }
    }

    return {
      facetSpace: concatFacets,
      branches: allBranches,
    };
  }

  private async resolveAxisConfig(config: AxisConfig): Promise<ResolvedAxis> {
    if (config.drilldown) {
      const { crossFields, hierarchyFields } = splitCrossAndHierarchy(config.field);
      const normalizedRules = normalizeDrilldownRules(hierarchyFields, config.drilldown);
      const branches = generateDrilldownBranches(crossFields, hierarchyFields, normalizedRules);
      return { facetSpace: [], branches };
    }
    return this.resolveAxis(config.field);
  }

  async getViewModelData(config: PivotConfig): Promise<GridDataViewModel> {
    const colConfig = normalizeAxisConfig(config.columns);
    // TODO make it mandatory to have a row config
    const rowConfig = config.rows ? normalizeAxisConfig(config.rows) : undefined;

    // Get the facet values (dimensional values) -> based on table algebra (concat, hierarchy, cross) create facet space
    // We get the data from server but the facet space calculation + table reshaping is done in client
    // This can become a potential point in failure if a high cardinality field is added with cross operation (as it
    // creates cartesia product) leading to huge fan out.
    // TODO detect high cardinality fields and throw an error (like tableau does)
    const [colResult, rowResult] = await Promise.all([
      this.resolveAxisConfig(colConfig),
      rowConfig ? this.resolveAxisConfig(rowConfig) : null,
    ]);

    const rowBranches = rowResult?.branches ?? [{ dimensions: [], measures: [] }];

    // Concat across multiple dimensions is a tricky operation. For example
    // | region | channel  | revenue |
    // |--------|----------|---------|
    // | East   | Online   | 100     |
    // | East   | Retail   | 200     |
    // | West   | Online   | 300     |
    // | West   | Wholesale| 400     |
    //
    // If we do concat(region, channel) sum(revenue) here is what we get
    // | regionxchannel | revenue |
    // |----------------|---------|
    // | East            | 300     |
    // | West            | 700     |
    // | Online          | 400     |
    // | Retail          | 600     |
    // | Wholesale       | 100     |
    //
    // So you can see group by region union all group by channel is ran on server
    // Since two group by-s are run with different dimensional values, it creates two branches
    // So for concat mulitiple branches (grouped data) would be returned from server, other wise one
    const groups: PivotGroup[] = [];
    const branchPairs: [Branch, Branch][] = [];
    for (const rowBranch of rowBranches) {
      for (const colBranch of colResult.branches) {
        groups.push({
          dimensions: [...rowBranch.dimensions, ...colBranch.dimensions],
          measures: [...rowBranch.measures, ...colBranch.measures],
          ...(rowBranch.filters ? { filters: rowBranch.filters } : {}),
          ...(rowBranch.groupingSets ? { groupingSets: rowBranch.groupingSets } : {}),
        });
        branchPairs.push([rowBranch, colBranch]);
      }
    }

    // Get the raw data from server, this is aggregated data but still in standard sql table format (column major
    // representation)
    const results = await this.getData({ type: "pivot", groups });

    // For drilldown axes, the facet space is built from query results (not resolved upfront).
    // Detect this by checking for an empty facet space.
    let rowDefs: (RowDef | undefined)[] | undefined;
    if (rowResult && rowResult.facetSpace.length === 0) {
      const numFields = rowResult.branches[0].dimensions.length + (rowResult.branches[0].padLevels ?? 0);
      const drilldownRowBranches = branchPairs.map(([rb]) => rb);
      const built = buildDrilldownFacetSpace(results, drilldownRowBranches, numFields);
      rowResult.facetSpace = built.facetSpace;
      rowDefs = built.rowDefs;
    }

    const colIndex = buildInvertedIndex(colResult.facetSpace);
    const rowIndex = rowResult ? buildInvertedIndex(rowResult.facetSpace) : new Map([["", 0]]);

    // Prepare stub for output data. Here the data reshaping is done
    const numCols = colResult.facetSpace[0].length;
    const numRows = rowResult ? rowResult.facetSpace[0].length : 1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any[][] = [];
    for (let c = 0; c < numCols; c++) {
      data.push(new Array(numRows).fill(null));
    }

    // Iterate over data returned by server and reshape it to pivot table format
    for (let gi = 0; gi < results.length; gi++) {
      const groupResult = results[gi];
      const [rowBranch, colBranch] = branchPairs[gi];
      const measures = [...rowBranch.measures, ...colBranch.measures];
      const totalDimCount = rowBranch.dimensions.length + colBranch.dimensions.length;
      const numResultRows = groupResult.data[0]?.length ?? 0;

      for (let r = 0; r < numResultRows; r++) {
        for (let mi = 0; mi < measures.length; mi++) {
          const value = groupResult.data[totalDimCount + mi][r];
          const rowKey = buildLookupKey(rowBranch, groupResult, r, rowBranch.measures.length > 0 ? measures[mi] : null);
          const colKey = buildLookupKey(colBranch, groupResult, r, colBranch.measures.length > 0 ? measures[mi] : null);
          const rowIdx = rowIndex.get(rowKey);
          const colIdx = colIndex.get(colKey);
          if (rowIdx !== undefined && colIdx !== undefined) {
            data[colIdx][rowIdx] = value;
          }
        }
      }
    }

    return new GridDataViewModel(data, colResult.facetSpace, rowResult?.facetSpace, rowDefs ? { rowDefs } : undefined);
  }
}
