import { defineConfig, defineDocs } from 'fumadocs-mdx/config';
import { metaSchema, pageSchema } from 'fumadocs-core/source/schema';
import { remarkAutoTypeTable } from 'fumadocs-typescript';
import { remarkDocGen } from 'fumadocs-docgen';
import { fileRegionGenerator } from './lib/file-region-generator';
import { remarkTypeTableWithDocs } from './lib/remark-type-table-with-docs';
import path from 'node:path';

const projectRoot = path.resolve(process.cwd(), '..', '..');

export const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    schema: pageSchema,
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
  meta: {
    schema: metaSchema,
  },
});

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [
      [remarkTypeTableWithDocs, { basePath: projectRoot }],
      [remarkAutoTypeTable, { options: {
        basePath: projectRoot,
        transform(entry: any) {
          for (const tag of entry.tags ?? []) {
            if (tag.name === 'throws') {
              entry.description += '\n\n**Throws:**\n\n' + tag.text;
            }
          }
        },
      } }],
      [remarkDocGen, { generators: [fileRegionGenerator({ basePath: projectRoot })] }],
    ],
  },
});
