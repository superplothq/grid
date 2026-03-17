export enum GridErrorCode {
  FETCH_FAILED = 1000,
  PARSE_FAILED = 1001,
  EMPTY_DATA = 1002,
  INVALID_DATA = 1003,
}

export class GridError extends Error {
  constructor(
    public readonly code: GridErrorCode,
    message: string,
    sourceErr?: Error,
    public readonly properties?: Record<string, unknown>,
  ) {
    super(`[${code}]: ${message}${sourceErr ? " :: " + sourceErr.message : ""}`);
    this.name = "GridError";
  }
}
