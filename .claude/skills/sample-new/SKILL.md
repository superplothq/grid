---
name: sample-new
description: Create a new grid sample in packages/samples (self-contained directory with sample.ts, index.mdx, optional conversation.json, registry + sidebar wiring). Use for "/sample-new" or when the user asks to add/create a grid sample.
---

# Create a new sample

Samples live in `packages/samples`. Each sample is one self-contained directory that
carries its own runnable demo, doc page, source, dataset references, and the
human↔agent conversation that produced it. Samples are consumed by **web's `/docs`**
through a fumadocs collection.

> The rendered docs UI (sidebar, TOC, theming) lives in **packages/web**, not here.
> This package owns only the sample *content and code*. See
> [Consumption & the sidebar](#consumption-web-docs) below.

## First: intake

Before writing anything, ask the user these two questions (use the AskUserQuestion
tool). Do not skip — the answers drive the sidebar wiring and the page frontmatter.

1. **Sidepanel grouping** — which group (a collapsible, non-clickable folder in the
   docs sidebar) should the sample sit under? Each group is a folder under
   `packages/web/content/docs/<group>/` that lists its samples as leaf links (see
   [How to customize the sidepanel](#sidepanel)). If the user names an existing group,
   add the sample's link to that group's `meta.json`; if a new group, create the folder.

2. **Description** — a one-line summary of what the sample demonstrates. This becomes
   the `description` frontmatter field in `index.mdx` and the gallery card copy.

Also confirm the **sample id** (kebab-case; it is the directory name, URL slug, and
registry key) and, if not obvious from the description, which **layout** (`pivot` or
`flat`), **dimensions**, and **measures** the sample should use.

**Conversation is optional** — do NOT write a `conversation.json` unless the user asks
for it. When omitted, give the registry entry an inline empty conversation (step 6).

**Dataset:** default to the `payroll` dataset (the only one registered right now — the
NYC Citywide Payroll data; see `runtime/datasets.ts` for its cleaned fields and the
`headers` map). Do NOT ask which dataset unless the user explicitly wants a different
one; only then register a new dataset per step 9.

## Design

The design decisions are about the *samples system*, not about the grid.

1. **The directory is the unit — self-contained and addressable.** One sample = one
   directory whose name is the id, the URL slug, and the registry key. Everything the
   sample needs — prose page, executable code, conversation, thumbnail, dataset
   references — is co-located in that directory.

2. **A tiny, framework-agnostic contract.** A sample exposes exactly one entry point,
   `mount(el, ctx) => cleanup`, and receives only a minimal `SampleContext` (a dataset
   loader). It renders into a bare DOM element and returns its own teardown — it knows
   nothing about React, the host page, or how it's displayed. The same sample runs
   unchanged in web (React 19), playground (React 18), or any future host. Keep the
   contract small; resist adding host-specific concerns to `SampleContext`.

3. **Registry of lazy loaders.** `registry.ts` is the one hand-maintained index,
   mapping id → `{ load(), conversation() }` via dynamic `import()`. Each sample (and
   anything heavy it pulls, e.g. wasm) is its own code-split chunk, and the registry is
   the single source of truth the host enumerates for routes and cards.

4. **Shared `runtime/`, strict no-sibling rule.** Samples may import only from
   `../../runtime`, `grid`, and their own files — **never from a sibling sample**.
   Common logic is hoisted into `runtime/`. Rule of thumb: duplicate once, hoist on the
   *second* use. This keeps `runtime/` small and boring (data loading, shaping,
   mounting) so the *interesting* grid usage stays visible in each `sample.ts`.

5. **Content is build-time static and provenance-carrying.** A sample bundles its own
   doc page (`index.mdx`) and its executed source (embedded from the real file at build
   via `doc-gen:file`, so the Source block can't drift from what runs), plus an optional
   `conversation.json` transcript.

6. **Rendering is not this package's job.** This package owns sample *content and
   code* only. The docs UI (sidebar, TOC, theming, gallery) is owned by
   **packages/web**.

## Current architecture

```
packages/samples/
  datasets/
    <name>.json                # shared raw datasets (many samples ← one dataset)
  src/
    index.ts                   # public entry: exports { samples, createSampleContext, types }
    registry.ts                # id → { load(), conversation() }, dynamic imports (code-split)
    types.ts                   # the contract (see below)
    runtime/                   # shared, hoisted helpers — the package's internal API
      context.ts               #   createSampleContext(): SampleContext
      datasets.ts              #   loadDataset(name) — JSON import + in-memory transform; headers map
      mount.ts                 #   createGrid(host, layout) → { grid, cleanup }  (optional; may build inline)
      shaping.ts               #   rowsToGroupedFlatParams / rowsToPivotParams (rows → VM params)
      toolbar.ts               #   shared minimalistic, theme-adaptive toolbar controls
    samples/
      meta.json                # gallery-folder order (hidden from sidebar; backs /docs/samples route)
      index.mdx                # /docs/samples gallery landing page
      <id>/
        index.mdx              # page: frontmatter + intro + ## Operation (codeblock + <SampleDemo/> + ### Source)
        sample.ts              # export function mount(el, ctx): () => void
        conversation.json      # optional { model?, date?, turns: [{ role, content }] }
        thumbnail.svg          # optional
```

### The contract (`src/types.ts`)

```ts
export type SampleValue = string | number | null | undefined;
export type SampleRow = Record<string, SampleValue>;

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

2. **`sample.ts`** — the executable. How every sample drives the grid:
   - **Deep-import `grid/dist/renderer`** (not the package root) so the sample doesn't
     pull in DuckDB.
   - **Build the grid inline** (`new Grid({}, mount, "flat" | "pivot")`) so the grid
     setup is visible in the shown source. `runtime/` helpers are for *shared, boring
     ops* (dataset loading, the toolbar chrome) — not for hiding grid construction.
   - **Use the DataViewModel ↔ Renderer bridge, in memory.** Skip the
     `DataSource → DataModel` layers: load a dataset, build
     `PivotDataViewModelParams` / `FlattenedDataViewModelParams`, and hand the result
     straight to the renderer via `grid.data = new …ViewModel(params)`. ViewModel
     creation is cheap. (A sample that genuinely needs SQL/`DuckDBWasmDataSource` sets
     `runtime: duckdb` in frontmatter and pulls the wasm through its own dynamic chunk.)
   - **Organize the file top-down: primary code first, helpers under a
     `/* ===== utils ===== */` separator.** Grid construction + data load read first;
     control/toolbar building and other helpers go below the separator.
   - **The sample owns its chrome.** `<SampleDemo>` renders a bare host — no border,
     background, or fixed height. So `mount` lays out its own UI: any controls via the
     shared toolbar (`runtime/toolbar.ts`), a gap that shows the page background, and a
     **fixed-height scrollable grid mount** with its own border/radius.

   ```ts
   import Grid, { PivotDataViewModel } from "grid/dist/renderer";
   import type { SampleContext } from "../../types";

   export function mount(el: HTMLElement, ctx: SampleContext): () => void {
     el.style.cssText = "display:flex;flex-direction:column;gap:12px;";

     const gridMount = document.createElement("div");
     gridMount.style.cssText =
       "position:relative;height:420px;overflow:auto;border-radius:8px;" +
       "border:1px solid color-mix(in srgb, currentColor 15%, transparent);";
     el.appendChild(gridMount);
     const grid = new Grid({}, gridMount, "pivot");   // or "flat"
     let disposed = false;

     ctx.loadDataset("payroll").then((rows) => {
       if (disposed) return;
       grid.data = new PivotDataViewModel(/* params built from rows */);
       grid.draw();
     });

     return () => { disposed = true; el.removeChild(gridMount); };
   }
   ```
   Cleanup must be real (remove the mounts, cancel pending loads) — docs dev runs React
   strict mode and will double-mount.

3. **`index.mdx`** — frontmatter + prose. Follow this **document structure** (all
   samples use it):

   1. **Intro** — a short paragraph on the core *concept* the sample teaches, followed
      by an **API-usage codeblock** showing that concept generically (a plain ```ts
      block). Keep it about the concept, not the specific demo operation.
   2. **`## <Operation>`** — one section per operation the demo performs (there may be
      several; more get added over time). Each section contains, in order:
      - a short explanation of the operation + an **API-usage codeblock**,
      - a short **"try it"** paragraph telling the reader what to do with the control
        panel to see the result,
      - the **`<SampleDemo id="my-sample" />`** (the demo lives inside the operation
        section, not the intro),
      - a **`### Source`** subheader embedding the real `sample.ts` via `doc-gen:file`.

   ````mdx
   ---
   title: My Sample
   description: <the one-line description from intake>
   thumbnail: ./thumbnail.svg
   datasets: [payroll]
   runtime: static
   tags: [flat]
   ---

   Short intro on the concept this sample teaches. Then the generic API usage:

   ```ts
   // the core API call, shown generically
   ```

   ## Do the thing

   Short explanation of this operation, then its API usage:

   ```ts
   // API for this operation
   ```

   Try it below: <what to pick/click in the control panel to see the result>.

   <SampleDemo id="my-sample" />

   ### Source

   ```json doc-gen:file
   { "file": "packages/samples/src/samples/my-sample/sample.ts", "codeblock": { "lang": "ts" } }
   ```
   ````
   `<SampleDemo>` is provided by web (no import, no `height` prop — the sample owns its
   own size). `doc-gen:file` embeds the *real* `sample.ts` at build time, so the Source
   block never drifts from what runs; the hand-written API codeblocks are illustrative
   snippets — keep them in sync if the sample changes.

4. **`conversation.json`** (optional) — only if the user asks. The human↔agent
   transcript (`{ model?, date?, turns: [{ role, content }] }`); convert relative dates
   to absolute. When omitted, do NOT create the file (step 6 handles the registry).

5. **`thumbnail.svg`** (optional).

6. **Register it** — add one entry to `src/registry.ts`. With a conversation file:
   ```ts
   "my-sample": {
     load: () => import("./samples/my-sample/sample"),
     conversation: () => import("./samples/my-sample/conversation.json").then((m) => m.default as Conversation),
   },
   ```
   Without one (the default), give it an inline empty conversation so types stay green:
   ```ts
   "my-sample": {
     load: () => import("./samples/my-sample/sample"),
     conversation: () => Promise.resolve({ turns: [] }),
   },
   ```

7. **Wire the sidebar** — the sample is a **leaf link under a collapsible group folder**
   (see [How to customize the sidepanel](#sidepanel)). In
   `packages/web/content/docs/<group>/meta.json`, add
   `"[My Sample](/docs/samples/my-sample)"` to `pages`; create the folder + list it in
   `content/docs/meta.json` if the group is new. Do NOT add the sample to
   `src/samples/meta.json` — that folder is hidden from the sidebar.

8. **Add a gallery card** — add a `<Card>` to `src/samples/index.mdx` pointing at
   `/docs/samples/<id>` with the intake description.

9. **New dataset?** put the file in `datasets/`, then register it in
   `runtime/datasets.ts` (import the JSON, transform/clean it once into a module-level
   variable, add it to the `datasets` map, and extend the `headers` map with
   human-readable names for any new fields). Reference its key in the sample's
   `datasets` frontmatter and pass it to `ctx.loadDataset(...)`.

10. **Shared logic?** if a second sample needs the same helper, hoist it into
    `runtime/` — never import from a sibling sample.

11. Run `yarn workspace samples types:check` and rebuild web
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

## How to customize the sidepanel {#sidepanel}

The left sidebar is fumadocs' `DocsLayout` sidebar, rendered by web. Structure and
styling live in **packages/web**, not this package.

### Structure / grouping — the group-folder pattern

The sidebar is a tree of **groups** (collapsible, non-clickable folders) each holding
**sample leaf links**. This shape is deliberate and comes from two fumadocs facts:

- A folder is **clickable** only if it has an `index` page. A folder with **no index**
  renders as a non-clickable collapsible group (just expands/collapses).
- A directory reference renders as an **expandable folder (chevron)**; a markdown
  **link** `"[Title](url)"` renders as a **leaf** (no chevron).

So each group is an *empty* folder under `content/docs/` (a `meta.json`, no `.mdx`) that
lists its samples as links:

```
packages/web/content/docs/
  meta.json                 # { "pages": ["column", "<other groups>"] }  — root order
  <group>/meta.json         # { "title": "Column",
                            #   "pages": ["[My Sample](/docs/samples/my-sample)"] }
```

- **New group:** create `content/docs/<group>/meta.json` with a `title` and a `pages`
  array of sample links, then add `"<group>"` to `content/docs/meta.json` `pages`.
- **Existing group:** append the sample's link to that group's `pages`.
- The samples collection's own folder (`src/samples/`, title "Samples") is kept **out**
  of the root `pages`, so it does not appear as a clickable sidebar folder — but its
  `index.mdx` still backs the `/docs/samples` gallery route (used by the top nav). Do
  not delete `src/samples/index.mdx`.

Avoid `"---Label---"` section headers for grouping — they are non-collapsing labels and
put the sample at the *same* level (no hierarchy). Use the group-folder pattern above.

### Appearance / behavior

`packages/web/app/docs/docs.css` (web) — all sidebar styling/layout overrides, keyed on
fumadocs' stable ids (`#nd-sidebar`, `#nd-docs-layout`, `#nd-toc`): width, colors,
fonts, stickiness, header row. Note: `docs.css` HMR is flaky under Turbopack — after
edits, verify via `yarn workspace web build` + static serve, or hard-refresh.

## Notes

- Do NOT write defensive code unless asked; a runtime error beats a masking bug.
- Do NOT add framework or DuckDB dependencies to `static` samples.
- TypeScript strict mode; ESM only.
