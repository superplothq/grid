import { expect } from "chai";
import { GraphQLApiDataSource, GraphQLApiDataSourceConfig } from "./graphql-api-datasource";
import { StandardDataFetchAndTransformIR } from "./types";
import { GridError, GridErrorCode } from "../errors";

const originalFetch = globalThis.fetch;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stubFetch(fn: (url: string, init: RequestInit) => Promise<Response>) { // eslint-disable-line no-undef
  globalThis.fetch = fn as typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function makeIR(overrides: Partial<StandardDataFetchAndTransformIR> = {}): StandardDataFetchAndTransformIR {
  return {
    startRow: 0,
    endRow: 100,
    groupPath: [],
    groupBy: [],
    project: ["a"],
    sort: [],
    filter: [],
    ...overrides,
  };
}

function makeDataSource(overrides: Partial<GraphQLApiDataSourceConfig> = {}) {
  return new GraphQLApiDataSource({
    endpoint: "https://example.test/graphql",
    getRows: {
      query: "query Rows($ir: JSON!) { grid { rows(ir: $ir) { rows totalRowCount } } }",
      parse: (data) => data.grid.rows,
    },
    getRange: {
      query: "query Range($field: String!) { grid { range(field: $field) } }",
      parse: (data) => data.grid.range,
    },
    ...overrides,
  });
}

describe("GraphQLApiDataSource", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("should post the query with default variables and parse the data payload", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let seenBody: any;
    stubFetch(async (url, init) => {
      seenBody = JSON.parse(init.body as string);
      return jsonResponse({ data: { grid: { rows: { rows: [{ a: 1 }], totalRowCount: 1 } } } });
    });

    const ds = makeDataSource();
    const ir = makeIR();
    const res = await ds.execute({ kind: "getRows", ir });

    expect(seenBody.query).to.equal("query Rows($ir: JSON!) { grid { rows(ir: $ir) { rows totalRowCount } } }");
    expect(seenBody.variables).to.deep.equal({ ir });
    expect(res).to.deep.equal({ rows: [{ a: 1 }], totalRowCount: 1 });
  });

  it("should use custom buildVariables when provided", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let seenBody: any;
    stubFetch(async (url, init) => {
      seenBody = JSON.parse(init.body as string);
      return jsonResponse({ data: { grid: { rows: { rows: [], totalRowCount: 0 } } } });
    });

    const ds = makeDataSource({
      getRows: {
        query: "query Rows($start: Int!, $end: Int!) { grid { rows(start: $start, end: $end) { rows totalRowCount } } }",
        buildVariables: (ir) => ({ start: ir.startRow, end: ir.endRow }),
        parse: (data) => data.grid.rows,
      },
    });
    await ds.execute({ kind: "getRows", ir: makeIR({ startRow: 10, endRow: 20 }) });

    expect(seenBody.variables).to.deep.equal({ start: 10, end: 20 });
  });

  it("should post the pivot query through the pivot operation", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let seenBody: any;
    stubFetch(async (url, init) => {
      seenBody = JSON.parse(init.body as string);
      return jsonResponse({ data: { grid: { pivot: { columns: ["region", "revenue"], rows: [{ region: "EU", revenue: 100 }] } } } });
    });

    const ds = makeDataSource({
      getPivotData: {
        query: "query Pivot($ir: JSON!) { grid { pivot(ir: $ir) { columns rows } } }",
        parse: (data) => data.grid.pivot,
      },
    });
    const ir = { dimSpec: { type: "simple" as const, field: "region", filter: [] }, measures: [] };
    const res = await ds.execute({ kind: "getPivotData", ir });

    expect(seenBody.variables).to.deep.equal({ ir });
    expect(res).to.deep.equal({ columns: ["region", "revenue"], rows: [{ region: "EU", revenue: 100 }] });
  });

  it("should parse getRange responses through the range operation", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let seenBody: any;
    stubFetch(async (url, init) => {
      seenBody = JSON.parse(init.body as string);
      return jsonResponse({ data: { grid: { range: { type: "categorical", values: ["EU", "NA"] } } } });
    });

    const ds = makeDataSource();
    const res = await ds.execute({ kind: "getRange", field: "region" });

    expect(seenBody.variables).to.deep.equal({ field: "region" });
    expect(res).to.deep.equal({ type: "categorical", values: ["EU", "NA"] });
  });

  it("should throw fetch failed when the response contains graphql errors", async () => {
    stubFetch(async () => jsonResponse({ errors: [{ message: "field not found" }] }));

    const ds = makeDataSource();
    try {
      await ds.execute({ kind: "getRange", field: "region" });
      expect.fail("expected GridError");
    } catch (e) {
      expect(e).to.be.instanceOf(GridError);
      expect((e as GridError).code).to.equal(GridErrorCode.FETCH_FAILED);
    }
  });
});
