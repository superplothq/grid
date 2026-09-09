# web

SuperPlot public site. Next.js 16 static export, React 19. The site owns its own docs route: fumadocs is wired directly into this app (`source.config.ts`, `app/grid/docs/`, `lib/docs-source.ts`) and serves under `/grid/docs`. This is unrelated to `packages/docs`, which is a separate standalone site.

## Commands

```
bun --filter web dev          # dev server on port 3334 (source maps disabled, see below)
bun --filter web build        # emits raw sample sources to public/samples, then static export
bun --filter web dev:preview  # static build into .next-preview + local static server
bun --filter web types:check  # fumadocs-mdx codegen + tsc
bun --filter web lint
```

- Next 16 allows one dev server per project. If a dev server is already running, preview changes with `dev:preview` instead of starting a second one.
- Dev scripts pass `--disable-source-maps`: Turbopack's source maps leak memory (next.js#81161).

## Content layout

```
content/docs/       docs pages (MDX, fumadocs collection)
content/patterns/   usage pattern registry (not pages; transcluded, see below)
../samples/src/     samples collection (owned by packages/samples, mounted read-only here)
app/grid/docs/      docs route, layout, and docs.css (all docs styling and theming)
components/docs/    components available inside MDX
lib/                remark/rehype plugins and generators behind the MDX extensions
scripts/            emit-sample-sources.mjs (runs before dev/build)
```

## MDX extensions

All registered in `source.config.ts`. Paths in `path` attributes are repo-root relative.

### `<usage-pattern id="..." />`

Transcludes a canonical pseudo-code pattern from the registry at `content/patterns/<id>.md`. Renders a "Usage pattern" header with the pattern's intent as muted text, followed by the pseudo code highlighted per the fence language (defaults to `ts`).

A pattern file is frontmatter plus one fenced code block:

```markdown
---
id: dataflow-loop
intent: One-line statement of what the pattern guarantees.
---

​```ts
// the pseudo code
​```
```

Handled by `lib/remark-usage-pattern.ts`, rendered by `components/docs/usage-pattern.tsx`. An unknown id, missing intent, or missing code block fails the build - patterns cannot silently render as nothing. Patterns are single-source: edit the file in `content/patterns/` and every page embedding it updates. Keep pattern files as fragments; do not link to them directly or turn them into pages.

### `<auto-type-table path="..." name="..." />`

Property table generated from a TypeScript type, interface, or class in the grid source, using the JSDoc on each member. `lib/remark-type-table-with-docs.ts` additionally inserts the type's own JSDoc description as prose above the table. For derived types pass `type` (the type expression) plus `origname` (where the JSDoc lives):

```mdx
<auto-type-table path="packages/grid/src/datamodel/types.ts" name="SortEntry" />
<auto-type-table path="packages/grid/src/datamodel/types.ts" type="Omit<DataSchema, keyof Schema>" name="DataSchemaOwn" origname="DataSchema" />
```

### `<auto-class-outline path="..." name="..." />`

A `.d.ts`-style outline of a class, interface, or type alias, rendered as a `ts` code block (`lib/remark-class-outline.ts`). Follows types referenced in the signatures and appends their outlines (skipping node_modules). Optional attributes: `exclude="TypeA,TypeB"` to stop the type-following, `title="..."` for a code block title.

### File regions

Embed a marked region of a source file via fumadocs-docgen (`lib/file-region-generator.ts`). Mark the region in source with `// #region <name>` / `// #endregion <name>`, then:

````mdx
```json doc-gen:file
{ "file": "packages/grid/src/datamodel/types.ts#schema-subtype", "codeblock": { "lang": "ts" } }
```
````

JSDoc comments are stripped from the output. Omit `codeblock` to inline the text as a paragraph.

### Mermaid

Standard ```mermaid fences render through `components/docs/mermaid.tsx`.

## Components available in MDX

Registered in `components/docs/mdx.tsx`. Notable ones:

- `<DocDiagram id="..." />` - inlines an SVG from `public/` so `currentColor` strokes follow the page theme. The id registry (file + aria label) lives in `components/docs/doc-diagram.tsx`; add new diagrams there.
- `<Term>` - hoverable term definitions.
- `<Pill kind="dimension|measure">` - Tableau-style field pills.
- `<SampleDemo>` / `<SampleConversation>` - used by sample pages.
- `UsagePattern` is registered but never written by hand; `<usage-pattern id>` emits it.

## Infra notes for doc writing

- **Links**: write root-absolute `/docs/...` links freely (including inside grid JSDoc). `lib/rehype-grid-docs-links.ts` rewrites them to `/grid/docs/...` at build time.
- **JSDoc edits**: type tables and outlines read the grid source at MDX compile time. If you change only JSDoc in `packages/grid/src`, the dev server will not recompile the page - touch the MDX file or restart dev.
- **Stale styles or content in dev**: Turbopack's persistent cache (`.next/cache`) can keep serving chunks compiled from old sources, and it survives server restarts. If an edit does not show up after a restart, delete `packages/web/.next` and start dev again.
- **Samples**: sample pages come from `packages/samples` via the `samples` collection in `source.config.ts`; raw sources are copied to `public/samples` by `scripts/emit-sample-sources.mjs` (runs automatically before dev/build). Author samples in `packages/samples`, not here.
- **Theming**: docs pages are themed by bridging web's `data-theme` attribute to fumadocs tokens in `app/grid/docs/docs.css`. There is no `.dark` class. Style new doc components with `doc-*` classes in that file, using the CSS variables (`--text`, `--text-muted`, `--font-mono`) so both themes work.
- **ESLint**: this package uses eslint 9 flat config with eslint-config-next. Keep eslint on ^9; eslint 10 breaks eslint-config-next's plugin stack.
