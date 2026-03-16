import { expect } from "chai";
import { getUnfetchedPagesByLogicalBoundary } from "./flat-table-datamodel";
import { DuckDBDataSource } from "./duckdb-datasource";
import { SqlFlatTableDataModel } from "./sql-flat-table-datamodel";
import { SqlColumnType } from "./datasource";
import { FlatTableConfig, GetRowsIR, GetRowsResponse, GridData, MeasureSchema, Schema, PageNode, ExpandedGroup } from "./types";

// 24 rows, 8 dimensions + 4 measures — same dataset as datamodel.data.test.ts
const schemaColumns: (string | Schema)[] = [
  "region", "country", "city", "department", "product", "channel", "quarter", "segment",
  { name: "revenue", displayName: "Revenue", type: "measure", aggregateFn: "sum" } as Schema,
  { name: "cost", displayName: "Cost", type: "measure", aggregateFn: "sum" } as Schema,
  { name: "units_sold", displayName: "Units Sold", type: "measure", aggregateFn: "sum" } as Schema,
  { name: "returns", displayName: "Returns", type: "measure", aggregateFn: "sum" } as Schema,
];

const region     = ["North America","North America","North America","North America","North America","North America","North America","North America","North America","North America","North America","North America","Europe","Europe","Europe","Europe","Europe","Europe","Europe","Europe","North America","Europe","North America","Europe"];
const country    = ["USA","USA","USA","USA","USA","USA","USA","USA","Canada","Canada","Canada","Canada","UK","UK","UK","UK","Germany","Germany","Germany","Germany","USA","UK","USA","Germany"];
const city       = ["New York","New York","New York","New York","New York","Chicago","Chicago","Chicago","Toronto","Toronto","Toronto","Toronto","London","London","London","London","Berlin","Berlin","Berlin","Berlin","New York","London","Chicago","Berlin"];
const department = ["Electronics","Electronics","Electronics","Apparel","Apparel","Electronics","Electronics","Apparel","Electronics","Electronics","Apparel","Apparel","Electronics","Electronics","Apparel","Apparel","Electronics","Electronics","Apparel","Apparel","Electronics","Apparel","Apparel","Electronics"];
const product    = ["Laptop","Laptop","Phone","Jacket","Jacket","Laptop","Phone","Shoes","Laptop","Phone","Jacket","Shoes","Laptop","Phone","Jacket","Shoes","Laptop","Phone","Jacket","Shoes","Phone","Jacket","Jacket","Laptop"];
const channel    = ["Online","Online","Retail","Online","Retail","Online","Retail","Online","Online","Online","Retail","Wholesale","Online","Retail","Online","Retail","Online","Wholesale","Retail","Online","Online","Retail","Wholesale","Retail"];
const quarter    = ["Q1","Q2","Q1","Q1","Q2","Q1","Q2","Q1","Q1","Q2","Q1","Q2","Q1","Q1","Q2","Q2","Q1","Q2","Q1","Q2","Q3","Q3","Q3","Q3"];
const segment    = ["Consumer","Consumer","Consumer","Consumer","Business","Business","Consumer","Consumer","Consumer","Business","Consumer","Business","Consumer","Business","Consumer","Business","Consumer","Business","Consumer","Consumer","Business","Consumer","Business","Consumer"];
const revenue    = [1200,1500,800,300,350,1100,900,250,1000,700,280,200,1400,850,400,320,1300,750,350,280,950,380,290,1350];
const cost       = [800,1000,500,150,175,750,550,120,700,450,140,100,950,520,200,160,880,480,170,135,580,190,145,900];
const units_sold = [10,12,20,15,18,9,22,25,8,16,14,30,11,19,20,28,10,17,16,22,24,17,13,11];
const returns    = [1,2,3,1,2,1,4,2,1,2,1,3,1,3,2,4,1,2,1,3,3,2,1,1];

const gridData: GridData = {
  columns: schemaColumns,
  data: [region, country, city, department, product, channel, quarter, segment, revenue, cost, units_sold, returns],
};

const flatSchema: (Schema | MeasureSchema)[] = [
  { name: "region", type: "dimension" },
  { name: "country", type: "dimension" },
  { name: "city", type: "dimension" },
  { name: "department", type: "dimension" },
  { name: "product", type: "dimension" },
  { name: "channel", type: "dimension" },
  { name: "quarter", type: "dimension" },
  { name: "segment", type: "dimension" },
  { name: "revenue", displayName: "Revenue", type: "measure", aggregateFn: "sum" },
  { name: "cost", displayName: "Cost", type: "measure", aggregateFn: "sum" },
  { name: "units_sold", displayName: "Units Sold", type: "measure", aggregateFn: "sum" },
  { name: "returns", displayName: "Returns", type: "measure", aggregateFn: "sum" },
];

