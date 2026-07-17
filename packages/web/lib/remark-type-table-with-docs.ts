import { visit } from "unist-util-visit";
import { createGenerator } from "fumadocs-typescript";
import { fromMarkdown } from "mdast-util-from-markdown";
import type { Root } from "mdast";
import type { VFile } from "vfile";
import path from "node:path";
import fs from "node:fs/promises";

const generator = createGenerator();

interface Options {
  basePath?: string;
}

interface PendingInsert {
  node: any;
  parent: any;
  props: Record<string, string>;
}

export function remarkTypeTableWithDocs({ basePath }: Options = {}) {
  return async (tree: Root, file: VFile) => {
    const pending: PendingInsert[] = [];

    visit(tree, "mdxJsxFlowElement", (node: any, _index, parent) => {
      if (node.name !== "auto-type-table" || !parent) return;

      const props: Record<string, string> = {};
      for (const attr of node.attributes) {
        if (attr.type === "mdxJsxAttribute" && typeof attr.value === "string") {
          props[attr.name] = attr.value;
        }
      }

      pending.push({ node, parent, props });
      return "skip";
    });

    for (const { node, parent, props } of pending) {
      if (!props.path) continue;
      const filePath = basePath
        ? path.resolve(basePath, props.path)
        : path.resolve(file.dirname ?? file.cwd, props.path);

      const content = await fs.readFile(filePath, "utf-8");
      const docName = props.origname ?? props.name;
      const docs = await generator.generateDocumentation(
        { path: filePath, content },
        docName,
      );

      const description = docs[0]?.description;
      if (description) {
        const parsed = fromMarkdown(description);
        const currentIndex = parent.children.indexOf(node);
        if (currentIndex !== -1) {
          parent.children.splice(currentIndex, 0, ...parsed.children);
        }
      }
    }
  };
}
