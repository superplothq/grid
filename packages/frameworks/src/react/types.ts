import type { FC, ComponentType } from "react";
import type Grid from "grid/dist/renderer";
import type {
  GridDataViewModel,
  SelectionPayload,
  LayoutType,
  CellRenderer,
  VTrackDef,
  FacetDef,
  FlatRowMeta,
} from "grid/dist/renderer";

export type { GridDataViewModel };

export type { CellRenderer };

export interface CellProps<T = any> {
  value: T;
  cell: HTMLElement;
}

export interface FacetCellProps {
  value: string | null;
  path: (string | null)[];
  level: number;
  index: number;
  cell: HTMLElement;
  container: HTMLElement;
  viewModel: GridDataViewModel;
  render: (vm: GridDataViewModel) => void;
  // TODO: this is mandatory for flattened-data-viewmodel
  //       Since for flattened data and pivot data only one FacetCellProps is the only
  //       interface that's carry the information for now it's passed as optional argument
  flatMeta?: FlatRowMeta;
}

export interface FacetHeaderProps {
  text: string;
  level: number;
}

export interface ColumnDef extends Omit<VTrackDef, "renderer"> {
  renderer?: FC<CellProps>;
}

export interface ReactFacetDef extends Omit<Partial<FacetDef>, "trackRenderer" | "headerRenderer"> {
  trackRenderer?: FC<FacetCellProps>;
  headerRenderer?: FC<FacetHeaderProps>;
}

export interface ReactFacetDefs {
  row: ReactFacetDef[];
  col: ReactFacetDef[];
  axis: "row" | "col";
}

export interface DataGridHandle {
  grid: Grid;
}

export interface DataGridProps {
  data: GridDataViewModel | null;
  layout?: LayoutType;
  theme?: string;
  pageLoadingInProgress?: boolean;
  pageLoadingIndicator?: ComponentType;
  onCellRelease?: (key: string, cell: HTMLElement) => void;
  onBeforeMeasure?: () => void;
  onRenderComplete?: (viewport: { x0: number; y0: number; x1: number; y1: number }) => void;
  onViewDataEmpty?: (payload: { startRow: number; endRow: number }) => void;
  onSelectionAdded?: (payload: SelectionPayload) => void;
  onSelectionRemoved?: (payload: SelectionPayload) => void;
}
