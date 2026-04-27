import { DataSchema } from "./types";

/**
 * Abstract base class that transforms raw data from a [DataSource](/docs/datasource) into a structure the renderer can display.

 *
 * `TInput` is the input that describes what data to produce (e.g. a pivot config, a row range query).
 * `TViewModelData` is the output shape the renderer expects.
 *
 * Subclasses implement `getViewModelData` to build a command, send it to the data source, and reshape the result.
 *
 * @typeParam TInput - Config or query object that describes the desired output.
 * @typeParam TViewModelData - The view model data shape returned to the renderer.
 */
export abstract class DataModel<TInput, TViewModelData> {
  /**
   * Column definitions describing name, type, display name, and aggregation for each field. Set once at construction and read-only.
   */
  protected schema: DataSchema[];

  /**
   * Maps column name to its index in the `schema` array for O(1) lookup.
   */
  protected schemaIndex: Map<string, number>;

  constructor(schema: DataSchema[]) {
    this.schema = schema;
    this.schemaIndex = new Map(schema.map((s, i) => [s.name, i]));
  }

  /**
   * Look up a column definition by name. Throws if the column does not exist in the schema.
   *
   * @param name - The column name to look up.
   */
  protected getColumn(name: string): DataSchema {
    const index = this.schemaIndex.get(name);
    const column = index === undefined ? undefined : this.schema[index];
    if (!column) {
      throw new Error(`Column "${name}" not found in schema. Available columns: ${Array.from(this.schemaIndex.keys()).join(", ")}`);
    }
    return column;
  }

  /**
   * Transform the input into view model data. Subclasses implement this to build a query, fetch data from the data source, and reshape the result.
   *
   * @param input - The config or query describing what data to produce.
   */
  abstract getViewModelData(input: TInput): Promise<TViewModelData>;
}
