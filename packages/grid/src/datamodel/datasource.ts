// #region sql-column-type
/**
 * Supported SQL column types for data ingestion.
 */
export type SqlColumnType = "VARCHAR" | "INTEGER" | "DOUBLE" | "TIMESTAMP";
// #endregion sql-column-type

/**
 * Generic interface for query execution with ref-counted lifecycle.
 *
 * Multiple **consumers** (e.g. pivot grid and flat table) can share a single
 * DataSource instance. Use `addRef` / `release` to manage ownership.
 *
 * @typeParam T - The query request type (e.g. `string` for SQL-based sources).
 */
export interface DataSource<T> {
  /**
   * Execute a query and return the result rows.
   *
   * @param req - The query request to execute.
   * @returns An array of result rows as key-value records.
   */
  execute(req: T): Promise<Record<string, any>[]>;

  /**
   * Increment the reference count. Call this when a new consumer
   * starts using this datasource.
   */
  addRef(): void;

  /**
   * Decrement the reference count. When the count reaches zero
   * the underlying resources are released.
   */
  release(): Promise<void>;
}
