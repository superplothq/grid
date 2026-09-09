import { HttpApiDataSource } from "./http-api-datasource";
import { StandardApiCommand, StandardApiResponse, StandardDataFetchAndTransformIR, GetRowsApiResponse, ColumnRangeValues, PivotDataFetchAndTransformIR, PivotFilterQuery, GetPivotDataApiResponse } from "./types";
import { GridError, GridErrorCode } from "../errors";

/**
 * How one command kind is expressed in the user's GraphQL schema: the query document to send, the variables to send
 * it with, and how to read the answer back out of `data`. A GraphQL endpoint has no per-command URLs, so this is
 * what takes the place of an endpoint mapping - one operation per command kind, all posted to the same endpoint.
 *
 * @typeParam TInput - The command payload (`StandardDataFetchAndTransformIR` for `getRows`, the field name for `getRange`, the full command for user-defined kinds).
 * @typeParam TOutput - The expected response (`GetRowsApiResponse` for `getRows`, `ColumnRangeValues` for `getRange`, the user-defined response for user-defined kinds).
 */
export interface GraphQLOperation<TInput, TOutput> {
  /** The GraphQL query document for this operation. */
  query: string;
  /** Name the command payload the way this operation's query document declares its variables. Defaults to `{ ir }` for `getRows` and `getPivotData`, `{ field }` for `getRange`, `{ query }` for `getFacetValues`, and the command's own fields (minus `kind`) for user-defined kinds - so it only needs supplying when the query document names them differently or splits the payload across several variables. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buildVariables?: (input: TInput) => Record<string, any>;
  /** Reach into the GraphQL `data` payload and return this operation's result. Required because only the schema author knows the field path the result sits under (e.g. `data.grid.rows`). This is payload extraction only - a result whose shape differs from what the datamodel expects is adapted by the [`StandardApiTransform`](/docs/api-references/type-references#standardapitransform) given to the datamodel. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parse: (data: any) => TOutput;
}

/**
 * Configuration for [`GraphQLApiDataSource`](/docs/datamodel/graphql-api-datasource).
 *
 * @typeParam TMetadataCommand - User-defined command kinds beyond the standard `getRows`/`getRange`. Each kind needs an entry in `metadataOperations`.
 * @typeParam TMetadataResponse - The responses for `TMetadataCommand` kinds.
 */
export interface GraphQLApiDataSourceConfig<TMetadataCommand extends { kind: string } = never, TMetadataResponse = never> {
  /** URL of the GraphQL endpoint the data is fetched from. Every command goes to this one URL - the command kind is expressed by the operation sent, not by the path. */
  endpoint: string;
  /** Common headers (e.g. auth tokens) sent with every request. `Content-Type: application/json` is filled in by [`HttpApiDataSource`](/docs/datamodel/http-api-datasource) unless set here. */
  headers?: Record<string, string>;
  /** The operation used for `getRows` commands. */
  getRows: GraphQLOperation<StandardDataFetchAndTransformIR, GetRowsApiResponse>;
  /** The operation used for `getRange` commands. */
  getRange: GraphQLOperation<string, ColumnRangeValues>;
  /** The operation used for `getPivotData` commands. Required when the datasource serves an [`ApiPivotTableDataModel`](/docs/datamodel/api-pivot-table-datamodel). */
  getPivotData?: GraphQLOperation<PivotDataFetchAndTransformIR, GetPivotDataApiResponse>;
  /** The operation used for `getFacetValues` commands. Required when the datasource serves an [`ApiPivotTableDataModel`](/docs/datamodel/api-pivot-table-datamodel). */
  getFacetValues?: GraphQLOperation<PivotFilterQuery, string[][]>;
  /** Operations for user-defined command kinds, keyed by the command's `kind`. The operation's `buildVariables` receives the full command. */
  metadataOperations?: Record<string, GraphQLOperation<TMetadataCommand, TMetadataResponse>>;
}

/** A [`GraphQLOperation`](/docs/api-references/type-references#graphqloperation) once the defaults are filled in, so `buildVariables` is always callable. */
type ResolvedGraphQLOperation<TInput, TOutput> = GraphQLOperation<TInput, TOutput> & {
  buildVariables: NonNullable<GraphQLOperation<TInput, TOutput>["buildVariables"]>;
};

/** [`GraphQLApiDataSourceConfig`](/docs/api-references/type-references#graphqlapidatasourceconfig) with every operation resolved. */
type ResolvedGraphQLApiDataSourceConfig<TMetadataCommand extends { kind: string }, TMetadataResponse> = GraphQLApiDataSourceConfig<TMetadataCommand, TMetadataResponse> & {
  getRows: ResolvedGraphQLOperation<StandardDataFetchAndTransformIR, GetRowsApiResponse>;
  getRange: ResolvedGraphQLOperation<string, ColumnRangeValues>;
  getPivotData?: ResolvedGraphQLOperation<PivotDataFetchAndTransformIR, GetPivotDataApiResponse>;
  getFacetValues?: ResolvedGraphQLOperation<PivotFilterQuery, string[][]>;
  metadataOperations?: Record<string, ResolvedGraphQLOperation<TMetadataCommand, TMetadataResponse>>;
};

/**
 * The variables a user-defined command is sent with when its operation does not name them itself: the command's own
 * fields, minus `kind`. `kind` is how this class picks the operation, so it carries no information the server needs.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function defaultMetadataVariables(cmd: { kind: string }): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const variables = { ...cmd } as Record<string, any>;
  delete variables.kind;
  return variables;
}

/**
 * GraphQL implementation of [`HttpApiDataSource`](/docs/datamodel/http-api-datasource). Every command is a
 * `POST { query, variables }` to the single `endpoint` - what distinguishes one command from another is the
 * operation chosen for it, so the whole protocol is described by the operations in the config rather than by URLs.
 *
 * The command payload travels as GraphQL variables (the
 * [`StandardDataFetchAndTransformIR`](/docs/api-references/type-references#standarddatafetchandtransformir) as `ir`
 * by default), which is what lets one query document serve every page, sort and filter the grid asks for. Reading the
 * answer back is the operation's job: GraphQL nests results under `data.<field path>` and returns failures inside a
 * `200` body, so `parse` pulls the payload out and this class turns a body carrying `errors` into a `GridError`.
 * User-defined command kinds find their operation in `metadataOperations`, keyed by `kind`.
 *
 * Code flow (pseudo code):
 * ```
 * buildRequest(cmd) {                              // called by HttpApiDataSource.execute
 *   op = operationFor(cmd);                        // config.getRows / getRange / ... / metadataOperations[kind]
 *   return { url: config.endpoint, init: POST { query: op.query, variables: op.buildVariables(payload) } };
 * }
 *
 * parseBody(cmd, body) {                           // called after the fetch, on the parsed body
 *   if (body.errors) throw GridError;
 *   return operationFor(cmd).parse(body.data);
 * }
 * ```
 *
 * @throws `GridError` with code `FETCH_FAILED` when the response contains GraphQL `errors`.
 */
export class GraphQLApiDataSource<TMetadataCommand extends { kind: string } = never, TMetadataResponse = never> extends HttpApiDataSource<TMetadataCommand, TMetadataResponse> {
  /**
   * Resolved configuration after merging user-provided values with defaults. See
   * [`GraphQLApiDataSourceConfig`](/docs/api-references/type-references#graphqlapidatasourceconfig).
   */
  protected config: ResolvedGraphQLApiDataSourceConfig<TMetadataCommand, TMetadataResponse>;

