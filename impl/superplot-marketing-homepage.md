# Implementation Spec: SuperPlot Marketing Home Page

## 1\. Summary & goal

Build the public SuperPlot marketing site in a new `packages/web` workspace. The functional spec asks for a marketing and product-entry page centered on "The JavaScript grid built for agents", with a hero, copyable agent prompt, demo showcase, guiding principles, feature matrix, FAQ, get-started content, top navigation, and footer (`impl/web-spec.md:3`, `impl/web-spec.md:9`, `impl/web-spec.md:71`, `impl/web-spec.md:81`, `impl/web-spec.md:113`, `impl/web-spec.md:119`, `impl/web-spec.md:147`, `impl/web-spec.md:183`, `impl/web-spec.md:209`, `impl/web-spec.md:227`).

The existing docs app should remain focused on product documentation. The current docs `/` route is a placeholder (`packages/docs/app/(home)/page.tsx:3`) inside the Fumadocs home layout (`packages/docs/app/(home)/layout.tsx:4`), but this plan should not replace it. Instead, create `packages/web` as the static marketing site, link to the existing docs routes where useful, and keep the page compatible with CloudFront/S3 static hosting. Do not embed the existing `hc_samples` app directly in this first implementation because it is a separate React 18/Webpack app while docs uses React 19/Next 16 (`packages/hc_samples/package.json:14`, `packages/hc_samples/package.json:34`, `packages/docs/package.json:19`, `packages/docs/package.json:20`).

## 2\. Current state

| Area | Verified current behavior | Code references |
| --- | --- | --- |
| Repo workspace | Root package is a Yarn workspaces repo over `packages/*`; a new `packages/web` workspace will be picked up by the existing workspace glob. Docs scripts are exposed as `docs:start` and `docs:build`; add parallel `web:start` and `web:build` scripts. | `package.json:5`, `package.json:11`, `package.json:12` |
| Web workspace | No `packages/web/package.json` exists today; the verified workspace package manifests are `docs`, `frameworks`, `grid`, `hc_samples`, and `playground`. | Verified by `find packages -maxdepth 2 -name package.json`; root workspace glob at `package.json:5` |
| Docs app runtime | Docs app is Next 16.2.4, React 19.2.5, Fumadocs UI/Core, Tailwind 4, and `lucide-react`. | `packages/docs/package.json:13`, `packages/docs/package.json:18`, `packages/docs/package.json:19`, `packages/docs/package.json:20`, `packages/docs/package.json:28` |
| Static export precedent | Docs Next config sets `output: 'export'`; `packages/web` should use the same static export mode and should not depend on dynamic server APIs or runtime image optimization. | `packages/docs/next.config.mjs:6`, `packages/docs/next.config.mjs:7` |
| Root app layout | Root layout loads Google Sans and JetBrains Mono, imports global CSS, and wraps all pages in `Provider`. | `packages/docs/app/layout.tsx:1`, `packages/docs/app/layout.tsx:3`, `packages/docs/app/layout.tsx:17`, `packages/docs/app/layout.tsx:24` |
| Theme/search provider | `Provider` is a client component that renders Fumadocs `RootProvider` with the docs search dialog. | `packages/docs/components/provider.tsx:1`, `packages/docs/components/provider.tsx:6`, `packages/docs/components/provider.tsx:7` |
| Global CSS | Tailwind and Fumadocs neutral/preset CSS are already imported globally; heading fonts are forced to mono. | `packages/docs/app/global.css:1`, `packages/docs/app/global.css:2`, `packages/docs/app/global.css:3`, `packages/docs/app/global.css:15` |
| Docs shared metadata | Docs app name and GitHub config are placeholder values: `My App`, `fuma-nama/fumadocs`. Leave this alone unless a later docs cleanup wants shared branding. | `packages/docs/lib/shared.ts:1`, `packages/docs/lib/shared.ts:7`, `packages/docs/lib/shared.ts:8`, `packages/docs/lib/shared.ts:9` |
| Docs shared layout options | `baseOptions()` currently sets only nav title and GitHub URL. It is consumed by both home and docs layouts. The new web app should not depend on this Fumadocs layout. | `packages/docs/lib/layout.shared.tsx:4`, `packages/docs/lib/layout.shared.tsx:6`, `packages/docs/lib/layout.shared.tsx:10`, `packages/docs/app/(home)/layout.tsx:5`, `packages/docs/app/docs/layout.tsx:7` |
| Docs placeholder home route | Docs `HomePage` renders only "Hello World" and a `/docs` link. Leave it as docs-internal placeholder for now; public traffic should go to `packages/web`. | `packages/docs/app/(home)/page.tsx:3`, `packages/docs/app/(home)/page.tsx:5`, `packages/docs/app/(home)/page.tsx:6`, `packages/docs/app/(home)/page.tsx:9` |
| Docs route | `/docs` uses `DocsLayout` with `source.getPageTree()`; docs pages are resolved by `source.getPage(params.slug)`, rendered with `DocsPage`, and statically parameterized by `source.generateParams()`. | `packages/docs/app/docs/layout.tsx:5`, `packages/docs/app/docs/layout.tsx:7`, `packages/docs/app/docs/[[...slug]]/page.tsx:16`, `packages/docs/app/docs/[[...slug]]/page.tsx:18`, `packages/docs/app/docs/[[...slug]]/page.tsx:24`, `packages/docs/app/docs/[[...slug]]/page.tsx:47` |
| Docs source | Fumadocs loader uses `docsRoute` as `baseUrl`, currently `/docs`. Markdown and OG helper routes also derive from `shared.ts`. | `packages/docs/lib/source.ts:3`, `packages/docs/lib/source.ts:6`, `packages/docs/lib/source.ts:7`, `packages/docs/lib/shared.ts:2`, `packages/docs/lib/shared.ts:3`, `packages/docs/lib/shared.ts:4` |
| Docs IA | Current docs tree has Introduction, Concepts, Core Components, and API references; no `/docs/features` page exists. | `packages/docs/content/docs/meta.json:2`, `packages/docs/content/docs/meta.json:5`, `packages/docs/content/docs/meta.json:8`, `packages/docs/content/docs/meta.json:13` |
| Docs intro | The docs introduction frontmatter exists, but the body is only `TODO`. | `packages/docs/content/docs/index.mdx:1`, `packages/docs/content/docs/index.mdx:6` |
| Grid docs content | Renderer docs describe the real grid render cycle and virtualized viewport behavior, useful for feature copy. | `packages/docs/content/docs/renderer/index.mdx:6`, `packages/docs/content/docs/renderer/index.mdx:48`, `packages/docs/content/docs/renderer/index.mdx:51`, `packages/docs/content/docs/renderer/index.mdx:56`, `packages/docs/content/docs/renderer/index.mdx:60` |
| React bindings | `DataGrid` wraps the imperative `Grid`, creates it in an effect, assigns `grid.data`, and calls `grid.draw()` on animation frame. | `packages/frameworks/src/react/DataGrid.tsx:12`, `packages/frameworks/src/react/DataGrid.tsx:44`, `packages/frameworks/src/react/DataGrid.tsx:49`, `packages/frameworks/src/react/DataGrid.tsx:71`, `packages/frameworks/src/react/DataGrid.tsx:72`, `packages/frameworks/src/react/DataGrid.tsx:73` |
| Flat grid hook | `useFlatGrid` owns `SqlStandardTableDataModel`, React cell adapter state, loading/error state, page loading state, and runtime sort/filter/page operations. | `packages/frameworks/src/react/data/useFlatGrid.ts:72`, `packages/frameworks/src/react/data/useFlatGrid.ts:75`, `packages/frameworks/src/react/data/useFlatGrid.ts:76`, `packages/frameworks/src/react/data/useFlatGrid.ts:83`, `packages/frameworks/src/react/data/useFlatGrid.ts:86`, `packages/frameworks/src/react/data/useFlatGrid.ts:424`, `packages/frameworks/src/react/data/useFlatGrid.ts:455` |
| Pivot hook | `usePivotGrid` owns `SqlPivotTableDataModel`, `PivotDataViewModel`, and async load/error state. | `packages/frameworks/src/react/data/usePivotGrid.ts:27`, `packages/frameworks/src/react/data/usePivotGrid.ts:30`, `packages/frameworks/src/react/data/usePivotGrid.ts:32`, `packages/frameworks/src/react/data/usePivotGrid.ts:35`, `packages/frameworks/src/react/data/usePivotGrid.ts:81` |
| Sample app | `hc_samples` registers samples into a module-level array and uses hash routing with `window.location`. | `packages/hc_samples/src/samples/registry.ts:9`, `packages/hc_samples/src/samples/registry.ts:11`, `packages/hc_samples/src/samples/index.ts:1`, `packages/hc_samples/src/App.tsx:5`, `packages/hc_samples/src/App.tsx:10`, `packages/hc_samples/src/App.tsx:60` |
| Sample package mismatch | `hc_samples` depends on React 18, React DOM 18, Webpack 5, and Webpack Dev Server 4; docs depends on React 19 and Next 16. The new web workspace should use React 19/Next 16 to match docs and avoid adding another React major. | `packages/hc_samples/package.json:14`, `packages/hc_samples/package.json:15`, `packages/hc_samples/package.json:16`, `packages/hc_samples/package.json:34`, `packages/hc_samples/package.json:36`, `packages/docs/package.json:19`, `packages/docs/package.json:20` |

