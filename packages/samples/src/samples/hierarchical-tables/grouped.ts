import { buildHierarchicalTable } from "./table";
import { REGIONS } from "./data";

const number = (value: number): string => value.toLocaleString("en-US");

export function mount(el: HTMLElement): () => void {
  return buildHierarchicalTable(el, {
    facetLabel: "Region",
    facetWidth: 260,
    marker: "chevron",
    columns: [
      { label: "Population", format: number },
      { label: "Mortality", format: number },
    ],
    tree: REGIONS,
  });
}
