import {ColDef} from "./renderer/types";

// TODO [Later] remember there might be custom aggregate function as well
//   (those functions will be registered separately and the name will be used here)
type AggregateFn = "sum" | "avg" | "count" | "min" | "max";

export interface Schema {
  name: string;
  displayName: string;
  type: "measure" | "dimension";
}

export interface MeasureSchema extends Schema {
  type: "measure";
  aggregateFn?: AggregateFn;   // default "sum"
}

export interface GridData {
  columns: (string | Schema)[];
  data: any[][];
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

export interface Filter {
  field: string;
  op: "eq" | "neq" | "in" | "not_in";
  value: string | string[];
}

export interface FacetQuery {
  type: "facet";
  fields: string[];
  mode: "distinct" | "group";
  filters?: Filter[];
}

export interface Measure {
  field: string;
  aggregation: AggregateFn;
}

export type DimSpec =
  | { type: "none" }
  | { type: "simple"; field: string }
  | { type: "hierarchy"; fields: string[]; segments?: HierarchySegment[] }
  | { type: "cross"; children: DimSpec[]; segments?: CrossSegment[] }
  | { type: "concat"; children: DimSpec[] };

export interface IR {
  dimSpec: DimSpec;
  measures: Measure[];
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
  colDefs?: ColDef[];
}


export enum ProjectionState {
  PROJECTED,
  NOT_PROJECTED,
  SOME_PROJECTED,
  PROJECTION_NOT_CONFIGURED
}

export interface ColDefsForFacet extends ColDef {
  projectionState: ProjectionState;
  projectedValues: Set<string>;
}
