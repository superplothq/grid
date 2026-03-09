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
      const vm = new FlattenedDataViewModel(data4x5, colFacets1Level, rowFacet, rowMetaBytes);
      expect(vm.numRowFacetLevels).to.equal(1);
    });

    it("should return correct numRows and numCols", () => {
      const vm = new FlattenedDataViewModel(data4x5, colFacets1Level, rowFacet, rowMetaBytes);
      expect(vm.numRows).to.equal(5);
      expect(vm.numCols).to.equal(4);
    });

    it("should wrap rowFacet in level-major format", () => {
      const vm = new FlattenedDataViewModel(data4x5, colFacets1Level, rowFacet, rowMetaBytes);
      expect(vm.rowFacets).to.deep.equal([rowFacet]);
    });

    it("should return numRowFacetLevels 0 when no rowFacet provided", () => {
      const vm = new FlattenedDataViewModel(data4x5, colFacets1Level);
      expect(vm.numRowFacetLevels).to.equal(0);
      expect(vm.rowFacets).to.deep.equal([]);
    });
  });

  describe("getSlice", () => {
    it("should return only numRows/numCols for empty slice", () => {
      const vm = new FlattenedDataViewModel(data4x5, colFacets1Level, rowFacet, rowMetaBytes);
      const result = vm.getSlice(0, 0, 0, 0);
      expect(result.numRows).to.equal(5);
      expect(result.numCols).to.equal(4);
      expect(result.data).to.be.undefined;
      expect(result.rowFacets).to.deep.equal([]);
      expect(result.rowMeta).to.deep.equal([]);
    });

    it("should slice full data range", () => {
      const vm = new FlattenedDataViewModel(data4x5, colFacets1Level, rowFacet, rowMetaBytes);
      const result = vm.getSlice(0, 0, 4, 5);
      expect(result.data).to.deep.equal(data4x5);
      expect(result.columnFacets).to.deep.equal([["P"], ["Q"], ["R"], ["S"]]);
      expect(result.rowFacets).to.deep.equal(
        ["Group A", "Group A.0", "Group B", "Group B.0", "Group C"],
      );
    });

    it("should unpack rowMeta into FlatRowMeta objects", () => {
      const vm = new FlattenedDataViewModel(data4x5, colFacets1Level, rowFacet, rowMetaBytes);
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
      const vm = new FlattenedDataViewModel(data4x5, colFacets1Level, rowFacet, rowMetaBytes);
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
      const vm = new FlattenedDataViewModel(data, colFacets2Levels, rf, rm);
      const result = vm.getSlice(0, 0, 4, 3);
      expect(result.columnFacets).to.deep.equal([["A", "X"], ["A", "Y"], ["B", "X"], ["B", "Y"]]);
      expect(result.rowFacets).to.deep.equal(["X", "Y", "Z"]);
    });

    it("should always return full numRows/numCols regardless of slice", () => {
      const vm = new FlattenedDataViewModel(data4x5, colFacets1Level, rowFacet, rowMetaBytes);
      const result = vm.getSlice(1, 2, 3, 4);
      expect(result.numRows).to.equal(5);
      expect(result.numCols).to.equal(4);
    });
  });

  describe("expand/collapse/toggleExpand", () => {
    it("should expand a collapsed row", () => {
      const rm = new Uint8Array([createRowMeta(0, false, false)]);
      const vm = new FlattenedDataViewModel([[1]], [["A"]], ["G"], rm);
      vm.expand(0);
      const result = vm.getSlice(0, 0, 1, 1);
      expect(result.rowMeta[0].isExpanded).to.be.true;
    });

    it("should collapse an expanded row", () => {
      const rm = new Uint8Array([createRowMeta(0, false, true)]);
      const vm = new FlattenedDataViewModel([[1]], [["A"]], ["G"], rm);
      vm.collapse(0);
      const result = vm.getSlice(0, 0, 1, 1);
      expect(result.rowMeta[0].isExpanded).to.be.false;
    });

    it("should toggle expand state", () => {
      const rm = new Uint8Array([createRowMeta(0, false, false)]);
      const vm = new FlattenedDataViewModel([[1]], [["A"]], ["G"], rm);
      vm.toggleExpand(0);
      expect(vm.getSlice(0, 0, 1, 1).rowMeta[0].isExpanded).to.be.true;
      vm.toggleExpand(0);
      expect(vm.getSlice(0, 0, 1, 1).rowMeta[0].isExpanded).to.be.false;
    });

    it("should not affect other bits when toggling", () => {
      const rm = new Uint8Array([createRowMeta(5, true, false)]);
      const vm = new FlattenedDataViewModel([[1]], [["A"]], ["G"], rm);
      vm.expand(0);
      const meta = vm.getSlice(0, 0, 1, 1).rowMeta[0];
      expect(meta.depth).to.equal(5);
      expect(meta.isLeaf).to.be.true;
      expect(meta.isExpanded).to.be.true;
    });
  });

  describe("ancestor backtracking", () => {
    const data = makeData(3, 8);
    const colFacets: string[][] = [["A", "B", "C"]];
    const rf = ["Root", "L1-A", "L2-A", "L2-B", "L1-B", "L2-C", "Root2", "L1-C"];
    const rm = new Uint8Array([
      createRowMeta(0, false, true),   // 0: Root     depth=0
      createRowMeta(1, false, true),   // 1: L1-A     depth=1
      createRowMeta(2, true, false),   // 2: L2-A     depth=2
      createRowMeta(2, true, false),   // 3: L2-B     depth=2
      createRowMeta(1, false, true),   // 4: L1-B     depth=1
      createRowMeta(2, true, false),   // 5: L2-C     depth=2
      createRowMeta(0, false, true),   // 6: Root2    depth=0
      createRowMeta(1, true, false),   // 7: L1-C     depth=1
    ]);

    it("should not prepend ancestors when y0 is 0", () => {
      const vm = new FlattenedDataViewModel(data, colFacets, rf, rm);
      const result = vm.getSlice(0, 0, 3, 3);
      expect(result.sliceNumRows).to.equal(3);
      expect(result.rowFacets).to.deep.equal(["Root", "L1-A", "L2-A"]);
      expect(result.rowMeta.some(m => m.isAncestor)).to.be.false;
      expect(result.data).to.deep.equal([[0, 1, 2], [100, 101, 102], [200, 201, 202]]);
    });

    it("should not prepend ancestors when depth of y0 is 0", () => {
      const vm = new FlattenedDataViewModel(data, colFacets, rf, rm);
      const result = vm.getSlice(0, 6, 3, 8);
      expect(result.sliceNumRows).to.equal(2);
      expect(result.rowFacets).to.deep.equal(["Root2", "L1-C"]);
      expect(result.rowMeta.some(m => m.isAncestor)).to.be.false;
      expect(result.data).to.deep.equal([[6, 7], [106, 107], [206, 207]]);
    });

    it("should prepend single ancestor at depth 0 for row at depth 1", () => {
      const vm = new FlattenedDataViewModel(data, colFacets, rf, rm);
      const result = vm.getSlice(0, 4, 3, 6);
      expect(result.sliceNumRows).to.equal(3);
      expect(result.rowFacets).to.deep.equal(["Root", "L1-B", "L2-C"]);
      expect(result.rowMeta[0]).to.deep.equal({ depth: 0, isLeaf: false, isExpanded: true, isAncestor: true });
      expect(result.rowMeta[1].isAncestor).to.be.undefined;
      expect(result.rowMeta[2].isAncestor).to.be.undefined;
      expect(result.data).to.deep.equal([[0, 4, 5], [100, 104, 105], [200, 204, 205]]);
    });

    it("should prepend multiple ancestors for row at depth 2", () => {
      const vm = new FlattenedDataViewModel(data, colFacets, rf, rm);
      const result = vm.getSlice(0, 5, 3, 6);
      expect(result.sliceNumRows).to.equal(3);
      expect(result.rowFacets).to.deep.equal(["Root", "L1-B", "L2-C"]);
      expect(result.rowMeta[0]).to.deep.equal({ depth: 0, isLeaf: false, isExpanded: true, isAncestor: true });
      expect(result.rowMeta[1]).to.deep.equal({ depth: 1, isLeaf: false, isExpanded: true, isAncestor: true });
      expect(result.rowMeta[2].isAncestor).to.be.undefined;
      expect(result.data).to.deep.equal([[0, 4, 5], [100, 104, 105], [200, 204, 205]]);
    });
  });

  describe("updateData", () => {
    it("should replace all data", () => {
      const vm = new FlattenedDataViewModel([[1]], [["A"]], ["G"], new Uint8Array([createRowMeta(0, true, false)]));
      const newData = makeData(3, 2);
      const newColFacets: string[][] = [["X", "Y", "Z"]];
      const newRowFacet = ["R1", "R2"];
      const newRowMeta = new Uint8Array([createRowMeta(0, false, true), createRowMeta(1, true, false)]);
      vm.updateData(newData, newColFacets, newRowFacet, newRowMeta);
      expect(vm.numRows).to.equal(2);
      expect(vm.numCols).to.equal(3);
      expect(vm.rowFacets).to.deep.equal([newRowFacet]);
      const result = vm.getSlice(0, 0, 3, 2);
      expect(result.data).to.deep.equal(newData);
    });
  });
});
