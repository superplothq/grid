import {PGlite} from "@electric-sql/pglite";
import { Col } from "./types";

export default abstract class DataSourceActions {
  abstract introspectSchema(): Promise<Col[]>;
  abstract upstreamExists(): Promise<boolean>;
}

export class LocalPgLiteActions extends DataSourceActions {
  private db: PGlite;
  private fullQualifiedTableName: string;

  constructor(db: PGlite, fullQualifiedTableName: string) {
    super();
    this.db = db;
    this.fullQualifiedTableName = fullQualifiedTableName;
  }

  async introspectSchema() {
    const result = await this.db.query(`
      SELECT
        column_name,
        data_type,
        is_nullable,
        column_default,
        character_maximum_length,
        numeric_precision,
        numeric_scale,
        ordinal_position
      FROM information_schema.columns
      WHERE table_name = '${this.fullQualifiedTableName}'
    `.trim());
    console.log("introspectSchema", result);
    return [];
  }

  async upstreamExists() {
    const r = await this.db.query<{ exists: boolean }>(`
        SELECT * FROM information_schema.columns
    `.trim());
    console.log("alltables", r);
    const result = await this.db.query<{ exists: boolean }>(`
    SELECT EXISTS (
        SELECT FROM pg_tables
        WHERE schemaname = 'public' AND tablename = '${this.fullQualifiedTableName}'
    );
    `.trim());
    return result.rows[0].exists;
  }
}

