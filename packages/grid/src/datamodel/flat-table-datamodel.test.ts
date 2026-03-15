import { expect } from "chai";
import { FlatTableDataModel, resolveLogicalRange } from "./flat-table-datamodel";
import { FlatTableConfig, GetRowsIR, GetRowsResponse, Schema, MeasureSchema, PageNode, ExpandedGroup } from "./types";

class MockFlatTableDataModel extends FlatTableDataModel {
  callCount = 0;
  lastIRs: GetRowsIR[] = [];
  private responses: Map<string, GetRowsResponse> = new Map();

  constructor(config: FlatTableConfig) {
    super(config);
  }

  setResponse(key: string, response: GetRowsResponse): void {
    this.responses.set(key, response);
  }

  private makeKey(ir: GetRowsIR): string {
    return `${ir.select.join(",")}|${ir.groupBy.join(",")}|${ir.startRow}`;
  }

  async getData(ir: GetRowsIR): Promise<GetRowsResponse> {
    this.callCount++;
    this.lastIRs.push({ ...ir });
    const key = this.makeKey(ir);
    const response = this.responses.get(key);
    if (response) return response;
    return { rowData: [], totalRowCount: 0 };
  }
}

const baseSchema: (Schema | MeasureSchema)[] = [
  { name: "country", type: "dimension" },
  { name: "year", type: "dimension" },
  { name: "athlete", type: "dimension" },
  { name: "sport", type: "dimension" },
  { name: "gold", type: "measure", aggregateFn: "sum" },
  { name: "silver", type: "measure", aggregateFn: "sum" },
];

function makeConfig(overrides: Partial<FlatTableConfig> = {}): FlatTableConfig {
  return {
    schema: baseSchema,
    pageSize: 3,
    maxCacheSize: 20,
    ...overrides,
  };
}

