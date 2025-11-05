export interface DataSourceConfig {
  sourceType: "rest" | "local";
  fullQualifiedName: string;
  name: string;
}

// PostgreSQL data types as they appear in information_schema.columns
export type PostgreSQLDataType =
  // Numeric types
  | "smallint"
  | "integer"
  | "bigint"
  | "decimal"
  | "numeric"
  | "real"
  | "double precision"
  | "smallserial"
  | "serial"
  | "bigserial"

  // Monetary type
  | "money"

  // Character types
  | "character varying"
  | "varchar"
  | "character"
  | "char"
  | "text"

  // Binary data types
  | "bytea"

  // Date/time types
  | "timestamp without time zone"
  | "timestamp with time zone"
  | "timestamp"
  | "timestamptz"
  | "date"
  | "time without time zone"
  | "time with time zone"
  | "time"
  | "timetz"
  | "interval"

  // Boolean type
  | "boolean"

  // Enumerated types
  | "USER-DEFINED"

  // Geometric types
  | "point"
  | "line"
  | "lseg"
  | "box"
  | "path"
  | "polygon"
  | "circle"

  // Network address types
  | "cidr"
  | "inet"
  | "macaddr"
  | "macaddr8"

  // Bit string types
  | "bit"
  | "bit varying"

  // Text search types
  | "tsvector"
  | "tsquery"

  // UUID type
  | "uuid"

  // XML type
  | "xml"

  // JSON types
  | "json"
  | "jsonb"

  // Arrays (appended with [])
  | "ARRAY"

  // Range types
  | "int4range"
  | "int8range"
  | "numrange"
  | "tsrange"
  | "tstzrange"
  | "daterange"

  // Other types
  | "pg_lsn"
  | "pg_snapshot"
  | "txid_snapshot";

export interface Col {
  name: string;
  dataType: PostgreSQLDataType;
  isNullable?: boolean;
  defaultValue?: string | null;
  characterMaximumLength?: number | null;
  numericPrecision?: number | null;
  numericScale?: number | null;
  ordinalPosition?: number;
}
