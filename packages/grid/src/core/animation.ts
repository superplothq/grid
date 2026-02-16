import { GridDataViewModel } from "../grid-data-viewmodel";

interface DiffItem {
  facetPath: string[];
  key: string;
  size: number;
  orderKey: number;
}

export type DiffModel = DiffItem[];

export interface DiffModelSnapshot { columns: DiffModel; rows: DiffModel }

export interface AnimationConfig {
  duration: number;
  easing: string;
}

export const SEPARATOR = "\0";

// To animate between old and new layouts, we need a merged spatial ordering that
// tells us exactly what changed and where. We compute this via the Longest Common
// Subsequence (LCS) of the old and new facet key arrays.
//
// Given old = [A, X, B, C, D] and new = [A, B, Y, C, D]:
//   LCS = [A, B, C, D]
//
// Backtracking through the DP table produces an edit script:
//   KEEP A   ← in both, part of LCS
//   DELETE X ← in old only
//   KEEP B
//   INSERT Y ← in new only
//   KEEP C
//   KEEP D
//
// For reordering (e.g. swap A,B → B,A), one element falls out of LCS and becomes
// a DELETE + INSERT pair. This is acceptable since reordering is rare in grids.
//
// KEEP entries are further classified:
//   - NOOP:   same position, same size — no animation needed
//   - MOVE:   position changed, size same — translate animation
//   - UPDATE: size changed — translate + clip animation
//
// The edit script is then swept left-to-right to accumulate animations per cell.

export const enum EditAction { INSERT = "i", DELETE = "d", KEEP = "k" }

export interface EditEntry {
  action: EditAction;
  key: string;
  oldItem?: DiffItem;
  newItem?: DiffItem;
}

export function buildEditset(oldItems: DiffModel, newItems: DiffModel): EditEntry[] {
  const m = oldItems.length;
  const n = newItems.length;

  const dp: number[][] = [];
  for (let i = 0; i <= m; i++) {
    dp[i] = new Array(n + 1).fill(0);
  }
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldItems[i - 1].key === newItems[j - 1].key) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to produce edit script in forward order
  const script: EditEntry[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldItems[i - 1].key === newItems[j - 1].key) {
      script.push({ action: EditAction.KEEP, key: oldItems[i - 1].key, oldItem: oldItems[i - 1], newItem: newItems[j - 1] });
      i--; j--;
    } else if (i > 0 && (j === 0 || dp[i - 1][j] > dp[i][j - 1])) {
      script.push({ action: EditAction.DELETE, key: oldItems[i - 1].key, oldItem: oldItems[i - 1] });
      i--;
    } else {
      script.push({ action: EditAction.INSERT, key: newItems[j - 1].key, newItem: newItems[j - 1] });
      j--;
    }
  }

  script.reverse();

  // TODO Sometimes the keys are not ordered properly and it messes with merging
  // It's not quite a bug; it's something like -> should INSERT be followed by DELETE or vice versa
  // For either case there might be an ordering issue
  // For exmaple: you'd see
  // CF0_0CF_10_CF_2_0 KEEP
  // CF0_1CF_10_CF_2_1 INSERT
  // CF0_0CF_10_CF_2_0 DELETE
  // This messes up with downstream merging of facets as CF0_0 comes after CF0_1. Ideally this should be grouped sorted
  // CF0_0CF_10_CF_2_0 KEEP
  // CF0_0CF_10_CF_2_0 DELETE
  // CF0_1CF_10_CF_2_1 INSERT

  return script;
}

export function buildDiffModel(opts: {
  fromPtr: number;
  toPtr: number;
  levels: number;
  getFacetValue: (level: number, idx: number) => string | undefined;
  getMeasurement?: (idx: number) => number;
}): DiffModel {
  const result: DiffModel = [];
  if (opts.levels === 0) return result;
  // Sometimes we want to create diff model just based on keys without any measurements
  const measure = opts.getMeasurement ?? (() => 0);

  for (let i = opts.fromPtr; i < opts.toPtr; i++) {
    const facetPath: string[] = [];
    for (let level = 0; level < opts.levels; level++) {
      facetPath.push(opts.getFacetValue(level, i) ?? "");
    }
    const key = facetPath.join(SEPARATOR);
    result.push({
      facetPath,
      key,
      size: measure(i),
      orderKey: i,
    });

  }
  return result;
}

