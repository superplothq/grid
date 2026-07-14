import { CellRenderer } from "./cell-renderers";
import { ProjectionState, DataSchema } from "../datamodel/types";
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

export interface DataViewport {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface FlatRowMeta {
  depth: number;
  isLeaf: boolean;
  isExpanded: boolean;
}

/**
 * Data required for the viewport defined by x0-x1 (columns) and y0-y1 (rows). The viewmodel decides which data to include. This is called a slice.
 */
export interface BaseSliceResult {
  /** Total number of rows in the viewmodel (not just the slice). */
  numRows: number;
  /** Total number of columns in the viewmodel (not just the slice). */
  numCols: number;
  /** Number of rows in this slice. */
  sliceNumRows: number;
  /** Number of columns in this slice. */
  sliceNumCols: number;
  /**
   * Column facet values for the sliced columns, transposed from the viewmodel's storage. The viewmodel stores facets as `colFacets[level][colIndex]`; the slice transposes them to `columnFacets[colIndex][level]` (grouped per column).
   *
   * Example - viewmodel with 2 levels, 4 columns:
   * ```
   * colFacets = [["Q1","Q1","Q2","Q2"], ["revenue","cost","revenue","cost"]]
   * ```
   * Slice for columns 1-2:
   * ```
   * columnFacets = [["Q1","cost"], ["Q2","revenue"]]
   * ```
   *
   * Absent when the slice is empty.
   */
  columnFacets?: (string | null)[][];
  /** Column-major data for the sliced range: `data[colIndex][rowIndex]`. Absent when the slice is empty. */
  data?: any[][];
}

/**
 * Slice result for pivot grids. Extends [`BaseSliceResult`](/docs/api-references/type-references#basesliceresult) with multi-level row facets.
 */
export interface PivotSliceResult extends BaseSliceResult {
  /**
   * Row facet values for the sliced rows, transposed from the viewmodel's storage. The viewmodel stores row facets as `rowFacets[level][rowIndex]`; the slice transposes them to `rowFacets[rowIndex][level]` (grouped per row). `null` means the value is the same as the row above (for merge/span rendering).
   *
   * Example - viewmodel with 2 levels, 3 rows:
   * ```
   * rowFacets = [["Europe",null,"North America"], ["Germany","France",null]]
   * ```
   * Slice for rows 0-2:
   * ```
   * rowFacets = [["Europe","Germany"], [null,"France"], ["North America",null]]
   * ```
   */
  rowFacets: (string | null)[][];
}

/**
 * Slice result for flat/standard tables. Extends [`BaseSliceResult`](/docs/api-references/type-references#basesliceresult) with single-level row facets and per-row metadata.
 */
export interface FlatSliceResult extends BaseSliceResult {
  /** Row facet values for the sliced rows. Group rows have a string label (e.g. `"USA"`); data/leaf rows have `null`. Single level, so no transposition - same shape as the viewmodel's storage. */
  rowFacets: (string | null)[];
  /** Unpacked row metadata for the sliced rows. See [`FlatRowMeta`](/docs/api-references/type-references#flatrowmeta). */
  rowMeta: FlatRowMeta[];
}

// #region col-auto-size-config
export interface IColAutoSize {
  strategy: "max-cell" | "clamped-width" | "static";
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

export interface IColAutoSizeStrategyClampedWidth extends IColAutoSize {
  strategy: "clamped-width";
  widthInPx?: number;
  maxWidthInPx?: number;
  minWidthInPx?: number;
}

export type ColAutoSizeConfig =
  | IColAutoSizeStrategyMaxCell
  | IColAutoSizeStrategyClampedWidth
  | IColAutoSizeStrategyStatic;
// #endregion col-auto-size-config

export interface VTrackDef<T = any> {
  renderer?: CellRenderer<T>;
  cellHeight?: number;
  sampleData?: T;
  colSize?: ColAutoSizeConfig;
}

type El = HTMLElement | HTMLElement[] | string;

// #region facet-cell-renderer
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
// #endregion facet-cell-renderer

// #region facet-header-renderer
export interface HeaderCellContext {
  viewModel: GridDataViewModel;
  level: number;
  key: string;
  cell: HTMLElement;
  container: HTMLElement;
  render: (viewModel: GridDataViewModel) => void;
}

// when the renderer takes ownership of the container element (framework like react createRoot rendering)
// it returns undefined (void) from the renderer
export type FacetHeaderRenderer = (
  text: string,
  ctx: HeaderCellContext
) => FacetCellContent | string | HTMLElement | HTMLElement[] | void;
// #endregion facet-header-renderer

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
  // Only used for row facet defs — column facets inherit the width of the data track above them.
  colSize?: ColAutoSizeConfig;
  groupSchema?: DataSchema[];
}

export interface GridDataViewModelOptions {
  vTrackDefs?: VTrackDef[];
  facetDefs?: {
    row: Partial<FacetDef>[];
    col: Partial<FacetDef>[];
    axis: "row" | "col";
  };
}

export interface ResolvedVTrackDef extends VTrackDef {
  renderer: CellRenderer<any>;
  isCustom: boolean;
  colSize: ColAutoSizeConfig;
}

export interface CellToMeasure {
  cell: HTMLElement;
  sizeKey: number;
  region: "left" | "center" | "right";
}

export type PFixtureCls = new (config: GridConfig, con: HTMLElement, cellManager: CellManager) => PFixture;
export interface LayoutFixtureClasses {
  top: PFixtureCls[];
  left: PFixtureCls[];
  bottom: PFixtureCls[];
  right: PFixtureCls[];
}

// #region metadata-types
export type MetadataValue = Record<string, unknown>;

export interface ColumnFacetMetadata {
  level: number;
  index: number;
  meta: MetadataValue;
}

export interface RowFacetMetadata {
  level: number;
  index: number;
  meta: MetadataValue;
}

export interface HeaderMetadata {
  axis: "row" | "column";
  level: number;
  meta: MetadataValue;
}

export interface ValueColumnMetadata {
  colIndex: number;
  meta: MetadataValue;
}

export interface ValueRowMetadata {
  rowIndex: number;
  meta: MetadataValue;
}

export interface ValueCellMetadata {
  colIndex: number;
  rowIndex: number;
  meta: MetadataValue;
}

export interface ViewModelMetadata {
  columnFacets?: ColumnFacetMetadata[];
  rowFacets?: RowFacetMetadata[];
  headers?: HeaderMetadata[];
  valueColumns?: ValueColumnMetadata[];
  valueRows?: ValueRowMetadata[];
  valueCells?: ValueCellMetadata[];

  getValueCellMeta(colIndex: number, rowIndex: number): MetadataValue | undefined;
  getValueColumnMeta(colIndex: number): MetadataValue | undefined;
  getValueRowMeta(rowIndex: number): MetadataValue | undefined;
  getColumnFacetMeta(level: number, index: number): MetadataValue | undefined;
  getRowFacetMeta(level: number, index: number): MetadataValue | undefined;
  getHeaderMeta(axis: "row" | "column", level: number): MetadataValue | undefined;
}

export interface ValueCellDataContext {
  viewModel: GridDataViewModel;
  rowIndex: number;
  colIndex: number;
}
// #endregion metadata-types

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
