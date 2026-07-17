import { visit } from "unist-util-visit";
import { toWebDocsHref } from "./web-docs-href";

export function rehypeGridDocsLinks() {
  return (tree: any) => {
    visit(tree, "element", (node: any) => {
      if (node.tagName !== "a") return;
      const href = node.properties?.href;
      if (typeof href === "string") node.properties.href = toWebDocsHref(href);
    });
  };
}