export interface FacetMatrix {
  valueCellKeys: string[][]; // m x n
  colFacetPathToMatrixIndex: Map<string, number>; // size n
  rowFacetPathToMatrixIndex: Map<string, number>; // size m
}
export function buildFacetMatrix(opts: {
  data: GridDataViewModel;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  numRowFacetLevels: number;
  numColFacetLevels: number;
}): FacetMatrix {
  const { data, x0, y0, x1, y1, numRowFacetLevels, numColFacetLevels } = opts;

  const matrix: FacetMatrix = {
    //                        rows                                cols
    valueCellKeys: new Array(y1 - y0).fill(0).map(() => new Array(x1 - x0)),
    colFacetPathToMatrixIndex: new Map(),
    rowFacetPathToMatrixIndex: new Map(),
  };

  for (let col = x0; col < x1; col++) {
    const absoluteColIndex = numRowFacetLevels + col;

    const colFacetPath: string[] = [];
    for (let level = 0; level < numColFacetLevels; level++) {
      colFacetPath.push(data.getColFacetValue(level, col) ?? "");
    }
    const colKey = colFacetPath.join(SEPARATOR);
    matrix.colFacetPathToMatrixIndex.set(colKey, col - x0);

    for (let row = y0; row < y1; row++) {
      const absoluteRowIndex = numColFacetLevels + row;
      const cellKey = `data-${absoluteColIndex}-${absoluteRowIndex}`;
      matrix.valueCellKeys[row - y0][col - x0] = cellKey;
    }
  }

  for (let row = y0; row < y1; row++) {
    const rowFacetPath: string[] = [];
    for (let level = 0; level < numRowFacetLevels; level++) {
      rowFacetPath.push(data.getRowFacetValue(level, row) ?? "");
    }

    const rowKey = rowFacetPath.join(SEPARATOR);
    matrix.rowFacetPathToMatrixIndex.set(rowKey, row - y0);
  }

  return matrix;
}

export interface FacetMatrixWithFacetCellMap extends FacetMatrix {
  rowFacetPathToCellMap: Map<string, string>;
  colFacetPathToCellMap: Map<string, string>;
  numRowFacetLevels: number;
  numColFacetLevels: number;
}

// TODO method can be simplified
export function collectEvacuationKeys(opts: {
  editset: EditEntry[];
  matrix: FacetMatrixWithFacetCellMap;
  axis: "col" | "row";
}): { facetPathKey: string; cellKeys: string[], axis: "col" | "row" }[] {
  const results: ReturnType<typeof collectEvacuationKeys> = [];
  for (const entry of opts.editset) {
    if (entry.action !== EditAction.DELETE) continue;
    const cellKeys: string[] = [];

    const idx = opts.matrix[opts.axis === "col" ? "colFacetPathToMatrixIndex" : "rowFacetPathToMatrixIndex"].get(entry.key) as number;
    let len = opts.axis === "col" ? opts.matrix.valueCellKeys.length : opts.matrix.valueCellKeys[0].length;
    for (let i = 0; i < len; i++) {
      const cellKey = opts.axis === "col" ? opts.matrix.valueCellKeys[i][idx] : opts.matrix.valueCellKeys[idx][i];
      cellKeys.push(cellKey);
    }
    const facetCellKey = opts.matrix[opts.axis === "col" ? "colFacetPathToCellMap" : "rowFacetPathToCellMap"].get(entry.key);
    cellKeys.push(facetCellKey!);
    results.push({ facetPathKey: entry.key, cellKeys, axis: opts.axis });
  }
  return results;
}

// Calculates keyframes and staggers the animation by offset so that only one row / column animation can be seen at a time
// For example for following editset
// a_KEEP b_DELETE c_INSERT
// no animation for a 
// slide out animation for b (width -> 0px)
// slide in animation for c (0px -> width)
// happens one after another
export function buildPhasedKeyframes(opts: {
  editset: EditEntry[];
  cssTemplate: string[];
  prop: "gridTemplateColumns" | "gridTemplateRows";
  trackOffset: number;
}): [keyframes: Array<{  offset: number, gridTemplateColumns?: string, gridTemplateRows?: string }>, totalSteps: number] {
  console.assert(opts.cssTemplate.length === opts.editset.length + opts.trackOffset, "length of editset and css tempalte should match");
  const keyframes = [];
  const templateVals = opts.cssTemplate.slice(0);
  let totalSteps = 0;
  for (let i = 0; i < opts.editset.length; i++) {
    if (opts.editset[i].action === EditAction.INSERT) {
      templateVals[opts.trackOffset + i] = "0px";
      totalSteps++;
    } else if (opts.editset[i].action === EditAction.DELETE) {
      totalSteps++;
    }
  }

  let offset = 0;
  keyframes.push({
    [opts.prop]: templateVals.join(" "),
    offset: offset++
  });
  for (let i = 0; i < opts.editset.length; i++) {
    if (opts.editset[i].action === EditAction.KEEP) continue;
    if (opts.editset[i].action === EditAction.INSERT) templateVals[opts.trackOffset + i] = opts.cssTemplate[opts.trackOffset + i];
    else if (opts.editset[i].action === EditAction.DELETE) templateVals[opts.trackOffset + i] = "0px";
    keyframes.push({
      [opts.prop]: templateVals.join(" "),
      offset: offset++ / totalSteps
    });
  }

  return [keyframes, totalSteps];
}