## 3\. Design

### Chosen approach

Create a new `packages/web` workspace and i<!-- p-cmt thread_1783333995510_0228am -->mplement a static server-rendered marketing site in `packages/web/app/page.tsx`<!-- /p-cmt --> with a small client island in `packages/web/app/home-client.tsx`. Put all homepage copy, links, demo definitions, feature definitions, FAQ entries, route metadata, and prompt text in a typed `packages/web/app/home-data.ts` module.

<!-- p-cmt thread_1783334044802_2tbtv1 -->The server route renders semantic content for SEO/AEO as build-time static HTML for CloudFront.<!-- /p-cmt --> This is not request-time SSR: the `web` app should follow the docs precedent of `output: 'export'` (`packages/docs/next.config.mjs:7`) and emit static files during `next build`. Client components handle only browser-state interactions:

- copy-to-clipboard for the hero prompt;

- active demo tab;

- theme selector for demo previews;

- prompt overlay/drawer for "See the prompt for this demo";

- FAQ accordion state.

This satisfies the functional spec's "Copy to your agent" hero bridge (`impl/web-spec.md:71`), tabbed demo area (`impl/web-spec.md:81`), per-demo prompt reveal (`impl/web-spec.md:105`), and FAQ section (`impl/web-spec.md:147`) without making the page depend on a dynamic backend.

### Key decisions

