import { expect } from "chai";
import { FlattenedDataViewModel, createRowMeta } from "./flattened-data-viewmodel";

const colFacets2Levels: string[][] = [
  ["A", "A", "B", "B"],
  ["X", "Y", "X", "Y"],
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

describe("createRowMeta", () => {
  it("should pack depth, isLeaf, isExpanded into a single byte", () => {
    const byte = createRowMeta(3, true, false);
    expect((byte >> 4) & 0x0F).to.equal(3);
    expect((byte & 0x08) !== 0).to.be.true;
    expect((byte & 0x04) !== 0).to.be.false;
  });

  it("should round-trip all depth values 0-15", () => {
    for (let depth = 0; depth <= 15; depth++) {
      for (const isLeaf of [true, false]) {
        for (const isExpanded of [true, false]) {
          const byte = createRowMeta(depth, isLeaf, isExpanded);
          expect((byte >> 4) & 0x0F).to.equal(depth);
          expect((byte & 0x08) !== 0).to.equal(isLeaf);
          expect((byte & 0x04) !== 0).to.equal(isExpanded);
        }
      }
    }
  });

});

describe("FlattenedDataViewModel", () => {
  const data4x5 = makeData(4, 5);
  const colFacets1Level: string[][] = [["P", "Q", "R", "S"]];
  const rowFacet = ["Group A", "Group A.0", "Group B", "Group B.0", "Group C"];
  const rowMetaBytes = new Uint8Array([
    createRowMeta(0, false, true),
    createRowMeta(1, true, false),
    createRowMeta(0, false, true),
    createRowMeta(1, true, false),
    createRowMeta(0, true, false),
  ]);

  describe("basic properties", () => {
    it("should always have numRowFacetLevels equal to 1", () => {
      const vm = new FlattenedDataViewModel({ data: data4x5, columnFacets: colFacets1Level, rowFacet, rowMeta: rowMetaBytes });
      expect(vm.numRowFacetLevels).to.equal(1);
    });

    it("should return correct numRows and numCols", () => {
      const vm = new FlattenedDataViewModel({ data: data4x5, columnFacets: colFacets1Level, rowFacet, rowMeta: rowMetaBytes });
      expect(vm.numRows).to.equal(5);
      expect(vm.numCols).to.equal(4);
    });

    it("should wrap rowFacet in level-major format", () => {
      const vm = new FlattenedDataViewModel({ data: data4x5, columnFacets: colFacets1Level, rowFacet, rowMeta: rowMetaBytes });
      expect(vm.rowFacets).to.deep.equal([rowFacet]);
    });

    it("should return numRowFacetLevels 0 when no rowFacet provided", () => {
      const vm = new FlattenedDataViewModel({ data: data4x5, columnFacets: colFacets1Level });
      expect(vm.numRowFacetLevels).to.equal(0);
      expect(vm.rowFacets).to.deep.equal([]);
    });
  });

  describe("getSlice", () => {
    it("should return only numRows/numCols for empty slice", () => {
      const vm = new FlattenedDataViewModel({ data: data4x5, columnFacets: colFacets1Level, rowFacet, rowMeta: rowMetaBytes });
      const result = vm.getSlice(0, 0, 0, 0);
      expect(result.numRows).to.equal(5);
      expect(result.numCols).to.equal(4);
      expect(result.data).to.be.undefined;
      expect(result.rowFacets).to.deep.equal([]);
      expect(result.rowMeta).to.deep.equal([]);
    });

    it("should slice full data range", () => {
      const vm = new FlattenedDataViewModel({ data: data4x5, columnFacets: colFacets1Level, rowFacet, rowMeta: rowMetaBytes });
      const result = vm.getSlice(0, 0, 4, 5);
      expect(result.data).to.deep.equal(data4x5);
      expect(result.columnFacets).to.deep.equal([["P"], ["Q"], ["R"], ["S"]]);
      expect(result.rowFacets).to.deep.equal(
        ["Group A", "Group A.0", "Group B", "Group B.0", "Group C"],
      );
    });

    it("should unpack rowMeta into FlatRowMeta objects", () => {
      const vm = new FlattenedDataViewModel({ data: data4x5, columnFacets: colFacets1Level, rowFacet, rowMeta: rowMetaBytes });
      const result = vm.getSlice(0, 0, 4, 5);
      expect(result.rowMeta).to.deep.equal([
        { depth: 0, isLeaf: false, isExpanded: true },
        { depth: 1, isLeaf: true, isExpanded: false },
        { depth: 0, isLeaf: false, isExpanded: true },
        { depth: 1, isLeaf: true, isExpanded: false },
        { depth: 0, isLeaf: true, isExpanded: false },
      ]);
    });

    it("should slice a sub-range with correct rowMeta", () => {
      const vm = new FlattenedDataViewModel({ data: data4x5, columnFacets: colFacets1Level, rowFacet, rowMeta: rowMetaBytes });
      const result = vm.getSlice(1, 2, 3, 4);
      expect(result.data).to.deep.equal([
        [102, 103],
        [202, 203],
      ]);
      expect(result.rowFacets).to.deep.equal(["Group B", "Group B.0"]);
      expect(result.rowMeta).to.deep.equal([
        { depth: 0, isLeaf: false, isExpanded: true },
        { depth: 1, isLeaf: true, isExpanded: false },
      ]);
    });

    it("should slice with 2-level column facets", () => {
      const data = makeData(4, 3);
      const rf = ["X", "Y", "Z"];
      const rm = new Uint8Array([createRowMeta(0, false, true), createRowMeta(1, true, false), createRowMeta(1, true, true)]);
      const vm = new FlattenedDataViewModel({ data, columnFacets: colFacets2Levels, rowFacet: rf, rowMeta: rm });
      const result = vm.getSlice(0, 0, 4, 3);
      expect(result.columnFacets).to.deep.equal([["A", "X"], ["A", "Y"], ["B", "X"], ["B", "Y"]]);
      expect(result.rowFacets).to.deep.equal(["X", "Y", "Z"]);
    });

    it("should always return full numRows/numCols regardless of slice", () => {
      const vm = new FlattenedDataViewModel({ data: data4x5, columnFacets: colFacets1Level, rowFacet, rowMeta: rowMetaBytes });
      const result = vm.getSlice(1, 2, 3, 4);
      expect(result.numRows).to.equal(5);
      expect(result.numCols).to.equal(4);
    });
  });

  describe("expand/collapse/toggleExpand", () => {
    it("should expand a collapsed row", () => {
      const rm = new Uint8Array([createRowMeta(0, false, false)]);
      const vm = new FlattenedDataViewModel({ data: [[1]], columnFacets: [["A"]], rowFacet: ["G"], rowMeta: rm });
      vm.expand(0);
      const result = vm.getSlice(0, 0, 1, 1);
      expect(result.rowMeta[0].isExpanded).to.be.true;
    });

    it("should collapse an expanded row", () => {
      const rm = new Uint8Array([createRowMeta(0, false, true)]);
      const vm = new FlattenedDataViewModel({ data: [[1]], columnFacets: [["A"]], rowFacet: ["G"], rowMeta: rm });
      vm.collapse(0);
      const result = vm.getSlice(0, 0, 1, 1);
      expect(result.rowMeta[0].isExpanded).to.be.false;
    });

    it("should toggle expand state", () => {
      const rm = new Uint8Array([createRowMeta(0, false, false)]);
      const vm = new FlattenedDataViewModel({ data: [[1]], columnFacets: [["A"]], rowFacet: ["G"], rowMeta: rm });
      vm.toggleExpand(0);
      expect(vm.getSlice(0, 0, 1, 1).rowMeta[0].isExpanded).to.be.true;
      vm.toggleExpand(0);
      expect(vm.getSlice(0, 0, 1, 1).rowMeta[0].isExpanded).to.be.false;
    });

    it("should not affect other bits when toggling", () => {
      const rm = new Uint8Array([createRowMeta(5, true, false)]);
      const vm = new FlattenedDataViewModel({ data: [[1]], columnFacets: [["A"]], rowFacet: ["G"], rowMeta: rm });
      vm.expand(0);
      const meta = vm.getSlice(0, 0, 1, 1).rowMeta[0];
      expect(meta.depth).to.equal(5);
      expect(meta.isLeaf).to.be.true;
      expect(meta.isExpanded).to.be.true;
    });
  });

  describe("updateData", () => {
    it("should replace all data", () => {
      const vm = new FlattenedDataViewModel({ data: [[1]], columnFacets: [["A"]], rowFacet: ["G"], rowMeta: new Uint8Array([createRowMeta(0, true, false)]) });
      const newData = makeData(3, 2);
      const newColFacets: string[][] = [["X", "Y", "Z"]];
      const newRowFacet = ["R1", "R2"];
      const newRowMeta = new Uint8Array([createRowMeta(0, false, true), createRowMeta(1, true, false)]);
      vm.updateData({ data: newData, columnFacets: newColFacets, rowFacet: newRowFacet, rowMeta: newRowMeta });
      expect(vm.numRows).to.equal(2);
      expect(vm.numCols).to.equal(3);
      expect(vm.rowFacets).to.deep.equal([newRowFacet]);
      const result = vm.getSlice(0, 0, 3, 2);
      expect(result.data).to.deep.equal(newData);
    });
  });
});
