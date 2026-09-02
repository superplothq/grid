import { expect } from "chai";
import { MetaState } from "./grid-data-viewmodel";
import { PivotDataViewModel } from "./pivot-data-viewmodel";
import { FlattenedDataViewModel, createRowMeta } from "./flattened-data-viewmodel";

const colFacets2Levels: string[][] = [
  ["A", "A", "A", "B", "B", "B"],
  ["X", "Y", "Z", "X", "Y", "Z"],
];

const rowFacets3Levels: string[][] = [
  ["R0", "R0", "R0", "R0", "R1", "R1", "R1", "R1"],
  ["S0", "S0", "S1", "S1", "S0", "S0", "S1", "S1"],
  ["T0", "T1", "T0", "T1", "T0", "T1", "T0", "T1"],
];

function makeData(numCols: number, numRows: number): number[][] {
  const data: number[][] = [];
  for (let col = 0; col < numCols; col++) {
    const column: number[] = [];
    for (let row = 0; row < numRows; row++) {
      column.push(col * 100 + row);
    }
    data.push(column);
  }
  return data;
}

const data6x8 = makeData(6, 8);

// Simple dataset: 1 level of column facets, no row facets
// 4 columns, 5 rows
const colFacets1Level: string[][] = [
  ["P", "Q", "R", "S"],
];
const data4x5 = makeData(4, 5);

describe("MetaState", () => {
  let metaState: MetaState;

  beforeEach(() => {
    metaState = new MetaState();
  });

  it("should set and get a value in a namespace", () => {
    metaState.set("ns1", "key1", "value1");
    expect(metaState.get("ns1")).to.deep.equal({ key1: "value1" });
  });

  it("should return undefined for unknown namespace", () => {
    expect(metaState.get("unknown")).to.be.undefined;
  });

  it("should overwrite an existing key", () => {
    metaState.set("ns1", "key1", "value1");
    metaState.set("ns1", "key1", "value2");
    expect(metaState.get("ns1")).to.deep.equal({ key1: "value2" });
  });

  it("should store multiple keys in a namespace", () => {
    metaState.set("ns1", "a", 1);
    metaState.set("ns1", "b", 2);
    expect(metaState.get("ns1")).to.deep.equal({ a: 1, b: 2 });
  });

  it("should clear a single key from a namespace", () => {
    metaState.set("ns1", "a", 1);
    metaState.set("ns1", "b", 2);
    metaState.clear("ns1", "a");
    expect(metaState.get("ns1")).to.deep.equal({ b: 2 });
  });

  it("should clear an entire namespace", () => {
    metaState.set("ns1", "a", 1);
    metaState.set("ns1", "b", 2);
    metaState.clear("ns1");
    expect(metaState.get("ns1")).to.be.undefined;
  });

  it("should be available on GridDataViewModel", () => {
    const vm = new PivotDataViewModel({ data: data4x5, columnFacets: colFacets1Level });
    vm.metaState.set("test", "loading", true);
    expect(vm.metaState.get("test")).to.deep.equal({ loading: true });
  });
});

