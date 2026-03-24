import * as arrow from "apache-arrow";
import { csvParse, csvParseRows } from "d3-dsv";
import { DataSource, SqlColumnType } from "./datasource";
import { GridError, GridErrorCode } from "../errors";

export type ColumnMetadata = {
  normColName: string;
  originalColName: string;
  type: SqlColumnType;
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T|\s)/;

function sampleNonEmpty(columnValues: unknown[], maxSamples: number): unknown[] {
  const result: unknown[] = [];
  for (const v of columnValues) {
    if (v === null || v === undefined || v === "") continue;
    result.push(v);
    if (result.length >= maxSamples) break;
  }
  return result;
}

function isISODateString(val: string): boolean {
  return ISO_DATE_RE.test(val) && !isNaN(Date.parse(val));
}

function inferColumnType(values: unknown[]): SqlColumnType {
  const samples = sampleNonEmpty(values, 20);
  if (samples.length === 0) return "VARCHAR";

  const allNumbers = samples.every((v) => typeof v === "number");
  if (allNumbers) {
    const hasDecimal = samples.some((v) => !Number.isInteger(v as number));
    return hasDecimal ? "DOUBLE" : "INTEGER";
  }

  const allNumericStrings = samples.every(
    (v) => typeof v === "string" && v !== "" && !isNaN(Number(v)),
  );
  if (allNumericStrings) {
    const hasDecimal = samples.some((v) => !Number.isInteger(Number(v)));
    return hasDecimal ? "DOUBLE" : "INTEGER";
  }

  const allDates = samples.every(
    (v) => typeof v === "string" && isISODateString(v),
  );
  if (allDates) return "TIMESTAMP";

  return "VARCHAR";
}

let tableCounter = 0;
function generateTableName(): string {
  return `__ds__${tableCounter++}`;
}

function buildCreateTableDDL(table: string, columns: Map<string, SqlColumnType>): string {
  const colDefs: string[] = [];
  for (const [name, type] of columns) {
    colDefs.push(`"${name}" ${type}`);
  }
  return `CREATE TABLE "${table}" (${colDefs.join(", ")})`;
}

export abstract class SqlDataSource implements DataSource<string> {
  table!: string;
  protected refCount = 1;

  abstract execute(sql: string): Promise<Record<string, any>[]>;

  async loadData(opts: {
    table?: string;
    columns: Map<string, SqlColumnType>;
    data: any[][];
  }): Promise<void> {
    this.table = opts.table ?? generateTableName();

    const ddl = buildCreateTableDDL(this.table, opts.columns);
    await this.execute(ddl);

    const numRows = opts.data[0]?.length ?? 0;
    if (numRows === 0) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const columns: Record<string, any> = {};
    let colIdx = 0;
    for (const [name, type] of opts.columns) {
      if (type === "DOUBLE") {
        columns[name] = new Float64Array(opts.data[colIdx]);
      } else {
        columns[name] = opts.data[colIdx];
      }
      colIdx++;
    }

    const arrowTable = arrow.tableFromArrays(columns);
    await this.insertArrowTable(arrowTable, this.table);
  }

  async loadDataFromURL(config: {
    url: string;
    type: "json" | "csv";
    preprocess?: (data: unknown) => unknown;
    columns?: Map<string, SqlColumnType>;
    columnOrder?: string[];
    table?: string;
  }): Promise<ColumnMetadata[]> {
    let response: Response;
    try {
      response = await fetch(config.url);
    } catch (e) {
      throw new GridError(GridErrorCode.FETCH_FAILED, "Failed to fetch URL", e as Error, {
        url: config.url,
      });
    }
    if (!response.ok) {
      throw new GridError(GridErrorCode.FETCH_FAILED, "Failed to fetch URL", undefined, {
        url: config.url,
        status: response.status,
      });
    }

    let parsed: any;
    let csvHeaders: string[] | undefined;
    let csvRows: string[][] | undefined;
    try {
      if (config.type === "json") {
        parsed = await response.json();
      } else {
        const text = await response.text();
        const rows = csvParseRows(text);
        csvHeaders = rows[0];
        csvRows = rows.slice(1);
      }
    } catch (e) {
      throw new GridError(GridErrorCode.PARSE_FAILED, "Failed to parse response", e as Error, {
        url: config.url,
      });
    }

    if (config.type === "json") {
      if (config.preprocess) {
        const preprocessed = config.preprocess(parsed);
        parsed = preprocessed ? preprocessed : parsed;
      }

      if (!Array.isArray(parsed) || parsed.length === 0) {
        if (Array.isArray(parsed)) {
          throw new GridError(GridErrorCode.EMPTY_DATA, "Parsed data is empty");
        }
        throw new GridError(GridErrorCode.INVALID_DATA, "Parsed data is not an array of objects");
      }
    } else {
      if (config.preprocess) {
        const preprocessed = config.preprocess(csvRows) as string[][];
        csvRows = preprocessed ? preprocessed : csvRows;
      }

      if (!csvRows || csvRows.length === 0) {
        throw new GridError(GridErrorCode.EMPTY_DATA, "Parsed data is empty");
      }
    }

    let columnOrder: string[];
    const columns = new Map<string, SqlColumnType>();
    const data: any[][] = [];

    if (config.type === "csv") {
      columnOrder = config.columnOrder ?? csvHeaders!;
      const colIndexMap = new Map<string, number>();
      for (let i = 0; i < csvHeaders!.length; i++) {
        colIndexMap.set(csvHeaders![i], i);
      }

      if (config.columns) {
        for (const col of columnOrder) {
          columns.set(col, config.columns.get(col) ?? "VARCHAR");
        }
      } else {
        for (const col of columnOrder) {
          const ci = colIndexMap.get(col)!;
          const values = csvRows!.map((row) => row[ci]);
          columns.set(col, inferColumnType(values));
        }
      }

      // TODO: this should only be there in dev mode
      console.log("Schema inference:", Object.fromEntries(columns));

      for (const [col, type] of columns) {
        const ci = colIndexMap.get(col)!;
        const colValues = csvRows!.map((row) => {
          const v = row[ci];
          if (v === null || v === undefined || v === "") return null;
          if (type === "INTEGER" || type === "DOUBLE") return Number(v);
          return v;
        });
        data.push(colValues);
      }
    } else {
      columnOrder = config.columnOrder ?? Object.keys(parsed[0]);

      if (config.columns) {
        for (const col of columnOrder) {
          columns.set(col, config.columns.get(col) ?? "VARCHAR");
        }
      } else {
        for (const col of columnOrder) {
          const values = parsed.map((row: Record<string, unknown>) => row[col]);
          columns.set(col, inferColumnType(values));
        }
      }

      // TODO: this should only be there in dev mode
      console.log("Schema inference:", Object.fromEntries(columns));

      for (const [col, type] of columns) {
        const colValues = parsed.map((row: Record<string, unknown>) => {
          const v = row[col];
          if (v === null || v === undefined || v === "") return null;
          if (type === "INTEGER" || type === "DOUBLE") {
            return typeof v === "number" ? v : Number(v);
          }
          return v;
        });
        data.push(colValues);
      }
    }

    await this.loadData({ table: config.table, columns, data });

    const result: ColumnMetadata[] = [];
    for (const [col, type] of columns) {
      result.push({ normColName: col, originalColName: col, type });
    }
    return result;
  }

  protected abstract insertArrowTable(table: arrow.Table, name: string): Promise<void>;

  addRef(): void {
    this.refCount++;
  }

  abstract release(): Promise<void>;
}
