export type GridData = {
  columns: Array<string>;
  data: Array<Array<string | number | boolean | null | undefined>>;
};

export interface ColumnViewModel<T> {
  name: string;
  idx: number;
  width: number; // final width of the column
  proposedWidth: number; // initial propsoal of width of the column
  maxContentWidth: number; // max width of the column based on content on viewport
  headerContentWidth: number; // width of the column header only
  __meta__: T; // store intermediate metadata for ops
}
