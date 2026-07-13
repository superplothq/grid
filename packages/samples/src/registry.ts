import type { Conversation, SampleEntry } from "./types";

export const samples: Record<string, SampleEntry> = {
  "flat-sales-table": {
    load: () => import("./samples/flat-sales-table/sample"),
    conversation: () =>
      import("./samples/flat-sales-table/conversation.json").then(
        (m) => m.default as Conversation
      ),
  },
  "sales-pivot": {
    load: () => import("./samples/sales-pivot/sample"),
    conversation: () =>
      import("./samples/sales-pivot/conversation.json").then(
        (m) => m.default as Conversation
      ),
  },
};
