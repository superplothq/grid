export { samples } from "./registry";
export { demos } from "./demos-registry";
export { createSampleContext } from "./runtime/context";

// Lazy loader for the props-driven pivot playground: a single widget the docs
// mount with different Rows/Columns expressions, so it needs no per-config
// registry entry. Kept behind a dynamic import so the barrel stays light.
export const loadPivotPlayground = () => import("./samples/pivot-table/playground");
export type {
  SampleRow,
  SampleContext,
  SampleModule,
  Conversation,
  ConversationTurn,
  SampleEntry,
  DemoEntry,
} from "./types";
