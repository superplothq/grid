import { defineConfig, defineDocs } from 'fumadocs-mdx/config';
import { metaSchema, pageSchema } from 'fumadocs-core/source/schema';
import { z } from 'zod';
import { remarkDocGen } from 'fumadocs-docgen';
import { fileRegionGenerator } from './lib/file-region-generator';
import { remarkClassOutline } from './lib/remark-class-outline';
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

export const samples = defineDocs({
  dir: '../samples/src',
  docs: {
    schema: pageSchema.extend({
      thumbnail: z.string().optional(),
      datasets: z.array(z.string()).default([]),
      runtime: z.enum(['static', 'duckdb']).default('static'),
      tags: z.array(z.string()).default([]),
    }),
    files: ['**/*.mdx'],
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
  meta: {
    schema: metaSchema,
    files: ['**/meta.json'],
  },
});

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [
      [remarkClassOutline, { basePath: projectRoot }],
      [remarkDocGen, { generators: [fileRegionGenerator({ basePath: projectRoot })] }],
    ],
  },
});
