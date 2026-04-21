import { VTrackDef } from "../renderer/types";

// TODO [Later] remember there might be custom aggregate function as well
//   (those functions will be registered separately and the name will be used here)
type AggregateFn = "sum" | "avg" | "count" | "min" | "max";

export type SortDirection = "asc" | "desc" | "noop";

export interface SortEntry {
  field: string;
  direction: SortDirection;
  by?: string;
}

export type SchemaSubtype = "quantitative" | "temporal" | "nominal" | "integer" | "decimal";

export interface Schema {
  type: "measure" | "dimension";
  subtype?: SchemaSubtype;
  datetimeFormat?: string;
  aggregateFn?: AggregateFn;
  cardinality?: "low" | "high";
}

export interface DataSchema extends Schema {
  name: string;
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

export interface FlatTableConfig {
  schema: DataSchema[];
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
