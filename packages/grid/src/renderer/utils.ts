const SEPARATOR = "\0";

export interface MergeState {
  level: number;
  value: string;
  path: string;
  start: number;
  span: number;
}

// computeMerges computes cell merge spans for facet headers (both row and column facets).
// The data model is identical for both row and column facets — the axes stay the same,
// only the rendering direction differs. It's convenient to think of it as row facets.
//
// Two axes of merging (mutually exclusive per cell — a cell merges in one axis, not both):
//   Primary axis (↓ vertical):  consecutive items with the same facet path merge into
//                                a single cell with rowspan (or colspan for column facets).
//   Secondary axis (→ horizontal): when a facet value is null, it means the previous
//                                non-null level's cell spans across those null levels.
//
// If both merging is present, first separate the merging directions so that merging across 
// primary and secondary axes can be done independently. (look at example below)
//
// Example — 3 facet levels, 8 items:
//
//   data[i] = [level0, level1, level2]
//
//   i=0  ["l0_0",  null,   null ]
//   i=1  ["l0_0", "l1_0",  "a"  ]
//   i=2  ["l0_0", "l1_0",  "b"  ]
//   i=3  ["l0_0", "l1_0",  "b"  ]
//   i=4  ["l0_0", "l1_1",  null ]
//   i=5  ["l0_0", "l1_1",  "c"  ]
//   i=6  ["l0_1",  null,   null ]
//   i=7  ["l0_2",  null,   null ]
//
// Rendered as row facets (3 levels as columns, 8 items as rows):
//
//        level0     level1     level2
//       ┌──────────────────────────────┐
//   0   │ l0_0      (→ span=3)         │   ← null at level1,2 → l0_0 spans horizontally
//       │──────────┬───────────────────│
//   1   │ l0_0     │ l1_0     │  a     │
//   2   │          │(↓ span=3)│  b     │   ← l1_0 merges vertically (rows 1-3)
//   3   │          │          │  b     │   ← "b" merges vertically (rows 2-3)
//       │          │──────────┼────────│
//   4   │(↓ span=5)│ l1_1  (→ span=2)  │   ← null at level2 → l1_1 spans horizontally
//       │          │──────────┬────────│
//   5   │          │ l1_1     │  c     │
//       │──────────┴──────────┴────────│
//   6   │ l0_1      (→ span=3)         │   ← null at level1,2 → spans horizontally
//       │──────────────────────────────│
//   7   │ l0_2      (→ span=3)         │   ← null at level1,2 → spans horizontally
//       └──────────────────────────────┘
//
// Primary axis merging (↓):
//   l0_0 at level0: items 1-5, span=5 (rows where l0_0 doesn't horizontally merge)
//   l1_0 at level1: items 1-3, span=3
//   "b"  at level2: items 2-3, span=2
//   l1_1 at level1: item 5, span=1 (row 4 is horizontal merge, row 5 is standalone)
//
// Secondary axis merging (→ null-based):
//   i=0: level1=null, level2=null → l0_0's cell gets colspan=3 (spans across level1, level2)
//   i=4: level2=null → l1_1's cell gets colspan=2 (spans across level2)
//   i=6: level1=null, level2=null → l0_1's cell gets colspan=3
//   i=7: level1=null, level2=null → l0_2's cell gets colspan=3
//
export function computeMerges(facetLevel: number, itemCount: number, facets: string[][]): Array<MergeState> {
  const results: Array<MergeState> = [];
  const mergeState: MergeState[] = [];

  for (let level = 0; level < facetLevel; level++) {
    mergeState[level] = { value: "", path: "", start: 0, span: 0, level };
  }

  for (let i = 0; i < itemCount; i++) {
    const facet = facets[i] || [];
    for (let level = 0; level < facetLevel; level++) {
      const value = facet[level];
      const path = facet.slice(0, level + 1).join(SEPARATOR);
      const state = mergeState[level];

      if (path === state.path && i > 0) {
        state.span++;
      } else {
        if (state.span > 0) {
          results.push({
            level,
            path: state.path,
            value: state.value as string,
            start: state.start,
            span: state.span
          });
        }
        state.value = value;
        state.path = path;
        state.start = i;
        state.span = 1;
      }
    }
  }

  for (let level = 0; level < facetLevel; level++) {
    const state = mergeState[level];
    if (state.span > 0) {
      results.push({
        level,
        path: state.path,
        value: state.value as string,
        start: state.start,
        span: state.span
      });
    }
  }

  return results;
}