function makeConfig(overrides: Partial<FlatTableConfig> = {}): FlatTableConfig {
  return {
    schema: flatSchema,
    pageSize: 100,
    maxCacheSize: 20,
    ...overrides,
  };
}

function makeIR(overrides: Partial<GetRowsIR> = {}): GetRowsIR {
  return {
    startRow: 0,
    endRow: 100,
    select: [],
    groupBy: ["region", "country"],
    project: ["revenue", "cost", "units_sold", "returns"],
    sort: [],
    filter: [],
    ...overrides,
  };
}

async function makeModel(configOverrides: Partial<FlatTableConfig> = {}) {
  return makePatchedModel(configOverrides);
}

async function makePatchedModel(configOverrides: Partial<FlatTableConfig> = {}) {
  const dataSchema: Schema[] = gridData.columns.map((col) => {
    if (typeof col === "string") {
      return { name: col, displayName: col, type: "dimension" as const };
    }
    return col;
  });
  const columns = new Map<string, SqlColumnType>(
    dataSchema.map((s) => [s.name, (s.type === "measure" ? "DOUBLE" : "VARCHAR") as SqlColumnType])
  );
  const ds = DuckDBDataSource.create();
  await ds.loadData({ table: "data", columns, data: gridData.data });
  const model = new SqlFlatTableDataModel(makeConfig(configOverrides), dataSchema, ds);
  let getDataCallCount = 0;
  const origGetData = model.getData.bind(model);
  model.getData = async (ir: GetRowsIR): Promise<GetRowsResponse> => {
    getDataCallCount++;
    return origGetData(ir);
  };
  return Object.assign(model, {
    getDataCallCount: () => getDataCallCount,
  });
}

