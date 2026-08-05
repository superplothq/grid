import { DataSchema, SchemaInfo } from "./types";
import { getColumn } from "./utils";

/**
 * Abstract base class that fetches raw data from a [DataSource](/docs/datasource) and transforms it into a structure the renderer can display.

 *
 * Subclasses implement `getViewModelData` to build a command, send it to the data source, and reshape the result.
 *
 * @typeParam TInput - Config that describes how the data should be transformed at the source and what needs to be fetched (e.g. a pivot config, a row range query)..
 * @typeParam TViewModelData - The view model data shape returned to the renderer.
 */
export abstract class DataModel<TInput, TViewModelData> {
  /**
   * [`DataSchema`](/docs/api-references/type-references#dataschema) column definitions describing name, type, display name, and aggregation for each field. Set once at construction and read-only.
   */
  protected schema: DataSchema[];

  protected schemaIndex: Map<string, number>;

  constructor(schema: DataSchema[]) {
    this.schema = schema;
    this.schemaIndex = new Map(schema.map((s, i) => [s.name, i]));
  }

  /**
   * The schema lookup state consumed by the pure schema utilities (`getColumn`, `computeOutputColumns`).
   */
  protected get schemaInfo(): SchemaInfo {
    return { schema: this.schema, schemaIndex: this.schemaIndex };
  }

  /**
   * Look up a column definition by name. Throws if the column does not exist in the schema.
   *
   * @param name - The column name to look up.
   */
  protected getColumn(name: string): DataSchema {
    return getColumn(name, this.schemaInfo);
  }

  /**
   * Transform (if supported) and fetch data from the data source based on input. Transform the data in memory and return the result that's ready for the renderer to consume.
   *
   * For SQL-backed sources, you can transform data at the source (sort, group, window, project, select, etc), get the result in JS memory, and reshape if necessary for renderer consumption.
   *
   * For other sources like directly loading a CSV file, download the data and transform the whole data in memory.
   *
   * @param input - The config or query describing what data to fetch
   */
  abstract getViewModelData(input: TInput): Promise<TViewModelData>;
}
