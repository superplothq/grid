import { GridDataViewModel } from "./renderer/grid-data-viewmodel";
import {
  AxisConfig,
  AxisExpr,
  CrossSegment,
  DimSpec,
  DrilldownPath,
  FacetQuery,
  HierarchySegment,
  IR,
  Measure,
  MeasureSchema,
  PivotConfig,
  RawDataFromIR,
  Schema,
  SegmentFilter,
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

export function normalizeAxisConfig(config: AxisExpr | AxisConfig): AxisConfig {
  if (typeof config === "string" || "type" in config) {
    return { expr: config as AxisExpr };
  }
  return config;
}

interface LevelRange {
  start: number;
  end: number;
}

// Computes the [start, end] drilldown level range for a DimSpec node.
// Drilldown operates on levels, not fields — this maps the tree structure to a flat
// level numbering so applyDrilldownToNode knows which nodes a given level affects.
//
// Rules:
//   - cross/hierarchy children consume levels sequentially (each child increments)
//   - concat is transparent — all children share the same level range
//   - simple occupies one level, none occupies zero
//
// Example: concat(cross(hierarchy(q,m), simple(p)), cross(simple(r), simple(p)))
//   concat [0,2]           ← transparent, takes max of children
//   ├── cross [0,2]        ← child0=[0,1], child1=[2,2]
//   │   ├── hierarchy [0,1]   q=L0, m=L1
//   │   └── simple [2,2]      p=L2
//   └── cross [0,2]
//       ├── simple [0,0]      r=L0
//       └── simple [1,1]      p=L1  (same level space, different subtree)
function computeLevelRange(spec: DimSpec, currentLevel: number): LevelRange {
  switch (spec.type) {
  case "none":
    return { start: currentLevel, end: currentLevel - 1 };
  case "simple":
    return { start: currentLevel, end: currentLevel };
  case "hierarchy":
    return { start: currentLevel, end: currentLevel + spec.fields.length - 1 };
  case "cross": {
    let level = currentLevel;
    let maxEnd = currentLevel - 1;
    for (const child of spec.children) {
      const childRange = computeLevelRange(child, level);
      if (childRange.end >= childRange.start) {
        maxEnd = Math.max(maxEnd, childRange.end);
        level = childRange.end + 1;
      }
    }
    return { start: currentLevel, end: maxEnd };
  }
  case "concat": {
    let maxEnd = currentLevel - 1;
    for (const child of spec.children) {
      const childRange = computeLevelRange(child, currentLevel);
      maxEnd = Math.max(maxEnd, childRange.end);
    }
    return { start: currentLevel, end: maxEnd };
  }
  }
}

function mergedOpenValuesAcrossDrilldownPaths(paths: DrilldownPath[]): "*" | string[] {
  const seen = new Set<string>();
  for (const p of paths) {
    // if atleast one value is "*", meaning the whole level is open
    if (p.open === "*") return "*";
    for (const v of p.open) seen.add(v);
  }
  const values: string[] = [];
  for (const p of paths) {
    for (const v of (p.open as string[])) {
      if (seen.delete(v)) values.push(v);
    }
  }
  return values;
}

function advancePaths(paths: DrilldownPath[]): DrilldownPath[] {
  const result: DrilldownPath[] = [];
  for (const p of paths) {
    if (p.next) result.push(p.next);
  }
  return result;
}

function makeHierarchySegment(groupBy: string[], filter: SegmentFilter): HierarchySegment {
  if (filter.pass.length === 0 && filter.fail.length === 0) return { groupBy };
  return { groupBy, filter };
}

/*
 * Produces mutually exclusive segments for a hierarchy with drilldown.
 *
 * A hierarchy with drilldown needs data at different GROUP BY depths depending on which values
 * the user has expanded. This function recursively partitions the data into segments — each
 * segment says "for this slice of data, aggregate to this depth, everything deeper is null."
 *
 * At each depth, one of three things happens:
 *   1. No paths left     → stop here. Emit one segment at current depth.
 *   2. Wildcard ("*")    → all values expanded. Go deeper without splitting.
 *   3. Selective (list)  → split per value:
 *        - For each opened value: recurse into its subtree with its own next-paths
 *        - For everything NOT opened: emit one segment at current depth
 *
 * Each recursion accumulates filter conditions (IN/NOT_IN). Each leaf of the recursion tree
 * becomes one segment. Because IN and NOT_IN partition the value space at every split, segments
 * are mutually exclusive — no row matches two segments.
 *
 * Example: hierarchy(region, country, city, department) with:
 *   drilldown: [
 *     { open: ["Europe"],        next: { open: "*" } },
 *     { open: ["North America"], next: { open: ["USA"], next: { open: ["New York"] } } },
 *   ]
 *
 * Recursion tree:                                Segment produced:
 * ───────────────────────────────────────────    ──────────────────────────────────────
 * depth 0: selective ["Europe","NA"]
 * ├─ "Europe" (IN) → depth 1: wildcard ("*")
 * │  └─ depth 2: paths exhausted → STOP         → groupBy[r,c,ci]     WHERE r IN (EU)
 * ├─ "NA" (IN) → depth 1: selective ["USA"]
 * │  ├─ "USA" (IN) → depth 2: selective ["New York"]
 * │  │  ├─ "NY" (IN) → depth 3: paths exhausted → groupBy[r,c,ci,d]   WHERE r IN (NA), c IN (USA), ci IN (NY)
 * │  │  └─ NOT IN ["NY"] → STOP                  → groupBy[r,c,ci]     WHERE r IN (NA), c IN (USA), ci NOT IN (NY)
 * │  └─ NOT IN ["USA"] → STOP                    → groupBy[r,c]        WHERE r IN (NA), c NOT IN (USA)
 * └─ NOT IN ["Europe","NA"] → STOP                → groupBy[r]          WHERE r NOT IN (EU, NA)
 *
 * Downstream (SQL or in-memory) processes each segment independently:
 *   1. Filter rows matching the segment's conditions
 *   2. Group by the segment's groupBy fields, aggregate measures
 *   3. Null-pad fields beyond groupBy (collapsed levels)
 * Then stack (UNION ALL) all segments into the final result.
 */
function buildHierarchySegments(
  fields: string[],
  paths: DrilldownPath[],
  depth: number,
  conditions: SegmentFilter,
): HierarchySegment[] {
  if (depth >= fields.length) {
    return [makeHierarchySegment(fields, conditions)];
  }

  if (paths.length === 0) {
    return [makeHierarchySegment(fields.slice(0, depth + 1), conditions)];
  }

  const merged = mergedOpenValuesAcrossDrilldownPaths(paths);

  if (merged === "*") {
    return buildHierarchySegments(fields, advancePaths(paths), depth + 1, conditions);
  }

  // Tracks per n-1 column which n columns are opened
  const valueNextPaths = new Map<string, DrilldownPath[]>();
  for (const v of merged) valueNextPaths.set(v, []);
  for (const p of paths) {
    if (!p.next) continue;
    for (const v of (p.open as string[])) {
      valueNextPaths.get(v)!.push(p.next);
    }
  }

  const segments: HierarchySegment[] = [];
  for (const [value, nextPaths] of valueNextPaths) {
    const valueConditions = { pass: [...conditions.pass, { field: fields[depth], values: [value] }], fail: conditions.fail };
    segments.push(...buildHierarchySegments(fields, nextPaths, depth + 1, valueConditions));
  }
  // Not_in i.e. closed condition is build upon combined values of all n-1 columns
  const notExpandedConditions = { pass: conditions.pass, fail: [...conditions.fail, { field: fields[depth], values: merged }] };
  segments.push(makeHierarchySegment(fields.slice(0, depth + 1), notExpandedConditions));

  return segments;
}

function getFieldAtLevel(spec: DimSpec, targetLevel: number, currentLevel: number): string | null {
  switch (spec.type) {
  case "none": return null;
  case "simple": return targetLevel === currentLevel ? spec.field : null;
  case "hierarchy": {
    const idx = targetLevel - currentLevel;
    return idx >= 0 && idx < spec.fields.length ? spec.fields[idx] : null;
  }
  case "cross": {
    let level = currentLevel;
    for (const child of spec.children) {
      const range = computeLevelRange(child, level);
      if (targetLevel >= range.start && targetLevel <= range.end) {
        return getFieldAtLevel(child, targetLevel, level);
      }
      if (range.end >= range.start) level = range.end + 1;
    }
    return null;
  }
  case "concat": {
    for (const child of spec.children) {
      const field = getFieldAtLevel(child, targetLevel, currentLevel);
      if (field) return field;
    }
    return null;
  }
  }
}

interface WalkResult {
  remainingPaths: DrilldownPath[];
  selectiveFilters: { field: string; values: string[] }[];
  nextLevelReached: boolean;
}

function walkPathsThroughRange(paths: DrilldownPath[], spec: DimSpec, range: LevelRange, startLevel: number): WalkResult {
  let currentPaths = paths;
  const selectiveFilters: { field: string; values: string[] }[] = [];

  for (let level = range.start; level <= range.end; level++) {
    if (currentPaths.length === 0) {
      return { remainingPaths: [], selectiveFilters, nextLevelReached: false };
    }

    const merged = mergedOpenValuesAcrossDrilldownPaths(currentPaths);
    if (merged !== "*") {
      const field = getFieldAtLevel(spec, level, startLevel);
      if (field) selectiveFilters.push({ field, values: merged });
    }

    currentPaths = advancePaths(currentPaths);
  }

  return { remainingPaths: currentPaths, selectiveFilters, nextLevelReached: true };
}

function applyDrilldownToNode(spec: DimSpec, paths: DrilldownPath[], currentLevel: number): DimSpec {
  switch (spec.type) {
  case "none":
  case "simple":
    return spec;

  case "concat": {
    const newChildren = spec.children.map(child =>
      applyDrilldownToNode(child, paths, currentLevel /* concat does not contribute to level creation */)
    );
    return { type: "concat", children: newChildren };
  }

  case "hierarchy": {
    if (paths.length === 0) {
      // Base/collapsed state: only show the first level opened (e.g. region in hierarchy(region,country,city)).
      // Deeper fields become NULL. Users open values via drilldown paths to reveal deeper levels.
      return { type: "hierarchy", fields: spec.fields, segments: [{ groupBy: [spec.fields[0]] }] };
    }

    const segments = buildHierarchySegments(spec.fields, paths, 0, { pass: [], fail: [] });
    if (segments.length === 1 && segments[0].groupBy.length === spec.fields.length && !segments[0].filter) {
      return spec;
    }
    return { type: "hierarchy", fields: spec.fields, segments };
  }

  /*
   * Cross drilldown: paths flow left-to-right through children.
   *
   * Each child occupies a level range. walkPathsThroughRange walks paths through
   * a child's range level-by-level. If paths have selective (non-wildcard) values
   * at any level within a child, those become "gating filters". If paths run out
   * or don't reach the end of a child's range, subsequent children are unreachable.
   *
   * The result is cross segments that partition the gating child's rows into two groups:
   *   - Rows matching the gating filter → CROSS JOIN with all reachable children
   *   - Rows not matching → only see children up to (and including) the gating child
   *
   * Example: cross(hierarchy(region, country, city), hierarchy(department, product))
   * Drilldown: open Europe → UK → London
   *
   * walkPathsThroughRange walks paths through child 0 (levels 0-2):
   *   L0: selective [Europe] → filter: region IN (EU)
   *   L1: selective [UK]     → filter: country IN (UK)
   *   L2: selective [London] → filter: city IN (London)
   *   Paths reach the end → child 1 is reachable.
   *
   * gatingFilter = { childIdx: 0, conditions: [region=[EU], country=[UK], city=[London]] }
   *
   * Two cross segments are produced:
   *
   * Segment 1 (visibleChildren: 2, filter: region IN (EU) AND country IN (UK) AND city IN (London)):
   *   Child 0 rows matching the filter get CROSS JOINed with child 1.
   *   Only EU/UK/London passes → it sees department/product:
   *     EU | UK | London | Electronics | null
   *     EU | UK | London | Apparel     | null
   *
   * Segment 2 (visibleChildren: 1, filter: NOT(...)):
   *   Child 0 rows NOT matching → child 1 fields are NULL:
   *     EU | Germany | null | null | null
   *     NA | null    | null | null | null
   *
   * UNION ALL of both segments gives the final dimension grid.
   * The filter is always on the gating child's columns — it decides which of
   * that child's rows see more children in the cross join.
   */
  case "cross": {
    let level = currentLevel;
    const newChildren: DimSpec[] = [];
    let lastReachableChildIdx = -1;
    let nextChildReached = true;
    const gatingFilters: { childIdx: number; conditions: { field: string; values: string[] }[] }[] = [];
    let currentPaths = paths;

    for (let i = 0; i < spec.children.length; i++) {
      const child = spec.children[i];
      const childRange = computeLevelRange(child, level);

      if (childRange.end < childRange.start) {
        newChildren.push(child);
        continue;
      }

      if (!nextChildReached) {
        newChildren.push(child);
        level = childRange.end + 1;
        continue;
      }

      lastReachableChildIdx = i;

      if (currentPaths.length === 0) {
        newChildren.push(applyDrilldownToNode(child, [], level));
        nextChildReached = false;
        level = childRange.end + 1;
        continue;
      }

      const walkResult = walkPathsThroughRange(currentPaths, child, childRange, level);
      const newChild = applyDrilldownToNode(child, currentPaths, level);
      newChildren.push(newChild);

      if (walkResult.selectiveFilters.length > 0) {
        const childHasSegments = (newChild.type === "hierarchy" && newChild.segments) ||
                                 (newChild.type === "cross" && newChild.segments);
        if (childHasSegments) {
          gatingFilters.push({ childIdx: i, conditions: walkResult.selectiveFilters });
        }
      }

      currentPaths = walkResult.remainingPaths;
      nextChildReached = walkResult.nextLevelReached;
      level = childRange.end + 1;
    }

    const someUnreachable = lastReachableChildIdx < spec.children.length - 1;
    const hasGatingBeforeLast = gatingFilters.some(g => g.childIdx < lastReachableChildIdx);
    const needsSegments = someUnreachable || hasGatingBeforeLast;
    if (!needsSegments) {
      return { type: "cross", children: newChildren };
    }

    const crossSegments: CrossSegment[] = [];
    const relevantGates = gatingFilters.filter(g => g.childIdx < lastReachableChildIdx);

    if (relevantGates.length === 0) {
      crossSegments.push({ visibleChildren: lastReachableChildIdx + 1 });
    } else {
      // Accumulate conditions from outermost to innermost gate.
      // Each tier sees more children than the previous, gated by cumulative conditions.
      const accumulatedConditions: { field: string; values: string[] }[] = [];

      // Deepest tier: passes ALL gates → sees all reachable children
      for (const gate of relevantGates) {
        accumulatedConditions.push(...gate.conditions);
      }
      crossSegments.push({
        visibleChildren: lastReachableChildIdx + 1,
        filter: { pass: accumulatedConditions, fail: [] },
      });

      // Remaining tiers (from innermost gate back to outermost):
      // Each tier passes outer gates but fails the current gate → sees children up to current gate's child.
      for (let g = relevantGates.length - 1; g >= 0; g--) {
        const pass: { field: string; values: string[] }[] = [];
        for (let o = 0; o < g; o++) {
          for (const c of relevantGates[o].conditions) {
            pass.push({ field: c.field, values: c.values });
          }
        }
        const fail = relevantGates[g].conditions.map(c => ({ field: c.field, values: c.values }));

        crossSegments.push({
          visibleChildren: relevantGates[g].childIdx + 1,
          filter: { pass, fail },
        });
      }
    }

    return { type: "cross", children: newChildren, segments: crossSegments };
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
    const [colConfig, rowConfig] = [config.columns, config.rows].map(normalizeAxisConfig);
    const [colIR, rowIR] = [colConfig.expr, rowConfig.expr].map(e => this.buildAxisIR(e));

    if (colConfig.drilldown) colIR.dimSpec = applyDrilldownToNode(colIR.dimSpec, colConfig.drilldown, 0);
    if (rowConfig.drilldown) rowIR.dimSpec = applyDrilldownToNode(rowIR.dimSpec, rowConfig.drilldown, 0);
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

    console.log("combinedDimSpec", JSON.stringify(combinedDimSpec, null, 2));

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
