import type { SampleEntry } from "./types";

export const samples: Record<string, SampleEntry> = {
  "column-selection": {
    load: () => import("./samples/column-selection/sample"),
    conversation: () => Promise.resolve({ turns: [] }),
  },
  "column-grouping": {
    load: () => import("./samples/column-grouping/sample"),
    conversation: () => Promise.resolve({ turns: [] }),
  },
  "column-properties-col-size": {
    load: () => import("./samples/column-properties/col-size"),
    conversation: () => Promise.resolve({ turns: [] }),
  },
  "column-properties-cell-height": {
    load: () => import("./samples/column-properties/cell-height"),
    conversation: () => Promise.resolve({ turns: [] }),
  },
  "column-properties-header-affixes": {
    load: () => import("./samples/column-properties/header-affixes"),
    conversation: () => Promise.resolve({ turns: [] }),
  },
  "column-properties-cell-renderer": {
    load: () => import("./samples/column-properties/cell-renderer"),
    conversation: () => Promise.resolve({ turns: [] }),
  },
};