| Decision | Rationale | Trade-off |
| --- | --- | --- |
| Create `packages/web` as the public website shell | Root `package.json` includes all `packages/*` workspaces (`package.json:5`), and no `packages/web` package exists yet. The user's requested separation keeps marketing concerns out of Fumadocs. | Adds one workspace and one build/deploy artifact, but avoids coupling the marketing site to docs layout internals. |
| Keep docs in `packages/docs` and link to it | Existing docs source loader uses `/docs` as `baseUrl` (`packages/docs/lib/source.ts:7`), and docs pages already render via Fumadocs (`packages/docs/app/docs/[[...slug]]/page.tsx:24`). | The web app needs explicit external/internal links to docs; docs branding can be cleaned up later. |
| Use static demo previews, not live grid embeds | Directly embedding `hc_samples` would cross React 18/React 19 package boundaries and pull in hash routing/window assumptions (`packages/hc_samples/src/App.tsx:5`, `packages/hc_samples/package.json:15`, `packages/docs/package.json:20`). | Demos are representative previews, not live data-grid instances in v1. Add a dedicated `/demos` implementation later. |
| Isolate interactive state in `packages/web/app/home-client.tsx` | `packages/web/app/page.tsx` can stay a server component while client-only APIs like `navigator.clipboard` remain behind `"use client"`. | Data passed into client components must be JSON-serializable; no React components/functions in `home-data.ts`. |
| Use Tailwind in the new web app without Fumadocs layout | Docs already proves Tailwind 4 is available in the repo (`packages/docs/app/global.css:1`, `packages/docs/package.json:28`), but the marketing site should use its own layout, metadata, colors, and nav. | Duplicates a small amount of layout/theme setup instead of reusing Fumadocs. |
| Set product naming in `packages/web` data | Use "SuperPlot" for the company/product brand and "SuperPlot Grid" when specifically naming the grid library. | Keeps footer/nav concise while giving technical copy a precise product noun. |

### Rejected alternatives

| Alternative | Why rejected |
| --- | --- |
| Embed `packages/hc_samples` inside the homepage | It is a separate React 18/Webpack app (`packages/hc_samples/package.json:14`, `packages/hc_samples/package.json:34`) with hash routing and direct `window.location` usage (`packages/hc_samples/src/App.tsx:5`, `packages/hc_samples/src/App.tsx:30`, `packages/hc_samples/src/App.tsx:33`). Docs is React 19/Next (`packages/docs/package.json:19`, `packages/docs/package.json:20`). |
| Reuse the docs home route | The user requested a different workspace called `web`, and Fumadocs home layout is unnecessary for the marketing site. Keep docs as docs. |
| Move marketing content into MDX | The web homepage needs tabs, copy state, overlays, and responsive preview layouts. MDX is better for long-form docs pages, not the top-level interactive marketing page. |
| Build the full `/grid/*` product route hierarchy now | The functional spec proposes future `/grid` product IA (`impl/web-spec.md:199`), but a single-product homepage can ship faster with root marketing routes and links to existing `/docs`. |
| Add a backend/API for demo prompt fetches | Static export is required for CloudFront/S3. Prompt content is small and can live in `home-data.ts`. |

### CloudFront static URL strategy

The `packages/web` app should be designed for CloudFront in front of S3 static files. Prefer directory-style static URLs by setting `trailingSlash: true` in the new web app's Next config, alongside `output: 'export'`. This produces paths like `/demos/index.html` rather than relying on CloudFront to map `/demos` to `/demos.html`.

| Choice | Proposal | Why |
| --- | --- | --- |
| Export shape | Use `output: 'export'` and `trailingSlash: true` in `packages/web/next.config.mjs`. | Docs already uses static export (`packages/docs/next.config.mjs:7`), and directory-style output works naturally with S3/CloudFront default object resolution. |
| Canonical URLs | Use trailing-slash canonical routes: `/`, `/demos/`, `/features/`, `/our-approach/`, `/contact/`, `/docs/`. | Avoids extension URLs in public copy and makes S3 object layout predictable. |
| CloudFront origin | Prefer S3 REST origin with Origin Access Control plus CloudFront Function rewrites for `/<path>` to `/<path>/index.html` only if needed. S3 website hosting also works but exposes the bucket website endpoint model. | Keeps buckets private with OAC and makes routing behavior explicit. |
| Error handling | Configure CloudFront custom error response for 403/404 to `/404.html` with the proper status. Do not route every 404 to `/index.html` because this is not an SPA-only app. | Preserves SEO correctness and avoids false-success pages for missing docs/routes. |
| Docs links | For v1, link web CTAs to `/docs/` if docs is deployed under the same distribution, or to `https://docs.superplot.dev/` if docs remains separate. | Existing docs route is `/docs` (`packages/docs/lib/source.ts:7`), but deployment topology is a product decision. |
| Asset caching | Set long immutable cache headers for `/_next/static/*` and short or invalidated cache for HTML files. | Static export emits hashed assets but HTML changes across releases. |

### Load-bearing constraints

- The page must remain compatible with static export: no `headers()`, `cookies()`, server actions, DB reads, or runtime fetch for primary content.

- Any module imported by `page.tsx` but containing hooks/browser APIs must be a client component boundary marked `"use client"`.

- `home-data.ts` must export plain serializable objects. Do not store JSX, icons, class instances, functions, `Map`, `Set`, or dates in data arrays.

- Do not add a dependency on `grid` or `frameworks` to `packages/web` in this implementation. Use static demo previews and link to docs/examples instead.

## 4\. Data model & state management

### Static data modules

Create `packages/web/app/home-data.ts`.

