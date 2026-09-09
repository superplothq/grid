import { expect } from "chai";
import { computeMerges, resolveFacetSpan, MergeState } from "./utils";

function order(a: MergeState[]) {
  // First sort based on level, then inside same level group (a.level-b.level would be zero) sort by start
  return a.slice(0).sort((a, b) => a.level - b.level || a.start - b.start);
}

describe("#computeMerges", () => {
  it("CASE: single level of facet", () => {
    const result = computeMerges(1, 4, [["a"], ["b"], ["c"], ["d"], ["e"], ["f"]]);
    expect(result).to.deep.equal([
      { level: 0, path: "a", value: "a", start: 0, spanPrimary: 1, spanSecondary: 1 },
      { level: 0, path: "b", value: "b", start: 1, spanPrimary: 1, spanSecondary: 1 },
      { level: 0, path: "c", value: "c", start: 2, spanPrimary: 1, spanSecondary: 1 },
      { level: 0, path: "d", value: "d", start: 3, spanPrimary: 1, spanSecondary: 1 },
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
      { level: 0, path: "a0", value: "a0", start: 0, spanPrimary: 1, spanSecondary: 1 },
      { level: 1, path: "a0\x00a1", value: "a1", start: 0, spanPrimary: 1, spanSecondary: 1 },
      { level: 0, path: "b0", value: "b0", start: 1, spanPrimary: 1, spanSecondary: 1 },
      { level: 1, path: "b0\x00b1", value: "b1", start: 1, spanPrimary: 1, spanSecondary: 1 },
      { level: 0, path: "c0", value: "c0", start: 2, spanPrimary: 1, spanSecondary: 1 },
      { level: 1, path: "c0\x00c1", value: "c1", start: 2, spanPrimary: 1, spanSecondary: 1 },
      { level: 0, path: "d0", value: "d0", start: 3, spanPrimary: 1, spanSecondary: 1 },
      { level: 1, path: "d0\x00d1", value: "d1", start: 3, spanPrimary: 1, spanSecondary: 1 }
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
      { level: 0, path: "l0", value: "l0", start: 0, spanPrimary: 3, spanSecondary: 1 },
      { level: 0, path: "l1", value: "l1", start: 3, spanPrimary: 2, spanSecondary: 1 },
      { level: 1, path: "l0\x00a", value: "a", start: 0, spanPrimary: 1, spanSecondary: 1 },
      { level: 1, path: "l0\x00b", value: "b", start: 1, spanPrimary: 1, spanSecondary: 1 },
      { level: 1, path: "l0\x00c", value: "c", start: 2, spanPrimary: 1, spanSecondary: 1 },
      { level: 1, path: "l1\x00a", value: "a", start: 3, spanPrimary: 1, spanSecondary: 1 },
      { level: 1, path: "l1\x00d", value: "d", start: 4, spanPrimary: 1, spanSecondary: 1 }
    ]);
  });

  it("CASE: multi level - adjascent child with same label node across different parent", () => {
    const result = computeMerges(2, 4, [
      ["l0", "a"],
      ["l0", "b"],
      ["l1", "b"],
      ["l2", "b"]]);

    expect(order(result)).to.deep.equal([
      { level: 0, path: "l0", value: "l0", start: 0, spanPrimary: 2, spanSecondary: 1 },
      { level: 0, path: "l1", value: "l1", start: 2, spanPrimary: 1, spanSecondary: 1 },
      { level: 0, path: "l2", value: "l2", start: 3, spanPrimary: 1, spanSecondary: 1 },
      { level: 1, path: "l0\x00a", value: "a", start: 0, spanPrimary: 1, spanSecondary: 1 },
      { level: 1, path: "l0\x00b", value: "b", start: 1, spanPrimary: 1, spanSecondary: 1 },
      { level: 1, path: "l1\x00b", value: "b", start: 2, spanPrimary: 1, spanSecondary: 1 },
      { level: 1, path: "l2\x00b", value: "b", start: 3, spanPrimary: 1, spanSecondary: 1 }
    ]);
  });

  it("CASE: single facet", () => {
    const result1 = computeMerges(1, 1, [["a"]]);
    expect(result1).to.deep.equal([
      { level: 0, path: "a", value: "a", start: 0, spanPrimary: 1, spanSecondary: 1 },
    ]);

    const result2 = computeMerges(2, 1, [["a", "b"]]);
    expect(result2).to.deep.equal([
      { level: 0, path: "a", value: "a", start: 0, spanPrimary: 1, spanSecondary: 1 },
      { level: 1, path: "a\u0000b", value: "b", start: 0, spanPrimary: 1, spanSecondary: 1 },
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

    const result = computeMerges(3, 14, data);
    expect(order(result)).to.deep.equal([
      // level 0
      { level: 0, path: "l0_0", value: "l0_0", start: 0, spanPrimary: 1, spanSecondary: 3 },
      { level: 0, path: "l0_0", value: "l0_0", start: 1, spanPrimary: 5, spanSecondary: 1 },
      { level: 0, path: "l0_1", value: "l0_1", start: 6, spanPrimary: 1, spanSecondary: 3 },
      { level: 0, path: "l0_2", value: "l0_2", start: 7, spanPrimary: 2, spanSecondary: 3 },
      { level: 0, path: "l0_2", value: "l0_2", start: 9, spanPrimary: 1, spanSecondary: 2 },
      { level: 0, path: "l0_2", value: "l0_2", start: 10, spanPrimary: 4, spanSecondary: 1 },
      // level 1
      { level: 1, path: "l0_0\x00l1_0", value: "l1_0", start: 1, spanPrimary: 3, spanSecondary: 1 },
      { level: 1, path: "l0_0\x00l1_1", value: "l1_1", start: 4, spanPrimary: 1, spanSecondary: 2 },
      { level: 1, path: "l0_0\x00l1_1", value: "l1_1", start: 5, spanPrimary: 1, spanSecondary: 1 },
      { level: 1, path: "l0_2\x00l1_0", value: "l1_0", start: 10, spanPrimary: 2, spanSecondary: 2 },
      { level: 1, path: "l0_2\x00l1_0", value: "l1_0", start: 12, spanPrimary: 2, spanSecondary: 1 },
      // level 2
      { level: 2, path: "l0_0\x00l1_0\x00a", value: "a", start: 1, spanPrimary: 1, spanSecondary: 1 },
      { level: 2, path: "l0_0\x00l1_0\x00b", value: "b", start: 2, spanPrimary: 2, spanSecondary: 1 },
      { level: 2, path: "l0_0\x00l1_1\x00c", value: "c", start: 5, spanPrimary: 1, spanSecondary: 1 },
      { level: 2, path: "l0_2\x00\x00e", value: "e", start: 9, spanPrimary: 1, spanSecondary: 1 },
      { level: 2, path: "l0_2\x00l1_0\x00e", value: "e", start: 12, spanPrimary: 1, spanSecondary: 1 },
      { level: 2, path: "l0_2\x00l1_0\x00f", value: "f", start: 13, spanPrimary: 1, spanSecondary: 1 },
    ]);
  });
});

describe("#resolveFacetSpan", () => {
  // level-major: facets[level][index]
  const facets: (string | null)[][] = [
    ["X", "X", "X", "Y", "Y", "Y"],
    ["A", "A", "B", "B", "B", "C"],
  ];

  it("CASE: leaf level resolves to the run of equal paths", () => {
    expect(resolveFacetSpan(facets, 1, 0)).to.deep.equal([0, 1]);
    expect(resolveFacetSpan(facets, 1, 1)).to.deep.equal([0, 1]);
    expect(resolveFacetSpan(facets, 1, 5)).to.deep.equal([5, 5]);
  });

  it("CASE: parent level spans all its children", () => {
    expect(resolveFacetSpan(facets, 0, 1)).to.deep.equal([0, 2]);
    expect(resolveFacetSpan(facets, 0, 4)).to.deep.equal([3, 5]);
  });

  it("CASE: same value under different parents does not merge", () => {
    expect(resolveFacetSpan(facets, 1, 2)).to.deep.equal([2, 2]);
    expect(resolveFacetSpan(facets, 1, 3)).to.deep.equal([3, 4]);
  });

  it("CASE: a null-padded item does not merge with a neighbour that has children", () => {
    // item-major: ["A", null], ["A", "X"], ["A", "Y"], ["B", null], ["B", null]
    const padded: (string | null)[][] = [
      ["A", "A", "A", "B", "B"],
      [null, "X", "Y", null, null],
    ];
    expect(resolveFacetSpan(padded, 0, 0)).to.deep.equal([0, 0]);
    expect(resolveFacetSpan(padded, 0, 1)).to.deep.equal([1, 2]);
    expect(resolveFacetSpan(padded, 0, 4)).to.deep.equal([3, 4]);
  });
});
