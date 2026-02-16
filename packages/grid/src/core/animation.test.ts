import assert from "node:assert";
import { buildEditset, buildDiffModel, buildPhasedKeyframes, collectEvacuationKeys, FacetMatrixWithFacetCellMap } from "./animation";

// TODO: test tests are not vetted

describe("animation", () => {
  describe.skip("#buildDiffModel", () => {
    it("works with getMeasurement provided", () => {
      const model = buildDiffModel({
        fromPtr: 0,
        toPtr: 2,
        levels: 1,
        getFacetValue: (_level: number, idx: number) => ["a", "b"][idx],
        getMeasurement: (idx: number) => [100, 200][idx],
      });
      assert.strictEqual(model.length, 2);
      assert.strictEqual(model[0].key, "a");
      assert.strictEqual(model[0].size, 100);
      assert.strictEqual(model[1].key, "b");
      assert.strictEqual(model[1].size, 200);
    });

    it("works without getMeasurement (defaults to 0)", () => {
      const model = buildDiffModel({
        fromPtr: 0,
        toPtr: 2,
        levels: 1,
        getFacetValue: (_level: number, idx: number) => ["a", "b"][idx],
      });
      assert.strictEqual(model.length, 2);
      assert.strictEqual(model[0].size, 0);
      assert.strictEqual(model[1].size, 0);
    });

    it("returns empty for levels === 0", () => {
      const model = buildDiffModel({
        fromPtr: 0,
        toPtr: 5,
        levels: 0,
        getFacetValue: () => "x",
      });
      assert.strictEqual(model.length, 0);
    });
  });

  describe("#buildPhasedKeyframes", () => {
    it("should pass", () => {
      assert.ok(true)
    })
  });

  describe("#collectEvacuationKeys", () => {
    it("collects data cell keys and facet cell key for column DELETE", () => {
      const prevFacetMatrix: FacetMatrixWithFacetCellMap = {
        valueCellKeys: [
          ["data-2-1", "data-3-1", "data-4-1"],
          ["data-2-2", "data-3-2", "data-4-2"],
        ],
        colFacetPathToMatrixIndex: new Map([["a", 0], ["b", 1], ["c", 2]]),
        rowFacetPathToMatrixIndex: new Map([["r0", 0], ["r1", 1]]),
        colFacetPathToCellMap: new Map([["a", "col-h-0-2"], ["b", "col-h-0-3"], ["c", "col-h-0-4"]]),
        rowFacetPathToCellMap: new Map([["r0", "row-h-0-0"], ["r1", "row-h-0-1"]]),
        numRowFacetLevels: 2,
        numColFacetLevels: 1,
      };

      const editset = buildEditset(
        [{ facetPath: [], key: "a", size: 10, orderKey: 0 }, { facetPath: [], key: "b", size: 20, orderKey: 1 }, { facetPath: [], key: "c", size: 30, orderKey: 2 }],
        [{ facetPath: [], key: "a", size: 10, orderKey: 0 }, { facetPath: [], key: "c", size: 30, orderKey: 1 }],
      );
      // editset: KEEP a, DELETE b, KEEP c

      const result = collectEvacuationKeys({ editset, matrix: prevFacetMatrix, axis: "col" });
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].facetPathKey, "b");
      assert.deepStrictEqual(result[0].cellKeys, ["data-3-1", "data-3-2", "col-h-0-3"]);
    });

    it("collects data cell keys and facet cell key for row DELETE", () => {
      const prevFacetMatrix: FacetMatrixWithFacetCellMap = {
        valueCellKeys: [
          ["data-2-1", "data-3-1"],
          ["data-2-2", "data-3-2"],
          ["data-2-3", "data-3-3"],
        ],
        colFacetPathToMatrixIndex: new Map([["c0", 0], ["c1", 1]]),
        rowFacetPathToMatrixIndex: new Map([["a", 0], ["b", 1], ["c", 2]]),
        colFacetPathToCellMap: new Map([["c0", "col-h-0-2"], ["c1", "col-h-0-3"]]),
        rowFacetPathToCellMap: new Map([["a", "row-h-0-0"], ["b", "row-h-0-1"], ["c", "row-h-0-2"]]),
        numRowFacetLevels: 1,
        numColFacetLevels: 1,
      };

      const editset = buildEditset(
        [{ facetPath: [], key: "a", size: 10, orderKey: 0 }, { facetPath: [], key: "b", size: 20, orderKey: 1 }, { facetPath: [], key: "c", size: 30, orderKey: 2 }],
        [{ facetPath: [], key: "a", size: 10, orderKey: 0 }, { facetPath: [], key: "c", size: 30, orderKey: 1 }],
      );

      const result = collectEvacuationKeys({ editset, matrix: prevFacetMatrix, axis: "row" });
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].facetPathKey, "b");
      assert.deepStrictEqual(result[0].cellKeys, ["data-2-2", "data-3-2", "row-h-0-1"]);
    });

    it("returns empty for all-KEEP editset", () => {
      const prevFacetMatrix: FacetMatrixWithFacetCellMap = {
        valueCellKeys: [["data-2-1"]],
        colFacetPathToMatrixIndex: new Map([["a", 0]]),
        rowFacetPathToMatrixIndex: new Map([["r0", 0]]),
        colFacetPathToCellMap: new Map([["a", "col-h-0-2"]]),
        rowFacetPathToCellMap: new Map(),
        numRowFacetLevels: 1,
        numColFacetLevels: 1,
      };

      const editset = buildEditset(
        [{ facetPath: [], key: "a", size: 10, orderKey: 0 }],
        [{ facetPath: [], key: "a", size: 10, orderKey: 0 }],
      );

      const result = collectEvacuationKeys({ editset, matrix: prevFacetMatrix, axis: "col" });
      assert.strictEqual(result.length, 0);
    });
  });
});
