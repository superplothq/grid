import {ColDef} from "./renderer/types";

// ── Existing types (carried over) ────────────────────────

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

export const ROLLUP_MARKER = "<__RUP__>";

export interface DrilldownRule {
  toLevel: string;
  where: "*" | Record<string, string[]>;
}

export interface AxisConfig {
  field: AxisExpr;
  drilldown?: DrilldownRule[];
}

export interface RowDef {
  type: "agg";
  root?: true;
}

export interface PivotConfig {
  rows?: AxisExpr | AxisConfig;
  columns: AxisExpr | AxisConfig;
}

// ── IR types (new) ───────────────────────────────────────

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

export interface PivotQuery {
  type: "pivot";
  groups: PivotGroup[];
  filters?: Filter[];
}

export interface PivotGroup {
  dimensions: string[];
  measures: Measure[];
  filters?: Filter[];
  groupingSets?: string[][];
}

export interface Measure {
  field: string;
  aggregation: AggregateFn;
}

// ── Result types ─────────────────────────────────────────

export interface PivotGroupResult {
  columns: string[];
  data: any[][];          // column-major
}

// ── ViewModel config (carried over) ─────────────────────

export interface ViewModelDataTransformationConfig {
  columns: string[];
  data: any[][];
  pivotConfig?: {
    rows?: AxisExpr;
    columns: AxisExpr;
  };
  colDefs?: ColDef[];
}
