import { visit } from "unist-util-visit";
import path from "node:path";
import fs from "node:fs/promises";

interface Options {
  patternsDir: string;
}

interface PendingPattern {
  node: any;
  parent: any;
  props: Record<string, string>;
}

export function remarkUsagePattern({ patternsDir }: Options) {
  return async (tree: any, file: any) => {
    const pending: PendingPattern[] = [];

    visit(tree, "mdxJsxFlowElement", (node: any, _index, parent) => {
      if (node.name !== "usage-pattern" || !parent) return;

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
      if (!props.id) {
        throw new Error(`<usage-pattern> in ${file.path} is missing an id`);
      }

      const filePath = path.join(patternsDir, `${props.id}.md`);
      let raw: string;
      try {
        raw = await fs.readFile(filePath, "utf-8");
      } catch {
        throw new Error(
          `Unknown usage pattern "${props.id}" in ${file.path} - expected ${filePath}`,
        );
      }
      const { intent, lang, code } = parsePattern(raw, filePath);

      const index = parent.children.indexOf(node);
      parent.children.splice(index, 1, {
        type: "mdxJsxFlowElement",
        name: "UsagePattern",
        attributes: [{ type: "mdxJsxAttribute", name: "intent", value: intent }],
        children: [{ type: "code", lang, value: code }],
      });
    }
  };
}

function parsePattern(raw: string, filePath: string) {
  const frontmatter = /^---\n([\s\S]*?)\n---/.exec(raw);
  if (!frontmatter) {
    throw new Error(`Pattern file ${filePath} is missing frontmatter`);
  }

  const intent = /^intent:\s*(.+)$/m.exec(frontmatter[1]);
  if (!intent) {
    throw new Error(`Pattern file ${filePath} is missing an intent in frontmatter`);
  }

  const fence = /```(\w*)\n([\s\S]*?)```/.exec(raw.slice(frontmatter[0].length));
  if (!fence) {
    throw new Error(`Pattern file ${filePath} has no fenced code block`);
  }

  return {
    intent: intent[1].trim(),
    lang: fence[1] || "ts",
    code: fence[2].replace(/\n$/, ""),
  };
}
