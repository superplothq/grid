import { expect } from "chai";
import { getUnfetchedPagesByLogicalBoundary, findTargetSlotPath, findContiguousPageBlocks } from "./standard-table-datamodel";
import { DuckDBDataSource } from "./duckdb-datasource";
import { SqlStandardTableDataModel } from "./sql-standard-table-datamodel";
import { DataSchema, DatePartScalarFilter, StandardTableConfig, StandardDataFetchAndTransformIR, GetRowsResponse, GridData, PageNode, ExpandedGroup } from "./types";
import { FlattenedDataViewModel } from "../renderer/flattened-data-viewmodel";

// 24 rows, 8 dimensions + 4 measures — same dataset as datamodel.data.test.ts
const schemaColumns: (string | DataSchema)[] = [
  "region", "country", "city", "department", "product", "channel", "quarter", "segment",
  { name: "revenue", displayName: "Revenue", type: "measure", aggregateFn: "sum" },
  { name: "cost", displayName: "Cost", type: "measure", aggregateFn: "sum" },
  { name: "units_sold", displayName: "Units Sold", type: "measure", aggregateFn: "sum" },
  { name: "returns", displayName: "Returns", type: "measure", aggregateFn: "sum" },
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

const flatSchema: DataSchema[] = [
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

function makeConfig(overrides: Partial<StandardTableConfig> = {}): StandardTableConfig {
  return {
    pageSize: 100,
    maxNumPageBeforeEviction: 20,
    ...overrides,
  };
}

function makeIR(overrides: Partial<StandardDataFetchAndTransformIR> = {}): StandardDataFetchAndTransformIR {
  return {
    startRow: 0,
    endRow: 100,
    groupPath: [],
    groupBy: ["region", "country"],
    project: ["revenue", "cost", "units_sold", "returns"],
    sort: [],
    filter: [],
    ...overrides,
  };
}

function withViewModelHelpers<T extends SqlStandardTableDataModel>(model: T) {
  return Object.assign(model, {
    async getViewModel(ir: StandardDataFetchAndTransformIR) {
      const args = await model.getViewModelData(ir);
      return new FlattenedDataViewModel(args);
    },
    async expandAndGetViewModel(select: string[]) {
      const args = await model.expand(select);
      return new FlattenedDataViewModel(args);
    },
    async collapseAndGetViewModel(select: string[]) {
      const args = await model.collapse(select);
      return new FlattenedDataViewModel(args);
    },
  });
}

async function makeModel(configOverrides: Partial<StandardTableConfig> = {}) {
  const dataSchema: DataSchema[] = gridData.columns.map((col) => {
    if (typeof col === "string") {
      return { name: col, displayName: col, type: "dimension" as const };
    }
    return col;
  });
  const ds = DuckDBDataSource.create();
  await ds.loadData({ table: "data", schema: dataSchema, data: gridData.data });
  const model = new SqlStandardTableDataModel(dataSchema, ds, makeConfig(configOverrides));
  let getDataCallCount = 0;
  const origGetData = model.getData.bind(model);
  model.getData = async (ir: StandardDataFetchAndTransformIR): Promise<GetRowsResponse> => {
    getDataCallCount++;
    return origGetData(ir);
  };
  return Object.assign(withViewModelHelpers(model), {
    getDataCallCount: () => getDataCallCount,
  });
}

describe("StandardTableDataModel (real DuckDB)", () => {
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

    const vm = await model.expandAndGetViewModel(["Europe"]);

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

    const collapsed = await model.collapseAndGetViewModel(["Europe"]);

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
    const reExpanded = await model.expandAndGetViewModel(["Europe"]);

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

    await model.expandAndGetViewModel(["Europe"]);
    const vm = await model.expandAndGetViewModel(["Europe", "Germany"]);

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

    await model.expandAndGetViewModel(["Europe"]);
    // 2 top-level + 2 children of Europe = 4
    expect(model.computeTotalLogicalRows()).to.equal(4);

    await model.expandAndGetViewModel(["North America"]);
    // 2 top-level + 2 Europe children + 2 NA children (Canada, USA) = 6
    expect(model.computeTotalLogicalRows()).to.equal(6);

    await model.collapseAndGetViewModel(["Europe"]);
    // 2 top-level + 2 NA children = 4
    expect(model.computeTotalLogicalRows()).to.equal(4);
  });

  it("should collapse all after scrolling into expanded children", async () => {
    const model = await makeModel();

    await model.getViewModel(makeIR({ startRow: 0, endRow: 100 }));
    await model.expand(["Europe"]);
    await model.expand(["North America"]);
    // total = 2 + 2 + 2 = 6
    expect(model.computeTotalLogicalRows()).to.equal(6);

    // Simulate scrolling into the middle
    await model.getViewModel(makeIR({ startRow: 4, endRow: 100 }));

    // Collapse all — each collapse shrinks total, startRow stays stale
    await model.collapse(["Europe"]);
    const vm = await model.collapse(["North America"]);
    expect(model.computeTotalLogicalRows()).to.equal(2);
    expect(vm.data[0]?.length).to.equal(2);
  });

  it("should collapse when startRow is inside the expanded group", async () => {
    const model = await makeModel();

    // startRow=0, expand Europe → total 4 rows (Europe, Germany, UK, North America)
    await model.getViewModel(makeIR({ startRow: 0, endRow: 100 }));
    await model.expandAndGetViewModel(["Europe"]);
    expect(model.computeTotalLogicalRows()).to.equal(4);

    // Simulate scrolling into the expanded children
    await model.getViewModel(makeIR({ startRow: 3, endRow: 100 }));

    // Collapse Europe — total drops to 2, but lastIR.startRow is still 3
    const vm = await model.collapseAndGetViewModel(["Europe"]);
    expect(model.computeTotalLogicalRows()).to.equal(2);
    expect(vm.numRows).to.equal(2);
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
      const vm3 = await model.expandAndGetViewModel(["Europe"]);

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
    // pageSize=1, maxNumPageBeforeEviction=2 → each group row is its own page
    const model = await makeModel({ pageSize: 1, maxNumPageBeforeEviction: 2 });

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

    // Expand Europe → fetches Germany child (3 fetched > maxNumPageBeforeEviction=2)
    // Viewport at startRow=0 (near Europe). NA (farthest) should be evicted.
    await model.expandAndGetViewModel(["Europe"]);
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
    const vm = await model.expandAndGetViewModel(["Europe"]);

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
    const vm = await model.expandAndGetViewModel(["Europe"]);

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
    await model.expandAndGetViewModel(["Canada"]);
    expect(model.getDataCallCount()).to.be.greaterThan(callsBefore);
  });

  it("should correctly aggregate measures at each group level", async () => {
    const model = await makeModel();
    const ir = makeIR({ groupBy: ["region", "country"] });
    await model.getViewModel(ir);

    const vm = await model.expandAndGetViewModel(["Europe"]);
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

  it("should return no rows when filter uses in with empty array", async () => {
    const model = await makeModel();
    const ir = makeIR({
      groupBy: ["country"],
      filter: [{ type: "scalar" as const, field: "region", op: "in" as const, value: [] }],
    });
    const vm = await model.getViewModel(ir);
    expect(vm.numRows).to.equal(0);
  });

  it("should return all rows when filter uses not_in with empty array", async () => {
    const model = await makeModel();
    const ir = makeIR({
      groupBy: ["country"],
      filter: [{ type: "scalar" as const, field: "region", op: "not_in" as const, value: [] }],
    });
    const vm = await model.getViewModel(ir);
    expect(vm.numRows).to.equal(4);
  });

  it("should expand after sorting by a non-group column", async () => {
    const model = await makeModel();
    const ir = makeIR({
      groupBy: ["region", "country"],
      sort: [
        { field: "region", direction: "asc" as const },
        { field: "revenue", direction: "desc" as const },
      ],
    });
    await model.getViewModel(ir);

    const vm = await model.expandAndGetViewModel(["Europe"]);
    const slice = vm.getSlice(0, 0, 4, vm.numRows);

    expect(slice.rowFacets[0]).to.equal("Europe");
    expect(slice.rowMeta[0].isExpanded).to.equal(true);
    expect(slice.rowFacets).to.include("Germany");
    expect(slice.rowFacets).to.include("UK");
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

  it("should flatten past a gap at the beginning of child pages", async () => {
    // pageSize=1 so each country is its own child page slot
    // groupBy country → 4 countries (Canada,Germany,UK,USA) each in their own page
    const model = await makeModel({ pageSize: 1 });

    // Load first page only (Canada)
    await model.getViewModel(makeIR({ startRow: 0, endRow: 1, groupBy: ["country"] }));
    expect(model.pages).to.have.length(4);
    expect(model.pages[0].data).to.not.be.null; // Canada
    expect(model.pages[1].data).to.be.null;      // Germany
    expect(model.pages[2].data).to.be.null;      // UK
    expect(model.pages[3].data).to.be.null;      // USA

    // Now request rows 2-4 (UK, USA) — skipping Germany (slot 1)
    const vm = await model.getViewModel(makeIR({ startRow: 2, endRow: 4, groupBy: ["country"] }));

    // Slots: Canada(loaded), Germany(NOT loaded), UK(loaded), USA(loaded)
    expect(model.pages[0].data).to.not.be.null;
    expect(model.pages[1].data).to.be.null;
    expect(model.pages[2].data).to.not.be.null;
    expect(model.pages[3].data).to.not.be.null;

    // flatten should skip the gap and produce UK,USA with offsetTop=2
    expect(vm.offsetTop).to.equal(2);
    expect(vm.numRows).to.equal(2);
    const slice2 = vm.getSlice(0, 0, 4, 2);
    expect(slice2.rowFacets).to.deep.equal(["UK", "USA"]);
  });

  it("should flatten past a gap in the middle of child pages", async () => {
    // pageSize=1, groupBy region,country
    // 2 regions → expand Europe → child pages: Germany(page0), UK(page1)
    const model = await makeModel({ pageSize: 1 });

    // Load both region pages
    const ir = makeIR({ startRow: 0, endRow: 2 });
    await model.getViewModel(ir);
    expect(model.pages[0].data).to.not.be.null; // Europe
    expect(model.pages[1].data).to.not.be.null; // North America

    // Expand Europe → Germany child page loaded, UK child page not loaded
    await model.expand(["Europe"]);
    const europeGroup = model.pages[0].expandedRows.get(0)!;
    expect(europeGroup.pages[0].data).to.not.be.null; // Germany
    expect(europeGroup.pages[1].data).to.be.null;      // UK

    // Now evict the Germany child page to create a gap at the beginning
    europeGroup.pages[0].data = null;

    // Load UK child page
    const vmData = await model.getViewModelData(makeIR({ startRow: 2, endRow: 3 }));
    expect(europeGroup.pages[0].data).to.be.null;      // Germany — gap
    expect(europeGroup.pages[1].data).to.not.be.null;   // UK — loaded

    // flatten should skip the Germany gap and produce:
    // Europe (parent kept for hierarchy), then skip Germany gap (offsetTop += 1), then UK, then North America
    // Europe is at logical row 0, Germany would be row 1 (gap), UK at row 2, NA at row 3
    // offsetTop = 1 (Germany gap), data = [Europe, UK, NA]
    expect(vmData.offsetTop).to.equal(1);
    expect(vmData.data[0]?.length).to.equal(3);

    const vm = new FlattenedDataViewModel(vmData);
    const slice = vm.getSlice(0, 0, 4, 3);
    expect(slice.rowFacets).to.deep.equal(["Europe", "UK", "North America"]);
  });
});

describe("DatePartScalarFilter (real DuckDB)", () => {
  const tsSchema: DataSchema[] = [
    { name: "created_at", type: "dimension", subtype: "temporal", datetimeFormat: "%Y-%m-%d %H:%M:%S" },
    { name: "category", type: "dimension" },
    { name: "amount", displayName: "Amount", type: "measure", aggregateFn: "sum" },
  ];

  const tsGridData: GridData = {
    columns: [
      { name: "created_at", type: "dimension", subtype: "temporal", datetimeFormat: "%Y-%m-%d %H:%M:%S" },
      "category",
      { name: "amount", displayName: "Amount", type: "measure", aggregateFn: "sum" },
    ],
    data: [
      // created_at — 6 rows spanning 2023 and 2024
      ["2023-01-15 10:30:00", "2023-06-20 14:00:00", "2023-12-01 08:00:00", "2024-03-10 09:15:00", "2024-07-22 16:45:00", "2024-11-05 12:00:00"],
      // category
      ["A", "B", "A", "B", "A", "B"],
      // amount
      [100, 200, 150, 300, 250, 400],
    ],
  };

  async function makeTsModel() {
    const ds = DuckDBDataSource.create();
    await ds.loadData({ table: "ts_data", schema: tsSchema, data: tsGridData.data });
    return withViewModelHelpers(new SqlStandardTableDataModel(
      tsSchema,
      ds,
      { pageSize: 100, maxNumPageBeforeEviction: 20 },
    ));
  }

  function makeTsIR(overrides: Partial<StandardDataFetchAndTransformIR> = {}): StandardDataFetchAndTransformIR {
    return {
      startRow: 0,
      endRow: 100,
      groupPath: [],
      groupBy: [],
      project: ["created_at", "category", "amount"],
      sort: [],
      filter: [],
      ...overrides,
    };
  }

  function datePart(part: DatePartScalarFilter["part"], op: DatePartScalarFilter["op"], value: DatePartScalarFilter["value"]): DatePartScalarFilter {
    return { type: "scalar", field: "created_at", subtype: "date", part, op, value };
  }

  it("should filter by year eq", async () => {
    const model = await makeTsModel();
    const vm = await model.getViewModel(makeTsIR({
      filter: [datePart("year", "eq", 2024)],
    }));
    expect(vm.numRows).to.equal(3);
  });

  it("should filter by year gt", async () => {
    const model = await makeTsModel();
    const vm = await model.getViewModel(makeTsIR({
      filter: [datePart("year", "gt", 2023)],
    }));
    expect(vm.numRows).to.equal(3);
  });

  it("should filter by year lt", async () => {
    const model = await makeTsModel();
    const vm = await model.getViewModel(makeTsIR({
      filter: [datePart("year", "lt", 2024)],
    }));
    expect(vm.numRows).to.equal(3);
  });

  it("should filter by month gte", async () => {
    const model = await makeTsModel();
    const vm = await model.getViewModel(makeTsIR({
      filter: [datePart("month", "gte", 7)],
    }));
    // Jun=no, Jul=yes, Dec=yes, Nov=yes → 3 rows
    expect(vm.numRows).to.equal(3);
  });

  it("should filter by month between", async () => {
    const model = await makeTsModel();
    const vm = await model.getViewModel(makeTsIR({
      filter: [datePart("month", "between", [3, 7])],
    }));
    // Jun(6), Mar(3), Jul(7) → 3 rows
    expect(vm.numRows).to.equal(3);
  });

  it("should filter by year in", async () => {
    const model = await makeTsModel();
    const vm = await model.getViewModel(makeTsIR({
      filter: [datePart("year", "in", [2023])],
    }));
    expect(vm.numRows).to.equal(3);
  });

  it("should filter by year not_in", async () => {
    const model = await makeTsModel();
    const vm = await model.getViewModel(makeTsIR({
      filter: [datePart("year", "not_in", [2023])],
    }));
    expect(vm.numRows).to.equal(3);
  });

  it("should filter by year neq", async () => {
    const model = await makeTsModel();
    const vm = await model.getViewModel(makeTsIR({
      filter: [datePart("year", "neq", 2023)],
    }));
    expect(vm.numRows).to.equal(3);
  });

  it("should combine date part filter with scalar filter", async () => {
    const model = await makeTsModel();
    const vm = await model.getViewModel(makeTsIR({
      filter: [
        datePart("year", "eq", 2024),
        { type: "scalar", field: "category", op: "eq", value: "A" },
      ],
    }));
    // 2024 rows: Mar(B), Jul(A), Nov(B) → only Jul(A) matches both
    expect(vm.numRows).to.equal(1);
  });

  it("should filter by day lte", async () => {
    const model = await makeTsModel();
    const vm = await model.getViewModel(makeTsIR({
      filter: [datePart("day", "lte", 5)],
    }));
    // day=15,20,1,10,22,5 → 1 and 5 match
    expect(vm.numRows).to.equal(2);
  });

  it("should filter by before op", async () => {
    const model = await makeTsModel();
    const vm = await model.getViewModel(makeTsIR({
      filter: [{ type: "scalar" as const, field: "created_at", op: "before" as const, value: "2024-01-01 00:00:00" }],
    }));
    // 3 rows in 2023
    expect(vm.numRows).to.equal(3);
  });

  it("should filter by after op", async () => {
    const model = await makeTsModel();
    const vm = await model.getViewModel(makeTsIR({
      filter: [{ type: "scalar" as const, field: "created_at", op: "after" as const, value: "2024-01-01 00:00:00" }],
    }));
    // 3 rows in 2024
    expect(vm.numRows).to.equal(3);
  });

  it("should filter by between op with timestamp values", async () => {
    const model = await makeTsModel();
    const vm = await model.getViewModel(makeTsIR({
      filter: [{ type: "scalar" as const, field: "created_at", op: "between" as const, value: ["2023-06-01 00:00:00", "2024-03-31 23:59:59"] }],
    }));
    // Jun 2023, Dec 2023, Mar 2024 → 3 rows
    expect(vm.numRows).to.equal(3);
  });
});

describe("getRangeOfColumn (real DuckDB)", () => {
  it("should return categorical values for dimension fields", async () => {
    const model = await makeModel();
    const result = await model.getRangeOfColumn("region");
    expect(result.type).to.equal("categorical");
    if (result.type === "categorical") {
      expect(result.values).to.include("Europe");
      expect(result.values).to.include("North America");
      expect(result.values).to.have.length(2);
    }
  });

  it("should return range for measure fields", async () => {
    const model = await makeModel();
    const result = await model.getRangeOfColumn("revenue");
    expect(result.type).to.equal("range");
    if (result.type === "range") {
      expect(result.min).to.equal(200);
      expect(result.max).to.equal(1500);
    }
  });

  it("should return temporal range for date fields", async () => {
    const tsSchema: DataSchema[] = [
      { name: "created_at", type: "dimension", subtype: "temporal", datetimeFormat: "%Y-%m-%d %H:%M:%S" },
      { name: "amount", displayName: "Amount", type: "measure", aggregateFn: "sum" },
    ];
    const tsGridData: GridData = {
      columns: [
        { name: "created_at", type: "dimension", subtype: "temporal", datetimeFormat: "%Y-%m-%d %H:%M:%S" },
        { name: "amount", displayName: "Amount", type: "measure", aggregateFn: "sum" },
      ],
      data: [
        ["2023-01-15 10:30:00", "2024-11-05 12:00:00"],
        [100, 400],
      ],
    };
    const ds = DuckDBDataSource.create();
    await ds.loadData({ table: "domain_ts", schema: tsSchema, data: tsGridData.data });
    const model = new SqlStandardTableDataModel(tsSchema, ds, { pageSize: 100, maxNumPageBeforeEviction: 20 });
    const result = await model.getRangeOfColumn("created_at");
    expect(result.type).to.equal("temporal");
    if (result.type === "temporal") {
      expect(result.min).to.be.a("string");
      expect(result.max).to.be.a("string");
      expect(result.min).to.include("2023");
      expect(result.max).to.include("2024");
    }
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

describe("#getUnfetchedPagesByLogicalBoundary", () => {
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

describe("#findTargetSlotPath", () => {
  it("should return empty path for empty pages array", () => {
    const result = findTargetSlotPath([], 0);
    expect(result).to.deep.equal([]);
  });

  it("should return empty path when all pages are unloaded", () => {
    const pages: PageNode[] = [
      makePage(null, 0, 10),
      makePage(null, 10, 10),
    ];
    const result = findTargetSlotPath(pages, 5);
    expect(result).to.deep.equal([]);
  });

  it("should target first page when logicalStart is 0", () => {
    const pages: PageNode[] = [
      makePage([["a", "b", "c", "d", "e"]], 0, 5),
    ];
    const result = findTargetSlotPath(pages, 0);
    expect(result).to.deep.equal([{ pageIdx: 0, rowIdx: -1 }]);
  });

  it("should target second page when logicalStart falls in it", () => {
    const pages: PageNode[] = [
      makePage([["a", "b", "c", "d", "e"]], 0, 5),
      makePage([["f", "g", "h", "i", "j"]], 5, 5),
    ];
    const result = findTargetSlotPath(pages, 7);
    expect(result).to.deep.equal([{ pageIdx: 1, rowIdx: -1 }]);
  });

  it("should skip unloaded pages and count their rows", () => {
    const pages: PageNode[] = [
      makePage(null, 0, 10),
      makePage([["a", "b", "c", "d", "e"]], 10, 5),
    ];
    const result = findTargetSlotPath(pages, 12);
    expect(result).to.deep.equal([{ pageIdx: 1, rowIdx: -1 }]);
  });

  it("should recurse into expanded child when logicalStart is inside it", () => {
    const childPages: PageNode[] = [
      makePage([["x", "y", "z"]], 0, 3),
    ];
    const expanded: ExpandedGroup = {
      expanded: true,
      totalRowCount: 3,
      pages: childPages,
    };
    const pages: PageNode[] = [
      makePage([["a", "b", "c", "d", "e"]], 0, 5, new Map([[1, expanded]])),
    ];
    // row0("a")=0, row1("b")=1, children=2,3,4, row2("c")=5, ...
    const result = findTargetSlotPath(pages, 3);
    expect(result).to.deep.equal([
      { pageIdx: 0, rowIdx: 1 },
      { pageIdx: 0, rowIdx: -1 },
    ]);
  });

  it("should not recurse into collapsed expanded groups", () => {
    const collapsed: ExpandedGroup = {
      expanded: false,
      totalRowCount: 3,
      pages: [makePage([["x", "y", "z"]], 0, 3)],
    };
    const pages: PageNode[] = [
      makePage([["a", "b", "c", "d", "e"]], 0, 5, new Map([[1, collapsed]])),
    ];
    const result = findTargetSlotPath(pages, 3);
    expect(result).to.deep.equal([{ pageIdx: 0, rowIdx: -1 }]);
  });

  it("should handle logicalStart at last row of a page", () => {
    const pages: PageNode[] = [
      makePage([["a", "b", "c", "d", "e"]], 0, 5),
    ];
    const result = findTargetSlotPath(pages, 4);
    expect(result).to.deep.equal([{ pageIdx: 0, rowIdx: -1 }]);
  });

  it("should return empty path when logicalStart is beyond all pages", () => {
    const pages: PageNode[] = [
      makePage([["a", "b", "c", "d", "e"]], 0, 5),
    ];
    const result = findTargetSlotPath(pages, 10);
    expect(result).to.deep.equal([]);
  });

  it("should handle multiple expanded rows in same page", () => {
    const child0: ExpandedGroup = {
      expanded: true,
      totalRowCount: 2,
      pages: [makePage([["c0a", "c0b"]], 0, 2)],
    };
    const child2: ExpandedGroup = {
      expanded: true,
      totalRowCount: 3,
      pages: [makePage([["c2a", "c2b", "c2c"]], 0, 3)],
    };
    const pages: PageNode[] = [
      makePage([["a", "b", "c", "d"]], 0, 4, new Map([[0, child0], [2, child2]])),
    ];
    // Layout: row0("a")=0, child0=1,2, row1("b")=3, row2("c")=4, child2=5,6,7, row3("d")=8
    const result = findTargetSlotPath(pages, 6);
    expect(result).to.deep.equal([
      { pageIdx: 0, rowIdx: 2 },
      { pageIdx: 0, rowIdx: -1 },
    ]);
  });

  it("should handle deeply nested expansions", () => {
    const grandchild: PageNode[] = [
      makePage([["g1", "g2"]], 0, 2),
    ];
    const childExpanded: ExpandedGroup = {
      expanded: true,
      totalRowCount: 2,
      pages: grandchild,
    };
    const childPages: PageNode[] = [
      makePage([["c1", "c2", "c3"]], 0, 3, new Map([[0, childExpanded]])),
    ];
    const topExpanded: ExpandedGroup = {
      expanded: true,
      totalRowCount: 3,
      pages: childPages,
    };
    const pages: PageNode[] = [
      makePage([["a", "b"]], 0, 2, new Map([[0, topExpanded]])),
    ];
    // Layout: a=0, child c1=1, grandchild g1=2, g2=3, c2=4, c3=5, b=6
    const result = findTargetSlotPath(pages, 2);
    expect(result).to.deep.equal([
      { pageIdx: 0, rowIdx: 0 },
      { pageIdx: 0, rowIdx: 0 },
      { pageIdx: 0, rowIdx: -1 },
    ]);
  });

  it("should target row after expanded group correctly", () => {
    const child: ExpandedGroup = {
      expanded: true,
      totalRowCount: 3,
      pages: [makePage([["x", "y", "z"]], 0, 3)],
    };
    const pages: PageNode[] = [
      makePage([["a", "b", "c", "d"]], 0, 4, new Map([[0, child]])),
    ];
    // Layout: row0("a")=0, children=1,2,3, row1("b")=4, row2("c")=5, row3("d")=6
    const result = findTargetSlotPath(pages, 5);
    expect(result).to.deep.equal([{ pageIdx: 0, rowIdx: -1 }]);
  });

  it("should handle multiple pages with expansion in second page", () => {
    const child: ExpandedGroup = {
      expanded: true,
      totalRowCount: 2,
      pages: [makePage([["x", "y"]], 0, 2)],
    };
    const pages: PageNode[] = [
      makePage([["a", "b", "c"]], 0, 3),
      makePage([["d", "e", "f"]], 3, 3, new Map([[1, child]])),
    ];
    // Layout: page0: a=0,b=1,c=2, page1: d=3, e=4, children=5,6, f=7
    const result = findTargetSlotPath(pages, 5);
    expect(result).to.deep.equal([
      { pageIdx: 1, rowIdx: 1 },
      { pageIdx: 0, rowIdx: -1 },
    ]);
  });

  it("should handle expansion at last row of page", () => {
    const child: ExpandedGroup = {
      expanded: true,
      totalRowCount: 4,
      pages: [makePage([["w", "x", "y", "z"]], 0, 4)],
    };
    const pages: PageNode[] = [
      makePage([["a", "b", "c"]], 0, 3, new Map([[2, child]])),
    ];
    // Layout: a=0, b=1, c=2, children=3,4,5,6
    const result = findTargetSlotPath(pages, 4);
    expect(result).to.deep.equal([
      { pageIdx: 0, rowIdx: 2 },
      { pageIdx: 0, rowIdx: -1 },
    ]);
  });

  it("should handle unloaded child pages within expansion", () => {
    const child: ExpandedGroup = {
      expanded: true,
      totalRowCount: 5,
      pages: [makePage(null, 0, 5)],
    };
    const pages: PageNode[] = [
      makePage([["a", "b", "c"]], 0, 3, new Map([[0, child]])),
    ];
    // Layout: a=0, children(5 unloaded)=1..5, b=6, c=7
    const result = findTargetSlotPath(pages, 3);
    expect(result).to.deep.equal([
      { pageIdx: 0, rowIdx: 0 },
    ]);
  });

  it("should handle logicalStart at exact boundary between page and expanded child", () => {
    const child: ExpandedGroup = {
      expanded: true,
      totalRowCount: 3,
      pages: [makePage([["x", "y", "z"]], 0, 3)],
    };
    const pages: PageNode[] = [
      makePage([["a", "b", "c"]], 0, 3, new Map([[1, child]])),
    ];
    // Layout: a=0, b=1, children=2,3,4, c=5
    const result = findTargetSlotPath(pages, 2);
    expect(result).to.deep.equal([
      { pageIdx: 0, rowIdx: 1 },
      { pageIdx: 0, rowIdx: -1 },
    ]);
  });

  it("should point to first child page when logicalStart lands on an expanded row", () => {
    // p0(row0, expanded) → children [c0, c1, c2]
    // p1(row1, expanded) → children [d0, d1]
    // Layout: p0=0, c0=1, c1=2, c2=3, p1=4, d0=5, d1=6
    const p0children: ExpandedGroup = { expanded: true, totalRowCount: 3, pages: [makePage([["c0", "c1", "c2"]], 0, 3)] };
    const p1children: ExpandedGroup = { expanded: true, totalRowCount: 2, pages: [makePage([["d0", "d1"]], 0, 2)] };
    const pages: PageNode[] = [
      makePage([["p0", "p1"]], 0, 2, new Map([[0, p0children], [1, p1children]])),
    ];
    // logicalStart=4 is p1 itself — should point to p1's first child page
    const result = findTargetSlotPath(pages, 4);
    expect(result).to.deep.equal([
      { pageIdx: 0, rowIdx: 1 },
      { pageIdx: 0, rowIdx: -1 },
    ]);
  });

  it("should point to first child page with 3-level nesting", () => {
    // depth 0: [r0(expanded), r1(expanded)]
    // depth 1 under r0: [r0.0(expanded)] → depth 2: [r0.0.0, r0.0.1]
    // depth 1 under r1: [r1.0(expanded)] → depth 2: [r1.0.0, r1.0.1, r1.0.2]
    //
    // Layout: r0=0, r0.0=1, r0.0.0=2, r0.0.1=3, r1=4, r1.0=5, r1.0.0=6, r1.0.1=7, r1.0.2=8
    const r0_0_children: ExpandedGroup = { expanded: true, totalRowCount: 2, pages: [makePage([["r0.0.0", "r0.0.1"]], 0, 2)] };
    const r0_children: ExpandedGroup = { expanded: true, totalRowCount: 1, pages: [makePage([["r0.0"]], 0, 1, new Map([[0, r0_0_children]]))] };
    const r1_0_children: ExpandedGroup = { expanded: true, totalRowCount: 3, pages: [makePage([["r1.0.0", "r1.0.1", "r1.0.2"]], 0, 3)] };
    const r1_children: ExpandedGroup = { expanded: true, totalRowCount: 1, pages: [makePage([["r1.0"]], 0, 1, new Map([[0, r1_0_children]]))] };
    const pages: PageNode[] = [
      makePage([["r0", "r1"]], 0, 2, new Map([[0, r0_children], [1, r1_children]])),
    ];

    // logicalStart=4 is r1 — point to r1's first child page
    const result4 = findTargetSlotPath(pages, 4);
    expect(result4).to.deep.equal([
      { pageIdx: 0, rowIdx: 1 },
      { pageIdx: 0, rowIdx: -1 },
    ]);

    // logicalStart=5 is r1.0 — point to r1.0's first child page
    const result5 = findTargetSlotPath(pages, 5);
    expect(result5).to.deep.equal([
      { pageIdx: 0, rowIdx: 1 },
      { pageIdx: 0, rowIdx: 0 },
      { pageIdx: 0, rowIdx: -1 },
    ]);

    // logicalStart=1 is r0.0 — point to r0.0's first child page
    const result1 = findTargetSlotPath(pages, 1);
    expect(result1).to.deep.equal([
      { pageIdx: 0, rowIdx: 0 },
      { pageIdx: 0, rowIdx: 0 },
      { pageIdx: 0, rowIdx: -1 },
    ]);
  });

  it("should point to first child page with 4-level nesting", () => {
    // depth 0: [a(expanded), b(expanded)]
    // depth 1 under a: [a0(expanded)]
    // depth 2 under a0: [a00(expanded)]
    // depth 3 under a00: [a000, a001]
    // depth 1 under b: [b0(expanded)]
    // depth 2 under b0: [b00(expanded)]
    // depth 3 under b00: [b000, b001, b002]
    //
    // Layout: a=0, a0=1, a00=2, a000=3, a001=4, b=5, b0=6, b00=7, b000=8, b001=9, b002=10
    const a00_children: ExpandedGroup = { expanded: true, totalRowCount: 2, pages: [makePage([["a000", "a001"]], 0, 2)] };
    const a0_children: ExpandedGroup = { expanded: true, totalRowCount: 1, pages: [makePage([["a00"]], 0, 1, new Map([[0, a00_children]]))] };
    const a_children: ExpandedGroup = { expanded: true, totalRowCount: 1, pages: [makePage([["a0"]], 0, 1, new Map([[0, a0_children]]))] };
    const b00_children: ExpandedGroup = { expanded: true, totalRowCount: 3, pages: [makePage([["b000", "b001", "b002"]], 0, 3)] };
    const b0_children: ExpandedGroup = { expanded: true, totalRowCount: 1, pages: [makePage([["b00"]], 0, 1, new Map([[0, b00_children]]))] };
    const b_children: ExpandedGroup = { expanded: true, totalRowCount: 1, pages: [makePage([["b0"]], 0, 1, new Map([[0, b0_children]]))] };
    const pages: PageNode[] = [
      makePage([["a", "b"]], 0, 2, new Map([[0, a_children], [1, b_children]])),
    ];

    // logicalStart=5 is b — point to b's first child page
    const result5 = findTargetSlotPath(pages, 5);
    expect(result5).to.deep.equal([
      { pageIdx: 0, rowIdx: 1 },
      { pageIdx: 0, rowIdx: -1 },
    ]);

    // logicalStart=6 is b0 — point to b0's first child page
    const result6 = findTargetSlotPath(pages, 6);
    expect(result6).to.deep.equal([
      { pageIdx: 0, rowIdx: 1 },
      { pageIdx: 0, rowIdx: 0 },
      { pageIdx: 0, rowIdx: -1 },
    ]);

    // logicalStart=7 is b00 — point to b00's first child page
    const result7 = findTargetSlotPath(pages, 7);
    expect(result7).to.deep.equal([
      { pageIdx: 0, rowIdx: 1 },
      { pageIdx: 0, rowIdx: 0 },
      { pageIdx: 0, rowIdx: 0 },
      { pageIdx: 0, rowIdx: -1 },
    ]);

    // logicalStart=2 is a00 — point to a00's first child page
    const result2 = findTargetSlotPath(pages, 2);
    expect(result2).to.deep.equal([
      { pageIdx: 0, rowIdx: 0 },
      { pageIdx: 0, rowIdx: 0 },
      { pageIdx: 0, rowIdx: 0 },
      { pageIdx: 0, rowIdx: -1 },
    ]);
  });

  it("should handle multiple child pages within expansion", () => {
    const child: ExpandedGroup = {
      expanded: true,
      totalRowCount: 6,
      pages: [
        makePage([["x", "y", "z"]], 0, 3),
        makePage([["w", "v", "u"]], 3, 3),
      ],
    };
    const pages: PageNode[] = [
      makePage([["a", "b"]], 0, 2, new Map([[0, child]])),
    ];
    // Layout: a=0, children=1,2,3,4,5,6, b=7
    const result = findTargetSlotPath(pages, 4);
    expect(result).to.deep.equal([
      { pageIdx: 0, rowIdx: 0 },
      { pageIdx: 1, rowIdx: -1 },
    ]);
  });
});

describe("#findContiguousPageBlocks", () => {
  it("should return cursor path when single loaded page", () => {
    const pages = [makePage([["a", "b"]], 0, 2)];
    const result = findContiguousPageBlocks(pages, [{ pageIdx: 0, rowIdx: -1 }]);
    expect(result).to.deep.equal({ blockStart: [{ pageIdx: 0, rowIdx: -1 }], blockEnd: [{ pageIdx: 0, rowIdx: -1 }] });
  });

  it("should expand block across all loaded sibling pages", () => {
    const pages = [makePage([["a"]], 0, 1), makePage([["b"]], 1, 1), makePage([["c"]], 2, 1)];
    const result = findContiguousPageBlocks(pages, [{ pageIdx: 1, rowIdx: -1 }]);
    expect(result).to.deep.equal({ blockStart: [{ pageIdx: 0, rowIdx: -1 }], blockEnd: [{ pageIdx: 2, rowIdx: -1 }] });
  });

  it("should stop at unloaded page going upward", () => {
    const pages = [makePage([["a"]], 0, 1), makePage(null, 1, 3), makePage([["b"]], 4, 1), makePage([["c"]], 5, 1)];
    const result = findContiguousPageBlocks(pages, [{ pageIdx: 3, rowIdx: -1 }]);
    expect(result).to.deep.equal({ blockStart: [{ pageIdx: 2, rowIdx: -1 }], blockEnd: [{ pageIdx: 3, rowIdx: -1 }] });
  });

  it("should stop at unloaded page going downward", () => {
    const pages = [makePage([["a"]], 0, 1), makePage([["b"]], 1, 1), makePage(null, 2, 3)];
    const result = findContiguousPageBlocks(pages, [{ pageIdx: 0, rowIdx: -1 }]);
    expect(result).to.deep.equal({ blockStart: [{ pageIdx: 0, rowIdx: -1 }], blockEnd: [{ pageIdx: 1, rowIdx: -1 }] });
  });

  it("should include loaded child pages in contiguous block", () => {
    const child: ExpandedGroup = { expanded: true, totalRowCount: 2, pages: [makePage([["x", "y"]], 0, 2)] };
    const pages = [makePage([["a", "b"]], 0, 2, new Map([[0, child]]))];
    const result = findContiguousPageBlocks(pages, [{ pageIdx: 0, rowIdx: -1 }]);
    expect(result).to.deep.equal({ blockStart: [{ pageIdx: 0, rowIdx: -1 }], blockEnd: [{ pageIdx: 0, rowIdx: 0 }, { pageIdx: 0, rowIdx: -1 }] });
  });

  it("should stop at unloaded child page", () => {
    const child: ExpandedGroup = { expanded: true, totalRowCount: 5, pages: [makePage([["x"]], 0, 1), makePage(null, 1, 3), makePage([["y"]], 4, 1)] };
    const pages = [makePage([["a"]], 0, 1, new Map([[0, child]])), makePage([["b"]], 1, 1)];
    // flat order: [0] -> [0,0](loaded) -> [0,1](unloaded) -> [0,2](loaded) -> [1]
    const result = findContiguousPageBlocks(pages, [{ pageIdx: 1, rowIdx: -1 }]);
    expect(result).to.deep.equal({ blockStart: [{ pageIdx: 0, rowIdx: 0 }, { pageIdx: 2, rowIdx: -1 }], blockEnd: [{ pageIdx: 1, rowIdx: -1 }] });
  });

  it("should handle cursor inside child pages", () => {
    const child: ExpandedGroup = { expanded: true, totalRowCount: 4, pages: [makePage([["x", "y"]], 0, 2), makePage(null, 2, 2)] };
    const pages = [makePage([["a"]], 0, 1, new Map([[0, child]])), makePage([["b"]], 1, 1)];
    // flat order: [0] -> [0,0] -> [0,1](unloaded) -> [1]
    const result = findContiguousPageBlocks(pages, [{ pageIdx: 0, rowIdx: 0 }, { pageIdx: 0, rowIdx: -1 }]);
    expect(result).to.deep.equal({ blockStart: [{ pageIdx: 0, rowIdx: -1 }], blockEnd: [{ pageIdx: 0, rowIdx: 0 }, { pageIdx: 0, rowIdx: -1 }] });
  });

  it("should return cursor path when cursor not found", () => {
    const pages = [makePage([["a"]], 0, 1)];
    const result = findContiguousPageBlocks(pages, [{ pageIdx: 5, rowIdx: -1 }]);
    expect(result).to.deep.equal({ blockStart: [{ pageIdx: 5, rowIdx: -1 }], blockEnd: [{ pageIdx: 5, rowIdx: -1 }] });
  });

  it("should handle multiple expanded rows creating interleaved children", () => {
    const child0: ExpandedGroup = { expanded: true, totalRowCount: 1, pages: [makePage([["c0"]], 0, 1)] };
    const child1: ExpandedGroup = { expanded: true, totalRowCount: 1, pages: [makePage(null, 0, 1)] };
    const pages = [makePage([["a", "b"]], 0, 2, new Map([[0, child0], [1, child1]]))];
    const result = findContiguousPageBlocks(pages, [{ pageIdx: 0, rowIdx: -1 }]);
    expect(result).to.deep.equal({ blockStart: [{ pageIdx: 0, rowIdx: -1 }], blockEnd: [{ pageIdx: 0, rowIdx: 0 }, { pageIdx: 0, rowIdx: -1 }] });
  });

  it("should handle collapsed groups not contributing to flat list", () => {
    const collapsed: ExpandedGroup = { expanded: false, totalRowCount: 3, pages: [makePage([["x", "y", "z"]], 0, 3)] };
    const pages = [makePage([["a"]], 0, 1, new Map([[0, collapsed]])), makePage([["b"]], 1, 1)];
    const result = findContiguousPageBlocks(pages, [{ pageIdx: 0, rowIdx: -1 }]);
    expect(result).to.deep.equal({ blockStart: [{ pageIdx: 0, rowIdx: -1 }], blockEnd: [{ pageIdx: 1, rowIdx: -1 }] });
  });

  it("should find contiguous block across multiple depths with unloaded boundaries", () => {
    const p0children: ExpandedGroup = { expanded: true, totalRowCount: 3, pages: [makePage([["a"]], 0, 1), makePage([["b"]], 1, 1), makePage([["c"]], 2, 1)] };
    const p1_1children: ExpandedGroup = { expanded: true, totalRowCount: 2, pages: [makePage([["d"]], 0, 1), makePage([["e"]], 1, 1)] };
    const p1children: ExpandedGroup = { expanded: true, totalRowCount: 2, pages: [makePage(null, 0, 1), makePage([["f"]], 1, 1, new Map([[0, p1_1children]]))] };
    const p2children: ExpandedGroup = { expanded: true, totalRowCount: 2, pages: [makePage([["g"]], 0, 1), makePage([["h"]], 1, 1)] };
    const p3_0children: ExpandedGroup = { expanded: true, totalRowCount: 2, pages: [makePage([["i"]], 0, 1), makePage(null, 1, 1)] };
    const p3children: ExpandedGroup = { expanded: true, totalRowCount: 1, pages: [makePage([["j"]], 0, 1, new Map([[0, p3_0children]]))] };

    const pages = [
      makePage([["p0"]], 0, 1, new Map([[0, p0children]])),
      makePage([["p1"]], 1, 1, new Map([[0, p1children]])),
      makePage([["p2"]], 2, 1, new Map([[0, p2children]])),
      makePage([["p3"]], 3, 1, new Map([[0, p3children]])),
    ];
    const cursor = [{ pageIdx: 2, rowIdx: 0 }, { pageIdx: 1, rowIdx: -1 }];
    const result = findContiguousPageBlocks(pages, cursor);
    // flat order (with full paths):
    // [0:-1], [0:0,0:-1], [0:0,1:-1], [0:0,2:-1],
    // [1:-1], [1:0,0:-1](unloaded), [1:0,1:-1], [1:0,1:0,0:-1], [1:0,1:0,1:-1],
    // [2:-1], [2:0,0:-1], [2:0,1:-1] <- cursor,
    // [3:-1], [3:0,0:-1], [3:0,0:0,0:-1], [3:0,0:0,1:-1](unloaded)
    // blockStart: walk up from cursor -> [2:0,0:-1] -> [2:-1] -> [1:0,1:0,1:-1] -> [1:0,1:0,0:-1] -> [1:0,1:-1] -> [1:0,0:-1] UNLOADED => stop
    // blockEnd: walk down from cursor -> [3:-1] -> [3:0,0:-1] -> [3:0,0:0,0:-1] -> [3:0,0:0,1:-1] UNLOADED => stop
    expect(result).to.deep.equal({
      blockStart: [{ pageIdx: 1, rowIdx: 0 }, { pageIdx: 1, rowIdx: -1 }],
      blockEnd: [{ pageIdx: 3, rowIdx: 0 }, { pageIdx: 0, rowIdx: 0 }, { pageIdx: 0, rowIdx: -1 }],
    });
  });
});
