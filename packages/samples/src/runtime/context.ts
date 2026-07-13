import type { SampleContext } from "../types";
import { loadDataset } from "./datasets";

export function createSampleContext(): SampleContext {
  return { loadDataset };
}
