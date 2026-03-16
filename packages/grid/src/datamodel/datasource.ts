export type SqlColumnType = "VARCHAR" | "INTEGER" | "DOUBLE" | "TIMESTAMP";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface DataSource<T> {
  execute(req: T): Promise<Record<string, any>[]>;
  addRef(): void;
  release(): Promise<void>;
}