describe("GridDataViewModel.getSlice", () => {
  describe("1 column facet level, no row facets", () => {
    let vm: PivotDataViewModel;

    beforeEach(() => {
      vm = new PivotDataViewModel({ data: data4x5, columnFacets: colFacets1Level });
    });

    it("should slice full data range", () => {
      const result = vm.getSlice(0, 0, 4, 5);
      expect(result.data).to.deep.equal(data4x5);
      expect(result.columnFacets).to.deep.equal([
        ["P"], ["Q"], ["R"], ["S"],
      ]);
      expect(result.rowFacets).to.deep.equal([]);
    });

    it("should slice a single column, all rows", () => {
      const result = vm.getSlice(1, 0, 2, 5);
      expect(result.data).to.deep.equal([[100, 101, 102, 103, 104]]);
      expect(result.columnFacets).to.deep.equal([["Q"]]);
    });

    it("should slice a single row, all columns", () => {
      const result = vm.getSlice(0, 2, 4, 3);
      expect(result.data).to.deep.equal([[2], [102], [202], [302]]);
      expect(result.columnFacets).to.deep.equal([["P"], ["Q"], ["R"], ["S"]]);
    });

    it("should slice a single cell", () => {
      const result = vm.getSlice(2, 3, 3, 4);
      expect(result.data).to.deep.equal([[203]]);
      expect(result.columnFacets).to.deep.equal([["R"]]);
    });

    it("should slice first column and first row only", () => {
      const result = vm.getSlice(0, 0, 1, 1);
      expect(result.data).to.deep.equal([[0]]);
      expect(result.columnFacets).to.deep.equal([["P"]]);
    });

    it("should slice last column and last row only", () => {
      const result = vm.getSlice(3, 4, 4, 5);
      expect(result.data).to.deep.equal([[304]]);
      expect(result.columnFacets).to.deep.equal([["S"]]);
    });

    it("should slice a middle sub-range", () => {
      const result = vm.getSlice(1, 1, 3, 4);
      expect(result.data).to.deep.equal([
        [101, 102, 103],
        [201, 202, 203],
      ]);
      expect(result.columnFacets).to.deep.equal([["Q"], ["R"]]);
    });

    it("should slice from start with partial columns and rows", () => {
      const result = vm.getSlice(0, 0, 2, 3);
      expect(result.data).to.deep.equal([
        [0, 1, 2],
        [100, 101, 102],
      ]);
      expect(result.columnFacets).to.deep.equal([["P"], ["Q"]]);
    });

    it("should slice to end with partial columns and rows", () => {
      const result = vm.getSlice(2, 3, 4, 5);
      expect(result.data).to.deep.equal([
        [203, 204],
        [303, 304],
      ]);
      expect(result.columnFacets).to.deep.equal([["R"], ["S"]]);
    });

    it("should always return full numRows/numCols regardless of slice", () => {
      const result = vm.getSlice(1, 2, 3, 4);
      expect(result.numRows).to.equal(5);
      expect(result.numCols).to.equal(4);
    });

    it("should handle adjacent single-column slices consistently", () => {
      const r1 = vm.getSlice(0, 0, 1, 5);
      const r2 = vm.getSlice(1, 0, 2, 5);
      const r3 = vm.getSlice(2, 0, 3, 5);
      const r4 = vm.getSlice(3, 0, 4, 5);
      const combined = [...r1.data!, ...r2.data!, ...r3.data!, ...r4.data!];
      expect(combined).to.deep.equal(data4x5);
    });

    it("should handle adjacent single-row slices consistently", () => {
      const rows: any[][] = [];
      for (let y = 0; y < 5; y++) {
        const r = vm.getSlice(0, y, 4, y + 1);
        for (let col = 0; col < 4; col++) {
          if (!rows[col]) rows[col] = [];
          rows[col].push(...r.data![col]);
        }
      }
      expect(rows).to.deep.equal(data4x5);
    });
  });

  describe("2 column facet levels, 3 row facet levels", () => {
    let vm: PivotDataViewModel;

    beforeEach(() => {
      vm = new PivotDataViewModel({ data: data6x8, columnFacets: colFacets2Levels, rowFacets: rowFacets3Levels });
    });

    it("should slice full data range with all facets", () => {
      const result = vm.getSlice(0, 0, 6, 8);
      expect(result.data).to.deep.equal(data6x8);
      expect(result.columnFacets).to.deep.equal([
        ["A", "X"], ["A", "Y"], ["A", "Z"], ["B", "X"], ["B", "Y"], ["B", "Z"],
      ]);
      expect(result.rowFacets).to.deep.equal([
        ["R0", "S0", "T0"], ["R0", "S0", "T1"],
        ["R0", "S1", "T0"], ["R0", "S1", "T1"],
        ["R1", "S0", "T0"], ["R1", "S0", "T1"],
        ["R1", "S1", "T0"], ["R1", "S1", "T1"],
      ]);
    });

    it("should slice column facets correctly for a sub-range", () => {
      const result = vm.getSlice(2, 0, 5, 1);
      expect(result.columnFacets).to.deep.equal([
        ["A", "Z"], ["B", "X"], ["B", "Y"],
      ]);
    });

    it("should slice row facets correctly for a sub-range", () => {
      const result = vm.getSlice(0, 3, 1, 6);
      expect(result.rowFacets).to.deep.equal([
        ["R0", "S1", "T1"],
        ["R1", "S0", "T0"],
        ["R1", "S0", "T1"],
      ]);
    });

    it("should slice data for a single cell with correct facets", () => {
      const result = vm.getSlice(4, 6, 5, 7);
      expect(result.data).to.deep.equal([[406]]);
      expect(result.columnFacets).to.deep.equal([["B", "Y"]]);
      expect(result.rowFacets).to.deep.equal([["R1", "S1", "T0"]]);
    });

    it("should slice a 2x2 sub-block", () => {
      const result = vm.getSlice(1, 2, 3, 4);
      expect(result.data).to.deep.equal([
        [102, 103],
        [202, 203],
      ]);
      expect(result.columnFacets).to.deep.equal([["A", "Y"], ["A", "Z"]]);
      expect(result.rowFacets).to.deep.equal([
        ["R0", "S1", "T0"], ["R0", "S1", "T1"],
      ]);
    });

    it("should preserve numRows/numCols in any slice", () => {
      const result = vm.getSlice(3, 5, 4, 6);
      expect(result.numRows).to.equal(8);
      expect(result.numCols).to.equal(6);
    });

    it("should slice first row only across all columns", () => {
      const result = vm.getSlice(0, 0, 6, 1);
      expect(result.data).to.deep.equal([[0], [100], [200], [300], [400], [500]]);
      expect(result.rowFacets).to.deep.equal([["R0", "S0", "T0"]]);
    });

    it("should slice last column only across all rows", () => {
      const result = vm.getSlice(5, 0, 6, 8);
      expect(result.data).to.deep.equal([[500, 501, 502, 503, 504, 505, 506, 507]]);
      expect(result.columnFacets).to.deep.equal([["B", "Z"]]);
    });
  });
});

