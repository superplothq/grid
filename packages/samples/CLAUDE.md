# packages/samples

Self-contained grid samples. Each sample is a runnable demo of the grid that also
carries its own doc page, source, dataset references, and the human↔agent
conversation that produced it. Samples are consumed by **web's `/docs`** through a
fumadocs collection, and are designed to be reusable elsewhere later.

> The rendered docs UI (sidebar, TOC, theming) lives in **packages/web**, not here.
> This package owns only the sample *content and code*. See
> [Consumption & the sidebar](#consumption-web-docs) below.

## Design

The design decisions are about the *samples system*, not about the grid. (How a
sample drives the grid is covered in [Add a new sample](#how-to-add-a-new-sample).)

1. **The directory is the unit — self-contained and addressable.** One sample = one
   directory whose name is the id, the URL slug, and the registry key. Everything the
   sample needs — prose page, executable code, conversation, thumbnail, dataset
   references — is co-located in that directory. This is what makes "share the URL"
   and "open the code" honest: the whole sample is one addressable thing.

2. **A tiny, framework-agnostic contract.** A sample exposes exactly one entry point,
   `mount(el, ctx) => cleanup`, and receives only a minimal `SampleContext` (a dataset
   loader). It renders into a bare DOM element and returns its own teardown — it knows
   nothing about React, the host page, or how it's displayed. That boundary is the
   whole point: the same sample runs unchanged in web (React 19), playground
   (React 18), or any future host, with no framework/version coupling. Keep the
   contract small; resist adding host-specific concerns to `SampleContext`.

3. **Registry of lazy loaders.** `registry.ts` is the one hand-maintained index,
   mapping id → `{ load(), conversation() }` via dynamic `import()`. Consequences by
   design: each sample (and anything heavy it pulls, e.g. wasm) is its own code-split
   chunk, so a gallery of many samples doesn't bloat one bundle; and the registry is
   the single source of truth the host enumerates for routes and cards.

4. **Shared `runtime/`, strict no-sibling rule.** Samples may import only from
   `../../runtime`, `grid`, and their own files — **never from a sibling sample**.
   Common logic is hoisted into `runtime/` (the package's internal API). Rule of
   thumb: duplicate once, hoist on the *second* use. This keeps samples independent
   and individually understandable while preventing drift; `runtime/` stays small and
   boring (data loading, shaping, mounting), so the *interesting* grid usage stays
   visible in each `sample.ts`.

5. **Content is build-time static and provenance-carrying.** A sample bundles its own
   doc page (`index.mdx`), its executed source (embedded from the real file at build
   via `doc-gen:file`, so displayed code can't drift from what runs), and the
   `conversation.json` transcript that produced it. The raw source + a concatenated
   `llms.txt` are published as static assets so an agent can fetch a self-describing
   view of any sample.

6. **Rendering is not this package's job.** This package owns sample *content and
   code* only. The docs UI (sidebar, TOC, theming, gallery) is owned by
   **packages/web**. Keeping that boundary is deliberate — samples stay host-agnostic
   (principle 2), and web is free to render them however it likes.

## Current architecture

```
packages/samples/
  datasets/
    sales.json                 # shared raw datasets (many samples ← one dataset)
  src/
    index.ts                   # public entry: exports { samples, createSampleContext, types }
    registry.ts                # id → { load(), conversation() }, dynamic imports (code-split)
    types.ts                   # the contract (see below)
    runtime/                   # shared, hoisted helpers — the package's internal API
      context.ts               #   createSampleContext(): SampleContext
      datasets.ts              #   loadDataset(name) — JSON module imports
      mount.ts                 #   createGrid(host, layout) → { grid, cleanup }
      shaping.ts               #   rowsToGroupedFlatParams / rowsToPivotParams (rows → VM params)
    samples/
      meta.json                # sidebar order for the collection
      index.mdx                # /docs/samples gallery landing page
      <id>/
        index.mdx              # page: frontmatter + prose + <SampleDemo/> + code + <SampleConversation/>
        sample.ts              # export function mount(el, ctx): () => void
        conversation.json      # { model?, date?, turns: [{ role, content }] }
        thumbnail.svg          # optional
```

### The contract (`src/types.ts`)

```ts
export type SampleRow = Record<string, string | number>;

export interface SampleContext {
  loadDataset(name: string): Promise<SampleRow[]>;
}
export interface SampleModule {
  mount(el: HTMLElement, ctx: SampleContext): () => void;   // returns cleanup
}
export interface Conversation {
  model?: string; date?: string;
  turns: { role: "human" | "agent"; content: string }[];
}
export interface SampleEntry {
  load: () => Promise<SampleModule>;
  conversation: () => Promise<Conversation>;
}
```

`registry.ts` is the one hand-maintained map (one entry per sample). Dynamic
`import()` makes each sample (and any `duckdb` wasm it pulls) its own chunk.

### Frontmatter schema

Each `<id>/index.mdx` frontmatter is validated by web's `source.config.ts`
(zod-extended `pageSchema`). Fields: `title`, `description` (both required),
`thumbnail?`, `datasets: string[]`, `runtime: 'static' | 'duckdb'`,
`tags: string[]`. Invalid frontmatter fails the build.

### Checks

- Type check: `yarn workspace samples types:check`
- Lint: `yarn workspace samples lint`
- Samples pin to the workspace `grid`, so a grid API change surfaces here at
  `types:check` — keep it green.

## How to add a new sample

1. **Create the directory** `src/samples/<id>/` (kebab-case id = slug = registry key).

2. **`sample.ts`** — the executable. How a sample drives the grid:
   - **Deep-import `grid/dist/renderer`** (not the package root) so the sample doesn't
     pull in DuckDB.
   - **Use the DataViewModel ↔ Renderer bridge, in memory.** Skip the
     `DataSource → DataModel` layers: load a dataset, shape the raw rows into
     `PivotDataViewModelParams` / `FlattenedDataViewModelParams` with a `runtime/`
     helper, and hand the result straight to the renderer via
     `grid.data = new …ViewModel(params)`. ViewModel creation is cheap and
     deterministic. (A sample that genuinely needs SQL/`DuckDBWasmDataSource` sets
     `runtime: duckdb` in frontmatter and pulls the wasm through its own dynamic
     chunk — keep it out of `static` samples.)

   ```ts
   import { PivotDataViewModel } from "grid/dist/renderer";
   import { createGrid } from "../../runtime/mount";
   import { rowsToPivotParams } from "../../runtime/shaping";
   import type { SampleContext } from "../../types";

   export function mount(el: HTMLElement, ctx: SampleContext): () => void {
     const { grid, cleanup } = createGrid(el, "pivot");   // or "flat"
     let disposed = false;
     ctx.loadDataset("sales").then((rows) => {
       if (disposed) return;
       grid.data = new PivotDataViewModel(rowsToPivotParams(rows, { /* dims, measures */ }));
       grid.draw();
     });
     return () => { disposed = true; cleanup(); };   // MUST tear down (strict-mode double-mount)
   }
   ```
   Cleanup must be real (destroy grid, cancel pending loads) — docs dev runs React
   strict mode and will double-mount.

3. **`index.mdx`** — frontmatter + prose. Drop in the demo, the source, and the
   conversation:
   ````mdx
   ---
   title: My Sample
   description: One-line summary
   thumbnail: ./thumbnail.svg
   datasets: [sales]
   runtime: static
   tags: [pivot]
   ---

   Prose explaining the sample.

   <SampleDemo id="my-sample" height={420} />

   ## Source

   ```json doc-gen:file
   { "file": "packages/samples/src/samples/my-sample/sample.ts", "codeblock": { "lang": "ts" } }
   ```

   <SampleConversation id="my-sample" />
   ````
   `<SampleDemo>` / `<SampleConversation>` are provided by web (no import needed).
   `doc-gen:file` embeds the *real* `sample.ts` at build time, so shown code never
   drifts from executed code.

4. **`conversation.json`** — the human↔agent transcript
   (`{ model?, date?, turns: [{ role, content }] }`). Convert relative dates to
   absolute.

5. **`thumbnail.svg`** (optional).

6. **Register it** — add one line to `src/registry.ts`:
   ```ts
   "my-sample": {
     load: () => import("./samples/my-sample/sample"),
     conversation: () => import("./samples/my-sample/conversation.json").then((m) => m.default as Conversation),
   },
   ```

7. **Add to the sidebar order** — `src/samples/meta.json` `pages` array (see below).

8. **New dataset?** put the file in `datasets/`, then register it as a JSON module
   in `runtime/datasets.ts`. Reference its key in the sample's `datasets` frontmatter
   and pass it to `ctx.loadDataset(...)`.

9. **Shared logic?** if a second sample needs the same helper, hoist it into
   `runtime/` — never import from a sibling sample.

10. Run `yarn workspace samples types:check` and rebuild web
    (`yarn workspace web build`) to verify the page renders.

## Consumption (web /docs) {#consumption-web-docs}

Samples are surfaced by **packages/web**, which owns the fumadocs setup:

- `packages/web/source.config.ts` — `samples` collection points at `../samples/src`
  and defines the frontmatter schema.
- `packages/web/lib/docs-source.ts` — merges the `samples` collection into the docs
  loader (routes under `/docs/samples`).
- `packages/web/components/docs/sample-demo.tsx` — `'use client'`; looks up
  `registry[id]`, dynamic-imports, and calls `mount` in an effect.
- `packages/web/components/docs/sample-conversation.tsx` — server component; reads
  `conversation()` at build time and renders web's `.demo-chatbox` markup.
- `packages/web/scripts/emit-sample-sources.mjs` — pre-build step that publishes raw
  `sample.ts`, `conversation.json`, thumbnails, and a concatenated `llms.txt` per
  sample to `packages/web/public/samples/<id>/` (served at `/samples/...`).

Nothing about the rendered docs UI is configured in this package.

## How to customize the sidepanel

The left sidebar is fumadocs' `DocsLayout` sidebar, rendered by web. Two levers:

1. **Order / grouping** — `src/samples/meta.json` (this package). The `pages` array
   sets the order of samples in the sidebar:
   ```json
   { "title": "Samples", "pages": ["index", "flat-sales-table", "sales-pivot"] }
   ```
   Use `"---"` for a separator or `"---Label---"` for a section header. Pages not
   listed won't appear. The top-level docs order lives in
   `packages/web/content/docs/meta.json`.

2. **Appearance / behavior** — `packages/web/app/docs/docs.css` (web). This is where
   all sidebar styling and layout overrides live, keyed on fumadocs' stable ids
   (`#nd-sidebar`, `#nd-docs-layout`, `#nd-toc`). Current customizations include:
   - full-bleed 3-column grid (drops fumadocs' centering gutters)
   - sidebar pinned `sticky` at full height (independent of the body scroll); toc is
     `static` (scrolls with the content); footer revealed at the end of body scroll
   - monospace font for the sidebar/toc; theme tokens mapped to web's design system
   - the collapse toggle + search box laid out on one row
   - `DocsLayout` props (`nav: { enabled: false }`, `themeSwitch: { enabled: false }`)
     in `packages/web/app/docs/layout.tsx` remove the sidebar's redundant title and
     theme button.

   Editing that file is the way to change sidebar width, colors, fonts, stickiness,
   or the header row. Note: `docs.css` HMR is flaky under Turbopack — after edits,
   verify via `yarn workspace web build` + static serve, or hard-refresh.

## Notes

- Do NOT write defensive code unless asked; a runtime error beats a masking bug.
- Do NOT add framework or DuckDB dependencies to `static` samples.
- TypeScript strict mode; ESM only.