describe("FlatTableDataModel", () => {
  it("should initialize and produce correct viewmodel shape", async () => {
    const config = makeConfig();
    const model = new MockFlatTableDataModel(config);

    model.setResponse("|country,year|0", {
      rowData: [["USA", "Canada", "UK"], [100, 80, 60], [50, 40, 30], [25, 20, 15]],
      totalRowCount: 3,
    });

    const ir: GetRowsIR = {
      startRow: 0,
      endRow: 3,
      select: [],
      groupBy: ["country", "year"],
      project: ["athlete", "sport", "gold", "silver"],
      sort: [],
      filter: [],
    };

    const vm = await model.getViewModelData(ir);
    expect(vm.numRows).to.equal(3);
    expect(vm.numCols).to.equal(4);

    const slice = vm.getSlice(0, 0, 4, 3);
    expect(slice.rowFacets).to.deep.equal(["USA", "Canada", "UK"]);
    expect(slice.rowMeta).to.have.length(3);
    expect(slice.rowMeta[0].depth).to.equal(0);
    expect(slice.rowMeta[0].isLeaf).to.equal(false);
    expect(slice.rowMeta[0].isExpanded).to.equal(false);
  });

  it("should expand a group and show children", async () => {
    const config = makeConfig();
    const model = new MockFlatTableDataModel(config);

    model.setResponse("|country,year|0", {
      rowData: [["USA", "Canada"], [100, 80], [50, 40], [25, 20]],
      totalRowCount: 2,
    });

    const ir: GetRowsIR = {
      startRow: 0,
      endRow: 3,
      select: [],
      groupBy: ["country", "year"],
      project: ["athlete", "sport", "gold", "silver"],
      sort: [],
      filter: [],
    };

    await model.getViewModelData(ir);

    model.setResponse("USA|country,year|0", {
      rowData: [["2008", "2012"], [60, 40], [30, 20], [15, 10]],
      totalRowCount: 2,
    });

    const vm = await model.expand(["USA"]);
    expect(vm.numRows).to.equal(4);

    const slice = vm.getSlice(0, 0, 4, 4);
    expect(slice.rowFacets[0]).to.equal("USA");
    expect(slice.rowFacets[1]).to.equal("2008");
    expect(slice.rowFacets[2]).to.equal("2012");
    expect(slice.rowFacets[3]).to.equal("Canada");

    expect(slice.rowMeta[0].depth).to.equal(0);
    expect(slice.rowMeta[0].isExpanded).to.equal(true);
    expect(slice.rowMeta[1].depth).to.equal(1);
  });

  it("should collapse a group and hide children", async () => {
    const config = makeConfig();
    const model = new MockFlatTableDataModel(config);

    model.setResponse("|country,year|0", {
      rowData: [["USA", "Canada"], [100, 80], [50, 40], [25, 20]],
      totalRowCount: 2,
    });

    await model.getViewModelData({
      startRow: 0, endRow: 3, select: [], groupBy: ["country", "year"],
      project: ["athlete", "sport", "gold", "silver"], sort: [], filter: [],
    });

    model.setResponse("USA|country,year|0", {
      rowData: [["2008", "2012"], [60, 40], [30, 20], [15, 10]],
      totalRowCount: 2,
    });

    await model.expand(["USA"]);
    const vm = await model.collapse(["USA"]);

    expect(vm.numRows).to.equal(2);
    const slice = vm.getSlice(0, 0, 4, 2);
    expect(slice.rowFacets).to.deep.equal(["USA", "Canada"]);
    expect(slice.rowMeta[0].isExpanded).to.equal(false);
  });

  it("should re-expand without additional getData call", async () => {
    const config = makeConfig();
    const model = new MockFlatTableDataModel(config);

    model.setResponse("|country,year|0", {
      rowData: [["USA", "Canada"], [100, 80], [50, 40], [25, 20]],
      totalRowCount: 2,
    });

    await model.getViewModelData({
      startRow: 0, endRow: 3, select: [], groupBy: ["country", "year"],
      project: ["athlete", "sport", "gold", "silver"], sort: [], filter: [],
    });

    model.setResponse("USA|country,year|0", {
      rowData: [["2008", "2012"], [60, 40], [30, 20], [15, 10]],
      totalRowCount: 2,
    });

    await model.expand(["USA"]);
    await model.collapse(["USA"]);

    const callsBefore = model.callCount;
    const vm = await model.expand(["USA"]);
    expect(model.callCount).to.equal(callsBefore);
    expect(vm.numRows).to.equal(4);
  });

  it("should handle nested expand", async () => {
    const config = makeConfig();
    const model = new MockFlatTableDataModel(config);

    model.setResponse("|country,year|0", {
      rowData: [["USA"], [100], [50], [25]],
      totalRowCount: 1,
    });

    await model.getViewModelData({
      startRow: 0, endRow: 3, select: [], groupBy: ["country", "year"],
      project: ["athlete", "sport", "gold", "silver"], sort: [], filter: [],
    });

    model.setResponse("USA|country,year|0", {
      rowData: [["2008"], [60], [30], [15]],
      totalRowCount: 1,
    });

    await model.expand(["USA"]);

    model.setResponse("USA,2008|country,year|0", {
      rowData: [["Phelps", "Bolt"], ["Swimming", "Athletics"], [8, 3], [2, 1]],
      totalRowCount: 2,
    });

    const vm = await model.expand(["USA", "2008"]);
    expect(vm.numRows).to.equal(4);

    const slice = vm.getSlice(0, 0, 4, 4);
    expect(slice.rowMeta[0].depth).to.equal(0);
    expect(slice.rowMeta[1].depth).to.equal(1);
    expect(slice.rowMeta[2].depth).to.equal(2);
    expect(slice.rowMeta[2].isLeaf).to.equal(true);
    expect(slice.rowMeta[3].depth).to.equal(2);
    expect(slice.rowMeta[3].isLeaf).to.equal(true);
  });

  it("should compute totalLogicalRows correctly on expand/collapse", async () => {
    const config = makeConfig();
    const model = new MockFlatTableDataModel(config);

    model.setResponse("|country,year|0", {
      rowData: [["USA", "Canada"], [100, 80], [50, 40], [25, 20]],
      totalRowCount: 2,
    });

    await model.getViewModelData({
      startRow: 0, endRow: 3, select: [], groupBy: ["country", "year"],
      project: ["athlete", "sport", "gold", "silver"], sort: [], filter: [],
    });

    expect(model.computeTotalLogicalRows()).to.equal(2);

    model.setResponse("USA|country,year|0", {
      rowData: [["2008", "2012", "2016"], [60, 40, 20], [30, 20, 10], [15, 10, 5]],
      totalRowCount: 3,
    });

    await model.expand(["USA"]);
    expect(model.computeTotalLogicalRows()).to.equal(5);

    await model.collapse(["USA"]);
    expect(model.computeTotalLogicalRows()).to.equal(2);
  });

  it("should evict pages when cache is full", async () => {
    const config = makeConfig({ pageSize: 2, maxCacheSize: 2 });
    const model = new MockFlatTableDataModel(config);

    model.setResponse("|country,year|0", {
      rowData: [["USA", "Canada"], [100, 80], [50, 40], [25, 20]],
      totalRowCount: 4,
    });

    await model.getViewModelData({
      startRow: 0, endRow: 2, select: [], groupBy: ["country", "year"],
      project: ["athlete", "sport", "gold", "silver"], sort: [], filter: [],
    });

    model.setResponse("|country,year|2", {
      rowData: [["UK", "France"], [60, 50], [30, 25], [15, 12]],
      totalRowCount: 4,
    });

    await model.getViewModelData({
      startRow: 2, endRow: 4, select: [], groupBy: ["country", "year"],
      project: ["athlete", "sport", "gold", "silver"], sort: [], filter: [],
    });

    expect(model.pages[0].data).to.not.be.null;
    expect(model.pages[1].data).to.not.be.null;

    model.setResponse("|country,year|0", {
      rowData: [["USA2", "Canada2"], [100, 80], [50, 40], [25, 20]],
      totalRowCount: 4,
    });

    await model.getViewModelData({
      startRow: 0, endRow: 2, select: [], groupBy: ["country", "year"],
      project: ["athlete", "sport", "gold", "silver"], sort: [], filter: [],
    });

    const fetchedCount = model.pages.filter((p) => p.data !== null).length;
    expect(fetchedCount).to.be.lte(2);
  });

  it("should clear tree when groupBy changes between IR calls", async () => {
    const config = makeConfig();
    const model = new MockFlatTableDataModel(config);

    model.setResponse("|country,year|0", {
      rowData: [["USA", "Canada"], [100, 80], [50, 40], [25, 20]],
      totalRowCount: 2,
    });

    await model.getViewModelData({
      startRow: 0, endRow: 3, select: [], groupBy: ["country", "year"],
      project: ["athlete", "sport", "gold", "silver"], sort: [], filter: [],
    });

    expect(model.pages).to.have.length(1);

    model.setResponse("|year|0", {
      rowData: [["2008", "2012"], [160, 120], [80, 60], [40, 30]],
      totalRowCount: 2,
    });

    const vm = await model.getViewModelData({
      startRow: 0, endRow: 3, select: [], groupBy: ["year"],
      project: ["athlete", "sport", "gold", "silver"], sort: [], filter: [],
    });

    expect(vm.numRows).to.equal(2);
    const slice = vm.getSlice(0, 0, 4, 2);
    expect(slice.rowFacets[0]).to.equal("2008");
  });

  it("should show isLeaf=true at deepest facet level when no outside facet dims", async () => {
    const config = makeConfig({
      schema: [
        { name: "country", type: "dimension" as const },
        { name: "year", type: "dimension" as const },
        { name: "gold", type: "measure" as const, aggregateFn: "sum" as const },
        { name: "silver", type: "measure" as const, aggregateFn: "sum" as const },
      ],
    });
    const model = new MockFlatTableDataModel(config);

    model.setResponse("|country,year|0", {
      rowData: [["USA"], [100], [50]],
      totalRowCount: 1,
    });

    await model.getViewModelData({
      startRow: 0, endRow: 3, select: [], groupBy: ["country", "year"],
      project: ["gold", "silver"], sort: [], filter: [],
    });

    model.setResponse("USA|country,year|0", {
      rowData: [["2008"], [60], [30]],
      totalRowCount: 1,
    });

    const vm = await model.expand(["USA"]);
    const slice = vm.getSlice(0, 0, 2, 2);

    expect(slice.rowMeta[0].isLeaf).to.equal(false);
    expect(slice.rowMeta[1].isLeaf).to.equal(true);
  });
});

