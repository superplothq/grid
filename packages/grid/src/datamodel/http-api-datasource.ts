import { DataSource } from "./datasource";
import { StandardApiCommand, StandardApiResponse } from "./types";
import { GridError, GridErrorCode } from "../errors";

/**
 * Base class for data sources that talk to a server over HTTP. The grid commands it accepts are fixed by this
 * class ([`StandardApiCommand`](/docs/api-references/type-references#standardapicommand)) - a child class does not
 * decide the commands, it decides how each command is converted into an HTTP payload (request body, headers,
 * query parameters) through its `buildRequest` implementation, and hands back what the server responds.
 *
 * Owns everything shared across HTTP protocols: the `fetch` call, error handling, JSON parsing, and in-flight
 * request deduplication (an identical command issued while its request is still pending shares that response
 * instead of hitting the network again - e.g. the page cache re-requesting a page mid-flight).
 *
 * Subclasses describe their protocol through two hooks: `buildRequest` decides the HTTP parameters of a command
 * (URL, method, body, headers), and `parseBody` is the first level of response parsing (e.g. GraphQL unwrapping
 * `data` and checking `errors`).
 *
 * Code flow (pseudo code):
 * ```
 * execute(cmd) {                                  // entry point, called by the datamodel
 *   if (inflight.has(cmd)) return inflight.get(cmd);
 *   return send(cmd);
 * }
 *
 * send(cmd) {
 *   { url, init } = buildRequest(cmd);            // child class: command -> HTTP request
 *   body = await fetch(url, init).json();         // this class: fetch, errors, JSON parsing
 *   return parseBody(cmd, body);                  // child class: first-level payload extraction
 * }
 * ```
 *
 * `addRef`/`release` are no-ops - HTTP is stateless, there is nothing to release.
 *
 * @typeParam TMetadataCommand - User-defined command kinds beyond the standard `getRows`/`getRange` (e.g. `{ kind: "getStats"; fields: string[] }` for a metadata endpoint). The core never sends these - user code (a datamodel subclass, a metadata resolver) does. Defaults to `never` (standard commands only).
 * @typeParam TMetadataResponse - The responses for `TMetadataCommand` kinds. Defaults to `never`.
 *
 * @throws `GridError` with code `FETCH_FAILED` on network errors or non-2xx responses, `PARSE_FAILED` when the response body is not valid JSON.
 */
export abstract class HttpApiDataSource<TMetadataCommand = never, TMetadataResponse = never> implements DataSource<StandardApiCommand<TMetadataCommand>, StandardApiResponse<TMetadataResponse>> {
  #inflight = new Map<string, Promise<StandardApiResponse<TMetadataResponse>>>();

  /**
   * Decides how a command reaches the server. Expected to return the complete HTTP request for the command: the
   * `url` to call and the `fetch` init (method, body, headers). The returned `init` is used as-is, except a
   * `Content-Type: application/json` header is added when none is set.
   *
   * The commands arriving here are the standard kinds issued by the API datamodels (`getRows` / `getRange` from
   * the standard table, `getPivotData` / `getFacetValues` from the pivot) plus any user-defined kinds issued by
   * datamodel subclasses or metadata resolvers. An implementation must handle every kind its datamodels will
   * issue: pick the endpoint for the kind and choose how the command's payload travels - serialized into the
   * request body, query parameters, or headers. Headers may differ per request (e.g. per-command auth).
   */
  // eslint-disable-next-line no-undef
  protected abstract buildRequest(cmd: StandardApiCommand<TMetadataCommand>): { url: string; init: RequestInit };

  /**
   * Extract the payload from the parsed JSON response body when the protocol nests it. The default returns the
   * body as-is. This is protocol extraction only - reshaping a nonstandard payload belongs in the
   * [`StandardApiTransform`](/docs/api-references/type-references#standardapitransform) given to the datamodel.
   *
   * Example - a GraphQL server nests the payload several layers deep and reports failures inside the body:
   *
   * ```
   * // body: { data: { grid: { rows: { rows: [...], totalRowCount: 8 } } }, errors: [...] }
   * protected parseBody(cmd, body) {
   *   if (body.errors?.length) throw new GridError(GridErrorCode.FETCH_FAILED, ...);
   *   return body.data.grid.rows;
   * }
   * ```
   */
  protected parseBody(cmd: StandardApiCommand<TMetadataCommand>, body: any): StandardApiResponse<TMetadataResponse> {
    return body;
  }

  /**
   * Execute a command, deduplicating identical in-flight requests. Calls the child class's `buildRequest`, which
   * provides the implementation details of how the command is sent over HTTP.
   */
  execute(cmd: StandardApiCommand<TMetadataCommand>): Promise<StandardApiResponse<TMetadataResponse>> {
    const key = JSON.stringify(cmd);
    const existing = this.#inflight.get(key);
    if (existing) return existing;
    const pending = this.send(cmd).finally(() => this.#inflight.delete(key));
    this.#inflight.set(key, pending);
    return pending;
  }

  protected async send(cmd: StandardApiCommand<TMetadataCommand>): Promise<StandardApiResponse<TMetadataResponse>> {
    const { url, init } = this.buildRequest(cmd);
    const headers = new Headers(init.headers);
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    init.headers = headers;

    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (e) {
      throw new GridError(GridErrorCode.FETCH_FAILED, "Failed to fetch from API", e as Error, { url });
    }
    if (!response.ok) {
      throw new GridError(GridErrorCode.FETCH_FAILED, "Failed to fetch from API", undefined, {
        url,
        status: response.status,
      });
    }

    let body: any;
    try {
      body = await response.json();
    } catch (e) {
      throw new GridError(GridErrorCode.PARSE_FAILED, "Failed to parse API response", e as Error, { url });
    }

    return this.parseBody(cmd, body);
  }

  addRef(): void {}

  async release(): Promise<void> {}
}
