import { VTrackDef } from "../renderer/types";

// TODO [Later] remember there might be custom aggregate function as well
//   (those functions will be registered separately and the name will be used here)
// #region aggregate-fn
type AggregateFn = "sum" | "avg" | "count" | "min" | "max";
// #endregion aggregate-fn

export type SortDirection = "asc" | "desc" | "noop";

export interface SortEntry {
  field: string;
  direction: SortDirection;
  by?: string;
}

// #region schema-subtype
export type SchemaSubtype = "temporal" | "nominal" | "integer" | "decimal";
// #endregion schema-subtype

/**
 * Defines the semantic role and behavior of a column — whether it holds values to aggregate (measure) or categories to group by (dimension), how its raw values should be parsed and stored, and what operations are valid on it.
 *
 * By attaching semantics to each field, the data model and renderer can make decisions automatically based on the column's role — SQL type casting during loading, aggregation strategy, domain value extraction for filters, and rendering behavior in the UI.
 */
export interface Schema {
  /**
   * Determines how the grid treats this column.
   *
   * - `"measure"` — stored as a number (`INTEGER` or `DOUBLE` in SQL). The grid can aggregate it (sum, avg, etc.) and reports numeric domain ranges (min/max) for filtering.
   * - `"dimension"` — used for grouping, pivoting, and labeling rows. Stored as `VARCHAR` (or `TIMESTAMP` if `subtype` is `"temporal"`). Filtering returns distinct categorical values.
   */
  type: "measure" | "dimension";
  /**
   * Optional refinement that controls SQL type casting and filtering behavior. See [SchemaSubtype](/docs/api-references/type-references#schemasubtype).
   *
   * | Subtype | Valid for type | Behavior |
   * | --- | --- | --- |
   * | `"integer"` | `"measure"` | Whole-number storage and aggregation |
   * | `"decimal"` | `"measure"` | Floating-point storage and aggregation |
   * | `"temporal"` | `"dimension"` | Parsed using `datetimeFormat`, filtered by date range (min/max) |
   * | `"nominal"` | `"dimension"` | Default for dimensions, filtered by distinct values |
   */
  subtype?: SchemaSubtype;
  /**
   * Format string that tells the SQL engine how to parse date/time values from raw strings.
   * Only used when `subtype` is `"temporal"`.
   *
   * Uses [strptime format codes](https://duckdb.org/docs/sql/functions/dateformat.html) — e.g. `"%Y-%m-%d"` parses `"2024-03-15"`, `"%m/%d/%Y %H:%M"` parses `"03/15/2024 14:30"`.
   */
  datetimeFormat?: string;
  /** Aggregate function for measures. Defaults to `"sum"` if not specified. See [AggregateFn](/docs/api-references/type-references#aggregatefn). */
  aggregateFn?: AggregateFn;
  /** Cardinality hint for dimensions: `"low"` for few unique values, `"high"` for many. Upstream consumers can use this to pick appropriate UI — e.g. a dropdown for low cardinality vs. a search input for high cardinality. */
  cardinality?: "low" | "high";
}

/**
 * A named column definition that extends `Schema` with an identifier.
 *
 * This is the primary type used throughout the grid to describe columns —
 * in datasource, datamodel, and grid configuration.
 */
export interface DataSchema extends Schema {
  /** The column name as it appears in the data source. */
  name: string;
  /** Optional human-readable label for rendering in headers. */
  displayName?: string;
}

export interface GridData {
  columns: (string | DataSchema)[];
  data: any[][];
  replace?: Map<string, Map<string, string>>;
}

export type AxisExpr =
  | string
  | { type: "cross"; children: AxisExpr[] }
  | { type: "concat"; children: AxisExpr[] }
  | { type: "hierarchy"; fields: string[] };

export interface DimensionalProjectionPath {
  open: string[] | "*";
  next?: DimensionalProjectionPath;
}

