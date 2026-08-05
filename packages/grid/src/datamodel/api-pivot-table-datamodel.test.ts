import { expect } from "chai";
import { ApiPivotTableDataModel, defaultPivotApiTransform } from "./api-pivot-table-datamodel";
import { RestApiDataSource } from "./rest-api-datasource";
import { cross, hierarchy } from "./pivot-table-datamodel";
import { PivotDataViewModel } from "../renderer/pivot-data-viewmodel";
import { DataSchema, DimSpec, PivotConfig, PivotDataFetchAndTransformIR, PivotFilterQuery, GetPivotDataApiResponse } from "./types";

const schema: DataSchema[] = [
  { name: "region", type: "dimension" },
  { name: "country", type: "dimension" },
  { name: "revenue", displayName: "Revenue", type: "measure", aggregateFn: "sum" },
  { name: "units", displayName: "Units", type: "measure", aggregateFn: "sum" },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dataset: Record<string, any>[] = [
  { region: "EU", country: "DE", revenue: 10, units: 1 },
  { region: "EU", country: "DE", revenue: 20, units: 2 },
  { region: "EU", country: "FR", revenue: 30, units: 3 },
  { region: "EU", country: "FR", revenue: 40, units: 4 },
  { region: "NA", country: "US", revenue: 50, units: 5 },
  { region: "NA", country: "US", revenue: 60, units: 6 },
  { region: "NA", country: "CA", revenue: 70, units: 7 },
  { region: "NA", country: "CA", revenue: 80, units: 8 },
];

function dimFields(spec: DimSpec): string[] {
  if (spec.type === "none") return [];
  if (spec.type === "simple") return [spec.field];
  if (spec.type === "hierarchy") return spec.fields;
  if (spec.type === "cross") return spec.children.flatMap(dimFields);
  throw new Error("concat not supported by the test server");
}

// In-process implementation of the pivot server semantics, served through a fetch stub.
// Returns GetPivotDataApiResponse: row-major rows keyed by the names in columns, dimension
// columns first, source insertion order. The datamodel picks columns from the rows by name.
function servePivot(ir: PivotDataFetchAndTransformIR): GetPivotDataApiResponse {
  const fields = dimFields(ir.dimSpec);
  const measureFields = ir.measures.map((m) => m.field);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rows: Record<string, any>[];
  if (fields.length === 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row: Record<string, any> = {};
    for (const m of ir.measures) row[m.field] = dataset.reduce((sum, r) => sum + r[m.field], 0);
    rows = [row];
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const groups = new Map<string, Record<string, any>>();
    for (const r of dataset) {
      const key = fields.map((f) => r[f]).join("\0");
      let group = groups.get(key);
      if (!group) {
        group = {};
        for (const f of fields) group[f] = r[f];
        for (const m of measureFields) group[m] = 0;
        groups.set(key, group);
      }
      for (const m of measureFields) group[m] += r[m];
    }
    rows = [...groups.values()];
  }
  const columns = [...fields, ...measureFields];
  const response: GetPivotDataApiResponse = { columns, rows };
  if (ir.metadata) {
    response.metadata = { __meta__high: rows.map((r) => (r.revenue > 100 ? 1 : 0)) };
  }
  return response;
}

function serveFacets(query: PivotFilterQuery): string[][] {
  return query.fields.map((f) => [...new Set(dataset.map((r) => String(r[f])))]);
}

const originalFetch = globalThis.fetch;
let seenPivotIRs: PivotDataFetchAndTransformIR[] = [];

function installServer() {
  seenPivotIRs = [];
  // eslint-disable-next-line no-undef
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    let payload;
    if (String(url).endsWith("/pivot")) {
      seenPivotIRs.push(body);
      payload = servePivot(body);
    } else {
      payload = serveFacets(body.query);
    }
    return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
}

function makeModel() {
  const ds = new RestApiDataSource({ baseUrl: "https://grid.test" });
  const model = new ApiPivotTableDataModel(schema, ds);
  return Object.assign(model, {
    async getViewModel(config: PivotConfig) {
      return new PivotDataViewModel(await model.getViewModelData(config));
    },
  });
}

describe("ApiPivotTableDataModel (through RestApiDataSource)", () => {
  beforeEach(() => {
    installServer();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("should produce correct viewmodel for simple rows with a measure column", async () => {
    const model = makeModel();
    const vm = await model.getViewModel({ rows: "region", columns: "revenue" });

    expect(vm.rowFacets).to.deep.equal([["EU", "NA"]]);
    expect(vm.columnFacets).to.deep.equal([["revenue"]]);
    expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([[100, 260]]);
  });

  it("should produce correct viewmodel for hierarchy rows", async () => {
    const model = makeModel();
    const vm = await model.getViewModel({ rows: hierarchy("region", "country"), columns: "revenue" });

    expect(vm.rowFacets).to.deep.equal([
      ["EU", "EU", "NA", "NA"],
      ["DE", "FR", "US", "CA"],
    ]);
    expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([[30, 70, 110, 150]]);
  });

  it("should produce correct viewmodel for dimension columns crossed with a measure", async () => {
    const model = makeModel();
    const vm = await model.getViewModel({ rows: "region", columns: cross("country", "revenue") });

    expect(vm.rowFacets).to.deep.equal([["EU", "NA"]]);
    expect(vm.columnFacets).to.deep.equal([
      ["DE", "FR", "US", "CA"],
      ["revenue", "revenue", "revenue", "revenue"],
    ]);
    expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
      [30, null],
      [70, null],
      [null, 110],
      [null, 150],
    ]);
  });

  it("should resolve facet values through the datasource", async () => {
    const model = makeModel();
    const values = await model.resolveFacetValues({ type: "facet", fields: ["region", "country"], mode: "distinct" });

    expect(values).to.deep.equal([
      ["EU", "NA"],
      ["DE", "FR", "US", "CA"],
    ]);
  });

  it("should send config metadata to the server inside the ir", async () => {
    const model = makeModel();
    await model.getViewModel({ rows: "region", columns: "revenue", metadata: { highCheck: true } });

    expect(seenPivotIRs).to.have.length(1);
    expect(seenPivotIRs[0].metadata).to.deep.equal({ highCheck: true });
  });

  it("should pass server metadata through to the raw result", async () => {
    const model = makeModel();
    const raw = await model.getData({
      dimSpec: { type: "simple", field: "region", filter: [] },
      measures: [{ field: "revenue", aggregation: "sum", filter: [] }],
      metadata: { highCheck: true },
    });

    expect(raw.columns).to.deep.equal(["region", "revenue"]);
    expect(raw.data).to.deep.equal([["EU", "NA"], [100, 260]]);
    expect(raw.metadata).to.deep.equal({ __meta__high: [0, 1] });
  });

  it("should adapt a deviating server through the transform paired with the datasource", async () => {
    // eslint-disable-next-line no-undef
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      const payload = String(url).endsWith("/pivot") ? { data: servePivot(body) } : { data: serveFacets(body.query) };
      return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;

    const ds = new RestApiDataSource({ baseUrl: "https://grid.test" });
    const model = new ApiPivotTableDataModel(schema, ds, { transform: (cmd, raw, ctx) => defaultPivotApiTransform(cmd, raw.data, ctx) });
    const vm = new PivotDataViewModel(await model.getViewModelData({ rows: "region", columns: "revenue" }));

    expect(vm.rowFacets).to.deep.equal([["EU", "NA"]]);
    expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([[100, 260]]);
  });
});
