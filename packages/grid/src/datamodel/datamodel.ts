import { DataSchema } from "./types";

export abstract class DataModel<TInput, TViewModelData> {
  protected schema: DataSchema[];
  protected schemaIndex: Map<string, number>;

  constructor(schema: DataSchema[]) {
    this.schema = schema;
    this.schemaIndex = new Map(schema.map((s, i) => [s.name, i]));
  }

  protected getColumn(name: string): DataSchema {
    const index = this.schemaIndex.get(name);
    const column = index === undefined ? undefined : this.schema[index];
    if (!column) {
      throw new Error(`Column "${name}" not found in schema. Available columns: ${Array.from(this.schemaIndex.keys()).join(", ")}`);
    }
    return column;
  }

  abstract getViewModelData(input: TInput): Promise<TViewModelData>;
}
