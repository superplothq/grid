import { expect } from "chai";
import { ApiStandardTableDataModel, defaultStandardApiTransform } from "./api-standard-table-datamodel";
import { RestApiDataSource } from "./rest-api-datasource";
import { DataSchema, StandardTableConfig, StandardDataFetchAndTransformIR, GetRowsResponse, GetRowsApiResponse, ColumnRangeValues, StandardMetadataPlumber, StandardMetadataReshaperInput, StandardRawMetadata, StandardGlobalMetadataResolver, StandardPageCellMetadata, PageMetadata } from "./types";
import { FlattenedDataViewModel } from "../renderer/flattened-data-viewmodel";

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

// In-process implementation of the standard grid server protocol, served through a fetch stub.
// Returns GetRowsApiResponse: row-major rows keyed by field name. The datamodel picks the output
// columns from the rows by name, so key order and extra keys in a row do not matter.
function serveRows(ir: StandardDataFetchAndTransformIR): GetRowsApiResponse {
  let rows = dataset;
  for (let i = 0; i < ir.groupPath.length; i++) {
    const field = ir.groupBy[i];
    rows = rows.filter((r) => String(r[field]) === String(ir.groupPath[i]));
  }

  const depth = ir.groupPath.length;
  if (depth < ir.groupBy.length) {
    const groupField = ir.groupBy[depth];
    const measures = ir.project.filter((p) => p !== groupField && schema.find((s) => s.name === p)?.aggregateFn);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const groups = new Map<string, Record<string, any>>();
    for (const row of rows) {
      const key = String(row[groupField]);
      let group = groups.get(key);
      if (!group) {
        group = { [groupField]: key };
        for (const m of measures) group[m] = 0;
        groups.set(key, group);
      }
      for (const m of measures) group[m] += row[m];
    }
    const grouped = [...groups.values()].sort((a, b) => String(a[groupField]).localeCompare(String(b[groupField])));
    return { rows: grouped.slice(ir.startRow, ir.endRow), totalRowCount: grouped.length };
  }

  const slice = rows.slice(ir.startRow, ir.endRow);
  const response: GetRowsApiResponse = { rows: slice, totalRowCount: rows.length };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((ir.metadata as any)?.highRevenue) {
    response.metadata = { __meta__revenue__high: slice.map((r) => (r.revenue > 40 ? 1 : 0)) };
  }
  return response;
}

function serveRange(field: string): ColumnRangeValues {
  const values = [...new Set(dataset.map((r) => String(r[field])))].sort();
  return { type: "categorical", values };
}

function serveStats(fields: string[]) {
  const stats: Record<string, { max: number }> = {};
  for (const field of fields) {
    stats[field] = { max: Math.max(...dataset.map((r) => Number(r[field]))) };
  }
  return { stats };
}

function servePageMeta(ir: StandardDataFetchAndTransformIR) {
  const slice = dataset.slice(ir.startRow, ir.endRow);
  return { metadata: { __meta__revenue__high: slice.map((r) => (r.revenue > 40 ? 1 : 0)) } };
}

const originalFetch = globalThis.fetch;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serve(url: string, body: any) {
  const path = String(url);
  if (path.endsWith("/rows")) return serveRows(body);
  if (path.endsWith("/range")) return serveRange(body.field);
  if (path.endsWith("/stats")) return serveStats(body.fields);
  return servePageMeta(body);
}

function installServer() {
  // eslint-disable-next-line no-undef
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const payload = serve(url, JSON.parse(init.body as string));
    return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
}

// Same protocol semantics, but every payload is wrapped in { data: ... } - a server that deviates
// from the standard shapes, adapted back by the transform paired with the datasource.
function installWrappingServer() {
  // eslint-disable-next-line no-undef
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const payload = { data: serve(url, JSON.parse(init.body as string)) };
    return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
}

const highRevenueReshaper = {
  reshape({ ir, pageMetadata }: StandardMetadataReshaperInput): PageMetadata {
    const flags = pageMetadata["__meta__revenue__high"] ?? [];
    const colIdx = ir.project.indexOf("revenue");
    const cells: StandardPageCellMetadata[] = [];
    for (let rowIdx = 0; rowIdx < flags.length; rowIdx++) {
      if (flags[rowIdx] === 1) cells.push({ rowIdx, colIdx, meta: { high: true } });
    }
    return { cells };
  },
};

