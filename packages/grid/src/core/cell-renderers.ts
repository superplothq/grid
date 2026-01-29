export interface RendererContext {}

export type CellRenderer<T> = (data: T, ctx: RendererContext) => string | HTMLElement | HTMLElement[];

export type ColumnQualifierLevel = "*" | string | string[];
export type ColumnQualifier = ColumnQualifierLevel[];

export interface RendererConfig<T = unknown> {
  columnQualifier: ColumnQualifier;
  renderer: CellRenderer<T>;
  cellHeight?: number;
  sampleData?: T;
}

export interface GridDataViewModelOptions {
  renderers?: RendererConfig[];
}

export interface ResolvedRenderer {
  renderer: CellRenderer<unknown>;
  cellHeight?: number;
  sampleData?: unknown;
  isCustom: boolean;
}

export const textRenderer: CellRenderer<unknown> = (data) => {
  return data == null ? "" : String(data);
};

/**
  * TODO[claude]
  * can you create a chartRenderer? wrapping the d3 code. the code might be in git stash. check it out.
  * Here is how i'd like the use the chart renderer to work:
  * Create a type CellWithConfigRenderer: (config: CellConfig) => CellRenderer<T>
  * Here user can pass a config before creating cell renderer. There can be different type of configs. Like chartconfig
  * would have chartType etc.
  */

