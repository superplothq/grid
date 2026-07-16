import { buildHierarchicalTable } from "./table";
import { FILES } from "./data";

const bytes = (value: number): string => {
  if (value >= 1_000_000) return `${(value / 1_048_576).toFixed(1)} MB`;
  if (value >= 1_000) return `${(value / 1_024).toFixed(1)} KB`;
  return `${value} B`;
};

export function mount(el: HTMLElement): () => void {
  return buildHierarchicalTable(el, {
    facetLabel: "Path",
    facetWidth: 300,
    marker: "plusminus",
    columns: [{ label: "Size", format: bytes }],
    tree: FILES,
  });
}