describe("valueFormatter resolution", () => {
  const trackFormatter = () => "track";
  const facetFormatter = () => "facet";
  const deeperFacetFormatter = () => "deeper";

  it("should resolve VTrackDef valueFormatter for its column only", () => {
    const vm = new PivotDataViewModel({
      data: data4x5,
      columnFacets: colFacets1Level,
      options: { vTrackDefs: [{ valueFormatter: trackFormatter }] },
    });
    expect(vm.vTrackDefs[0].valueFormatter).to.equal(trackFormatter);
    expect(vm.vTrackDefs[1].valueFormatter).to.be.undefined;
  });

  it("should default every column to the col facet valueFormatter", () => {
    const vm = new PivotDataViewModel({
      data: data4x5,
      columnFacets: colFacets1Level,
      options: { facetDefs: { row: [], col: [{ valueFormatter: facetFormatter }], axis: "col" } },
    });
    for (const def of vm.vTrackDefs) {
      expect(def.valueFormatter).to.equal(facetFormatter);
    }
  });

  it("should prefer VTrackDef valueFormatter over col facet valueFormatter", () => {
    const vm = new PivotDataViewModel({
      data: data4x5,
      columnFacets: colFacets1Level,
      options: {
        vTrackDefs: [{ valueFormatter: trackFormatter }],
        facetDefs: { row: [], col: [{ valueFormatter: facetFormatter }], axis: "col" },
      },
    });
    expect(vm.vTrackDefs[0].valueFormatter).to.equal(trackFormatter);
    expect(vm.vTrackDefs[1].valueFormatter).to.equal(facetFormatter);
  });

  it("should pick the deepest col facet level that defines valueFormatter", () => {
    const vm = new PivotDataViewModel({
      data: data6x8,
      columnFacets: colFacets2Levels,
      options: {
        facetDefs: {
          row: [],
          col: [{ valueFormatter: facetFormatter }, { valueFormatter: deeperFacetFormatter }],
          axis: "col",
        },
      },
    });
    for (const def of vm.vTrackDefs) {
      expect(def.valueFormatter).to.equal(deeperFacetFormatter);
    }
  });

  it("should fall back to a shallower col facet level when deeper levels define none", () => {
    const vm = new PivotDataViewModel({
      data: data6x8,
      columnFacets: colFacets2Levels,
      options: {
        facetDefs: { row: [], col: [{ valueFormatter: facetFormatter }, {}], axis: "col" },
      },
    });
    for (const def of vm.vTrackDefs) {
      expect(def.valueFormatter).to.equal(facetFormatter);
    }
  });

  it("should leave valueFormatter undefined when none is configured", () => {
    const vm = new PivotDataViewModel({ data: data4x5, columnFacets: colFacets1Level });
    for (const def of vm.vTrackDefs) {
      expect(def.valueFormatter).to.be.undefined;
    }
  });

  it("should carry valueFormatter through normalized facet defs", () => {
    const vm = new PivotDataViewModel({
      data: data4x5,
      columnFacets: colFacets1Level,
      options: { facetDefs: { row: [], col: [{ valueFormatter: facetFormatter }], axis: "col" } },
    });
    expect(vm.facetDefs.col[0].valueFormatter).to.equal(facetFormatter);
  });

  it("should re-resolve valueFormatter on updateData", () => {
    const vm = new PivotDataViewModel({
      data: data4x5,
      columnFacets: colFacets1Level,
      options: { vTrackDefs: [{ valueFormatter: trackFormatter }] },
    });
    vm.updateData({
      data: data4x5,
      columnFacets: colFacets1Level,
      options: { facetDefs: { row: [], col: [{ valueFormatter: facetFormatter }], axis: "col" } },
    });
    expect(vm.vTrackDefs[0].valueFormatter).to.equal(facetFormatter);
  });
});

