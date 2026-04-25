export type SqlColumnType = "VARCHAR" | "INTEGER" | "DOUBLE" | "TIMESTAMP";

/**
 * Generic interface for query execution with ref-counted lifecycle.
 *
 * Multiple consumers (e.g. pivot grid and flat table) can share a single
 * DataSource instance. Use `addRef` / `release` to manage ownership.
 *
 * @typeParam T - The query request type (e.g. `string` for SQL-based sources, js object for API based sources).
 */
export interface DataSource<T> {
  /**
   * Execute a command against the data source and return the result.
   *
   * The shape of `req` depends on the data source implementation:
   * - SQL-based sources: a SQL query string (e.g. `"SELECT city, revenue FROM sales"`)
   * - API-based sources: a request object describing the endpoint and payload
   * - Custom sources: whatever command shape your source accepts
   *
   * @param req - The command to execute. Its type is determined by `T`.
   * @returns An array of key-value records. The layout (row-major vs column-major) is up to the implementation — the data model consuming the result handles the transformation.
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