```ts
// packages/web/app/home-data.ts
export type HomeLink = {
  label: string;
  href: string;
  external?: boolean;
  ariaLabel?: string;
};

export type HeroContent = {
  headline: string;
  body: string;
  primaryCtas: HomeLink[];
  secondaryCtas: HomeLink[];
  agentPrompt: string;
};

export type DemoTheme = "operator" | "studio" | "contrast";

export type DemoPreviewColumn = {
  key: string;
  label: string;
  align?: "left" | "right";
};

export type DemoPreviewRow = Record<string, string | number>;

export type DemoKpi = {
  label: string;
  value: string;
  trend?: string;
};

export type HomeDemo = {
  id: string;
  title: string;
  eyebrow: string;
  description: string;
  prompt: string;
  docsHref: string;
  githubHref?: string;
  columns: DemoPreviewColumn[];
  rows: DemoPreviewRow[];
  kpis?: DemoKpi[];
  badges?: string[];
};

export type Principle = {
  id: string;
  title: string;
  body: string;
  href: string;
};

export type Feature = {
  id: string;
  title: string;
  body: string;
  href: string;
};

export type FAQ = {
  id: string;
  question: string;
  answer: string;
};
```

Recommended exported values:

| Export | Contents | Source in functional spec |
| --- | --- | --- |
| `heroContent` | Headline, body, "View Demos", "Read about our approach", "GitHub Repo", "Join our Discord", and `agentPrompt`. | `impl/web-spec.md:9`, `impl/web-spec.md:11`, `impl/web-spec.md:67`, `impl/web-spec.md:75` |
| `agentStackItems` | Short bar entries such as "React", "Next", "DuckDB/WASM", "Typed APIs", "LLM prompts". | "Built for any agent and stack" at `impl/web-spec.md:79` |
| `demos` | Four v1 demos: Sales, Infrastructure, Finance, Pivot Analytics. Add Billing/HR/Performance later. | Candidate demo list at `impl/web-spec.md:87` through `impl/web-spec.md:101` |
| `principles` | Headless architecture, full-stack grid, table algebra. | `impl/web-spec.md:117` |
| `features` | Nine feature rows matching the functional spec's feature list. | `impl/web-spec.md:123` through `impl/web-spec.md:141` |
| `faqs` | FAQ entries from the functional spec, with answers grounded in current package support. | `impl/web-spec.md:151` through `impl/web-spec.md:181` |
| `footerLinks` | About, MIT License, GitHub, contact email. | `impl/web-spec.md:227` through `impl/web-spec.md:245` |

### Proposed page copy

Use this copy as the v1 baseline wherever the functional spec left placeholders:

| Surface | Proposed copy |
| --- | --- |
| Hero headline | `The JavaScript grid built for agents.` |
| Hero body | `Create advanced grids, pivots, and data views with typed APIs, composable primitives, and prompts that coding agents can actually follow. Start with a fast grid today; extend it into richer data interfaces tomorrow.` |
| Primary CTAs | `View demos` -> `/#demos`; `Read our approach` -> `/#approach` |
| Agent prompt title | `Copy to your agent` |
| Agent prompt body | `Build a SuperPlot Grid for a revenue operations dashboard. Use a virtualized table with grouped accounts, pinned opportunity columns, sortable ARR, set filters for region and owner, expandable account hierarchy, and a prompt panel that explains every generated grid decision.` |
| Secondary CTAs | `GitHub repo` -> repository URL once confirmed; `Join Discord` -> Discord invite once confirmed; until then use `Contact us` -> `mailto:hello@superplot.dev`. |
| Stack bar | `Built for any agent and stack` with labels `Claude Code`, `Codex`, `Cursor`, `React`, `Next.js`, `DuckDB`, `Typed APIs`. |
| Demos intro | `Every preview below is written as an agent-ready build brief: the UI pattern, data shape, and grid behaviors are explicit enough for an engineer or coding agent to implement without reverse-engineering intent.` |
| Approach intro | `SuperPlot is designed for agentic development: a headless rendering core, full-stack data transformations, and table algebra that make grid behavior describable, testable, and composable.` |
| Feature intro | `Core capabilities cover the grid behaviors teams usually rebuild by hand: virtualization, grouping, pivots, tree data, sorting, filtering, pagination, custom renderers, real-time updates, and advanced row/column interaction.` |
| Get started | `Install the grid, choose a data model, describe the view you want, and wire the generated configuration into your app. The same primitives work for hand-written TypeScript and agent-generated code.` |
| Footer | `SuperPlot` / `(c) DataFlow Solutions Pte Ltd, 2026` / `hello@superplot.dev`. |

### Proposed routes and naming

| Decision | Proposal |
| --- | --- |
| Workspace | `packages/web` |
| Package name | `web` |
| Public brand | `SuperPlot` |
| Product noun | `SuperPlot Grid` when referring to the grid library specifically |
| Root homepage | `/` |
| Demos | `/#demos` for v1 section; later `/demos/` when live or full-page demos exist |
| Features | `/#features` for v1 section; later `/features/` if feature pages are added |
| Approach | `/#approach` for v1 section; later `/our-approach/` if the manifesto grows |
| Docs | `/docs/` if deployed in the same CloudFront distribution, otherwise an external docs subdomain |
| Contact | `/contact/` can be deferred; v1 nav can use `mailto:hello@superplot.dev` |
| License | Do not display `MIT License` until a root or package-level license file exists; no `LICENSE` file was found in the checkout. Use `License` as a future footer item only after confirming the license. |

### Univer reference treatment

Use Univer as a layout reference, not a visual clone. The reference pattern to carry over is:

- left hero with a crisp agent-facing product claim;

- right hero prompt card labeled "Copy to your agent" with a visible copy action;

- secondary GitHub/community CTA near the prompt card;

- post-hero bar communicating agent and stack compatibility;

- dense, product-led sections below the fold.