describe("FlatTableDataModel (real DuckDB)", () => {
  it("should produce correct viewmodel for top-level groups", async () => {
    const model = await makeModel();
    const vm = await model.getViewModel(makeIR());

    // groupBy region → 2 groups: Europe, North America (sorted alphabetically)
    expect(vm.numRows).to.equal(2);
    expect(vm.numCols).to.equal(4);

    const slice = vm.getSlice(0, 0, 4, 2);
    expect(slice.rowFacets).to.deep.equal(["Europe", "North America"]);
    expect(slice.data).to.deep.equal([[7380, 9820], [4585, 6160], [171, 236], [20, 27]]);
    expect(slice.rowMeta).to.deep.equal([
      { depth: 0, isLeaf: false, isExpanded: false },
      { depth: 0, isLeaf: false, isExpanded: false },
    ]);
  });

  it("should expand a group and show child facets", async () => {
    const model = await makeModel();
    await model.getViewModel(makeIR());

    const vm = await model.expand(["Europe"]);

    // Europe expanded → shows child countries: Germany, UK
    // Total rows: Europe + [Germany, UK] + North America = 4
    expect(vm.numRows).to.equal(4);
    expect(vm.numCols).to.equal(4);

    const slice = vm.getSlice(0, 0, 4, 4);
    expect(slice.rowFacets).to.deep.equal(["Europe", "Germany", "UK", "North America"]);
    expect(slice.data).to.deep.equal([
      [7380, 4030, 3350, 9820],
      [4585, 2565, 2020, 6160],
      [171, 76, 95, 236],
      [20, 8, 12, 27],
    ]);
    expect(slice.rowMeta).to.deep.equal([
      { depth: 0, isLeaf: false, isExpanded: true },
      { depth: 1, isLeaf: true, isExpanded: false },
      { depth: 1, isLeaf: true, isExpanded: false },
      { depth: 0, isLeaf: false, isExpanded: false },
    ]);

    const collapsed = await model.collapse(["Europe"]);

    expect(collapsed.numRows).to.equal(2);
    expect(collapsed.numCols).to.equal(4);

    const collapsedSlice = collapsed.getSlice(0, 0, 4, 2);
    expect(collapsedSlice.rowFacets).to.deep.equal(["Europe", "North America"]);
    expect(collapsedSlice.data).to.deep.equal([[7380, 9820], [4585, 6160], [171, 236], [20, 27]]);
    expect(collapsedSlice.rowMeta).to.deep.equal([
      { depth: 0, isLeaf: false, isExpanded: false },
      { depth: 0, isLeaf: false, isExpanded: false },
    ]);

    const callsBefore = model.getDataCallCount();
    const reExpanded = await model.expand(["Europe"]);

    expect(model.getDataCallCount()).to.equal(callsBefore);
    expect(reExpanded.numRows).to.equal(4);
    expect(reExpanded.numCols).to.equal(4);

    const reExpandedSlice = reExpanded.getSlice(0, 0, 4, 4);
    expect(reExpandedSlice.rowFacets).to.deep.equal(["Europe", "Germany", "UK", "North America"]);
    expect(reExpandedSlice.data).to.deep.equal([
      [7380, 4030, 3350, 9820],
      [4585, 2565, 2020, 6160],
      [171, 76, 95, 236],
      [20, 8, 12, 27],
    ]);
    expect(reExpandedSlice.rowMeta).to.deep.equal([
      { depth: 0, isLeaf: false, isExpanded: true },
      { depth: 1, isLeaf: true, isExpanded: false },
      { depth: 1, isLeaf: true, isExpanded: false },
      { depth: 0, isLeaf: false, isExpanded: false },
    ]);
  });

  it("should handle nested expand with outsideFacetDims", async () => {
    const model = await makeModel();
    const ir = makeIR({ project: ["product", "revenue", "cost", "units_sold", "returns"] });
    await model.getViewModel(ir);

    await model.expand(["Europe"]);
    const vm = await model.expand(["Europe", "Germany"]);

    expect(vm.numRows).to.equal(9);
    expect(vm.numCols).to.equal(5);

    const slice = vm.getSlice(0, 0, 5, 9);
    expect(slice.rowFacets).to.deep.equal(["Europe", "Germany", null, null, null, null, null, "UK", "North America"]);
    expect(slice.data).to.deep.equal([
      [null, null, "Laptop", "Phone", "Jacket", "Shoes", "Laptop", null, null],
      [7380, 4030, 1300, 750, 350, 280, 1350, 3350, 9820],
      [4585, 2565, 880, 480, 170, 135, 900, 2020, 6160],
      [171, 76, 10, 17, 16, 22, 11, 95, 236],
      [20, 8, 1, 2, 1, 3, 1, 12, 27],
    ]);
    expect(slice.rowMeta).to.deep.equal([
      { depth: 0, isLeaf: false, isExpanded: true },
      { depth: 1, isLeaf: false, isExpanded: true },
      { depth: 2, isLeaf: true, isExpanded: false },
      { depth: 2, isLeaf: true, isExpanded: false },
      { depth: 2, isLeaf: true, isExpanded: false },
      { depth: 2, isLeaf: true, isExpanded: false },
      { depth: 2, isLeaf: true, isExpanded: false },
      { depth: 1, isLeaf: false, isExpanded: false },
      { depth: 0, isLeaf: false, isExpanded: false },
    ]);
  });

  it("should compute totalLogicalRows correctly on expand/collapse", async () => {
    const model = await makeModel();
    await model.getViewModel(makeIR());

    expect(model.computeTotalLogicalRows()).to.equal(2);

    await model.expand(["Europe"]);
    // 2 top-level + 2 children of Europe = 4
    expect(model.computeTotalLogicalRows()).to.equal(4);

    await model.expand(["North America"]);
    // 2 top-level + 2 Europe children + 2 NA children (Canada, USA) = 6
    expect(model.computeTotalLogicalRows()).to.equal(6);

    await model.collapse(["Europe"]);
    // 2 top-level + 2 NA children = 4
    expect(model.computeTotalLogicalRows()).to.equal(4);
  });

  it("should handle incremental page fetching", async () => {
    // --- Top-level incremental loading ---
    // groupBy country, pageSize=2 → 4 countries (Canada,Germany,UK,USA) in 2 pages
    {
      const model = await makeModel({ pageSize: 2 });
      const ir = makeIR({ startRow: 0, endRow: 2, groupBy: ["country"] });

      const vm1 = await model.getViewModel(ir);

      expect(model.pages).to.have.length(2);
      expect(model.pages[0].data).to.not.be.null;
      expect(model.pages[1].data).to.be.null;
      expect(model.getDataCallCount()).to.equal(1);

      expect(vm1.numRows).to.equal(2);
      expect(vm1.numCols).to.equal(4);
      const slice1 = vm1.getSlice(0, 0, 4, 2);
      expect(slice1.rowFacets).to.deep.equal(["Canada", "Germany"]);
      expect(slice1.data).to.deep.equal([[2180, 4030], [1390, 2565], [68, 76], [7, 8]]);
      expect(slice1.rowMeta).to.deep.equal([
        { depth: 0, isLeaf: true, isExpanded: false },
        { depth: 0, isLeaf: true, isExpanded: false },
      ]);

      const vm2 = await model.getViewModel(makeIR({ startRow: 2, endRow: 4, groupBy: ["country"] }));

      expect(model.pages[0].data).to.not.be.null;
      expect(model.pages[1].data).to.not.be.null;
      expect(model.getDataCallCount()).to.equal(2);

      expect(vm2.numRows).to.equal(4);
      expect(vm2.numCols).to.equal(4);
      const slice2 = vm2.getSlice(0, 0, 4, 4);
      expect(slice2.rowFacets).to.deep.equal(["Canada", "Germany", "UK", "USA"]);
      expect(slice2.data).to.deep.equal([
        [2180, 4030, 3350, 7640],
        [1390, 2565, 2020, 4770],
        [68, 76, 95, 168],
        [7, 8, 12, 20],
      ]);
      expect(slice2.rowMeta).to.deep.equal([
        { depth: 0, isLeaf: true, isExpanded: false },
        { depth: 0, isLeaf: true, isExpanded: false },
        { depth: 0, isLeaf: true, isExpanded: false },
        { depth: 0, isLeaf: true, isExpanded: false },
      ]);
    }

    // --- Expand and then incremental child loading ---
    // groupBy region,country, pageSize=1 → 2 regions in 2 pages, expand creates child pages
    {
      const model = await makeModel({ pageSize: 1 });

      const vm1 = await model.getViewModel(makeIR({ startRow: 0, endRow: 1 }));

      expect(model.pages).to.have.length(2);
      expect(model.pages[0].data).to.not.be.null;
      expect(model.pages[1].data).to.be.null;
      expect(model.getDataCallCount()).to.equal(1);

      expect(vm1.numRows).to.equal(1);
      expect(vm1.numCols).to.equal(4);
      const slice1 = vm1.getSlice(0, 0, 4, 1);
      expect(slice1.rowFacets).to.deep.equal(["Europe"]);
      expect(slice1.data).to.deep.equal([[7380], [4585], [171], [20]]);
      expect(slice1.rowMeta).to.deep.equal([
        { depth: 0, isLeaf: false, isExpanded: false },
      ]);

      // Fetch page 1 (North America)
      const vm2 = await model.getViewModel(makeIR({ startRow: 1, endRow: 2 }));

      expect(model.pages[1].data).to.not.be.null;
      expect(model.getDataCallCount()).to.equal(2);

      expect(vm2.numRows).to.equal(2);
      expect(vm2.numCols).to.equal(4);
      const slice2 = vm2.getSlice(0, 0, 4, 2);
      expect(slice2.rowFacets).to.deep.equal(["Europe", "North America"]);
      expect(slice2.data).to.deep.equal([[7380, 9820], [4585, 6160], [171, 236], [20, 27]]);
      expect(slice2.rowMeta).to.deep.equal([
        { depth: 0, isLeaf: false, isExpanded: false },
        { depth: 0, isLeaf: false, isExpanded: false },
      ]);

      // Expand Europe → child pages: Germany(fetched), UK(unfetched)
      const vm3 = await model.expand(["Europe"]);

      const europeGroup = model.pages[0].expandedRows.get(0)!;
      expect(europeGroup.pages).to.have.length(2);
      expect(europeGroup.pages[0].data).to.not.be.null;
      expect(europeGroup.pages[1].data).to.be.null;
      expect(model.getDataCallCount()).to.equal(3);

      // Only Europe + Germany are output; UK child page is unloaded so walk stops
      // (North America excluded to keep output contiguous for pagination)
      expect(vm3.numRows).to.equal(2);
      expect(vm3.numCols).to.equal(4);
      const slice3 = vm3.getSlice(0, 0, 4, 2);
      expect(slice3.rowFacets).to.deep.equal(["Europe", "Germany"]);
      expect(slice3.data).to.deep.equal([
        [7380, 4030],
        [4585, 2565],
        [171, 76],
        [20, 8],
      ]);
      expect(slice3.rowMeta).to.deep.equal([
        { depth: 0, isLeaf: false, isExpanded: true },
        { depth: 1, isLeaf: true, isExpanded: false },
      ]);

      // Incrementally load UK child page
      const vm4 = await model.getViewModel(makeIR({ startRow: 0, endRow: 4 }));

      expect(europeGroup.pages[1].data).to.not.be.null;
      expect(model.getDataCallCount()).to.equal(4);

      expect(vm4.numRows).to.equal(4);
      expect(vm4.numCols).to.equal(4);
      const slice4 = vm4.getSlice(0, 0, 4, 4);
      expect(slice4.rowFacets).to.deep.equal(["Europe", "Germany", "UK", "North America"]);
      expect(slice4.data).to.deep.equal([
        [7380, 4030, 3350, 9820],
        [4585, 2565, 2020, 6160],
        [171, 76, 95, 236],
        [20, 8, 12, 27],
      ]);
      expect(slice4.rowMeta).to.deep.equal([
        { depth: 0, isLeaf: false, isExpanded: true },
        { depth: 1, isLeaf: true, isExpanded: false },
        { depth: 1, isLeaf: true, isExpanded: false },
        { depth: 0, isLeaf: false, isExpanded: false },
      ]);
    }
  });

  it("should evict pages when cache is full", async () => {
    // pageSize=1, maxCacheSize=2 → each group row is its own page
    const model = await makeModel({ pageSize: 1, maxCacheSize: 2 });

    await model.getViewModel(makeIR({ startRow: 0, endRow: 1 }));
    expect(model.pages).to.have.length(2);
    expect(model.pages[0].data).to.not.be.null;
    expect(model.pages[1].data).to.be.null;

    // Fetch second page — now at capacity (2 fetched)
    await model.getViewModel(makeIR({ startRow: 1, endRow: 2 }));
    expect(model.pages[0].data).to.not.be.null;
    expect(model.pages[1].data).to.not.be.null;

    // Scroll back to startRow=0 before expanding
    await model.getViewModel(makeIR({ startRow: 0, endRow: 1 }));

    // Expand Europe → fetches Germany child (3 fetched > maxCacheSize=2)
    // Viewport at startRow=0 (near Europe). NA (farthest) should be evicted.
    await model.expand(["Europe"]);
    const europeGroup = model.pages[0].expandedRows.get(0)!;
    expect(model.pages[0].data).to.not.be.null;
    expect(model.pages[1].data).to.be.null;
    expect(europeGroup.pages[0].data).to.not.be.null;
    expect(europeGroup.pages[1].data).to.be.null;
    expect(countFetchedPages(model.pages)).to.equal(2);
  });

  it("should clear tree when groupBy changes", async () => {
    const model = await makeModel();
    await model.getViewModel(makeIR());
    expect(model.pages).to.have.length(1);

    // Change groupBy to just country
    const vm = await model.getViewModel(makeIR({ groupBy: ["country"] }));

    // 4 countries: Canada, Germany, UK, USA
    expect(vm.numRows).to.equal(4);
    const slice = vm.getSlice(0, 0, 4, 4);
    expect(slice.rowFacets).to.deep.equal(["Canada", "Germany", "UK", "USA"]);
  });

  it("should show isLeaf=true at deepest facet level when no outside facet dims", async () => {
    const model = await makeModel();
    // project has only measures → no outsideFacetDims → deepest facet level is leaf
    await model.getViewModel(makeIR());
    const vm = await model.expand(["Europe"]);

    // groupBy=["region","country"], project=["revenue","cost","units_sold","returns"]
    // At depth 1, country is the deepest groupBy level. No outsideFacetDims.
    // So Germany/UK rows should have isLeaf=true.
    const slice = vm.getSlice(0, 0, 4, vm.numRows);
    const germanyIdx = slice.rowFacets.indexOf("Germany");
    expect(slice.rowMeta[germanyIdx].depth).to.equal(1);
    expect(slice.rowMeta[germanyIdx].isLeaf).to.equal(true);
  });

  it("should handle outsideFacetDim leaf rows correctly", async () => {
    const model = await makeModel();
    const ir = makeIR({
      groupBy: ["region"],
      project: ["country", "revenue", "cost"],
    });
    await model.getViewModel(ir);

    // Expand Europe — should show individual rows with country, revenue, cost
    const vm = await model.expand(["Europe"]);

    const slice = vm.getSlice(0, 0, 3, vm.numRows);

    // Europe row + 10 individual data rows + North America
    expect(slice.rowMeta[0].depth).to.equal(0);
    expect(slice.rowMeta[0].isExpanded).to.equal(true);
    expect(slice.rowMeta[0].isLeaf).to.equal(false);

    // Child rows should be depth 1, isLeaf=true, rowFacet=null
    expect(slice.rowMeta[1].depth).to.equal(1);
    expect(slice.rowMeta[1].isLeaf).to.equal(true);
    expect(slice.rowFacets[1]).to.be.null;
  });

  it("should fetch incremental child pages on expand", async () => {
    // pageSize=3 so 4 countries span 2 pages
    const model = await makeModel({ pageSize: 3 });

    const ir = makeIR({
      startRow: 0,
      endRow: 3,
      groupBy: ["country"],
      project: ["product", "revenue"],
    });
    await model.getViewModel(ir);

    // 4 countries in 2 pages (pageSize=3 → page0: [3 countries], page1: [1 country])
    expect(model.pages).to.have.length(2);
    expect(model.pages[0].data).to.not.be.null;
    // Second page unfetched since endRow=3 doesn't overlap it
    expect(model.pages[1].data).to.be.null;

    // Expand Canada → should fetch child rows
    const callsBefore = model.getDataCallCount();
    await model.expand(["Canada"]);
    expect(model.getDataCallCount()).to.be.greaterThan(callsBefore);
  });

  it("should correctly aggregate measures at each group level", async () => {
    const model = await makeModel();
    const ir = makeIR({ groupBy: ["region", "country"] });
    await model.getViewModel(ir);

    const vm = await model.expand(["Europe"]);
    const slice = vm.getSlice(0, 0, 4, 4);

    // Germany revenue: rows 16-19, 23 → 1300+750+350+280+1350 = 4030
    const germanyIdx = slice.rowFacets.indexOf("Germany");
    expect(slice.data![0][germanyIdx]).to.equal(4030);

    // UK revenue: rows 12-15, 21 → 1400+850+400+320+380 = 3350
    const ukIdx = slice.rowFacets.indexOf("UK");
    expect(slice.data![0][ukIdx]).to.equal(3350);
  });

  it("should handle filter in IR", async () => {
    const model = await makeModel();
    const ir = makeIR({
      groupBy: ["country"],
      filter: [{ type: "scalar" as const, field: "region", op: "eq" as const, value: "Europe" }],
    });
    const vm = await model.getViewModel(ir);

    // Only European countries
    expect(vm.numRows).to.equal(2);
    const slice = vm.getSlice(0, 0, 4, 2);
    expect(slice.rowFacets).to.deep.equal(["Germany", "UK"]);
  });

  it("should invalidate cache when filter changes", async () => {
    const model = await makeModel();
    const ir1 = makeIR({ groupBy: ["country"] });
    await model.getViewModel(ir1);

    const ir2 = makeIR({
      groupBy: ["country"],
      filter: [{ type: "scalar" as const, field: "region", op: "eq" as const, value: "Europe" }],
    });
    const vm = await model.getViewModel(ir2);

    expect(vm.numRows).to.equal(2);
    const slice = vm.getSlice(0, 0, 4, 2);
    expect(slice.rowFacets).to.deep.equal(["Germany", "UK"]);
  });
});

