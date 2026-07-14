import type { SampleEntry } from "./types";

export const samples: Record<string, SampleEntry> = {
  "column-selection": {
    load: () => import("./samples/column-selection/sample"),
    conversation: () => Promise.resolve({ turns: [] }),
  },
};
