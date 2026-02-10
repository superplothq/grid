import assert from "node:assert";
import { buildEditset, buildDiffModel, buildPhasedKeyframes, collectEvacuationKeys, FacetMatrixWithFacetCellMap } from "./animation";

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
    it("returns empty for all-KEEP editset", () => {
      const editset = buildEditset(
        [{ facetPath: [], key: "a", size: 10, orderKey: 0 }, { facetPath: [], key: "b", size: 20, orderKey: 1 }],
        [{ facetPath: [], key: "a", size: 10, orderKey: 0 }, { facetPath: [], key: "b", size: 20, orderKey: 1 }],
      );
      const keyframes = buildPhasedKeyframes({
        editset,
        oldTemplate: "50px 100px 200px",
        newTemplate: "50px 100px 200px",
        facetTrackCount: 1,
        templateProperty: "gridTemplateColumns",
      });
      assert.strictEqual(keyframes.length, 0);
    });

    it("single INSERT produces 2 keyframes", () => {
      const editset = buildEditset(
        [{ facetPath: [], key: "a", size: 10, orderKey: 0 }],
        [{ facetPath: [], key: "a", size: 10, orderKey: 0 }, { facetPath: [], key: "b", size: 20, orderKey: 1 }],
      );
      const keyframes = buildPhasedKeyframes({
        editset,
        oldTemplate: "50px 100px",
        newTemplate: "50px 100px 200px",
        facetTrackCount: 1,
        templateProperty: "gridTemplateColumns",
      });
      assert.strictEqual(keyframes.length, 2);
      assert.strictEqual(keyframes[0].offset, 0);
      assert.strictEqual(keyframes[1].offset, 1);
      assert.strictEqual(keyframes[0].gridTemplateColumns, "50px 100px 0px");
      assert.strictEqual(keyframes[1].gridTemplateColumns, "50px 100px 200px");
    });

    it("single DELETE produces 2 keyframes", () => {
      const editset = buildEditset(
        [{ facetPath: [], key: "a", size: 10, orderKey: 0 }, { facetPath: [], key: "b", size: 20, orderKey: 1 }],
        [{ facetPath: [], key: "a", size: 10, orderKey: 0 }],
      );
      const keyframes = buildPhasedKeyframes({
        editset,
        oldTemplate: "50px 100px 200px",
        newTemplate: "50px 100px",
        facetTrackCount: 1,
        templateProperty: "gridTemplateColumns",
      });
      assert.strictEqual(keyframes.length, 2);
      assert.strictEqual(keyframes[0].gridTemplateColumns, "50px 100px 200px");
      assert.strictEqual(keyframes[1].gridTemplateColumns, "50px 100px 0px");
    });

    it("mixed DELETE then INSERT produces cascading 3 keyframes", () => {
      const editset = buildEditset(
        [{ facetPath: [], key: "a", size: 10, orderKey: 0 }, { facetPath: [], key: "b", size: 20, orderKey: 1 }, { facetPath: [], key: "c", size: 30, orderKey: 2 }],
        [{ facetPath: [], key: "a", size: 10, orderKey: 0 }, { facetPath: [], key: "c", size: 30, orderKey: 1 }, { facetPath: [], key: "x", size: 40, orderKey: 2 }],
      );
      // editset: KEEP a, DELETE b, KEEP c, INSERT x
      const keyframes = buildPhasedKeyframes({
        editset,
        oldTemplate: "50px 100px 200px 300px",
        newTemplate: "50px 100px 300px 400px",
        facetTrackCount: 1,
        templateProperty: "gridTemplateColumns",
      });
      assert.strictEqual(keyframes.length, 3);
      assert.strictEqual(keyframes[0].offset, 0);
      assert.strictEqual(keyframes[1].offset, 0.5);
      assert.strictEqual(keyframes[2].offset, 1);
      // start: [KEEP a_old=100px, DELETE b_old=200px, KEEP c_old=300px, INSERT x=0px]
      assert.strictEqual(keyframes[0].gridTemplateColumns, "50px 100px 200px 300px 0px");
      // phase 1: DELETE b shrinks to 0px
      assert.strictEqual(keyframes[1].gridTemplateColumns, "50px 100px 0px 300px 0px");
      // phase 2: INSERT x grows to 400px
      assert.strictEqual(keyframes[2].gridTemplateColumns, "50px 100px 0px 300px 400px");
    });

    it("uses gridTemplateRows when specified", () => {
      const editset = buildEditset(
        [{ facetPath: [], key: "a", size: 10, orderKey: 0 }],
        [{ facetPath: [], key: "a", size: 10, orderKey: 0 }, { facetPath: [], key: "b", size: 20, orderKey: 1 }],
      );
      const keyframes = buildPhasedKeyframes({
        editset,
        oldTemplate: "30px 40px",
        newTemplate: "30px 40px 50px",
        facetTrackCount: 1,
        templateProperty: "gridTemplateRows",
      });
      assert.strictEqual(keyframes.length, 2);
      assert.ok("gridTemplateRows" in keyframes[0]);
      assert.ok(!("gridTemplateColumns" in keyframes[0]));
    });
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
