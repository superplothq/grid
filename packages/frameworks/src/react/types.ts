import type { FC } from "react";
import type Grid from "grid/dist/renderer";
import type {
  GridDataViewModel,
  SelectionPayload,
  LayoutType,
  CellRenderer,
  VTrackDef,
  FacetDef,
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
  onCellRelease?: (key: string, cell: HTMLElement) => void;
  onBeforeMeasure?: () => void;
  onRenderComplete?: (viewport: { x0: number; y0: number; x1: number; y1: number }) => void;
  onViewDataEmpty?: (payload: { startRow: number; endRow: number }) => void;
  onSelectionAdded?: (payload: SelectionPayload) => void;
  onSelectionRemoved?: (payload: SelectionPayload) => void;
}
