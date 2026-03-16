import { DuckDBPivotDataModel } from "./duckdb-pivot-datamodel";
import { GridData, Schema } from "./types";

// @ts-expect-error - static create() intentionally has a different signature than DuckDBPivotDataModel.create()
export class InMemoryPivotDataModel extends DuckDBPivotDataModel {
  private constructor(schema: Schema[], table: string, db: any, conn: any) {
    super(schema, table, db, conn);
  }

  static async create(gridData: GridData): Promise<InMemoryPivotDataModel> {
    const schema: Schema[] = gridData.columns.map((col) => {
      if (typeof col === "string") {
        return { name: col, displayName: col, type: "dimension" as const };
      }
      return col;
    });

    const tableName = "data";
    const parent = await DuckDBPivotDataModel.create(schema, tableName);

    const instance = new InMemoryPivotDataModel(
      schema,
      tableName,
      (parent as any).db,
      (parent as any).conn,
    );

    await instance.loadData(gridData.data, gridData.replace);

    return instance;
  }
}
