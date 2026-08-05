import { HttpApiDataSource } from "./http-api-datasource";
import { StandardApiCommand } from "./types";

/**
 * Configuration for [`RestApiDataSource`](/docs/datamodel/rest-api-datasource).
 *
 * @typeParam TMetadataCommand - User-defined command kinds beyond the standard `getRows`/`getRange`. A custom `buildRequest` must handle them.
 */
export interface RestApiDataSourceConfig<TMetadataCommand = never> {
  /** Base URL of the server the data is fetched from. The per-command endpoint is appended to it, so this is the common prefix of every URL the source calls. */
  baseUrl: string;
  /** Common headers (e.g. auth tokens) that `buildRequest` might use while building the request. */
  headers?: Record<string, string>;
  /** Replace how a command maps to an HTTP request - return the URL and `fetch` init (method, body, headers) for the given command. The whole config is passed in, so the same values the default uses (`baseUrl`, `headers`) are available here. Use this to adapt an existing API without subclassing, only if building the request from the command needs to be customized. Required when user-defined command kinds are used (the default only knows the standard commands), or when the default request building does not suit the requests your server expects. */
  // eslint-disable-next-line no-undef
  buildRequest?: (config: RestApiDataSourceConfig<TMetadataCommand>, cmd: StandardApiCommand<TMetadataCommand>) => { url: string; init: RequestInit };
}

/** [`RestApiDataSourceConfig`](/docs/api-references/type-references#restapidatasourceconfig) once the defaults are filled in, so `buildRequest` is always callable. */
type ResolvedRestApiDataSourceConfig<TMetadataCommand> = RestApiDataSourceConfig<TMetadataCommand> & {
  buildRequest: NonNullable<RestApiDataSourceConfig<TMetadataCommand>["buildRequest"]>;
};

/**
 * The request shape [`RestApiDataSource`](/docs/datamodel/rest-api-datasource) speaks out of the box: every command
 * is a `POST` to its own endpoint under `baseUrl`, carrying the command's payload as a JSON body, with `config.headers`
 * on every call (`Content-Type: application/json` is filled in later by
 * [`HttpApiDataSource`](/docs/datamodel/http-api-datasource) unless the request already sets it).
 *
 * | command | endpoint | body |
 * | --- | --- | --- |
 * | `getRows` | `{baseUrl}/rows` | the [`StandardDataFetchAndTransformIR`](/docs/api-references/type-references#standarddatafetchandtransformir) |
 * | `getPivotData` | `{baseUrl}/pivot` | the [`PivotDataFetchAndTransformIR`](/docs/api-references/type-references#pivotdatafetchandtransformir) |
 * | `getRange` | `{baseUrl}/range` | `{ field }` |
 * | `getFacetValues` | `{baseUrl}/facets` | `{ query }` |
 *
 * The IR is what makes this work with a single endpoint per command: it is a fully serializable description of the
 * request (row window, grouping, projection, sort, filter, metadata), so it travels over the wire untouched and the
 * server decides how to answer it. Nothing about the query is encoded in the URL.
 *
 * This is only the default. A server that expects different endpoints, verbs, or payload placement (query params,
 * headers) supplies `buildRequest` in [`RestApiDataSourceConfig`](/docs/api-references/type-references#restapidatasourceconfig),
 * which replaces this function entirely.
 *
 * Call chain: `execute(cmd)` on the data source (dedup, fetch, error handling) -> `buildRequest(cmd)` on the class ->
 * `config.buildRequest` when given, this function otherwise.
 */
// eslint-disable-next-line no-undef
function defaultBuildRequest(config: RestApiDataSourceConfig<any>, cmd: StandardApiCommand): { url: string; init: RequestInit } {
  const path = cmd.kind === "getRows" ? "/rows" : cmd.kind === "getRange" ? "/range" : cmd.kind === "getPivotData" ? "/pivot" : "/facets";
  const payload = cmd.kind === "getRows" || cmd.kind === "getPivotData" ? cmd.ir : cmd.kind === "getRange" ? { field: cmd.field } : { query: cmd.query };
  return {
    url: `${config.baseUrl}${path}`,
    init: {
      method: "POST",
      headers: config.headers,
      body: JSON.stringify(payload),
    },
  };
}

/**
 * REST implementation of [`HttpApiDataSource`](/docs/datamodel/http-api-datasource). Sends commands as JSON over HTTP.
 *
 * By default it speaks the standard grid server protocol: `POST {baseUrl}/rows` carrying the
 * [`StandardDataFetchAndTransformIR`](/docs/api-references/type-references#getrowsir) as body, expecting the
 * row-major [`GetRowsApiResponse`](/docs/api-references/type-references#getrowsapiresponse) back. The `buildRequest`
 * hook replaces the default entirely to adapt a different request shape (e.g. GET with query params, per-request
 * headers) or to route user-defined command kinds to their endpoints; it is resolved once in the constructor.
 * Response bodies are returned as the server sent them - a server whose response shapes differ is adapted by the
 * [`StandardApiTransform`](/docs/api-references/type-references#standardapitransform) given to the datamodel.
 */
export class RestApiDataSource<TMetadataCommand = never, TMetadataResponse = never> extends HttpApiDataSource<TMetadataCommand, TMetadataResponse> {
  /**
   * Resolved configuration after merging user-provided values with defaults. See
   * [`RestApiDataSourceConfig`](/docs/api-references/type-references#restapidatasourceconfig).
   */
  protected config: ResolvedRestApiDataSourceConfig<TMetadataCommand>;

  constructor(config: RestApiDataSourceConfig<TMetadataCommand>) {
    super();
    this.config = {
      buildRequest: defaultBuildRequest as ResolvedRestApiDataSourceConfig<TMetadataCommand>["buildRequest"],
      ...config
    };
  }

  // eslint-disable-next-line no-undef
  protected buildRequest(cmd: StandardApiCommand<TMetadataCommand>): { url: string; init: RequestInit } {
    return this.config.buildRequest(this.config, cmd);
  }
}