function makeIR(overrides: Partial<StandardDataFetchAndTransformIR> = {}): StandardDataFetchAndTransformIR {
  return {
    startRow: 0,
    endRow: 100,
    groupPath: [],
    groupBy: ["region", "country"],
    project: ["revenue", "units"],
    sort: [],
    filter: [],
    ...overrides,
  };
}

function makeModel(configOverrides: Partial<StandardTableConfig> = {}) {
  const ds = new RestApiDataSource({ baseUrl: "https://grid.test" });
  const model = new ApiStandardTableDataModel(schema, ds, { pageSize: 100, maxNumPageBeforeEviction: 20, ...configOverrides });
  return Object.assign(model, {
    ds,
    async getViewModel(ir: StandardDataFetchAndTransformIR) {
      return new FlattenedDataViewModel(await model.getViewModelData(ir));
    },
    async expandAndGetViewModel(groupPath: string[]) {
      return new FlattenedDataViewModel(await model.expand(groupPath));
    },
  });
}

describe("ApiStandardTableDataModel (through RestApiDataSource)", () => {
  beforeEach(() => {
    installServer();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("should produce correct viewmodel for top-level groups", async () => {
    const model = makeModel();
    const vm = await model.getViewModel(makeIR());

    expect(vm.numRows).to.equal(2);
    expect(vm.numCols).to.equal(2);

    const slice = vm.getSlice(0, 0, 2, 2);
    expect(slice.rowFacets).to.deep.equal(["EU", "NA"]);
    expect(slice.data).to.deep.equal([[100, 260], [10, 26]]);
  });

  it("should expand a group and fetch its children over the api", async () => {
    const model = makeModel();
    await model.getViewModel(makeIR());
    const vm = await model.expandAndGetViewModel(["EU"]);

    expect(vm.numRows).to.equal(4);

    const slice = vm.getSlice(0, 0, 2, 4);
    expect(slice.rowFacets).to.deep.equal(["EU", "DE", "FR", "NA"]);
    expect(slice.data).to.deep.equal([[100, 30, 70, 260], [10, 3, 7, 26]]);
  });

  it("should produce correct viewmodel when projecting a subset of measures", async () => {
    const model = makeModel();
    const vm = await model.getViewModel(makeIR({ project: ["units"] }));

    expect(vm.numRows).to.equal(2);
    const slice = vm.getSlice(0, 0, 1, 2);
    expect(slice.rowFacets).to.deep.equal(["EU", "NA"]);
    expect(slice.data).to.deep.equal([[10, 26]]);
  });

  it("should produce correct viewmodel when measures are projected in a different order than the schema", async () => {
    const model = makeModel();
    const vm = await model.getViewModel(makeIR({ project: ["units", "revenue"] }));

    const slice = vm.getSlice(0, 0, 2, 2);
    expect(slice.data).to.deep.equal([[10, 26], [100, 260]]);

    const expanded = await model.expandAndGetViewModel(["EU"]);
    const expandedSlice = expanded.getSlice(0, 0, 2, 4);
    expect(expandedSlice.rowFacets).to.deep.equal(["EU", "DE", "FR", "NA"]);
    expect(expandedSlice.data).to.deep.equal([[10, 3, 7, 26], [100, 30, 70, 260]]);
  });

  it("should render individual rows when no groupBy is set", async () => {
    const model = makeModel();
    const vm = await model.getViewModel(makeIR({ groupBy: [], project: ["region", "country", "revenue", "units"] }));

    expect(vm.numRows).to.equal(8);
    expect(vm.numCols).to.equal(4);

    const slice = vm.getSlice(0, 0, 4, 8);
    expect(slice.data[1]).to.deep.equal(["DE", "DE", "FR", "FR", "US", "US", "CA", "CA"]);
    expect(slice.data[2]).to.deep.equal([10, 20, 30, 40, 50, 60, 70, 80]);
  });

  it("should return column range values through the datasource", async () => {
    const model = makeModel();
    const range = await model.getRangeOfColumn("region");

    expect(range).to.deep.equal({ type: "categorical", values: ["EU", "NA"] });
  });
});

describe("ApiStandardTableDataModel with a transform", () => {
  beforeEach(() => {
    installWrappingServer();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("should adapt a deviating server for every command kind through one transform", async () => {
    const ds = new RestApiDataSource({ baseUrl: "https://grid.test" });
    const model = new ApiStandardTableDataModel(schema, ds, { pageSize: 100, maxNumPageBeforeEviction: 20, transform: (cmd, raw, ctx) => defaultStandardApiTransform(cmd, raw.data, ctx) });
    const vm = new FlattenedDataViewModel(await model.getViewModelData(makeIR()));

    const slice = vm.getSlice(0, 0, 2, 2);
    expect(slice.rowFacets).to.deep.equal(["EU", "NA"]);
    expect(slice.data).to.deep.equal([[100, 260], [10, 26]]);

    const range = await model.getRangeOfColumn("region");
    expect(range).to.deep.equal({ type: "categorical", values: ["EU", "NA"] });
  });
});

describe("ApiStandardTableDataModel metadata plumbing", () => {
  beforeEach(() => {
    installServer();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("should deliver pagewise metadata returned in the same response", async () => {
    const plumber: StandardMetadataPlumber = (ir) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ir.metadata as any)?.highRevenue ? { pageWise: { reshaper: highRevenueReshaper } } : {};
    const ds = new RestApiDataSource({ baseUrl: "https://grid.test" });
    const model = new ApiStandardTableDataModel(schema, ds, { pageSize: 100, maxNumPageBeforeEviction: 20 }, plumber);

    const params = await model.getViewModelData(makeIR({
      groupBy: [],
      project: ["region", "country", "revenue", "units"],
      metadata: { highRevenue: true },
    }));

    expect(params.metadata!.valueCells).to.deep.equal([
      { colIndex: 2, rowIndex: 4, meta: { high: true } },
      { colIndex: 2, rowIndex: 5, meta: { high: true } },
      { colIndex: 2, rowIndex: 6, meta: { high: true } },
      { colIndex: 2, rowIndex: 7, meta: { high: true } },
    ]);
  });

  it("should resolve global metadata through a user-defined command", async () => {
    type StatsCommand = { kind: "getStats"; fields: string[] };
    type StatsResponse = { stats: Record<string, { max: number }> };

    const ds = new RestApiDataSource<StatsCommand, StatsResponse>({
      baseUrl: "https://grid.test",
      buildRequest: (config, cmd) => {
        const path = cmd.kind === "getRows" ? "/rows" : cmd.kind === "getRange" ? "/range" : "/stats";
        const payload = cmd.kind === "getRows" ? cmd.ir : cmd.kind === "getRange" ? { field: cmd.field } : { fields: cmd.fields };
        return { url: `https://grid.test${path}`, init: { method: "POST", body: JSON.stringify(payload) } };
      },
    });
    const plumber: StandardMetadataPlumber = () => ({
      global: {
        resolver: {
          async resolve({ dataSource }): Promise<StandardRawMetadata> {
            return await dataSource!.execute({ kind: "getStats", fields: ["revenue", "units"] }) as StandardRawMetadata;
          },
        },
        reshaper: {
          reshape({ ir, raw }) {
            const stats = (raw as StatsResponse).stats;
            return ir.project.map((field, colIdx) => ({ colIdx, meta: stats[field] ?? {} }));
          },
        },
      },
    });
    const model = new ApiStandardTableDataModel(schema, ds, { pageSize: 100, maxNumPageBeforeEviction: 20 }, plumber);

    const params = await model.getViewModelData(makeIR({ groupBy: [], project: ["region", "country", "revenue", "units"] }));

    const revenueCol = params.metadata!.valueColumns!.find((c) => c.colIndex === 2);
    expect(revenueCol!.meta).to.deep.equal({ max: 80 });
    const unitsCol = params.metadata!.valueColumns!.find((c) => c.colIndex === 3);
    expect(unitsCol!.meta).to.deep.equal({ max: 8 });
  });

  it("should adapt global metadata from a deviating server via getGlobalMetadata override", async () => {
    installWrappingServer();
    type StatsCommand = { kind: "getStats"; fields: string[] };
    type StatsResponse = { stats: Record<string, { max: number }> };

    const ds = new RestApiDataSource<StatsCommand, StatsResponse>({
      baseUrl: "https://grid.test",
      buildRequest: (config, cmd) => {
        const path = cmd.kind === "getRows" ? "/rows" : cmd.kind === "getRange" ? "/range" : "/stats";
        const payload = cmd.kind === "getRows" ? cmd.ir : cmd.kind === "getRange" ? { field: cmd.field } : { fields: cmd.fields };
        return { url: `https://grid.test${path}`, init: { method: "POST", body: JSON.stringify(payload) } };
      },
    });
    const plumber: StandardMetadataPlumber = () => ({
      global: {
        resolver: {
          async resolve({ dataSource }): Promise<StandardRawMetadata> {
            return await dataSource!.execute({ kind: "getStats", fields: ["revenue", "units"] }) as StandardRawMetadata;
          },
        },
        reshaper: {
          reshape({ ir, raw }) {
            const stats = (raw as StatsResponse).stats;
            return ir.project.map((field, colIdx) => ({ colIdx, meta: stats[field] ?? {} }));
          },
        },
      },
    });

    class WrappedStatsTableDataModel extends ApiStandardTableDataModel<StatsCommand, StatsResponse> {
      protected async getGlobalMetadata(ir: StandardDataFetchAndTransformIR, resolver: StandardGlobalMetadataResolver): Promise<StandardRawMetadata> {
        const raw = await super.getGlobalMetadata(ir, resolver);
        return (raw as { data: StandardRawMetadata }).data;
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = new WrappedStatsTableDataModel(schema, ds, { pageSize: 100, maxNumPageBeforeEviction: 20, transform: (cmd, raw: any, ctx) => defaultStandardApiTransform(cmd, raw.data, ctx) }, plumber);

    const params = await model.getViewModelData(makeIR({ groupBy: [], project: ["region", "country", "revenue", "units"] }));

    const revenueCol = params.metadata!.valueColumns!.find((c) => c.colIndex === 2);
    expect(revenueCol!.meta).to.deep.equal({ max: 80 });
    const unitsCol = params.metadata!.valueColumns!.find((c) => c.colIndex === 3);
    expect(unitsCol!.meta).to.deep.equal({ max: 8 });
  });

  it("should combine data and metadata from separate endpoints via getData override", async () => {
    type PageMetaCommand = { kind: "getPageMeta"; ir: StandardDataFetchAndTransformIR };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type PageMetaResponse = { metadata: Record<string, any[]> };

    const ds = new RestApiDataSource<PageMetaCommand, PageMetaResponse>({
      baseUrl: "https://grid.test",
      buildRequest: (config, cmd) => {
        const path = cmd.kind === "getRows" ? "/rows" : cmd.kind === "getRange" ? "/range" : "/pagemeta";
        const payload = cmd.kind === "getRows" ? cmd.ir : cmd.kind === "getRange" ? { field: cmd.field } : cmd.ir;
        return { url: `https://grid.test${path}`, init: { method: "POST", body: JSON.stringify(payload) } };
      },
    });

    class TwoCallTableDataModel extends ApiStandardTableDataModel<PageMetaCommand, PageMetaResponse> {
      constructor(source: RestApiDataSource<PageMetaCommand, PageMetaResponse>) {
        super(schema, source, { pageSize: 100, maxNumPageBeforeEviction: 20 }, () => ({ pageWise: { reshaper: highRevenueReshaper } }));
      }

      async getData(ir: StandardDataFetchAndTransformIR): Promise<GetRowsResponse> {
        const [dataRes, metaRes] = await Promise.all([
          super.getData(ir),
          this.executeCommand({ kind: "getPageMeta", ir }),
        ]);
        return { ...dataRes, metadata: metaRes.metadata };
      }
    }

    const model = new TwoCallTableDataModel(ds);
    const params = await model.getViewModelData(makeIR({ groupBy: [], project: ["region", "country", "revenue", "units"] }));

    expect(params.metadata!.valueCells).to.deep.equal([
      { colIndex: 2, rowIndex: 4, meta: { high: true } },
      { colIndex: 2, rowIndex: 5, meta: { high: true } },
      { colIndex: 2, rowIndex: 6, meta: { high: true } },
      { colIndex: 2, rowIndex: 7, meta: { high: true } },
    ]);
  });
});
