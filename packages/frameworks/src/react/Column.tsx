import type { FC } from "react";
import type { CellProps, ColumnDef } from "./types";

export interface ColumnProps extends ColumnDef {
  field?: string;
  header?: string;
}

export const Column: FC<ColumnProps> = () => null;