const flatColFacets: string[][] = [
  ["name", "value"],
];
const flatRowFacet: (string | null)[] = ["G0", null, null, "G1", null];
const flatRowMeta = new Uint8Array([
  createRowMeta(0, false, true),
  createRowMeta(1, true, false),
  createRowMeta(1, true, false),
  createRowMeta(0, false, true),
  createRowMeta(1, true, false),
]);

function expectBlank(vm: PivotDataViewModel | FlattenedDataViewModel): void {
  expect(vm.isDataLoaded()).to.be.false;
  expect(vm.isEmpty()).to.be.true;
  expect(vm.numRows).to.equal(0);
  expect(vm.numCols).to.equal(0);
  expect(vm.totalRows).to.equal(0);
  expect(vm.offsetTop).to.equal(0);
  expect(vm.numColFacetLevels).to.equal(0);
  expect(vm.numRowFacetLevels).to.equal(0);
  expect(vm.columnFacets).to.deep.equal([]);
  expect(vm.rowFacets).to.deep.equal([]);
  expect(vm.vTrackDefs).to.deep.equal([]);
  expect(vm.facetDefs.col).to.deep.equal([]);
  expect(vm.facetDefs.row).to.deep.equal([]);
  expect(vm.viewport).to.deep.equal({ x0: 0, y0: 0, x1: 0, y1: 0 });
  expect(vm.metadata.getValueCellMeta(0, 0)).to.be.undefined;
}