  constructor(config: GraphQLApiDataSourceConfig<TMetadataCommand, TMetadataResponse>) {
    super();
    this.config = {
      ...config,
      getRows: { buildVariables: (ir) => ({ ir }), ...config.getRows },
      getRange: { buildVariables: (field) => ({ field }), ...config.getRange },
      getPivotData: config.getPivotData && { buildVariables: (ir) => ({ ir }), ...config.getPivotData },
      getFacetValues: config.getFacetValues && { buildVariables: (query) => ({ query }), ...config.getFacetValues },
      metadataOperations: config.metadataOperations && Object.fromEntries(
        Object.entries(config.metadataOperations).map(([kind, op]) => [kind, { buildVariables: defaultMetadataVariables, ...op }]),
      ),
    };
  }

  #operationFor(cmd: StandardApiCommand<TMetadataCommand>): {
    query: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    variables: Record<string, any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parse: (data: any) => StandardApiResponse<TMetadataResponse>;
  } {
    if (cmd.kind === "getRows" || cmd.kind === "getRange" || cmd.kind === "getPivotData" || cmd.kind === "getFacetValues") {
      const std = cmd as StandardApiCommand;
      switch (std.kind) {
      case "getRows":
        return { query: this.config.getRows.query, variables: this.config.getRows.buildVariables(std.ir), parse: this.config.getRows.parse };
      case "getRange":
        return { query: this.config.getRange.query, variables: this.config.getRange.buildVariables(std.field), parse: this.config.getRange.parse };
      case "getPivotData":
        return { query: this.config.getPivotData!.query, variables: this.config.getPivotData!.buildVariables(std.ir), parse: this.config.getPivotData!.parse };
      case "getFacetValues":
        return { query: this.config.getFacetValues!.query, variables: this.config.getFacetValues!.buildVariables(std.query), parse: this.config.getFacetValues!.parse };
      }
    }
    const custom = cmd as TMetadataCommand;
    const op = this.config.metadataOperations![custom.kind];
    return { query: op.query, variables: op.buildVariables(custom), parse: op.parse };
  }

  // eslint-disable-next-line no-undef
  protected buildRequest(cmd: StandardApiCommand<TMetadataCommand>): { url: string; init: RequestInit } {
    const { query, variables } = this.#operationFor(cmd);
    return {
      url: this.config.endpoint,
      init: {
        method: "POST",
        headers: this.config.headers,
        body: JSON.stringify({ query, variables }),
      },
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected parseBody(cmd: StandardApiCommand<TMetadataCommand>, body: any): StandardApiResponse<TMetadataResponse> {
    if (body.errors && body.errors.length > 0) {
      throw new GridError(GridErrorCode.FETCH_FAILED, "GraphQL request returned errors", undefined, {
        url: this.config.endpoint,
        errors: body.errors,
      });
    }
    return this.#operationFor(cmd).parse(body.data);
  }
}
