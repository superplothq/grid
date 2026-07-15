import type { DemoEntry } from "./types";

// Demos are like samples (same SampleModule mount contract, same package) but are
// self-contained - they generate their own data and carry no mdx page or gallery
// card. Web lists them on a plain /demos route, one URL each. Add an entry here
// per demo directory under src/demos/<id>/.
export const demos: Record<string, DemoEntry> = {
  "starter-grid": {
    title: "Starter Grid",
    description: "A self-contained flat grid rendered from generated data - the starting point for demos.",
    load: () => import("./demos/starter-grid/demo"),
  },
  "signal-inbox": {
    title: "Signal Inbox",
    description: "A sleek B2B sales signal inbox - rich contact cells, a numeric heat score, category pills, a pipeline bar and a Fit toggle, with sorting, selection and pagination over 800 generated leads.",
    load: () => import("./demos/signal-inbox/demo"),
  },
  "market-pulse": {
    title: "Market Pulse",
    description: "A realtime trading blotter - instruments grouped by asset class tick live with in-cell sparklines, a signed %-change surfaced through the grid's metadata layer, sortable columns, value filters and drag-to-group.",
    load: () => import("./demos/market-pulse/demo"),
  },
};