describe("createBlank", () => {
  it("should report a pivot viewmodel as empty and not loaded", () => {
    expectBlank(PivotDataViewModel.createBlank());
  });

  it("should report a flat viewmodel as empty and not loaded", () => {
    expectBlank(FlattenedDataViewModel.createBlank());
  });

  it("should return an empty slice", () => {
    const vm = PivotDataViewModel.createBlank();
    const slice = vm.getSlice(0, 0, 0, 0);
    expect(slice.numRows).to.equal(0);
    expect(slice.numCols).to.equal(0);
    expect(slice.sliceNumRows).to.equal(0);
    expect(slice.sliceNumCols).to.equal(0);
    expect(slice.rowFacets).to.deep.equal([]);
  });

  it("should report a constructed viewmodel as loaded", () => {
    const vm = new PivotDataViewModel({ data: data4x5, columnFacets: colFacets1Level });
    expect(vm.isDataLoaded()).to.be.true;
    expect(vm.isEmpty()).to.be.false;
  });

  it("should report a viewmodel constructed with zero rows as loaded but empty", () => {
    const vm = new PivotDataViewModel({ data: [[], [], [], []], columnFacets: colFacets1Level });
    expect(vm.isDataLoaded()).to.be.true;
    expect(vm.isEmpty()).to.be.true;
    expect(vm.numCols).to.equal(4);
  });
});

describe("blank then load", () => {
  it("should hold pivot data after updateData", () => {
    const vm = PivotDataViewModel.createBlank();
    vm.updateData({ data: data6x8, columnFacets: colFacets2Levels, rowFacets: rowFacets3Levels });

    expect(vm.isDataLoaded()).to.be.true;
    expect(vm.isEmpty()).to.be.false;
    expect(vm.numRows).to.equal(8);
    expect(vm.numCols).to.equal(6);
    expect(vm.totalRows).to.equal(8);
    expect(vm.numColFacetLevels).to.equal(2);
    expect(vm.numRowFacetLevels).to.equal(3);
    expect(vm.vTrackDefs.length).to.equal(6);
    expect(vm.facetDefs.col.length).to.equal(2);
    expect(vm.facetDefs.row.length).to.equal(3);
  });

  it("should slice pivot data after updateData", () => {
    const vm = PivotDataViewModel.createBlank();
    vm.updateData({ data: data6x8, columnFacets: colFacets2Levels, rowFacets: rowFacets3Levels });

    const slice = vm.getSlice(0, 0, 2, 2);
    expect(slice.data).to.deep.equal([[0, 1], [100, 101]]);
    expect(slice.columnFacets).to.deep.equal([["A", "X"], ["A", "Y"]]);
    expect(slice.rowFacets).to.deep.equal([["R0", "S0", "T0"], ["R0", "S0", "T1"]]);
  });

  it("should hold flat data after updateData", () => {
    const vm = FlattenedDataViewModel.createBlank();
    vm.updateData({
      data: makeData(2, 5), columnFacets: flatColFacets, rowFacet: flatRowFacet, rowMeta: flatRowMeta,
      totalRows: 200, offsetTop: 100,
    });

    expect(vm.isDataLoaded()).to.be.true;
    expect(vm.isEmpty()).to.be.false;
    expect(vm.numRows).to.equal(5);
    expect(vm.numCols).to.equal(2);
    expect(vm.totalRows).to.equal(200);
    expect(vm.offsetTop).to.equal(100);
    expect(vm.numRowFacetLevels).to.equal(1);
    expect(vm.vTrackDefs.length).to.equal(2);
    expect(vm.facetDefs.row.length).to.equal(1);
  });

  it("should slice flat data after updateData", () => {
    const vm = FlattenedDataViewModel.createBlank();
    vm.updateData({ data: makeData(2, 5), columnFacets: flatColFacets, rowFacet: flatRowFacet, rowMeta: flatRowMeta });

    const slice = vm.getSlice(0, 0, 2, 2);
    expect(slice.data).to.deep.equal([[0, 1], [100, 101]]);
    expect(slice.rowFacets).to.deep.equal(["G0", null]);
    expect(slice.rowMeta).to.deep.equal([
      { depth: 0, isLeaf: false, isExpanded: true },
      { depth: 1, isLeaf: true, isExpanded: false },
    ]);
  });

  it("should keep options injected at createBlank when updateData omits them", () => {
    const renderer = () => "x";
    const vm = FlattenedDataViewModel.createBlank({
      options: { vTrackDefs: [{ renderer }] },
      schema: [{ name: "name", type: "dimension" }],
    });
    expect(vm.vTrackDefs).to.deep.equal([]);

    vm.updateData({ data: makeData(2, 5), columnFacets: flatColFacets });

    expect(vm.vTrackDefs.length).to.equal(2);
    expect(vm.vTrackDefs[0].renderer).to.equal(renderer);
    expect(vm.schema).to.deep.equal([{ name: "name", type: "dimension" }]);
  });

  it("should keep the facet axis when updateData omits options", () => {
    const vm = PivotDataViewModel.createBlank({
      options: { facetDefs: { row: [], col: [], axis: "row" } },
    });
    vm.updateData({ data: data6x8, columnFacets: colFacets2Levels, rowFacets: rowFacets3Levels });

    expect(vm.facetDefs.axis).to.equal("row");
  });

  it("should apply options passed with the first updateData", () => {
    const renderer = () => "x";
    const vm = PivotDataViewModel.createBlank();
    vm.updateData({
      data: data4x5, columnFacets: colFacets1Level,
      options: { vTrackDefs: [{ renderer }] },
    });

    expect(vm.vTrackDefs.length).to.equal(4);
    expect(vm.vTrackDefs[0].renderer).to.equal(renderer);
  });
});