SuperPlot's visual language should differ: use actual grid/table preview surfaces, data-state badges, small charts, column/row affordances, and prompt snippets rather than spreadsheet imagery. The design should feel like a serious developer data tool, not a generic AI landing page.

### Client state

All state is local and ephemeral. Nothing is persisted to storage in v1.

| State | Owner | Initial value | Mutations | Invariant |
| --- | --- | --- | --- | --- |
| `copyState` | `CopyPromptButton` in `home-client.tsx` | `"idle"` | Set to `"copied"` on successful `navigator.clipboard.writeText`; set `"error"` on failure; reset via timeout. | Never blocks rendering; button remains usable when clipboard fails. |
| `activeDemoId` | `HomeDemoTabs` in `home-client.tsx` | `demos[0]?.id` | Tab button click. | Must resolve to an existing demo; if not, use first demo. |
| `activeTheme` | `HomeDemoTabs` or `DemoThemePicker` | `"operator"` | Segmented control change. | Must be one of `DemoTheme`. |
| `openPromptDemoId` | `HomeDemoTabs` | `null` | "See prompt" click opens; close button/Escape/backdrop closes. | At most one prompt overlay open. |
| `openFaqId` | `FAQAccordion` | first FAQ ID or `null` | Question button toggles. | At most one open FAQ unless later changed to multi-open. |

### Navigation metadata

Create web-local metadata in `packages/web/app/home-data.ts` or `packages/web/lib/site.ts`; do not modify docs metadata for this homepage pass.

```ts
// packages/web/lib/site.ts
export const appName = "SuperPlot";
export const productName = "SuperPlot Grid";
export const contactEmail = "hello@superplot.dev";

export const gitConfig = {
  user: "dataflow",
  repo: "nebula",
  branch: "main",
};

export const siteLinks = {
  home: "/",
  demos: "/#demos",
  approach: "/#approach",
  features: "/#features",
  docs: "/docs/",
  contact: "mailto:hello@superplot.dev",
};
```

`gitConfig` values are a proposal and need confirmation before publish. The docs app currently has placeholder values at `packages/docs/lib/shared.ts:7` through `packages/docs/lib/shared.ts:10`, but the web app should not depend on that file.

The web app should render its own nav from `siteLinks`:

```tsx
// packages/web/app/page.tsx
const navLinks = [
  { label: "Home", href: siteLinks.home },
  { label: "Approach", href: siteLinks.approach },
  { label: "Demos", href: siteLinks.demos },
  { label: "Features", href: siteLinks.features },
  { label: "Docs", href: siteLinks.docs },
  { label: "Contact", href: siteLinks.contact },
];
```

## 5\. Control flow

### Static page render

1. Next resolves `/` to `packages/web/app/page.tsx`.

2. `packages/web/app/layout.tsx` sets HTML metadata, imports `packages/web/app/global.css`, and renders the site shell without Fumadocs `HomeLayout`.

3. `packages/web/app/page.tsx` imports static arrays from `home-data.ts`.

4. `HomePage` renders:

- hero section with heading/body/CTAs and an agent prompt panel;

- agent stack bar;

- `HomeDemoTabs` client component;

- guiding principles;

- feature matrix;

- optional "Why SuperPlot" comparison band;

- `FAQAccordion` client component;

- get-started section;

- footer.

5. `yarn workspace web build` runs `next build`; with `output: 'export'`, Next emits static HTML/assets into `packages/web/out`.

6. CloudFront serves the exported HTML. Crawlers and answer engines receive the meaningful page content in the initial HTML; client hydration only activates copy, tabs, prompt dialog, theme selector, and FAQ accordion.

### Copy prompt flow

1. User clicks "Copy to your agent" in `CopyPromptButton`.

2. Component checks `navigator.clipboard?.writeText`.

3. If available, await `navigator.clipboard.writeText(prompt)`.

4. On success, set `copyState = "copied"` and update label to "Copied".

5. Start a timeout to reset to `"idle"` after about 1800 ms.

6. On failure or missing Clipboard API, set `"error"` and expose a compact fallback message. The prompt remains visible for manual selection.

7. Cleanup timeout on unmount to avoid setting state after unmount.

Failure behavior: no rollback is needed because the only side effect is attempting a clipboard write. The visible prompt is always the source of truth.

### Demo tab flow

1. `HomeDemoTabs` receives `demos` as a serialized array.

2. Initialize `activeDemoId` to `demos[0]?.id`.

3. Compute `activeDemo = demos.find((demo) => demo.id === activeDemoId) ?? demos[0]`.

4. Render tab buttons with `aria-selected`, `role="tab"`, and stable `id`/`aria-controls`.

5. User clicks a tab; set `activeDemoId`.

6. Preview panel re-renders synchronously with the selected demo's table rows, KPIs, badges, and links.

7. "See prompt" sets `openPromptDemoId = activeDemo.id`.

8. Prompt overlay renders the active demo prompt; close button/backdrop/Escape clears `openPromptDemoId`.

Failure behavior: if `demos` is empty, render `null` for the tab component and keep the rest of the page intact. Static data should not be empty.

### Theme selector flow

1. `HomeDemoTabs` owns `activeTheme`.

2. Theme segmented buttons set `activeTheme` synchronously.

3. Preview panel applies a class/data attribute such as `data-theme={activeTheme}`.

4. Theme changes do not mutate demo data; only presentation changes.

### FAQ flow

1. `FAQAccordion` receives `faqs`.

2. Initialize `openFaqId` to the first FAQ ID or `null`.

3. Render each question as a button with `aria-expanded`.