export type AxisConfig = { expr: AxisExpr; projection?: DimensionalProjectionPath[] };

export interface PivotConfig {
  rows: AxisExpr | AxisConfig;
  columns: AxisExpr | AxisConfig;
  filter?: Filter[];
  sort?: SortEntry[];
}

export interface SegmentFilter {
  pass: { field: string; values: string[] }[];
  fail: { field: string; values: string[] }[];
}

export interface HierarchySegment {
  groupBy: string[];
  filter?: SegmentFilter;
}

export interface CrossSegment {
  visibleChildren: number;
  filter?: SegmentFilter;
}

export interface ScalarFilter {
  type: "scalar";
  field: string;
  subtype?: "date";
  op: "eq" | "neq" | "in" | "not_in"
    | "gt" | "lt" | "gte" | "lte"
    | "between"
    | "contains" | "doesNotContain" | "startsWith" | "endsWith"
    | "before" | "after"
    | "empty" | "notEmpty";
  value: string | string[] | number | number[] | null;
}

export type DatePart = "year" | "month" | "day" | "hour" | "minute" | "second" | "quarter" | "week";

export interface DatePartScalarFilter extends ScalarFilter {
  subtype: "date";
  part: DatePart;
}

export type DomainValues =
  | { type: "categorical"; values: string[] }
  | { type: "range"; min: number; max: number }
  | { type: "temporal"; min: string; max: string };

export interface TupleFilter {
  type: "tuple";
  fields: string[];
  op: "in" | "not_in";
  value: (string | number)[][];
}

export type Filter = ScalarFilter | TupleFilter;

export interface FacetQuery {
  type: "facet";
  fields: string[];
  mode: "distinct" | "group";
  filters?: ScalarFilter[];
}

export interface Measure {
  field: string;
  aggregation: AggregateFn;
  filter: ScalarFilter[];
}

// hierarchy groups multiple fields into a single leaf node (e.g. hierarchy("region", "country")).
// A filter on any of its fields (e.g. region="Europe") must land on the hierarchy node itself
// because there is no deeper simple node to attach it to — the hierarchy IS the leaf CTE.
export type DimSpec =
  | { type: "none" }
  | { type: "simple"; field: string; filter: Filter[] }
  | { type: "hierarchy"; fields: string[]; segments?: HierarchySegment[]; filter: Filter[] }
  | { type: "cross"; children: DimSpec[]; segments?: CrossSegment[]; filter: Filter[] }
  | { type: "concat"; children: DimSpec[] };

export interface IR {
  dimSpec: DimSpec;
  measures: Measure[];
  sort?: SortEntry[];
}

export interface RawDataFromIR {
  columns: string[];
  data: any[][];
}

export interface ViewModelDataTransformationConfig {
  columns: string[];
  data: any[][];
  pivotConfig?: {
    rows: AxisExpr;
    columns: AxisExpr;
  };
  vTrackDefs?: VTrackDef[];
}


export enum ProjectionState {
  PROJECTED,
  NOT_PROJECTED,
  SOME_PROJECTED,
  PROJECTION_NOT_CONFIGURED
}

export interface ColDefsForFacet {
  projectionState: ProjectionState;
  projectedValues: Set<string>;
}

export interface StandardTableConfig {
  pageSize?: number;
  // TODO[review] rename numMaxPageSize
  maxCacheSize?: number;
}

export interface GetRowsIR {
  startRow: number;
  endRow: number;
  groupPath: string[];
  groupBy: string[];
  project: string[];
  sort: SortEntry[];
  filter: ScalarFilter[];
}

export interface GetRowsResponse {
  rowData: any[][];
  totalRowCount: number;
}

export interface PageNode {
  data: any[][] | null;
  physicalStart: number;
  rowCount: number;
  expandedRows: Map<number, ExpandedGroup>;
}

export interface ExpandedGroup {
  expanded: boolean;
  totalRowCount: number;
  pages: PageNode[];
}