function makePage(data: any[][] | null, physicalStart: number, rowCount: number, expandedRows?: Map<number, ExpandedGroup>): PageNode {
  return { data, physicalStart, rowCount, expandedRows: expandedRows ?? new Map() };
}

describe("resolveLogicalRange", () => {
  it("should return empty when all pages are loaded", () => {
    const pages: PageNode[] = [
      makePage([["A", "B", "C"]], 0, 3),
    ];
    const result = resolveLogicalRange(pages, 0, 3);
    expect(result).to.have.length(0);
  });

  it("should return empty for an empty page tree", () => {
    const result = resolveLogicalRange([], 0, 10);
    expect(result).to.have.length(0);
  });

  it("should return the single unfetched page overlapping the range", () => {
    const pages: PageNode[] = [
      makePage(null, 0, 5),
    ];
    const result = resolveLogicalRange(pages, 0, 5);
    expect(result).to.have.length(1);
    expect(result[0].page).to.equal(pages[0]);
    expect(result[0].selectPath).to.deep.equal([]);
  });

  it("should return only unfetched pages that overlap the range", () => {
    const pages: PageNode[] = [
      makePage([["A", "B"]], 0, 2),
      makePage(null, 2, 2),
      makePage(null, 4, 2),
    ];
    const result = resolveLogicalRange(pages, 2, 4);
    expect(result).to.have.length(1);
    expect(result[0].page).to.equal(pages[1]);
  });

  it("should return multiple unfetched pages spanning the range", () => {
    const pages: PageNode[] = [
      makePage(null, 0, 3),
      makePage(null, 3, 3),
      makePage(null, 6, 3),
    ];
    const result = resolveLogicalRange(pages, 0, 9);
    expect(result).to.have.length(3);
  });

  it("should skip unfetched pages entirely before the range", () => {
    const pages: PageNode[] = [
      makePage(null, 0, 5),
      makePage(null, 5, 5),
    ];
    const result = resolveLogicalRange(pages, 5, 10);
    expect(result).to.have.length(1);
    expect(result[0].page).to.equal(pages[1]);
  });

  it("should skip unfetched pages entirely after the range", () => {
    const pages: PageNode[] = [
      makePage(null, 0, 5),
      makePage(null, 5, 5),
    ];
    const result = resolveLogicalRange(pages, 0, 5);
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
    const result = resolveLogicalRange(pages, 4, 6);
    expect(result).to.have.length(1);
    expect(result[0].page).to.equal(pages[1]);
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
    const result = resolveLogicalRange(pages, 1, 4);
    expect(result).to.have.length(1);
    expect(result[0].page).to.equal(childPages[0]);
    expect(result[0].selectPath).to.deep.equal(["USA"]);
  });

  it("should not recurse into collapsed groups", () => {
    const childPages: PageNode[] = [
      makePage(null, 0, 3),
    ];
    const collapsed: ExpandedGroup = { expanded: false, totalRowCount: 3, pages: childPages };
    const pages: PageNode[] = [
      makePage([["USA", "Canada"]], 0, 2, new Map([[0, collapsed]])),
    ];
    // Logical layout: USA(0), Canada(1) — collapsed children don't count
    const result = resolveLogicalRange(pages, 0, 2);
    expect(result).to.have.length(0);
  });

  it("should handle range starting mid-unfetched-page", () => {
    const pages: PageNode[] = [
      makePage(null, 0, 10),
    ];
    const result = resolveLogicalRange(pages, 5, 8);
    expect(result).to.have.length(1);
    expect(result[0].page).to.equal(pages[0]);
  });

  it("should stop early when logicalEnd is reached inside a fetched page", () => {
    const pages: PageNode[] = [
      makePage([["A", "B", "C", "D", "E"]], 0, 5),
      makePage(null, 5, 5),
    ];
    const result = resolveLogicalRange(pages, 0, 3);
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
    const result = resolveLogicalRange(pages, 2, 4);
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
    const result = resolveLogicalRange(pages, 0, 4);
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
    const result = resolveLogicalRange(pages, 4, 7);
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
    const result = resolveLogicalRange(pages, 3, 6);
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
    // Even though expandedRows exists, the page data is null so we can't read row values
    const expanded: ExpandedGroup = { expanded: true, totalRowCount: 3, pages: childPages };
    const pages: PageNode[] = [
      makePage(null, 0, 2, new Map([[0, expanded]])),
    ];
    // Unfetched page — counts as 2 logical rows. No recursion into children.
    const result = resolveLogicalRange(pages, 0, 5);
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
    const result = resolveLogicalRange(pages, 0, 8);
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
    const result = resolveLogicalRange(pages, 5, 8);
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
    const result = resolveLogicalRange(pages, 5, 7);
    expect(result).to.have.length(1);
    expect(result[0].page).to.equal(midPages[1]);
    expect(result[0].selectPath).to.deep.equal(["USA"]);
  });
});