4. User clicks question:

- if already open, set `openFaqId = null`;

- otherwise set `openFaqId = faq.id`.

5. Answer panel conditionally renders for the open item.

### Docs/navigation flow

1. Internal links use Next `Link` in server components where imported.

2. Hash links (`/#demos`, `/#approach`, `/#features`) target section IDs on the same page.

3. `/docs/` links target the existing docs app route if web and docs share one CloudFront distribution. If docs is deployed separately, set `siteLinks.docs` to the docs domain instead.

4. External links use normal anchors with `target="_blank"` and `rel="noreferrer"` when the target is not same-origin.

5. Mail links use `mailto:hello@superplot.dev` from the functional spec (`impl/web-spec.md:239`).

## 6\. Key logic (pseudocode / trimmed code)

### `packages/web/app/page.tsx` near new `HomePage`

Create the new web homepage route in `packages/web/app/page.tsx`.

```tsx
// packages/web/app/page.tsx
import Link from "next/link";
import {
  agentStackItems,
  demos,
  faqs,
  features,
  footerLinks,
  getStartedSteps,
  heroContent,
  principles,
} from "./home-data";
import { CopyPromptButton, FAQAccordion, HomeDemoTabs } from "./home-client";

export default function HomePage() {
  return (
    <main className="min-h-screen">
      <section className="mx-auto grid max-w-7xl gap-10 px-6 py-16 lg:grid-cols-[1fr_460px]">
        <div>
          <h1>{heroContent.headline}</h1>
          <p>{heroContent.body}</p>
          <div>
            {heroContent.primaryCtas.map((link) => (
              <HomeLink key={link.href} link={link} />
            ))}
          </div>
        </div>

        <aside aria-label="Agent prompt">
          <pre>{heroContent.agentPrompt}</pre>
          <CopyPromptButton text={heroContent.agentPrompt} />
          <div>
            {heroContent.secondaryCtas.map((link) => (
              <HomeLink key={link.href} link={link} />
            ))}
          </div>
        </aside>
      </section>

      <AgentStack items={agentStackItems} />
      <section id="demos"><HomeDemoTabs demos={demos} /></section>
      <section id="approach"><Principles items={principles} /></section>
      <section id="features"><FeatureMatrix features={features} /></section>
      <FAQAccordion faqs={faqs} />
      <GetStarted steps={getStartedSteps} />
      <Footer links={footerLinks} />
    </main>
  );
}
```

### `packages/web/app/home-client.tsx` client boundary

```tsx
// packages/web/app/home-client.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import type { FAQ, HomeDemo, DemoTheme } from "./home-data";

export function CopyPromptButton({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");

  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    if (state === "idle") return;
    const id = window.setTimeout(() => setState("idle"), 1800);
    return () => window.clearTimeout(id);
  }, [state]);

  return (
    <button type="button" onClick={copy} aria-live="polite">
      {state === "copied" ? "Copied" : "Copy to your agent"}
    </button>
  );
}
```

```tsx
// packages/web/app/home-client.tsx
export function HomeDemoTabs({ demos }: { demos: HomeDemo[] }) {
  const [activeDemoId, setActiveDemoId] = useState(demos[0]?.id ?? "");
  const [activeTheme, setActiveTheme] = useState<DemoTheme>("operator");
  const [openPromptDemoId, setOpenPromptDemoId] = useState<string | null>(null);

  const activeDemo = useMemo(
    () => demos.find((demo) => demo.id === activeDemoId) ?? demos[0],
    [activeDemoId, demos],
  );
  const promptDemo = demos.find((demo) => demo.id === openPromptDemoId);

  if (!activeDemo) return null;

  return (
    <div>
      <div role="tablist" aria-label="Demo use cases">
        {demos.map((demo) => (
          <button
            key={demo.id}
            type="button"
            role="tab"
            aria-selected={demo.id === activeDemo.id}
            onClick={() => setActiveDemoId(demo.id)}
          >
            {demo.title}
          </button>
        ))}
      </div>

      <ThemePicker value={activeTheme} onChange={setActiveTheme} />
      <DemoPreview demo={activeDemo} theme={activeTheme} />

      <button type="button" onClick={() => setOpenPromptDemoId(activeDemo.id)}>
        See the prompt for this demo
      </button>

      {promptDemo ? (
        <PromptDialog demo={promptDemo} onClose={() => setOpenPromptDemoId(null)} />
      ) : null}
    </div>
  );
}
```

```tsx
// packages/web/app/home-client.tsx
export function FAQAccordion({ faqs }: { faqs: FAQ[] }) {
  const [openId, setOpenId] = useState(faqs[0]?.id ?? null);

  return (
    <section id="faq">
      {faqs.map((faq) => {
        const open = faq.id === openId;
        return (
          <article key={faq.id}>
            <button
              type="button"
              aria-expanded={open}
              aria-controls={`faq-${faq.id}`}
              onClick={() => setOpenId(open ? null : faq.id)}
            >
              {faq.question}
            </button>
            {open ? <p id={`faq-${faq.id}`}>{faq.answer}</p> : null}
          </article>
        );
      })}
    </section>
  );
}
```

### Link helper in `page.tsx`

```tsx
// packages/web/app/page.tsx
function HomeLink({ link }: { link: HomeLink }) {
  if (link.external) {
    return (
      <a href={link.href} target="_blank" rel="noreferrer" aria-label={link.ariaLabel}>
        {link.label}
      </a>
    );
  }

  if (link.href.startsWith("mailto:")) {
    return <a href={link.href}>{link.label}</a>;
  }

  return <Link href={link.href}>{link.label}</Link>;
}
```

