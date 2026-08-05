import { expect } from "chai";
import { HttpApiDataSource } from "./http-api-datasource";
import { RestApiDataSource } from "./rest-api-datasource";
import { StandardApiCommand } from "./types";
import { GridError, GridErrorCode } from "../errors";

const originalFetch = globalThis.fetch;

// eslint-disable-next-line no-undef
function stubFetch(fn: (url: string, init: RequestInit) => Promise<Response>) {
  globalThis.fetch = fn as typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

class QueryParamApiDataSource extends HttpApiDataSource {
  // eslint-disable-next-line no-undef
  protected buildRequest(cmd: StandardApiCommand): { url: string; init: RequestInit } {
    const params = cmd.kind === "getRows"
      ? new URLSearchParams({ start: String(cmd.ir.startRow), end: String(cmd.ir.endRow) })
      : new URLSearchParams({ field: cmd.field });
    return { url: `https://example.test/grid?${params}`, init: { method: "GET" } };
  }
}

describe("HttpApiDataSource", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("should support get requests with query params via buildRequest only", async () => {
    let seenUrl = "";
    let seenMethod = "";
    stubFetch(async (url, init) => {
      seenUrl = url;
      seenMethod = init.method!;
      return jsonResponse({ rows: [{ a: 1 }], totalRowCount: 1 });
    });

    const ds = new QueryParamApiDataSource();
    const res = await ds.execute({ kind: "getRows", ir: { startRow: 0, endRow: 100, groupPath: [], groupBy: [], project: ["a"], sort: [], filter: [] } });

    expect(seenUrl).to.equal("https://example.test/grid?start=0&end=100");
    expect(seenMethod).to.equal("GET");
    expect(res).to.deep.equal({ rows: [{ a: 1 }], totalRowCount: 1 });
  });

  it("should deduplicate identical in-flight requests", async () => {
    let fetchCallCount = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    stubFetch(async () => {
      fetchCallCount++;
      await gate;
      return jsonResponse({ type: "categorical", values: ["EU"] });
    });

    const ds = new QueryParamApiDataSource();
    const p1 = ds.execute({ kind: "getRange", field: "region" });
    const p2 = ds.execute({ kind: "getRange", field: "region" });
    release();
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(fetchCallCount).to.equal(1);
    expect(r1).to.deep.equal(r2);

    await ds.execute({ kind: "getRange", field: "region" });
    expect(fetchCallCount).to.equal(2);
  });

  it("should not deduplicate different commands", async () => {
    let fetchCallCount = 0;
    stubFetch(async () => {
      fetchCallCount++;
      return jsonResponse({ type: "categorical", values: [] });
    });

    const ds = new QueryParamApiDataSource();
    await Promise.all([
      ds.execute({ kind: "getRange", field: "region" }),
      ds.execute({ kind: "getRange", field: "country" }),
    ]);

    expect(fetchCallCount).to.equal(2);
  });

  it("should throw fetch failed on network error", async () => {
    stubFetch(async () => { throw new TypeError("network down"); });

    const ds = new QueryParamApiDataSource();
    try {
      await ds.execute({ kind: "getRange", field: "region" });
      expect.fail("expected GridError");
    } catch (e) {
      expect(e).to.be.instanceOf(GridError);
      expect((e as GridError).code).to.equal(GridErrorCode.FETCH_FAILED);
    }
  });

  it("should throw fetch failed on non-2xx status", async () => {
    stubFetch(async () => jsonResponse({ message: "nope" }, 500));

    const ds = new QueryParamApiDataSource();
    try {
      await ds.execute({ kind: "getRange", field: "region" });
      expect.fail("expected GridError");
    } catch (e) {
      expect(e).to.be.instanceOf(GridError);
      expect((e as GridError).code).to.equal(GridErrorCode.FETCH_FAILED);
    }
  });

  it("should throw parse failed on invalid json body", async () => {
    stubFetch(async () => new Response("not json", { status: 200 }));

    const ds = new QueryParamApiDataSource();
    try {
      await ds.execute({ kind: "getRange", field: "region" });
      expect.fail("expected GridError");
    } catch (e) {
      expect(e).to.be.instanceOf(GridError);
      expect((e as GridError).code).to.equal(GridErrorCode.PARSE_FAILED);
    }
  });

  it("should merge configured headers with defaults", async () => {
    let seenHeaders!: Headers;
    stubFetch(async (url, init) => {
      seenHeaders = new Headers(init.headers);
      return jsonResponse({ rows: [], totalRowCount: 0 });
    });

    const ds = new RestApiDataSource({ baseUrl: "https://example.test", headers: { Authorization: "Bearer token" } });
    await ds.execute({ kind: "getRange", field: "region" });

    expect(seenHeaders.get("Content-Type")).to.equal("application/json");
    expect(seenHeaders.get("Authorization")).to.equal("Bearer token");
  });

  it("should preserve headers given as a Headers instance", async () => {
    let seenHeaders!: Headers;
    stubFetch(async (url, init) => {
      seenHeaders = new Headers(init.headers);
      return jsonResponse({ rows: [], totalRowCount: 0 });
    });

    const ds = new RestApiDataSource({
      baseUrl: "https://example.test",
      buildRequest: (config, cmd) => ({
        url: "https://example.test/grid",
        init: { method: "POST", headers: new Headers({ Authorization: "Bearer token" }), body: JSON.stringify(cmd) },
      }),
    });
    await ds.execute({ kind: "getRange", field: "region" });

    expect(seenHeaders.get("Authorization")).to.equal("Bearer token");
    expect(seenHeaders.get("Content-Type")).to.equal("application/json");
  });

  it("should preserve headers given as an entries array", async () => {
    let seenHeaders!: Headers;
    stubFetch(async (url, init) => {
      seenHeaders = new Headers(init.headers);
      return jsonResponse({ rows: [], totalRowCount: 0 });
    });

    const ds = new RestApiDataSource({
      baseUrl: "https://example.test",
      buildRequest: (config, cmd) => ({
        url: "https://example.test/grid",
        init: { method: "POST", headers: [["X-Custom", "1"]], body: JSON.stringify(cmd) },
      }),
    });
    await ds.execute({ kind: "getRange", field: "region" });

    expect(seenHeaders.get("X-Custom")).to.equal("1");
    expect(seenHeaders.get("Content-Type")).to.equal("application/json");
  });

  it("should let a lowercase content type header override the default", async () => {
    let seenHeaders!: Headers;
    stubFetch(async (url, init) => {
      seenHeaders = new Headers(init.headers);
      return jsonResponse({ rows: [], totalRowCount: 0 });
    });

    const ds = new RestApiDataSource({
      baseUrl: "https://example.test",
      buildRequest: (config, cmd) => ({
        url: "https://example.test/grid",
        init: { method: "POST", headers: { "content-type": "text/csv" }, body: JSON.stringify(cmd) },
      }),
    });
    await ds.execute({ kind: "getRange", field: "region" });

    expect(seenHeaders.get("Content-Type")).to.equal("text/csv");
  });

  it("should allow different headers per request via custom buildRequest", async () => {
    const seenHeaders: Headers[] = [];
    stubFetch(async (url, init) => {
      seenHeaders.push(new Headers(init.headers));
      return jsonResponse({ type: "categorical", values: [] });
    });

    const ds = new RestApiDataSource({
      baseUrl: "https://example.test",
      buildRequest: (config, cmd) => ({
        url: "https://example.test/grid",
        init: { method: "POST", headers: { "X-Command": cmd.kind }, body: JSON.stringify(cmd) },
      }),
    });
    await ds.execute({ kind: "getRange", field: "region" });
    await ds.execute({ kind: "getRange", field: "country" });

    expect(seenHeaders[0].get("X-Command")).to.equal("getRange");
    expect(seenHeaders[0].get("Content-Type")).to.equal("application/json");
  });
});
