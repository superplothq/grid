import fs from "node:fs/promises";
import path from "node:path";
import type { DocGenerator } from "fumadocs-docgen";

interface FileRegionInput {
  file: string;
  codeblock?: { lang?: string; meta?: string } | boolean;
}

interface FileRegionGeneratorOptions {
  basePath?: string;
}

export function fileRegionGenerator({ basePath }: FileRegionGeneratorOptions = {}): DocGenerator {
  return {
    name: "file",
    async run(input, ctx) {
      const { file: rawFile, codeblock = false } = input as FileRegionInput;
      const [filePath, region] = rawFile.split("#");
      const dest = basePath
        ? path.resolve(basePath, filePath)
        : path.resolve(ctx.cwd, path.dirname(ctx.path), filePath);
      let value = await fs.readFile(dest, "utf-8");

      if (region) {
        const startRegex = new RegExp(`^\\s*//\\s*#region\\s+${region}\\s*$`, "m");
        const endRegex = new RegExp(`^\\s*//\\s*#endregion\\s+${region}\\s*$`, "m");
        const startMatch = startRegex.exec(value);
        const endMatch = endRegex.exec(value);
        if (startMatch && endMatch) {
          value = value
            .slice(startMatch.index + startMatch[0].length, endMatch.index)
            .replace(/^\n/, "");
        }
      }

      value = value.replace(/\/\*\*[\s\S]*?\*\/\s*/g, "").trim();

      if (codeblock === false) {
        return { type: "paragraph", children: [{ type: "text", value }] };
      }

      const lang =
        typeof codeblock === "object" ? codeblock.lang : undefined;
      const meta =
        typeof codeblock === "object" ? codeblock.meta : undefined;

      return { type: "code", lang, meta, value };
    },
  };
}
