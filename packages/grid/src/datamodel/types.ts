import { VTrackDef, ViewModelMetadata, MetadataValue } from "../renderer/types";
import type { FacetData } from "../renderer/types";
import type { DataSource } from "./datasource";

// TODO [Later] remember there might be custom aggregate function as well
//   (those functions will be registered separately and the name will be used here)
// #region aggregate-fn
type AggregateFn = "sum" | "avg" | "count" | "min" | "max";
// #endregion aggregate-fn

// #region sort-direction
export type SortDirection = "asc" | "desc" | "noop";
// #endregion sort-direction

/**
 * A single sort instruction. The `sort` array in [`StandardDataFetchAndTransformIR`](/docs/api-references/type-references#getrowsir) is ordered - earlier entries take priority (multi-sort).
 */
export interface SortEntry {
  /** Column to sort by. */
  field: string;
  /** Sort direction. `"noop"` means this entry is inactive. */
  direction: SortDirection;
  /** When absent, rows are sorted by the value of `field` directly. When present, `field` identifies which group to sort and `by` specifies a measure column whose aggregated value determines the order. For example, `{ field: "country", direction: "desc", by: "revenue" }` sorts country groups by their total revenue descending. */
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

/**
 * Controls which values are expanded at a single level of a [dimensional projection](/docs/datamodel/pivot-table-datamodel#dimensional-projection). Forms a linked list - each node describes one level, and `next` points to the projection for the level below.
 */
export interface DimensionalProjectionPath {
  /** Values to expand at this level. `"*"` expands all values; an array expands only the listed values. */
  open: string[] | "*";
  /** Projection for the next level down. Only applies to values matched by `open`. If absent, expansion stops at this level. */
  next?: DimensionalProjectionPath;
}

export type AxisConfig = { expr: AxisExpr; projection?: DimensionalProjectionPath[] };

/**
 * Input to [`PivotTableDataModel.getViewModelData`](/docs/datamodel/pivot-table-datamodel#how-it-works). Describes which fields go on the row axis, column axis, and how to filter and sort the data.
 */
export interface PivotConfig {
  /** Defines the row axis. Pass a plain string, an operator tree ([`AxisExpr`](/docs/api-references/type-references#axisexpr)), or an [`AxisConfig`](/docs/api-references/type-references#axisconfig) to include [dimensional projection](/docs/datamodel/pivot-table-datamodel#dimensional-projection). */
  rows: AxisExpr | AxisConfig;
  /** Defines the column axis. Same types as `rows`. */
  columns: AxisExpr | AxisConfig;
  /** Filters applied globally to both axes before aggregation. Supports [`ScalarFilter`](/docs/api-references/type-references#scalarfilter) and [`TupleFilter`](/docs/api-references/type-references#tuplefilter). Multiple filters are combined with AND. */
  filter?: Filter[];
  /** Controls the ordering of row facet values. Each [`SortEntry`](/docs/api-references/type-references#sortentry) can sort by the dimension value itself (`by` absent) or by a measure's aggregated value (`by` set to a measure field). `direction: "noop"` keeps the natural order. */
  sort?: SortEntry[];
  /** Agent-defined metadata configuration. Core does not interpret this field — it passes it through to the metadata plumber's resolver and reshaper. */
  metadata?: unknown;
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

/**
 * A single filter condition on one column. The `filter` array in [`StandardDataFetchAndTransformIR`](/docs/api-references/type-references#getrowsir) combines entries with AND - all filters must match for a row to be included.
 */
export interface ScalarFilter {
  /** Always `"scalar"` for scalar filters. */
  type: "scalar";
  /** Column to filter on. */
  field: string;
  /** Set to `"date"` for date-part filters (year, month, etc). */
  subtype?: "date";
  /** Comparison operator. */
  op: "eq" | "neq" | "in" | "not_in"
    | "gt" | "lt" | "gte" | "lte"
    | "between"
    | "contains" | "doesNotContain" | "startsWith" | "endsWith"
    | "before" | "after"
    | "empty" | "notEmpty";
  /** Value to compare against. Shape depends on `op` - array for `in`/`not_in`/`between`, scalar for others, `null` for `empty`/`notEmpty`. */
  value: string | string[] | number | number[] | null;
}

// #region date-part
export type DatePart = "year" | "month" | "day" | "hour" | "minute" | "second" | "quarter" | "week";
// #endregion date-part

/**
 * Extends [`ScalarFilter`](/docs/api-references/type-references#scalarfilter) for filtering on a specific part of a date/timestamp column. Adds a `part` field that extracts a [`DatePart`](/docs/api-references/type-references#datepart) (year, month, day, etc) from the column before applying the operator. This enables queries like "year = 2024" or "month between 3 and 6" that are not possible with a plain `ScalarFilter` on the raw timestamp value.
 */
export interface DatePartScalarFilter extends ScalarFilter {
  /** Must be `"date"` to indicate date-part extraction. */
  subtype: "date";
  /** Which part of the date to extract before comparing. See [`DatePart`](/docs/api-references/type-references#datepart). */
  part: DatePart;
}

// #region domain-values
export type ColumnRangeValues =
  | { type: "categorical"; values: string[] }
  | { type: "range"; min: number; max: number }
  | { type: "temporal"; min: string; max: string };
// #endregion domain-values

/**
 * Filters on combinations of multiple columns. Each entry in `value` is a tuple that must match across all `fields`. For example, `fields: ["region", "country"], op: "in", value: [["Europe", "Germany"], ["Europe", "France"]]` includes only rows where region/country is one of those exact pairs.
 */
export interface TupleFilter {
  /** Always `"tuple"` for tuple filters. */
  type: "tuple";
  /** Columns that form the tuple (e.g. `["region", "country"]`). */
  fields: string[];
  /** `"in"` includes matching tuples; `"not_in"` excludes them. */
  op: "in" | "not_in";
  /** Array of tuples to match. Each inner array has one value per field, in the same order as `fields`. */
  value: (string | number)[][];
}

export type Filter = ScalarFilter | TupleFilter;

/**
 * Query passed to [`PivotTableDataModel.resolveFacetValues`](/docs/datamodel/pivot-table-datamodel#api-reference) to retrieve available values for filter UIs. Returns one array of values per field.
 *
 * Example: fetch distinct regions and countries for filter dropdowns:
 *
 * ```
 * const query: PivotFilterQuery = {
 *   type: "facet",
 *   fields: ["region", "country"],
 *   mode: "distinct",
 * };
 * const result = await model.resolveFacetValues(query);
 * // result: [["NA", "EU", "APAC"], ["USA", "Canada", "UK", "Germany"]]
 * ```
 */
export interface PivotFilterQuery {
  /** Always `"facet"`. */
  type: "facet";
  /** Column names to query values for. */
  fields: string[];
  /** `"distinct"` returns unique values per field independently. `"group"` returns observed combinations across fields. */
  mode: "distinct" | "group";
  /** Optional pre-filters to narrow the values returned (e.g. only show countries within a selected region). */
  filters?: ScalarFilter[];
}

/**
 * A measure to aggregate in the pivot query. Extracted from the [`AxisExpr`](/docs/api-references/type-references#axisexpr) during IR building - any field whose schema type is `"measure"` becomes a `Measure` entry.
 */
export interface Measure {
  /** Column name of the measure field. */
  field: string;
  /** Aggregation function to apply. See [AggregateFn](/docs/api-references/type-references#aggregatefn). Defaults to `"sum"` if not specified in the schema. */
  aggregation: AggregateFn;
  /** Optional [`ScalarFilter`](/docs/api-references/type-references#scalarfilter)s applied to this measure before aggregation. */
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

/**
 * Intermediate representation passed to [`PivotTableDataModel.getData`](/docs/datamodel/pivot-table-datamodel#api-reference). Contains the dimensional structure and measures to aggregate. The subclass interprets this to produce grouped, aggregated data.
 */
export interface PivotDataFetchAndTransformIR {
  /** Tree describing the dimensional grouping structure. See [DimSpec](/docs/datamodel/pivot-table-datamodel#dimspec). */
  dimSpec: DimSpec;
  /** Flat list of measures to aggregate. Each has a field, aggregation function, and optional filters. */
  measures: Measure[];
  /** Sort instructions for row dimension values. When present, only covers row dimension fields. */
  sort?: SortEntry[];
}

/**
 * The return type of [`PivotTableDataModel.getData`](/docs/datamodel/pivot-table-datamodel#api-reference). Column-major format: `data[i]` is the full value array for `columns[i]`. Dimension columns come first (in tree-traversal order of the DimSpec), followed by measure columns.
 *
 * Example for `cross("region", "department")` with measure `revenue`:
 *
 * ```
 * {
 *   columns: ["region", "department", "revenue"],
 *   data: [
 *     ["NA", "NA", "EU", "EU"],         // region (dimension)
 *     ["Elec", "App", "Elec", "App"],   // department (dimension)
 *     [8150, 1670, 5650, 1730],         // revenue (measure)
 *   ],
 * }
 * ```
 */
export interface PivotRawDataFromSource {
  /** Column names in order: dimension columns first, then measure columns. */
  columns: string[];
  /** Column-major data. `data[i]` holds all values for `columns[i]`. All inner arrays have the same length (the row count). */
  data: any[][];
  /** Metadata columns extracted separately from the main data. Keys are metadata aliases (e.g. `"__meta__profit_pct"`), values are column-major arrays aligned with the main data rows. */
  metadata?: Record<string, any[]>;
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

/**
 * Configuration for [`StandardTableDataModel`](/docs/datamodel/standard-table-datamodel) pagination and cache behavior.
 */
export interface StandardTableConfig {
  /** Number of rows per page. */
  pageSize: number;
  /** Maximum number of fetched pages to keep in memory before the farthest page is evicted. This is how larger-than-memory datasets are supported - only a bounded window of pages is held in the browser at any time. */
  maxNumPageBeforeEviction: number;
}

/**
 * Intermediate representation describing which rows to fetch. [`StandardTableDataModel`](/docs/datamodel/standard-table-datamodel) passes this to `getData`; the subclass converts it into a backend command (e.g. SQL).
 */
export interface StandardDataFetchAndTransformIR {
  /** Start row index in the data source (inclusive). The caller is responsible for converting any logical row to a row index in the data source. All pages overlapping the `[startRow, endRow)` range that are not already cached are fetched in parallel. */
  startRow: number;
  /** End row index in the data source (exclusive). */
  endRow: number;
  /** Path into the group hierarchy. When `groupBy` is set, data is organized in nested groups. Expanding a group progressively loads its child pages. `groupPath` represents which expanded path to fetch from - empty `[]` for top level, `["USA"]` for children of "USA", `["USA", "California"]` for children of California under USA. */
  groupPath: string[];
  /** Columns that form the grouping hierarchy (e.g. `["country", "state"]`). When set, the data source returns aggregated group rows instead of individual rows. Each level in `groupBy` becomes a nesting level - the first column forms the top-level groups, the second forms sub-groups within each expanded parent, and so on. `groupPath` determines which level is being fetched. */
  groupBy: string[];
  /** Columns to include in the output. */
  project: string[];
  /** Sort instructions. Array is ordered by priority (multi-sort) - first entry is the primary sort. See [`SortEntry`](/docs/api-references/type-references#sortentry). */
  sort: SortEntry[];
  /** Filter conditions. Multiple filters are combined with AND - all must match. See [`ScalarFilter`](/docs/api-references/type-references#scalarfilter). */
  filter: ScalarFilter[];
  /** Agent-defined metadata configuration. Core does not interpret this field — it passes it through to the metadata plumber. */
  metadata?: unknown;
}

/**
 * The response shape returned by [`getData`](/docs/datamodel/standard-table-datamodel#api-reference).
 */
export interface GetRowsResponse {
  /** Column-major data arrays. Each inner array holds all values for one column. For example, 3 rows with columns `[name, age]` is stored as `[["Alice", "Bob", "Carol"], [30, 25, 28]]`. */
  rowData: any[][];
  /** Total number of rows. */
  totalRowCount: number;
  /** Raw metadata columns extracted from the query. Keys are metadata aliases (e.g. `"__meta__email__null"`), values are column-major arrays aligned with `rowData` rows. Populated when a metadata resolver contributes expressions to the getData query. */
  metadata?: Record<string, any[]>;
}

/**
 * A page slot in the [`StandardTableDataModel`](/docs/datamodel/standard-table-datamodel) cache tree. Each page holds a fixed slice of rows.
 */
export interface PageNode {
  /** Column-major row data, or `null` if the page has not been fetched yet. */
  data: any[][] | null;
  /** The starting row index in the data source for this page. Physical index refers to the actual row position in the source data, as opposed to logical index which is the position the renderer displays. These differ when virtualization or lazy loading is active - only a subset of physical rows may be loaded, and the renderer maps them to logical positions. */
  physicalStart: number;
  /** Number of rows this page covers. */
  rowCount: number;
  /** Map from local row index to its [`ExpandedGroup`](/docs/api-references/type-references#expandedgroup). When `expand(groupPath)` is called, an entry is added here for that row with `expanded: true` and child pages populated. When `collapse(groupPath)` is called, `expanded` is set to `false` but the entry and its child data remain cached for fast re-expansion. */
  expandedRows: Map<number, ExpandedGroup>;
  /** Page-scoped metadata (rows + cells) in page-local coordinates. Evicted with data when the page is evicted. */
  metadata?: PageMetadata;
}

/**
 * Represents an expanded (or previously expanded) child group within a [`PageNode`](/docs/api-references/type-references#pagenode).
 */
export interface ExpandedGroup {
  /** Whether this group is currently expanded. `false` means collapsed but child data is still cached. */
  expanded: boolean;
  /** Total number of child rows in this group. */
  totalRowCount: number;
  /** Child [`PageNode`](/docs/api-references/type-references#pagenode)s holding the group's row data. */
  pages: PageNode[];
}

// #region pivot-metadata

export interface PivotMetadataResolverInput {
  ir: PivotDataFetchAndTransformIR;
  schema: DataSchema[];
}

export interface PivotMetadataResolver<T> {
  resolve(input: PivotMetadataResolverInput): T[];
}

export interface SqlPivotMetadataResolverInput extends PivotMetadataResolverInput {
  gridCte: string;
  tableAlias: string;
}

export interface SqlSelectExpression {
  alias: string;
  sql: string;
}

export interface SqlPivotMetadataResolver extends PivotMetadataResolver<SqlSelectExpression> {
  resolve(input: SqlPivotMetadataResolverInput): SqlSelectExpression[];
}

export interface PivotMetadataReshapeInput {
  config: PivotConfig;
  raw: PivotRawDataFromSource;
  data: any[][];
  rowIndex: Map<string, number>;
  colIndex: Map<string, number>;
  rowFacets: FacetData;
  colFacets: FacetData;
  measures: Measure[];
  rowDimCount: number;
  colDimCount: number;
}

export interface PivotMetadataReshaper {
  reshape(input: PivotMetadataReshapeInput, metadata: Partial<ViewModelMetadata>): void;
}

export interface PivotMetadataPlumbing<T> {
  resolver?: PivotMetadataResolver<T>;
  reshaper: PivotMetadataReshaper;
}

export type PivotMetadataPlumber<T = unknown> = (config: PivotConfig) => PivotMetadataPlumbing<T>;

// #endregion pivot-metadata

// #region standard-table-metadata

export interface StandardRawMetadata {
  [key: string]: unknown;
}

export interface StandardMetadataResolverInput {
  ir: StandardDataFetchAndTransformIR;
  schema: DataSchema[];
  dataSource?: DataSource<any>;
}

export interface StandardGlobalMetadataResolver {
  resolve(input: StandardMetadataResolverInput): Promise<StandardRawMetadata>;
}

export interface StandardMetadataResolver<T> {
  resolve(input: StandardMetadataResolverInput): T[];
}

export interface SqlStandardMetadataResolverInput extends StandardMetadataResolverInput {
  table: string;
}

export interface SqlStandardMetadataResolver extends StandardMetadataResolver<SqlSelectExpression> {
  resolve(input: SqlStandardMetadataResolverInput): SqlSelectExpression[];
}

export interface StandardColumnMetadata {
  colIdx: number;
  meta: MetadataValue;
}

export interface StandardPageRowMetadata {
  rowIdx: number;
  meta: MetadataValue;
}

export interface StandardPageCellMetadata {
  rowIdx: number;
  colIdx: number;
  meta: MetadataValue;
}

export interface PageMetadata {
  rows?: StandardPageRowMetadata[];
  cells?: StandardPageCellMetadata[];
}

export interface StandardGlobalMetadataReshaperInput {
  ir: StandardDataFetchAndTransformIR;
  raw: StandardRawMetadata;
  schema: DataSchema[];
}

export interface StandardGlobalMetadataReshaper {
  reshape(input: StandardGlobalMetadataReshaperInput): StandardColumnMetadata[];
}

export interface StandardMetadataReshaperInput {
  ir: StandardDataFetchAndTransformIR;
  pageMetadata: Record<string, any[]>;
  rowData: any[][];
  schema: DataSchema[];
}

export interface StandardMetadataReshaper {
  reshape(input: StandardMetadataReshaperInput): PageMetadata;
}

export interface StandardMetadataPlumbing {
  global?: { resolver: StandardGlobalMetadataResolver; reshaper: StandardGlobalMetadataReshaper };
  pageWise?: { resolver: StandardMetadataResolver<unknown>; reshaper: StandardMetadataReshaper };
}

export type StandardMetadataPlumber = (ir: StandardDataFetchAndTransformIR) => StandardMetadataPlumbing;

// #endregion standard-table-metadata
