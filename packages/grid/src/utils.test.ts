import assert from "node:assert";
import { praseGridCellValue } from "./utils";

describe("#praseGridCellValue", () => {
  it("should parse gridColumn without span", () => {
    assert.deepEqual(praseGridCellValue("1", "gridColumn"), [1, 1]);
    assert.deepEqual(praseGridCellValue(" 5 ", "gridColumn"), [5, 1]);
    assert.deepEqual(praseGridCellValue(" px ", "gridColumn"), [-1, -1]);
  });
  it("should parse gridColumn with span", () => {
    assert.deepEqual(praseGridCellValue("1 / span 3", "gridColumn"), [1, 3]);
    assert.deepEqual(praseGridCellValue(" 5 / span 1 ", "gridColumn"), [5, 1]);
    assert.deepEqual(praseGridCellValue(" 10 / 11 / span 2", "gridColumn"), [-1, -1]);
  });
});
