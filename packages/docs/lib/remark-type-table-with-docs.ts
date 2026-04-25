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

export function remarkTypeTableWithDocs({ basePath }: Options = {}) {
  return async (tree: Root, file: VFile) => {
    const queue: Promise<void>[] = [];

    visit(tree, "mdxJsxFlowElement", (node: any, index, parent) => {
      if (node.name !== "auto-type-table" || !parent || index == null) return;

      const props: Record<string, string> = {};
      for (const attr of node.attributes) {
        if (attr.type === "mdxJsxAttribute" && typeof attr.value === "string") {
          props[attr.name] = attr.value;
        }
      }

      queue.push(
        (async () => {
          if (!props.path) return;
          const filePath = basePath
            ? path.resolve(basePath, props.path)
            : path.resolve(file.dirname ?? file.cwd, props.path);

          const content = await fs.readFile(filePath, "utf-8");
          const docs = await generator.generateDocumentation(
            { path: filePath, content },
            props.name,
          );

          const description = docs[0]?.description;
          if (description) {
            const parsed = fromMarkdown(description);
            parent.children.splice(index, 0, ...parsed.children);
          }
        })(),
      );

      return "skip";
    });

    await Promise.all(queue);
  };
}
