import {DuckDBDataModel} from "./duckdb-datamodel";
import {GridData, Schema} from "./types";

// @ts-expect-error - static create() intentionally has a different signature than DuckDBDataModel.create()
export class InMemoryDataModel extends DuckDBDataModel {
  private constructor(schema: Schema[], table: string, db: any, conn: any) {
    super(schema, table, db, conn);
  }

  static async create(gridData: GridData): Promise<InMemoryDataModel> {
    const schema: Schema[] = gridData.columns.map((col) => {
      if (typeof col === "string") {
        return { name: col, displayName: col, type: "dimension" as const };
      }
      return col;
    });

    const tableName = "data";
    const parent = await DuckDBDataModel.create(schema, tableName);

    const instance = new InMemoryDataModel(
      schema,
      tableName,
      (parent as any).db,
      (parent as any).conn,
    );

    await instance.loadData(gridData.data, gridData.replace);

    return instance;
  }
}