describe("blank then load then blank", () => {
  it("should return a pivot viewmodel to the blank state on reset", () => {
    const vm = PivotDataViewModel.createBlank();
    vm.updateData({ data: data6x8, columnFacets: colFacets2Levels, rowFacets: rowFacets3Levels });
    vm.reset();

    expectBlank(vm);
  });

  it("should return a flat viewmodel to the blank state on reset", () => {
    const vm = FlattenedDataViewModel.createBlank();
    vm.updateData({
      data: makeData(2, 5), columnFacets: flatColFacets, rowFacet: flatRowFacet, rowMeta: flatRowMeta,
      totalRows: 200, offsetTop: 100,
    });
    vm.reset();

    expectBlank(vm);
  });

  it("should drop metadata on reset", () => {
    const vm = PivotDataViewModel.createBlank();
    vm.updateData({
      data: data4x5, columnFacets: colFacets1Level,
      metadata: { valueCells: [{ colIndex: 0, rowIndex: 0, meta: { flag: true } }] },
    });
    expect(vm.metadata.getValueCellMeta(0, 0)).to.deep.equal({ flag: true });

    vm.reset();
    expect(vm.metadata.getValueCellMeta(0, 0)).to.be.undefined;
  });

  it("should preserve metaState across reset", () => {
    const vm = PivotDataViewModel.createBlank();
    vm.metaState.set("ns", "sort", "asc");
    vm.updateData({ data: data4x5, columnFacets: colFacets1Level });
    vm.reset();

    expect(vm.metaState.get("ns")).to.deep.equal({ sort: "asc" });
  });

  it("should preserve registered callbacks across reset", () => {
    const vm = PivotDataViewModel.createBlank();
    let calls = 0;
    vm.register("viewportDataChange", () => { calls++; });
    vm.updateData({ data: data4x5, columnFacets: colFacets1Level });
    vm.reset();
    vm.updateData({ data: data4x5, columnFacets: colFacets1Level });
    vm.getViewportData(0, 0, 2, 2);

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(calls).to.equal(1);
        resolve();
      }, 80);
    });
  });

  it("should keep rendering options across reset", () => {
    const renderer = () => "x";
    const vm = FlattenedDataViewModel.createBlank({ options: { vTrackDefs: [{ renderer }] } });
    vm.updateData({ data: makeData(2, 5), columnFacets: flatColFacets });
    vm.reset();
    vm.updateData({ data: makeData(2, 3), columnFacets: flatColFacets });

    expect(vm.vTrackDefs[0].renderer).to.equal(renderer);
  });

  it("should keep schema across reset", () => {
    const schema = [{ name: "name", type: "dimension" as const }];
    const vm = FlattenedDataViewModel.createBlank({ schema });
    vm.updateData({ data: makeData(2, 5), columnFacets: flatColFacets });
    vm.reset();

    expect(vm.schema).to.equal(schema);
  });

  it("should reload after reset", () => {
    const vm = FlattenedDataViewModel.createBlank();
    vm.updateData({ data: makeData(2, 5), columnFacets: flatColFacets, rowFacet: flatRowFacet, rowMeta: flatRowMeta });
    vm.reset();
    vm.updateData({ data: makeData(3, 2), columnFacets: [["a", "b", "c"]] });

    expect(vm.isDataLoaded()).to.be.true;
    expect(vm.isEmpty()).to.be.false;
    expect(vm.numCols).to.equal(3);
    expect(vm.numRows).to.equal(2);
    expect(vm.numRowFacetLevels).to.equal(0);
    expect(vm.vTrackDefs.length).to.equal(3);
  });
});

