import DataSourceActions, {LocalPgLiteActions} from "./datasource-actions";
import { Col, DataSourceConfig } from "./types";
import { PGlite } from "@electric-sql/pglite"

/**
  * Points to the data source where the data is stored.
  * Data can be stored in browser's local storage (via pglite) or on a database server.
  * One datasource is created per table in database.
  *
  * DataSource expects table to be already present in the database.
  */
export default class DataSource {
  readonly config: DataSourceConfig;
  readonly dsAction: DataSourceActions;
  schema: Col[] = [];
  isSchemaIntrospectionCompleted: boolean = false;

  constructor(config: DataSourceConfig) {
    this.config = config;

    if (config.sourceType === "local") {
      const db = new PGlite("idb://" + config.fullQualifiedName);
      this.dsAction = new LocalPgLiteActions(db, config.fullQualifiedName);
    } else {
      throw new Error(`TODO: Actions not supported for ${config.sourceType} yet`);
    }
  }

  async init() {
    if (!this.isSchemaIntrospectionCompleted) {
      if (await this.dsAction.upstreamExists()) {
        await this.introspectSchema();
        this.isSchemaIntrospectionCompleted = true;
      } else {
        throw new Error(`Table ${this.config.fullQualifiedName} does not exist`);
      }
    }
  }

  async introspectSchema() {
    this.schema = await this.dsAction.introspectSchema();
  }
}