function countFetchedPages(pages: PageNode[]): number {
  let count = 0;
  for (const page of pages) {
    if (page.data !== null) count++;
    page.expandedRows.forEach((expanded) => {
      count += countFetchedPages(expanded.pages);
    });
  }
  return count;
}

function makePage(data: any[][] | null, physicalStart: number, rowCount: number, expandedRows?: Map<number, ExpandedGroup>): PageNode {
  return { data, physicalStart, rowCount, expandedRows: expandedRows ?? new Map() };
}

describe("getUnfetchedPagesByLogicalBoundary", () => {
  it("should return empty when all pages are loaded", () => {
    const pages: PageNode[] = [
      makePage([["A", "B", "C"]], 0, 3),
    ];
    const result = getUnfetchedPagesByLogicalBoundary(pages, 0, 3);
    expect(result).to.have.length(0);
  });

  it("should return empty for an empty page tree", () => {
    const result = getUnfetchedPagesByLogicalBoundary([], 0, 10);
    expect(result).to.have.length(0);
  });

  it("should return the single unfetched page overlapping the range", () => {
    const pages: PageNode[] = [
      makePage(null, 0, 5),
    ];
    const result = getUnfetchedPagesByLogicalBoundary(pages, 0, 5);
    expect(result).to.have.length(1);
    expect(result[0].page).to.equal(pages[0]);
    expect(result[0].selectPath).to.deep.equal([]);

    // Range starting mid-page still returns the whole page
    const result2 = getUnfetchedPagesByLogicalBoundary(pages, 2, 4);
    expect(result2).to.have.length(1);
    expect(result2[0].page).to.equal(pages[0]);
  });

  it("should return only unfetched pages that overlap the range", () => {
    const pages: PageNode[] = [
      makePage([["A", "B"]], 0, 2),
      makePage(null, 2, 2),
      makePage(null, 4, 2),
    ];
    const result = getUnfetchedPagesByLogicalBoundary(pages, 2, 4);
    expect(result).to.have.length(1);
    expect(result[0].page).to.equal(pages[1]);
  });

  it("should return multiple unfetched pages spanning the range", () => {
    const pages: PageNode[] = [
      makePage(null, 0, 3),
      makePage(null, 3, 3),
      makePage(null, 6, 3),
    ];
    const result = getUnfetchedPagesByLogicalBoundary(pages, 0, 9);
    expect(result).to.have.length(3);
  });

  it("should skip unfetched pages entirely before & after the range", () => {
    const pages: PageNode[] = [
      makePage(null, 0, 5),
      makePage(null, 5, 5),
    ];

    // before
    let result = getUnfetchedPagesByLogicalBoundary(pages, 5, 10);
    expect(result).to.have.length(1);
    expect(result[0].page).to.equal(pages[1]);

    // after
    result = getUnfetchedPagesByLogicalBoundary(pages, 0, 5);
    expect(result).to.have.length(1);
    expect(result[0].page).to.equal(pages[0]);

  });

  it("should account for expanded groups shifting logical rows", () => {
    const childPages: PageNode[] = [
      makePage([["2008", "2012"]], 0, 2),
    ];
    const expanded: ExpandedGroup = { expanded: true, totalRowCount: 2, pages: childPages };
    const pages: PageNode[] = [
      makePage([["USA", "Canada"]], 0, 2, new Map([[0, expanded]])),
      makePage(null, 2, 2),
    ];
    // Logical layout: USA(0), 2008(1), 2012(2), Canada(3), [page1: 4,5]
    const result = getUnfetchedPagesByLogicalBoundary(pages, 4, 6);
    expect(result).to.have.length(1);
    expect(result[0].page).to.equal(pages[1]);

    // Range 0-4 covers pages[0] (fetched) and childPages[0] (fetched) — nothing to fetch
    const result2 = getUnfetchedPagesByLogicalBoundary(pages, 0, 4);
    expect(result2).to.have.length(0);
  });

  it("should fetch unfetched child pages within the logical range", () => {
    const childPages: PageNode[] = [
      makePage(null, 0, 3),
    ];
    const expanded: ExpandedGroup = { expanded: true, totalRowCount: 3, pages: childPages };
    const pages: PageNode[] = [
      makePage([["USA", "Canada"]], 0, 2, new Map([[0, expanded]])),
    ];
    // Logical layout: USA(0), [child unfetched: 1,2,3], Canada(4)
    const result = getUnfetchedPagesByLogicalBoundary(pages, 1, 4);
    expect(result).to.have.length(1);
    expect(result[0].page).to.equal(childPages[0]);
    expect(result[0].selectPath).to.deep.equal(["USA"]);
  });

  it("should not fetch collapsed children", () => {
    const childPages: PageNode[] = [
      makePage(null, 0, 3),
    ];
    const collapsed: ExpandedGroup = { expanded: false, totalRowCount: 3, pages: childPages };
    const pages: PageNode[] = [
      makePage([["USA", "Canada"]], 0, 2, new Map([[0, collapsed]])),
    ];
    // Logical layout: USA(0), Canada(1) — collapsed children don't count
    const result = getUnfetchedPagesByLogicalBoundary(pages, 0, 2);
    expect(result).to.have.length(0);
  });

  it("should stop early when logicalEnd is reached inside a fetched page", () => {
    const pages: PageNode[] = [
      makePage([["A", "B", "C", "D", "E"]], 0, 5),
      makePage(null, 5, 5),
    ];
    const result = getUnfetchedPagesByLogicalBoundary(pages, 0, 3);
    expect(result).to.have.length(0);
  });

  it("should handle deeply nested expansions", () => {
    const leafPages: PageNode[] = [
      makePage(null, 0, 2),
    ];
    const innerExpanded: ExpandedGroup = { expanded: true, totalRowCount: 2, pages: leafPages };
    const midPages: PageNode[] = [
      makePage([["2008"]], 0, 1, new Map([[0, innerExpanded]])),
    ];
    const outerExpanded: ExpandedGroup = { expanded: true, totalRowCount: 1, pages: midPages };
    const pages: PageNode[] = [
      makePage([["USA"]], 0, 1, new Map([[0, outerExpanded]])),
    ];
    // Logical layout: USA(0), 2008(1), [leaf unfetched: 2,3]
    const result = getUnfetchedPagesByLogicalBoundary(pages, 2, 4);
    expect(result).to.have.length(1);
    expect(result[0].page).to.equal(leafPages[0]);
    expect(result[0].selectPath).to.deep.equal(["USA", "2008"]);
  });

  it("should fetch pages at multiple depths in a single call", () => {
    const childPages: PageNode[] = [
      makePage(null, 0, 2),
    ];
    const expanded: ExpandedGroup = { expanded: true, totalRowCount: 2, pages: childPages };
    const pages: PageNode[] = [
      makePage([["USA"]], 0, 1, new Map([[0, expanded]])),
      makePage(null, 1, 1),
    ];
    // Logical layout: USA(0), [child unfetched: 1,2], [page1 unfetched: 3]
    const result = getUnfetchedPagesByLogicalBoundary(pages, 0, 4);
    expect(result).to.have.length(2);
    expect(result[0].page).to.equal(childPages[0]);
    expect(result[0].selectPath).to.deep.equal(["USA"]);
    expect(result[1].page).to.equal(pages[1]);
    expect(result[1].selectPath).to.deep.equal([]);
  });

  it("should handle multiple expanded rows in the same page", () => {
    const usaChildren: PageNode[] = [
      makePage([["2008", "2012"]], 0, 2),
    ];
    const canadaChildren: PageNode[] = [
      makePage(null, 0, 3),
    ];
    const usaExpanded: ExpandedGroup = { expanded: true, totalRowCount: 2, pages: usaChildren };
    const canadaExpanded: ExpandedGroup = { expanded: true, totalRowCount: 3, pages: canadaChildren };
    const pages: PageNode[] = [
      makePage([["USA", "Canada"]], 0, 2, new Map([[0, usaExpanded], [1, canadaExpanded]])),
    ];
    // Logical: USA(0), 2008(1), 2012(2), Canada(3), [canada children unfetched: 4,5,6]
    const result = getUnfetchedPagesByLogicalBoundary(pages, 4, 7);
    expect(result).to.have.length(1);
    expect(result[0].page).to.equal(canadaChildren[0]);
    expect(result[0].selectPath).to.deep.equal(["Canada"]);
  });

  it("should handle partially fetched child pages", () => {
    const childPages: PageNode[] = [
      makePage([["2008", "2012"]], 0, 2),
      makePage(null, 2, 2),
      makePage(null, 4, 1),
    ];
    const expanded: ExpandedGroup = { expanded: true, totalRowCount: 5, pages: childPages };
    const pages: PageNode[] = [
      makePage([["USA"]], 0, 1, new Map([[0, expanded]])),
    ];
    // Logical: USA(0), 2008(1), 2012(2), [child p1 unfetched: 3,4], [child p2 unfetched: 5]
    const result = getUnfetchedPagesByLogicalBoundary(pages, 3, 6);
    expect(result).to.have.length(2);
    expect(result[0].page).to.equal(childPages[1]);
    expect(result[0].selectPath).to.deep.equal(["USA"]);
    expect(result[1].page).to.equal(childPages[2]);
    expect(result[1].selectPath).to.deep.equal(["USA"]);
  });

  it("should not recurse into unfetched intermediate pages", () => {
    const childPages: PageNode[] = [
      makePage(null, 0, 3),
    ];
    const expanded: ExpandedGroup = { expanded: true, totalRowCount: 3, pages: childPages };
    const pages: PageNode[] = [
      makePage(null, 0, 2, new Map([[0, expanded]])),
    ];
    // Unfetched page — counts as 2 logical rows. No recursion into children.
    const result = getUnfetchedPagesByLogicalBoundary(pages, 0, 5);
    expect(result).to.have.length(1);
    expect(result[0].page).to.equal(pages[0]);
    expect(result[0].selectPath).to.deep.equal([]);
  });

  it("should handle multiple expansions across separate top-level pages", () => {
    const usaChildren: PageNode[] = [
      makePage(null, 0, 2),
    ];
    const ukChildren: PageNode[] = [
      makePage(null, 0, 3),
    ];
    const usaExpanded: ExpandedGroup = { expanded: true, totalRowCount: 2, pages: usaChildren };
    const ukExpanded: ExpandedGroup = { expanded: true, totalRowCount: 3, pages: ukChildren };
    const pages: PageNode[] = [
      makePage([["USA", "Canada"]], 0, 2, new Map([[0, usaExpanded]])),
      makePage([["UK"]], 2, 1, new Map([[0, ukExpanded]])),
    ];
    // Logical: USA(0), [usa children: 1,2], Canada(3), UK(4), [uk children: 5,6,7]
    const result = getUnfetchedPagesByLogicalBoundary(pages, 0, 8);
    expect(result).to.have.length(2);
    expect(result[0].page).to.equal(usaChildren[0]);
    expect(result[0].selectPath).to.deep.equal(["USA"]);
    expect(result[1].page).to.equal(ukChildren[0]);
    expect(result[1].selectPath).to.deep.equal(["UK"]);
  });

  it("should handle range targeting only the second expanded group across pages", () => {
    const usaChildren: PageNode[] = [
      makePage([["2008", "2012"]], 0, 2),
    ];
    const ukChildren: PageNode[] = [
      makePage(null, 0, 3),
    ];
    const usaExpanded: ExpandedGroup = { expanded: true, totalRowCount: 2, pages: usaChildren };
    const ukExpanded: ExpandedGroup = { expanded: true, totalRowCount: 3, pages: ukChildren };
    const pages: PageNode[] = [
      makePage([["USA", "Canada"]], 0, 2, new Map([[0, usaExpanded]])),
      makePage([["UK"]], 2, 1, new Map([[0, ukExpanded]])),
    ];
    // Logical: USA(0), 2008(1), 2012(2), Canada(3), UK(4), [uk children: 5,6,7]
    const result = getUnfetchedPagesByLogicalBoundary(pages, 5, 8);
    expect(result).to.have.length(1);
    expect(result[0].page).to.equal(ukChildren[0]);
    expect(result[0].selectPath).to.deep.equal(["UK"]);
  });

  it("should handle three-level nesting with mixed fetch states", () => {
    const leafPages: PageNode[] = [
      makePage([["Phelps", "Bolt"]], 0, 2),
    ];
    const innerExpanded: ExpandedGroup = { expanded: true, totalRowCount: 2, pages: leafPages };
    const midPages: PageNode[] = [
      makePage([["2008", "2012"]], 0, 2, new Map([[0, innerExpanded]])),
      makePage(null, 2, 1),
    ];
    const outerExpanded: ExpandedGroup = { expanded: true, totalRowCount: 3, pages: midPages };
    const pages: PageNode[] = [
      makePage([["USA", "Canada"]], 0, 2, new Map([[0, outerExpanded]])),
    ];
    // Logical: USA(0), 2008(1), Phelps(2), Bolt(3), 2012(4), [mid p1 unfetched: 5], Canada(6)
    const result = getUnfetchedPagesByLogicalBoundary(pages, 5, 7);
    expect(result).to.have.length(1);
    expect(result[0].page).to.equal(midPages[1]);
    expect(result[0].selectPath).to.deep.equal(["USA"]);
  });
});
