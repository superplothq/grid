import { DuckDBFlatTableDataModel } from "./duckdb-flat-table-datamodel";
import { FlatTableConfig, GridData, Schema } from "./types";

// @ts-expect-error - static create() intentionally has a different signature than DuckDBFlatTableDataModel.create()
export class InMemoryFlatTableDataModel extends DuckDBFlatTableDataModel {
  private constructor(config: FlatTableConfig, dataSchema: Schema[], table: string, db: any, conn: any) {
    super(config, dataSchema, table, db, conn);
  }

  static async create(config: FlatTableConfig, gridData: GridData): Promise<InMemoryFlatTableDataModel> {
    const dataSchema: Schema[] = gridData.columns.map((col) => {
      if (typeof col === "string") {
        return { name: col, displayName: col, type: "dimension" as const };
      }
      return col;
    });

    const tableName = "data";
    const parent = await DuckDBFlatTableDataModel.create(config, dataSchema, tableName);

    const instance = new InMemoryFlatTableDataModel(
      config,
      dataSchema,
      tableName,
      (parent as any).db,
      (parent as any).conn,
    );

    await instance.loadData(gridData.data);

    return instance;
  }
}
