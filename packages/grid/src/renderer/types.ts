import { CellRenderer } from "./cell-renderers";
import { ProjectionState } from "../datamodel/types";
import { GridDataViewModel } from "./grid-data-viewmodel";
import { GridConfig } from "./grid-config";
import CellManager from "./cell-manager";
import PFixture from "./fixture-proto";

export type Constructor<T> = new (...args: any[]) => T;

export type Registry = Map<string, Map<string, Object>>;

export type Theme = Record<string, string | number>;

export type GridWin = Window & {
  __dataflow_grid__: {
    registry: Registry;
    themes: Map<string, Theme>;
  };
};

export type FacetData = (string | null)[][];

export interface FlatRowMeta {
  depth: number;
  isLeaf: boolean;
  isExpanded: boolean;
}

export interface BaseSliceResult {
  numRows: number;
  numCols: number;
  sliceNumRows: number;
  sliceNumCols: number;
  columnFacets?: (string | null)[][];
  data?: any[][];
}

export interface PivotSliceResult extends BaseSliceResult {
  rowFacets: (string | null)[][];
}

export interface FlatSliceResult extends BaseSliceResult {
  rowFacets: (string | null)[];
  rowMeta: FlatRowMeta[];
}

export interface IColAutoSize {
  strategy: "max-cell" | "fixed-width" | "static";
  excludeColumnFacets?: boolean;
}

export interface IColAutoSizeStrategyMaxCell extends IColAutoSize {
  strategy: "max-cell";
}

// Fits container
export interface IColAutoSizeStrategyStatic extends IColAutoSize {
  strategy: "static";
  width: number;
  unit: "%" | "fr" | "px";
}

export interface IColAutoSizeStrategyFixedWidth extends IColAutoSize {
  strategy: "fixed-width";
  widthInPx?: number;
  maxWidthInPx?: number;
  minWidthInPx?: number;
}

export type ColAutoSizeConfig =
  | IColAutoSizeStrategyMaxCell
  | IColAutoSizeStrategyFixedWidth
  | IColAutoSizeStrategyStatic;

export interface VTrackDef<T = any> {
  renderer?: CellRenderer<T>;
  cellHeight?: number;
  sampleData?: T;
  colSize?: ColAutoSizeConfig;
}
type El = HTMLElement | HTMLElement[] | string;

export interface FacetRendererContext {
  render: (viewModel: GridDataViewModel) => void;
  cell: HTMLElement;
  container: HTMLElement;
}

export interface FacetDataContext {
  viewModel: GridDataViewModel;
  path: (string | null)[];
  level: number;
  index: number;
  flatMeta?: FlatRowMeta;
  key: string;
}

export interface FacetCellContent {
  left?: El;
  content: El;
  right?: El;
}

// when the renderer takes ownership of the container element (framework like react createRoot rendering)
// it returns undefined (void) from the renderer
export type FacetCellRenderer<T = string> = (
  data: T,
  dataCtx: FacetDataContext,
  ctx: FacetRendererContext
) => FacetCellContent | El | void;

export interface HeaderCellContext {
  viewModel: GridDataViewModel;
  axis: "row" | "col";
  level: number;
  key: string;
  container: HTMLElement;
}

// when the renderer takes ownership of the container element (framework like react createRoot rendering)
// it returns undefined (void) from the renderer
export type FacetHeaderRenderer = (
  text: string,
  ctx: HeaderCellContext
) => FacetCellContent | string | HTMLElement | HTMLElement[] | void;

export interface FacetMeta {
  projectionState: ProjectionState;
  projectedValues: Set<string>;
}

export interface FacetDef {
  text: string;
  facetField?: string | null;
  headerRenderer: FacetHeaderRenderer;
  trackRenderer: FacetCellRenderer;
  meta?: FacetMeta;
  pseudo?: boolean;
  colSize?: ColAutoSizeConfig;
}

export interface GridDataViewModelOptions {
  vTrackDefs?: VTrackDef[];
  facetDefs?: {
    row: Partial<FacetDef>[];
    col: Partial<FacetDef>[];
    axis: "row" | "col";
  };
  totalRows?: number;
  offsetTop?: number;
}

export interface ResolvedVTrackDef extends VTrackDef {
  renderer: CellRenderer<any>;
  isCustom: boolean;
  colSize: ColAutoSizeConfig;
}

export interface CellToMeasure {
  cell: HTMLElement;
  sizeKey: number;
}

export type PFixtureCls = new (config: GridConfig, con: HTMLElement, cellManager: CellManager) => PFixture;
export interface LayoutFixtureClasses {
  top: PFixtureCls[];
  left: PFixtureCls[];
  bottom: PFixtureCls[];
  right: PFixtureCls[];
}

export type FacetPredicate = (dim: string, dimVal: string | null, path: [string, string | null][]) => boolean;
export type CellPredicate = (value: any) => boolean;

export interface SelectionProps {
  cellRenderer?: CellRenderer<any>;
  trackRenderer?: FacetCellRenderer;
  colSize?: ColAutoSizeConfig;
}

export interface FacetPredicateNode { type: "facet"; predicate: FacetPredicate; }
export interface CellPredicateNode { type: "cell"; predicate: CellPredicate; }
export type PredicateNode = FacetPredicateNode | CellPredicateNode;

export type TerminalOp =
  | { type: "prop"; props: SelectionProps }
  | { type: "style"; fn: (container: HTMLElement) => void };

export interface SelectionRule {
  id: number;
  predicates: PredicateNode[];
  terminal: TerminalOp;
}
