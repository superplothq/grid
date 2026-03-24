import * as arrow from "apache-arrow";
import { csvParseRows } from "d3-dsv";
import { DataSource, SqlColumnType } from "./datasource";
import { DataSchema } from "./types";
import { schemaToSqlType } from "./sql-pivot-datamodel";
import { GridError, GridErrorCode } from "../errors";

export type ColumnMetadata = DataSchema & {
  normColName: string;
  originalColName: string;
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
    schema: DataSchema[];
    data: any[][];
    replace?: Map<string, Map<string, string>>;
  }): Promise<void> {
    this.table = opts.table ?? generateTableName();

    const varcharColumns = new Map<string, SqlColumnType>(
      opts.schema.map(s => [s.name, "VARCHAR"])
    );
    const ddl = buildCreateTableDDL(this.table, varcharColumns);
    await this.execute(ddl);

    const numRows = opts.data[0]?.length ?? 0;
    if (numRows === 0) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const columns: Record<string, any> = {};
    for (let i = 0; i < opts.schema.length; i++) {
      const colData = opts.data[i];
      columns[opts.schema[i].name] = colData.map((v: unknown) =>
        v === null || v === undefined ? null : String(v)
      );
    }

    const arrowTable = arrow.tableFromArrays(columns);
    await this.insertArrowTable(arrowTable, this.table);

    for (const s of opts.schema) {
      const colReplacements = opts.replace?.get(s.name);
      const targetType = schemaToSqlType(s);

      let expr = `"${s.name}"`;
      if (colReplacements) {
        for (const [search, rep] of colReplacements) {
          expr = `REPLACE(${expr}, '${search}', '${rep}')`;
        }
      }
      if (s.subtype === "temporal" && s.datetimeFormat) {
        expr = `strptime(${expr}, '${s.datetimeFormat}')`;
      }

      await this.execute(
        `ALTER TABLE "${this.table}" ALTER COLUMN "${s.name}" SET DATA TYPE ${targetType} USING ${expr}`
      );
    }
  }

  async loadDataFromURL(config: {
    url: string;
    type: "json" | "csv";
    preprocess?: (data: unknown) => unknown;
    schema?: DataSchema[];
    replace?: Map<string, Map<string, string>>;
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    const inferredTypes = new Map<string, SqlColumnType>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any[][] = [];

    if (config.type === "csv") {
      columnOrder = csvHeaders!;
      const colIndexMap = new Map<string, number>();
      for (let i = 0; i < csvHeaders!.length; i++) {
        colIndexMap.set(csvHeaders![i], i);
      }

      if (config.schema) {
        columnOrder = config.schema.map(s => s.name);
      }

      for (const col of columnOrder) {
        const ci = colIndexMap.get(col)!;
        const values = csvRows!.map((row) => row[ci]);
        inferredTypes.set(col, inferColumnType(values));
      }

      // TODO: this should only be there in dev mode
      console.log("Schema inference:", Object.fromEntries(inferredTypes));

      for (const col of columnOrder) {
        const ci = colIndexMap.get(col)!;
        const colValues = csvRows!.map((row) => {
          const v = row[ci];
          if (v === null || v === undefined || v === "") return null;
          return v;
        });
        data.push(colValues);
      }
    } else {
      columnOrder = config.schema ? config.schema.map(s => s.name) : Object.keys(parsed[0]);

      for (const col of columnOrder) {
        const values = parsed.map((row: Record<string, unknown>) => row[col]);
        inferredTypes.set(col, inferColumnType(values));
      }

      // TODO: this should only be there in dev mode
      console.log("Schema inference:", Object.fromEntries(inferredTypes));

      for (const col of columnOrder) {
        const colValues = parsed.map((row: Record<string, unknown>) => {
          const v = row[col];
          if (v === null || v === undefined || v === "") return null;
          return v;
        });
        data.push(colValues);
      }
    }

    const schema: DataSchema[] = config.schema
      ? config.schema.map(s => {
        if (s.type === "measure" && !s.subtype) {
          const inferred = inferredTypes.get(s.name);
          return { ...s, subtype: (inferred === "INTEGER" ? "integer" : "decimal") as DataSchema["subtype"] };
        }
        return s;
      })
      : columnOrder.map(col => {
        const inferred = inferredTypes.get(col)!;
        if (inferred === "INTEGER" || inferred === "DOUBLE") {
          return {
            name: col,
            type: "measure" as const,
            subtype: (inferred === "INTEGER" ? "integer" : "decimal") as DataSchema["subtype"],
          };
        }
        if (inferred === "TIMESTAMP") {
          return { name: col, type: "dimension" as const, subtype: "temporal" as const };
        }
        return { name: col, type: "dimension" as const };
      });

    await this.loadData({ table: config.table, schema, data, replace: config.replace });

    const result: ColumnMetadata[] = [];
    for (const s of schema) {
      result.push({ ...s, normColName: s.name, originalColName: s.name });
    }
    return result;
  }

  protected abstract insertArrowTable(table: arrow.Table, name: string): Promise<void>;

  addRef(): void {
    this.refCount++;
  }

  abstract release(): Promise<void>;
}
