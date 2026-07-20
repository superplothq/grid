# From URL

`loadDataFromURL` fetches JSON or CSV data from a URL, infers column types, and loads it into the datasource.

## Signature

```ts
async loadDataFromURL(config: {
  url: string;
  type: "json" | "csv";
  preprocess?: (data: unknown) => unknown;
  columns?: Map<string, SqlColumnType>;
  columnOrder?: string[];
  table?: string;
}): Promise<ColumnMetadata[]>
```

## Return value

Returns an array of `ColumnMetadata`:

```ts
type ColumnMetadata = {
  normColName: string;
  originalColName: string;
  type: SqlColumnType; // "VARCHAR" | "INTEGER" | "DOUBLE" | "TIMESTAMP"
};
```

## Usage

### JSON

```ts
const ds = /* your SqlDataSource instance */;

const columns = await ds.loadDataFromURL({
  url: "https://example.com/sales.json",
  type: "json",
});
```

### CSV

```ts
const columns = await ds.loadDataFromURL({
  url: "https://example.com/sales.csv",
  type: "csv",
});
```

### With preprocess

When the JSON response wraps the array (e.g. `{ results: [...] }`), use `preprocess` to extract it:

```ts
const columns = await ds.loadDataFromURL({
  url: "https://example.com/api/sales",
  type: "json",
  preprocess: (data) => (data as { results: unknown[] }).results,
});
```

### With explicit columns

Skip type inference by providing column types directly:

```ts
const columns = await ds.loadDataFromURL({
  url: "https://example.com/sales.csv",
  type: "csv",
  columns: new Map([
    ["revenue", "DOUBLE"],
    ["region", "VARCHAR"],
    ["year", "INTEGER"],
  ]),
});
```

### With columnOrder

Control which columns are loaded and their order:

```ts
const columns = await ds.loadDataFromURL({
  url: "https://example.com/sales.json",
  type: "json",
  columnOrder: ["region", "revenue", "year"],
});
```

## Column order resolution

| type | `columnOrder` provided | source |
|------|----------------------|--------|
| csv  | yes | `columnOrder` |
| csv  | no  | CSV header row |
| json | yes | `columnOrder` |
| json | no  | `Object.keys(data[0])` |

## Type inference

When `columns` is not provided, types are inferred by sampling up to 20 non-empty values per column:

| Condition | Inferred type |
|-----------|---------------|
| All values are numbers (`typeof === "number"`), all integers | `INTEGER` |
| All values are numbers, any has a decimal | `DOUBLE` |
| All values are numeric strings, all parse to integers | `INTEGER` |
| All values are numeric strings, any parses to non-integer | `DOUBLE` |
| All values match ISO 8601 date format (`YYYY-MM-DDT...` or `YYYY-MM-DD ...`) | `TIMESTAMP` |
| Mixed types, non-numeric strings, or all empty | `VARCHAR` |

For CSV data, all raw values are strings. Numeric columns (INTEGER/DOUBLE) are coerced to numbers before loading.

## Errors

All errors are thrown as `GridError` with a `code`, `message`, and optional `properties`:

| Code | Enum | When |
|------|------|------|
| 1000 | `GridErrorCode.FETCH_FAILED` | Network error or non-ok HTTP response |
| 1001 | `GridErrorCode.PARSE_FAILED` | JSON/CSV parsing fails |
| 1002 | `GridErrorCode.EMPTY_DATA` | Parsed data is an empty array |
| 1003 | `GridErrorCode.INVALID_DATA` | Parsed data is not an array |

```ts
import { GridError, GridErrorCode } from "@superplot/grid";

try {
  await ds.loadDataFromURL({ url: "https://example.com/data.json", type: "json" });
} catch (e) {
  if (e instanceof GridError && e.code === GridErrorCode.FETCH_FAILED) {
    console.log(e.message);     // "[1000]: Failed to fetch URL :: <source error>"
    console.log(e.properties);  // { url: "...", status: 404 }
  }
}
```