### Demo preview logic

```tsx
// packages/web/app/home-client.tsx
function DemoPreview({ demo, theme }: { demo: HomeDemo; theme: DemoTheme }) {
  return (
    <div data-demo-theme={theme}>
      <header>
        <p>{demo.eyebrow}</p>
        <h3>{demo.title}</h3>
        <p>{demo.description}</p>
      </header>

      {demo.kpis?.length ? (
        <dl>
          {demo.kpis.map((kpi) => (
            <div key={kpi.label}>
              <dt>{kpi.label}</dt>
              <dd>{kpi.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div role="table" aria-label={`${demo.title} preview`}>
        <div role="row">
          {demo.columns.map((column) => (
            <div role="columnheader" key={column.key}>{column.label}</div>
          ))}
        </div>
        {demo.rows.map((row, index) => (
          <div role="row" key={index}>
            {demo.columns.map((column) => (
              <div role="cell" key={column.key}>{row[column.key]}</div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Existing grid behavior to describe accurately in homepage copy

Do not claim unverified internals. The following claims are grounded:

```ts
// packages/frameworks/src/react/DataGrid.tsx
const grid = new Grid(config, containerRef.current, layout, handlers);
grid.data = data;
grid.draw();
```

This is verified by `DataGrid` constructing `Grid` at `packages/frameworks/src/react/DataGrid.tsx:49`, assigning `grid.data` at `packages/frameworks/src/react/DataGrid.tsx:72`, and drawing at `packages/frameworks/src/react/DataGrid.tsx:73`.

```ts
// packages/frameworks/src/react/data/useFlatGrid.ts
const pageIR = { ...activeIRRef.current, startRow, endRow };
const result = await model.getViewModelData(pageIR);
applyResult(result);
gridRef.current?.grid.scheduleDraw();
```

This is verified in `fetchPage` at `packages/frameworks/src/react/data/useFlatGrid.ts:343` through `packages/frameworks/src/react/data/useFlatGrid.ts:353`. Homepage feature copy can mention paged/virtualized rendering and async data refresh, but should not imply a complete production demo embed on `/` yet.

## 7\. File-by-file change plan

| File | Change | Why | Hook/reference |
| --- | --- | --- | --- |
| `package.json` | Add `web:start` and `web:build` scripts that call `yarn workspace web dev` and `yarn workspace web build`. | Root already exposes docs/sample scripts; web should be first-class. | Existing scripts at `package.json:8` through `package.json:16`; workspace glob at `package.json:5`. |
| `packages/web/package.json` | Add new workspace package named `web` with Next, React, React DOM, Tailwind, TypeScript, and `lucide-react` dependencies aligned with docs where possible. | User requested a separate web workspace; no `packages/web` exists today. | Existing docs versions at `packages/docs/package.json:18` through `packages/docs/package.json:21`, `packages/docs/package.json:28` through `packages/docs/package.json:36`. |
| `packages/web/next.config.mjs` | Configure `output: 'export'`, `trailingSlash: true`, and `reactStrictMode: true`. | Supports CloudFront/S3 static hosting and directory-style URLs. | Static export precedent at `packages/docs/next.config.mjs:6` through `packages/docs/next.config.mjs:8`. |
| `packages/web/tsconfig.json`, `packages/web/postcss.config.mjs`, `packages/web/eslint.config.mjs` | Add package-local TS, PostCSS, and lint config based on docs conventions. | Keeps web build independent from Fumadocs internals. | Docs package has equivalent config files in `packages/docs/`. |
| `packages/web/app/layout.tsx` | Add root HTML layout, metadata, font setup, and import `global.css`. | Web app should own its shell instead of using Fumadocs `HomeLayout`. | Docs root layout is a reference at `packages/docs/app/layout.tsx:17` through `packages/docs/app/layout.tsx:24`. |
| `packages/web/app/global.css` | Add Tailwind import, base tokens, responsive layout variables, and light/dark-safe colors. | Marketing visual design should be independent from docs' Fumadocs preset. | Docs imports Tailwind globally at `packages/docs/app/global.css:1`. |
| `packages/web/app/home-data.ts` | Add typed static content exports for hero, prompt, demo previews, principles, features, FAQ, get-started steps, footer, route links, and proposed copy. | Keeps route deterministic and serializable; supports static export and client tabs/accordion without runtime fetch. | Imported by new `packages/web/app/page.tsx`. |
| `packages/web/app/home-client.tsx` | Add `"use client"` components: `CopyPromptButton`, `HomeDemoTabs`, `FAQAccordion`, internal `DemoPreview`, `PromptDialog`, `ThemePicker`. | Isolates browser APIs and React state from the static server route. | Use `lucide-react`; docs already carries that dependency at `packages/docs/package.json:18`. |
| `packages/web/app/page.tsx` | Add full landing page composition. | Implements the functional spec homepage in the new web workspace. | Functional spec homepage requirements at `impl/web-spec.md:3` through `impl/web-spec.md:245`. |
| `packages/web/app/not-found.tsx` | Add a static not-found page. | CloudFront should serve a real `/404.html` instead of rewriting all misses to home. | CloudFront error strategy in this spec's URL section. |
| `packages/docs/content/docs/index.mdx` | Optional later, not part of web homepage: replace `TODO` with a usable docs introduction. | Web CTAs may point to docs; current docs intro is weak. | Current docs intro body at `packages/docs/content/docs/index.mdx:6`. |
| `packages/docs/content/docs/meta.json` | Optional later: add real feature pages or a features grouping. | Functional spec references `/docs/features`, but current docs tree has no such page. | Current pages array at `packages/docs/content/docs/meta.json:2` through `packages/docs/content/docs/meta.json:14`. |

Do not modify `packages/hc_samples` for this homepage implementation. It can remain a reference for future live demos.

## 8\. Edge cases, failure modes & concurrency

| Case | Handling |
| --- | --- |
| Clipboard API unavailable | `CopyPromptButton` catches the failure, sets error state, and leaves prompt visible for manual copy. No page-level error. |
| Clipboard promise rejects due to browser permission | Same as unavailable clipboard. Reset status after timeout so user can retry. |
| Component unmount during copy-status timeout | Cleanup timeout in `useEffect` to avoid state updates after unmount. |
| Empty `demos` array | `HomeDemoTabs` returns `null`. Static data should include at least four demos to satisfy the spec. |
| Stale `activeDemoId` after data edit/hot reload | Compute active demo with fallback to `demos[0]`. |
| Prompt overlay open and active tab changes | Keep prompt tied to `openPromptDemoId`; changing tabs does not silently swap the prompt. User closes/open prompt explicitly. |
| Escape key in prompt overlay | Add `keydown` listener only while overlay is open; cleanup on close/unmount. |
| Hash navigation under web layout | Section IDs must be stable (`demos`, `approach`, `features`, `faq`). Verify sticky headers do not obscure anchors; add `scroll-mt-*` classes where needed. |
| Static export | All content is local imports. Do not call dynamic Next APIs. Avoid `next/image` unless configured for static export with unoptimized images. |
| CloudFront clean URLs | Use `trailingSlash: true` in `packages/web/next.config.mjs`, then deploy directory-style output. If CloudFront/S3 still receives `/demos` without slash, add a CloudFront Function redirect to `/demos/`. |
| Shared nav regression | Web nav is local to `packages/web`; docs Fumadocs nav should not change in this pass. Build and manually check web `/` plus docs `/docs` if deployed together. |
| External link uncertainty | If public GitHub/Discord URLs are not confirmed, use placeholders only where clearly marked, or keep Discord as a mail/contact CTA until a real URL is provided. |
| React server/client boundary | `packages/web/app/home-client.tsx` imports only serializable types/data. `packages/web/app/page.tsx` can import client components, but must not pass functions or JSX through props. |
| Accessibility | Demo tabs use `role="tablist"`/`role="tab"` and `aria-selected`; FAQ buttons use `aria-expanded` and `aria-controls`; prompt dialog needs `role="dialog"`, `aria-modal`, close button, and focus management. |
| Concurrent rapid tab/theme clicks | State changes are synchronous and local; latest click wins. No async request is fired. |
| Concurrent copy clicks | Multiple clipboard writes may race only in status labels. Disable button while pending or track `"copying"` state if this becomes visible. |
| Dark mode readability | Web app should define explicit light/dark-safe tokens in `packages/web/app/global.css`; do not rely on Fumadocs provider behavior. |
| Homepage claims exceeding implementation | Copy must distinguish static preview demos from live embedded demos. Do not imply `/` runs the real grid until a live demo route is implemented. |

## 9\. <!-- p-cmt thread_1783334381794_g2ttnk -->Decisions, proposals & risks<!-- /p-cmt -->

1. Public GitHub URL proposal: use `https://github.com/dataflow/nebula` until the real public repository is confirmed. Current docs code has placeholder `fuma-nama/fumadocs` (`packages/docs/lib/shared.ts:8`, `packages/docs/lib/shared.ts:9`), and the functional spec only says "Github Repo" (`impl/web-spec.md:77`) and GitHub icon (`impl/web-spec.md:223`).