describe("blank then load empty data then blank", () => {
  it("should stay loaded when pivot data has no rows", () => {
    const vm = PivotDataViewModel.createBlank();
    vm.updateData({ data: [[], [], [], []], columnFacets: colFacets1Level });

    expect(vm.isDataLoaded()).to.be.true;
    expect(vm.isEmpty()).to.be.true;
    expect(vm.numRows).to.equal(0);
    expect(vm.numCols).to.equal(4);
    expect(vm.totalRows).to.equal(0);
    expect(vm.numColFacetLevels).to.equal(1);
    expect(vm.vTrackDefs.length).to.equal(4);
  });

  it("should stay loaded when flat data has no rows", () => {
    const vm = FlattenedDataViewModel.createBlank();
    vm.updateData({ data: [[], []], columnFacets: flatColFacets, rowFacet: [], rowMeta: new Uint8Array([]) });

    expect(vm.isDataLoaded()).to.be.true;
    expect(vm.isEmpty()).to.be.true;
    expect(vm.numRows).to.equal(0);
    expect(vm.numCols).to.equal(2);
    expect(vm.numRowFacetLevels).to.equal(1);
  });

  it("should slice headers with no rows", () => {
    const vm = PivotDataViewModel.createBlank();
    vm.updateData({ data: [[], [], [], []], columnFacets: colFacets1Level });

    const slice = vm.getSlice(0, 0, 4, 0);
    expect(slice.sliceNumRows).to.equal(0);
    expect(slice.sliceNumCols).to.equal(4);
    expect(slice.columnFacets).to.deep.equal([["P"], ["Q"], ["R"], ["S"]]);
    expect(slice.data).to.deep.equal([[], [], [], []]);
  });

  it("should return to the blank state on reset after an empty load", () => {
    const vm = PivotDataViewModel.createBlank();
    vm.updateData({ data: data4x5, columnFacets: colFacets1Level });
    vm.updateData({ data: [[], [], [], []], columnFacets: colFacets1Level });
    vm.reset();

    expectBlank(vm);
  });

  it("should return to the blank state on reset after an empty flat load", () => {
    const vm = FlattenedDataViewModel.createBlank();
    vm.updateData({ data: makeData(2, 5), columnFacets: flatColFacets, rowFacet: flatRowFacet, rowMeta: flatRowMeta });
    vm.updateData({ data: [[], []], columnFacets: flatColFacets, rowFacet: [], rowMeta: new Uint8Array([]) });
    vm.reset();

    expectBlank(vm);
  });
});
