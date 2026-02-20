import { expect } from "chai";
import { computeMerges, MergeState } from "./utils";

function order(a: MergeState[]) {
  // First sort based on level, then inside same level group (a.level-b.level would be zero) sort by start
  return a.slice(0).sort((a, b) => a.level - b.level || a.start - b.start);
}

describe.only("#computeMerges", () => {
  it("CASE: single level of facet", () => {
    const result = computeMerges(1, 4, [["a"], ["b"], ["c"], ["d"], ["e"], ["f"]]);
    expect(result).to.deep.equal([
      { level: 0, path: "a", value: "a", start: 0, span: 1 },
      { level: 0, path: "b", value: "b", start: 1, span: 1 },
      { level: 0, path: "c", value: "c", start: 2, span: 1 },
      { level: 0, path: "d", value: "d", start: 3, span: 1 },
    ]);
  });

  it("CASE: two level - not spanned", () => {
    const result = computeMerges(2, 4, [
      ["a0", "a1"],
      ["b0", "b1"],
      ["c0", "c1"],
      ["d0", "d1"],
      ["e0", "e1"],
      ["f0", "f1"]]);

    expect(result).to.deep.equal([
      { level: 0, path: "a0", value: "a0", start: 0, span: 1 },
      { level: 1, path: "a0\x00a1", value: "a1", start: 0, span: 1 },
      { level: 0, path: "b0", value: "b0", start: 1, span: 1 },
      { level: 1, path: "b0\x00b1", value: "b1", start: 1, span: 1 },
      { level: 0, path: "c0", value: "c0", start: 2, span: 1 },
      { level: 1, path: "c0\x00c1", value: "c1", start: 2, span: 1 },
      { level: 0, path: "d0", value: "d0", start: 3, span: 1 },
      { level: 1, path: "d0\x00d1", value: "d1", start: 3, span: 1 }
    ]);
  });

  it("CASE: multi level- spanned", () => {
    const result = computeMerges(2, 5, [
      ["l0", "a"],
      ["l0", "b"],
      ["l0", "c"],
      ["l1", "a"],
      ["l1", "d"]]);

    expect(order(result)).to.deep.equal([
      { level: 0, path: "l0", value: "l0", start: 0, span: 3 },
      { level: 0, path: "l1", value: "l1", start: 3, span: 2 },
      { level: 1, path: "l0\x00a", value: "a", start: 0, span: 1 },
      { level: 1, path: "l0\x00b", value: "b", start: 1, span: 1 },
      { level: 1, path: "l0\x00c", value: "c", start: 2, span: 1 },
      { level: 1, path: "l1\x00a", value: "a", start: 3, span: 1 },
      { level: 1, path: "l1\x00d", value: "d", start: 4, span: 1 }
    ]);
  });

  it("CASE: multi level - adjascent child with same label node across different parent", () => {
    const result = computeMerges(2, 4, [
      ["l0", "a"],
      ["l0", "b"],
      ["l1", "b"],
      ["l2", "b"]]);

    expect(order(result)).to.deep.equal([
      { level: 0, path: "l0", value: "l0", start: 0, span: 2 },
      { level: 0, path: "l1", value: "l1", start: 2, span: 1 },
      { level: 0, path: "l2", value: "l2", start: 3, span: 1 },
      { level: 1, path: "l0\x00a", value: "a", start: 0, span: 1 },
      { level: 1, path: "l0\x00b", value: "b", start: 1, span: 1 },
      { level: 1, path: "l1\x00b", value: "b", start: 2, span: 1 },
      { level: 1, path: "l2\x00b", value: "b", start: 3, span: 1 }
    ]);
  });

  it("CASE: single facet", () => {
    const result1 = computeMerges(1, 1, [["a"]]);
    expect(result1).to.deep.equal([
      { level: 0, path: "a", value: "a", start: 0, span: 1 },
    ]);

    const result2 = computeMerges(2, 1, [["a", "b"]]);
    expect(result2).to.deep.equal([
      { level: 0, path: "a", value: "a", start: 0, span: 1 },
      { level: 1, path: "a\u0000b", value: "b", start: 0, span: 1 },
    ]);
  });

  it("CASE: should span based on secondary axis as well", () => {
    // thin the structure for row facet (for column facet it's the same as well, it's just conveneint to think it as a
    // row facet)
    const data = [
      // -> merge nulls (secondary axis)
      ["l0_0", null, null],
      ["l0_0", "l1_0", "a"],
      ["l0_0", "l1_0", "b"],
      ["l0_0", "l1_0", "b"],
      ["l0_0", "l1_1", null],
      ["l0_0", "l1_1", "c"],
      ["l0_1", null, null],
      ["l0_2", null, null],
      ["l0_2", null, null],
      ["l0_2", null, "e"],
      ["l0_2", "l1_0", null],
      ["l0_2", "l1_0", null],
      ["l0_2", "l1_0", "e"],
      ["l0_2", "l1_0", "f"],
    ];
  });
});
