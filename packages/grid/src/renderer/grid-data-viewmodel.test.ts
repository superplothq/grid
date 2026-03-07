import { expect } from "chai";
import { MetaState } from "./grid-data-viewmodel";
import { PivotDataViewModel } from "./pivot-data-viewmodel";

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
    const vm = new PivotDataViewModel(data4x5, colFacets1Level);
    vm.metaState.set("test", "loading", true);
    expect(vm.metaState.get("test")).to.deep.equal({ loading: true });
  });
});

describe("GridDataViewModel.getSlice", () => {
  describe("1 column facet level, no row facets", () => {
    let vm: PivotDataViewModel;

    beforeEach(() => {
      vm = new PivotDataViewModel(data4x5, colFacets1Level);
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
      vm = new PivotDataViewModel(data6x8, colFacets2Levels, rowFacets3Levels);
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
