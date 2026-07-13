import sales from "../../datasets/sales.json";
import type { SampleRow } from "../types";

const datasets: Record<string, SampleRow[]> = {
  sales: sales as SampleRow[],
};

export async function loadDataset(name: string): Promise<SampleRow[]> {
  return datasets[name];
}
