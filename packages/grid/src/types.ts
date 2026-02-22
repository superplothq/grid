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

export interface PivotConfig {
  rows: AxisExpr;
  columns: AxisExpr;
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
  | { type: "hierarchy"; fields: string[] }
  | { type: "cross"; children: DimSpec[] }
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
