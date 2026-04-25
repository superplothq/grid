# packages/docs

Documentation site built with [Fumadocs](https://fumadocs.dev) + Next.js (static export).

## Quick Reference

- Dev server: `yarn workspace docs dev` (runs on port 3333)
- Build: `yarn workspace docs build`
- Content lives in: `content/docs/` as `.mdx` files

## Project Structure

```
packages/docs/
  app/                          # Next.js app router
    layout.tsx                  # Root layout (IBM Plex fonts)
    global.css                  # Tailwind + fumadocs theme
    docs/[[...slug]]/page.tsx   # Doc page renderer (uses clerk TOC style)
  components/
    mdx.tsx                     # MDX component registry (TypeTable, etc.)
  content/docs/                 # MDX doc pages go here
  lib/
    file-region-generator.ts    # Custom doc-gen: sources code from files with #region support
    remark-type-table-with-docs.ts  # Extracts interface-level JSDoc as rendered markdown above type tables
    source.ts                   # Content source config
    shared.ts                   # App name, git config
  source.config.ts              # MDX pipeline config (remark plugins)
```

## Writing Guidelines

The audience is developers and AI agents who will read these docs and build complex grids on their own, without access to the source code or a human to ask. The docs must be self-contained — if something isn't documented here, the reader can't know it.

1. **Simple language.** No jargon. If a simpler word works, use it. Write as if the reader has never seen this codebase.
2. **Define before you use.** Before using any term (e.g. "ref-counting", "pivot config", "DataViewModel"), explain what it means in plain words or link to its doc page if one exists. Never assume the reader already knows a term.
3. **Show alongside telling.** Every concept needs a code snippet or example right next to the explanation. Don't describe behavior without demonstrating it.
4. **Self-contained pages.** A reader should be able to follow a page top-to-bottom without jumping elsewhere. Include enough context on each page that it stands alone. Link to other pages for deeper dives, not for prerequisites.
5. **Heavy on examples.** Show full, runnable examples — not fragments. Show the common case first, then edge cases. If there are multiple ways to do something, show the recommended way and explain when you'd pick an alternative.
6. **One idea per section.** If a section covers two concepts, split it.

## TODO Markers

- `TODO[agent]`: Address this — fill in missing content, fix the issue, or complete the section.
- `TODO[link]`: Ignore this. It marks a place where a link to another page should go, but that page hasn't been written yet.

## Writing a New Doc Page

Create a `.mdx` file in `content/docs/`:

```mdx
---
title: Page Title
description: One-line description
---

Your markdown content here.
```

The page is automatically available at `/docs/<filename>` (without the `.mdx` extension).

## Sourcing API Docs from TypeScript (auto-type-table)

Use `<auto-type-table>` to generate a property/method table from a TypeScript interface or type. The interface-level JSDoc is automatically rendered as markdown above the table (via `remarkTypeTableWithDocs`).

```mdx
<auto-type-table path="packages/grid/src/datamodel/datasource.ts" name="DataSource" />
```

- `path` is relative to the project root (monorepo root)
- `name` is the exported type/interface name
- JSDoc on the interface itself becomes the description paragraph (supports markdown: `**bold**`, `` `code` ``, lists)
- JSDoc on each property/method becomes the row description in the table
- Works for interfaces and object types, NOT for union types (use manual docs for those)

## Sourcing Code Snippets from Files (doc-gen:file)

Embed code from source files using a JSON code block with `doc-gen:file` meta:

````mdx
```json doc-gen:file
{ "file": "packages/grid/src/datamodel/datasource.ts", "codeblock": { "lang": "ts" } }
```
````

- `file` path is relative to the project root (monorepo root)
- JSDoc comments (`/** ... */`) are automatically stripped from the output

### Region extraction

To embed only a portion of a file, add `// #region` / `// #endregion` markers in the source:

```ts
// #region my-region
export type Foo = "A" | "B";
// #endregion my-region
```

Then reference with `#region-name`:

````mdx
```json doc-gen:file
{ "file": "packages/grid/src/some-file.ts#my-region", "codeblock": { "lang": "ts" } }
```
````

## Adding Custom MDX Components

1. Create your component in `components/`
2. Register it in `components/mdx.tsx`:

```tsx
import { MyComponent } from './my-component';

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    TypeTable,
    MyComponent,
    ...components,
  } satisfies MDXComponents;
}
```

3. Use in any MDX file without imports:

```mdx
<MyComponent prop="value" />
```

## Built-in MDX Components

These are available in all MDX files without importing:

- `<Cards>` / `<Card>` — card grid layout
- `<Callout>` — info/warning/error callout boxes
- `<TypeTable>` — property table (used by auto-type-table internally)
- `<Tabs>` / `<Tab>` — tabbed content
- Code blocks with syntax highlighting (Shiki)

## Remark Plugin Pipeline

Configured in `source.config.ts`, runs in this order:

1. `remarkTypeTableWithDocs` — extracts interface-level JSDoc from `<auto-type-table>` and inserts as markdown
2. `remarkAutoTypeTable` — converts `<auto-type-table>` into `<TypeTable>` with property entries
3. `remarkDocGen` with `fileRegionGenerator` — processes `doc-gen:file` code blocks into embedded source

## Fonts

- Body: IBM Plex Sans (`--font-body`)
- Headings: IBM Plex Mono (`--font-title`)

Configured in `app/layout.tsx` as CSS variables, mapped to Tailwind in `app/global.css` via `@theme`.

## Deployment

Static export (`output: 'export'` in `next.config.mjs`). Build produces static files in `out/` — deploy to S3 + CloudFront or any static host.