2. Discord proposal: keep the CTA label as `Join Discord`, but if no invite exists at implementation time, route the visible CTA to `mailto:hello@superplot.dev` and label it `Contact us`. The functional spec asks for "Join our Discord" (`impl/web-spec.md:77`) but provides no URL.

3. Route proposal: use homepage hash sections for v1 (`/#approach`, `/#demos`, `/#features`) and reserve full routes (`/our-approach/`, `/demos/`, `/features/`) for when those sections need their own content depth. Functional spec lists both root routes and a guiding-principles section (`impl/web-spec.md:117`, `impl/web-spec.md:191`, `impl/web-spec.md:213`).

4. Product naming proposal: use `SuperPlot` in nav/footer and `SuperPlot Grid` in technical copy, FAQ answers, and docs CTAs. Footer says SuperPlot (`impl/web-spec.md:231`), while FAQ wording says "SuperPlot grid" (`impl/web-spec.md:151`, `impl/web-spec.md:159`).

5. License proposal: do not display `MIT License` in the footer until a `LICENSE` file or package license metadata exists. The functional spec asks for it (`impl/web-spec.md:235`), but this checkout did not show a root `LICENSE` file.

6. Univer reference proposal: follow the content architecture, not the styling verbatim. Use a left hero claim, right "Copy to your agent" card, community CTAs, and agent-stack bar; make SuperPlot visually distinct with grid previews, table controls, data badges, and chart fragments.

7. Live demos remain a future risk. The best v1 approach is static previews because docs and samples are on different React majors (`packages/docs/package.json:20`, `packages/hc_samples/package.json:15`). A future live demo page should align package versions or expose framework-neutral web components.

8. `/docs/features` does not exist today. Feature CTAs should link to existing docs sections such as `/docs/renderer`, `/docs/datamodel`, `/docs/viewmodel`, and `/docs/api-references` until feature pages are added (`packages/docs/content/docs/meta.json:8` through `packages/docs/content/docs/meta.json:13`).