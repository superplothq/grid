# SuperPlot Web Implementation Spec

## 1\. Summary & goal

Build the first static SuperPlot web surface for the grid product. The first production route is `/grid`, not `/`; `/` can be introduced later as a broader company/product entry point. The site presents SuperPlot as an agent-first JavaScript grid library with a full-viewport hero, "copy to your agent" bridge, demo navigation with empty grid frames, collapsible demo conversation chatboxes, guiding principles, core capabilities, comparison scaffold, FAQ, get-started content, top navigation, and footer.

<!-- p-cmt thread_1783374603873_eib4an -->The implementation should live in a new `packages/web` Yarn workspace package, statically generate deployable assets for CloudFront, and own the `/grid/...`, `/about`, and `/contact` web routes for this product site<!-- /p-cmt -->. The homepage should make the library's positioning clear: composable grid primitives for agents, fullstack/headless data architecture, table algebra, and demos that show how human/agent conversations create grids.

The web package is a static site: all marketing copy, feature text, FAQ answers, demo conversation messages, anchors, and structured metadata must be present in generated HTML for SEO and AEO. Client-side code may enhance visibility, animation, copy affordances, and future grid rendering, but SEO-critical content must not depend on hydration.

## 2<!-- p-cmt thread_1783374806833_x3125t -->. Current state<!-- /p-cmt -->

| Area | Current state | Verified references |
| --- | --- | --- |
| Workspace shape | The root workspace includes all direct packages under `packages/*`; adding `packages/web` will make it a Yarn workspace package. | `package.json:5`, `package.json:6` |
| Existing packages | The checkout currently has `packages/docs`, `packages/frameworks`, `packages/grid`, and `packages/playground`; `packages/web` does not exist yet. | Verified with `find packages -maxdepth 2 -type f -name package.json`. |
| <!-- p-cmt thread_1783375944523_h7prwt -->Legacy `/docs` package presence<!-- /p-cmt --> | `packages/docs` exists, but it is legacy/out of scope for this implementation. `/grid/docs` is a separate future grid-product surface and must not be treated as a rewrite or alias of `/docs`. | `packages/docs/package.json:2` confirms the package exists. |
| Grid package | `packages/grid` is the product library that future live demo frames will render with. | `packages/grid/package.json` exists in the workspace. |
| Playground references | `packages/playground` contains sample/demo code that may inform future `/grid/samples` content, but the initial `/grid` page uses static empty frames. | `packages/playground/package.json` exists in the workspace. |
| Git remote | The checkout's remote is temporary input for GitHub link assumptions until final SuperPlot repo details are supplied. | `git remote -v` reports `git@github.com:adotg/dataflow-nebula.git`. |

## 3\. Design

### Chosen approach

Create a new static web package at `packages/web` <!-- p-cmt thread_1783374929182_avt04u -->implemented as static-first HTML with progressive enhancement only for URL-backed presentation, animation, optional copy affordances, collapsible UI polish, and future grid mounts<!-- /p-cmt -->.

- `/grid` is the primary grid product page for this iteration. Always use `/grid` for grid product navigation now; `/` is reserved for a later broader landing page.

- The static HTML is the source of truth for all copy, FAQ answers, feature descriptions, demo metadata, demo conversation chat messages, route links, and deep-linkable anchors.

- Demo tabs are URL-backed anchor navigation over real server-rendered sections. Use slash-like hash paths such as `#demos/sales`, not stacked hashes.

- Demo conversation display is a collapsible chatbox component under each demo frame. It is not an overlay and does not need to drive URL changes.

- Grid demo frames are static empty containers now. Later, client-side grid code can mount into those containers while preserving static fallback content.

- `/grid/docs`, `/grid/docs/features`, `/grid/samples`, and `/grid/demos` are grid-product surfaces. They may be implemented in `packages/web` now as dummy/static routes, or later in a different package; they are not coupled to legacy `/docs`.

- `/about` and `/contact` are root routes and stay as-is.

- The build output must be static assets deployable to S3 + CloudFront. No server actions, API routes, request-time rendering, sessions, cookies, or runtime secrets.

### Design details

The functional spec asks for a Univer.ai-like hero. Implement the same product posture, not a clone:

| Area | Direction |
| --- | --- |
| First viewport | A two-column hero on desktop: left product claim/CTAs, right "Copy to your agent" bridge. Mobile stacks the bridge below the claim. |
| Hero tone | Work-focused, agent-native, technical. The H1 should be "The JavaScript grid built for agents" or a close variant. |
| Bridge panel | Use a code/prompt panel that users can read and optionally copy. It should look like a practical artifact, not a decorative card. |
| Post-hero bar | A compact "Built for any agent and stack" band remains visible in the first viewport or immediately after it. |
| Demos | Use tab-like anchors for the demo use cases; each selected demo has a static empty grid frame and a collapsible conversation chatbox. |
| Visual style | Quiet, precise, technical UI; avoid marketing fluff, oversized decorative cards, and one-note color palettes. |
| Static-first interactions | CSS handles baseline layout, anchors, `:target`, and collapsible content. Optional JS only improves animation, active styling, copy, and future grid mounts. |
| SEO/AEO | Use semantic sections, one H1, clear H2/H3 hierarchy, FAQ HTML, canonical URLs, Open Graph/Twitter metadata, and JSON-LD for Organization, WebSite, SoftwareApplication/Product, BreadcrumbList, and FAQPage. |

### Key decisions

| Decision | Rationale | Trade-off |
| --- | --- | --- |
| Add `packages/web` as a new workspace package | The root workspace glob already includes `packages/*`, and the product site should be isolated from legacy docs. | Requires package scaffold and root scripts. |
| Make `/grid` the current product entry point | Review direction says grid routes always use `/grid` now; `/` may come later. | `/` can redirect or be omitted until a later iteration. |
| Keep SEO/AEO content in HTML | Search engines, answer engines, link previews, and no-JS users need complete content without client code. | Client code cannot own copy or canonical selection state. |
| Use slash-like hash paths for micro-navigation | `#demos/sales` expresses hierarchy without invalid stacked hashes. | CSS selectors need escaping or data-attribute enhancement for richer styling. |
| Render all primary route pages with dummy content | Review direction says all routes should be full routes even if data comes in the next iteration. | More placeholder pages, but no broken nav/CTA paths. |
| Use empty grid frames now | Functional source asks to create frames and add demos progressively. | Users initially see placeholder frames, not live demos. |
| Use collapsible demo conversation chatboxes | Demo conversation history explains how agent/human collaboration creates each grid. | Requires a dedicated component and content model instead of simple prompt lists. |
| Use concrete temporary brand/link values | Avoid ambiguous placeholders in implementation instructions. | Temporary values must be listed for later correction. |

<!-- p-cmt thread_1783407874540_2i4l1m -->Rejected alternatives<!-- /p-cmt --> section removed. The spec now states positive design decisions and implementation boundaries instead of listing alternatives that do not apply to the settled static `/grid` web direction.

### Load-bearing constraints

- `packages/web` must generate static assets suitable for S3 + CloudFront.

- Package scaffold prerequisite: <!-- p-cmt thread_1783408710537_g2l8wy -->`packages/web` must be added before `web:start` or `web:build` can work.<!-- /p-cmt -->

- Static-site prerequisite: <!-- p-cmt thread_1783408772905_2831jm -->do not design server actions, API routes, request-time rendering, or runtime-only configuration for this package.<!-- /p-cmt -->

- Grid-related web routes use `/grid/...` now. `/` is not the grid homepage in this iteration.

- SEO/AEO content must exist in the initial HTML: one H1, semantic sections, crawlable links, FAQ question/answer text, demo labels, demo conversation messages, and JSON-LD.

- Links exposed in top nav must resolve. If <!-- p-cmt thread_1783375530968_wic89m -->`/grid/our-approach`, `/grid/demos`, `/grid/docs/features`,<!-- /p-cmt --> `/about`, or `/contact` are included, create full static routes with dummy content when final content is not available.

- Hash fragments are not sent to CloudFront or the origin. They work by browser-native scrolling and optional static enhancement after the HTML loads.

- The first two visual areas, hero and "Built for any agent and stack" bar, must occupy the initial viewport while leaving a hint of the next section visible on common desktop and mobile viewports.

- Copy-to-clipboard is optional enhancement. The required baseline is visible, selectable prompt text.

- Future grid rendering is the only feature that may require client-side rendering for core functionality. Empty grid frames must have static fallback content today.

## 4\. Design Components

Build the web package around explicit static components. These are required before the data model is useful.

| Component | File | Props | Purpose | Static content requirement |
| --- | --- | --- | --- | --- |
| `SiteLayout` | `packages/web/app/layout.tsx` | `children`, metadata defaults | Root shell, fonts/CSS, canonical metadata defaults | Emits static HTML shell. |
| `TopNav` | `packages/web/components/site/TopNav.tsx` | `items`, `activePath?` | Header nav for `/grid`, `/grid/demos`, `/grid/docs`, `/grid/samples`, `/about`, `/contact` | Links are real anchors. |
| `Hero` | `packages/web/components/home/Hero.tsx` | `copyToAgentPrompt`, `githubUrl`, `discordUrl` | Left product claim plus right copy-to-agent bridge | Prompt text is in HTML. |
| `AgentStackBar` | `packages/web/components/home/AgentStackBar.tsx` | `items` | "Built for any agent and stack" post-hero band | Text in HTML. |
| `DemoTabs` | `packages/web/components/home/DemoTabs.tsx` | `demos` | Anchor-based demo navigation with `#demos/<demoKey>` links | All links and labels in HTML. |
| `DemoFrame` | `packages/web/components/home/DemoFrame.tsx` | `demoKey`, `mountId`, `title`, `summary` | Static empty grid frame and future client mount point | Fallback visible if grid does not mount. |
| <!-- p-cmt thread_1783409279354_h1p3x9 -->`DemoConversationChatbox`<!-- /p-cmt --> | `packages/web/components/home/DemoConversationChatbox.tsx` | `conversation`, `defaultOpen?` | Collapsible agent/human conversation transcript for a demo | All messages rendered in HTML. |
| `PrinciplesSection` | `packages/web/components/home/PrinciplesSection.tsx` | `principles` | Headless architecture, fullstack grid, table algebra cards/links | Text and links in HTML. |
| `FeatureGrid` | `packages/web/components/home/FeatureGrid.tsx` | `features` | 9 core capabilities with links to `/grid/docs/...` or dummy pages | Text and links in HTML. |
| `ComparisonScaffold` | `packages/web/components/home/ComparisonScaffold.tsx` | `rows` | Placeholder "Why SuperPlot?" table | Clearly dummy/non-claim content. |
| `FaqSection` | `packages/web/components/home/FaqSection.tsx` | `items` | LLM-friendly FAQ | Question/answer text in HTML. |
| `GetStartedSection` | `packages/web/components/home/GetStartedSection.tsx` | `steps`, `primaryHref` | Install/get-started CTA | Steps in HTML. |
| `SiteFooter` | `packages/web/components/site/SiteFooter.tsx` | `links`, `contactEmail`, `socialLinks` | Footer links and company/legal text | Links in HTML. |
| `JsonLd` | `packages/web/components/seo/JsonLd.tsx` | `siteConfig`, `faqItems` | Structured data | Emits script tags at build time. |
| `GridMountEnhancer` | static script or client entry | none or data attributes | Future grid mounting into `[data-grid-demo]` frames | Not required for content. |

## 5\. <!-- p-cmt thread_1783409514226_87419f -->Data model <!-- /p-cmt -->& state management

### Static content model

Define marketing content as readonly TypeScript data in `packages/web/lib/home-content.ts`. These values are build-time constants rendered into HTML.

```ts
// packages/web/lib/home-content.ts
export type DemoKey =
  | 'sales'
  | 'infrastructure'
  | 'finance'
  | 'billing'
  | 'hr'
  | 'pivot-analytics'
  | 'performance'
  | 'data-wrangling'
  | 'custom-filters';

export interface DemoConversationMessage {
  role: 'human' | 'agent';
  body: string;
  code?: string;
}

export interface DemoUseCase {
  key: DemoKey;
  hashPath: `demos/${string}`;
  label: string;
  theme: string;
  summary: string;
  conversation: DemoConversationMessage[];
  gridMountId: `grid-demo-${string}`;
}

export interface Principle {
  slug: string;
  title: string;
  body: string;
  href: string;
}

export interface FeatureLink {
  hashPath: `features/${string}`;
  title: string;
  body: string;
  href: string;
  icon: 'gauge' | 'layers' | 'tree' | 'table' | 'server' | 'filter' | 'radio' | 'move' | 'palette';
}

export interface FaqItem {
  hashPath: `faq/${string}`;
  question: string;
  answer: string;
}
```

| Shape | Source of truth | Lifecycle | Invariants |
| --- | --- | --- | --- |
| <!-- p-cmt thread_1783376330399_q33tnw -->`copyToAgentPrompt`<!-- /p-cmt --> | Static string constant | Rendered into the hero bridge at build time; optional copy script reads it from DOM/data attribute. | Must be useful to a coding agent and visible without JS. |
| `demoUseCases` | Static array | Rendered as anchor nav plus one section per demo. | `key`, `hashPath`, and `gridMountId` are unique; each demo has a `DemoConversationChatbox`. |
| `demoConversation` | Static message array per demo | Rendered into a collapsible chatbox below the demo frame. | Each message has `role` and `body`; optional `code` is rendered in a code block. |
| `principles` | Static array of three items | Rendered as crawlable cards/sections. | Exactly three primary concepts: headless architecture, fullstack grid, table algebra. |
| `features` | Static array of nine items | Rendered as crawlable feature links. | Each `href` resolves to a real route, even if that route has dummy content. |
| `faqItems` | Static array | Rendered as static FAQ content. | Each answer is present in HTML and has a stable hash path. |
| `routeConfig` | Build-time constants | Used by nav, CTAs, footer, canonical URLs, and assumptions table. | Temporary values are centralized and documented. |

### Route and brand constants

<!-- p-cmt thread_1783376442872_qzwv9z -->Use concrete temporary build-time values in `packages/web/lib/site-config.ts` and list them again in<!-- /p-cmt --> "Temporary assumptions to revisit". These values are baked into static output during `web:build`; changing them requires rebuild and redeploy.

```ts
// packages/web/lib/site-config.ts
export const siteName = 'SuperPlot';
export const siteUrl = 'https://superplot.dev';
export const gridBasePath = '/grid';
export const gridDocsPath = '/grid/docs';
export const gridSamplesPath = '/grid/samples';
export const gridFeaturesPath = '/grid/docs/features';
export const gridDemosPath = '/grid/demos';
export const ourApproachPath = '/grid/our-approach';
export const aboutPath = '/about';
export const contactPath = '/contact';
export const contactEmail = 'hello@superplot.dev';
export const githubUrl = 'https://github.com/adotg/dataflow-nebula';
export const discordUrl = '#';
export const twitterUrl = '#';
```

### <!-- p-cmt thread_1783376603798_77r2e5 -->URL state and client enhancement state<!-- /p-cmt -->

URL state is authoritative for section/subsection selection. Client-only state is allowed only for non-canonical presentation details and grid lifecycle.

| State | Backing | Mutated by | Requires URL change? | Notes |
| --- | --- | --- | --- | --- |
| Active demo tab | `location.hash` slash path, e.g. `#demos/sales` | Anchor click/hashchange | Yes | Selecting a demo changes the hash. |
| Active feature highlight | `location.hash`, e.g. `#features/pivot-table` | Anchor click/hashchange | Yes | Derived from one canonical hash. |
| Active FAQ focus | `location.hash`, e.g. `#faq/install` | Anchor click/hashchange | Yes | Native `<details>` can be open independently, but URL-selected FAQ is derived from hash. |
| Demo conversation open/closed | Native `<details>` or enhancement state | User toggles chatbox | No | Conversation display does not need URL hash. |
| Copy feedback | Enhancement state | Copy button click | No | Transient "Copied" UI only. |
| Grid mounted/loading/error | Future grid script | Grid mount lifecycle | No | Does not change URL. |
| Animation/focus affordances | Enhancement state | Scroll/hash/UI events | No | Presentation only. |

## 6\. Control flow

### Static build and CloudFront deployment

1. Build runs the `packages/web` static-site build command.

2. The build emits static HTML, CSS, JavaScript enhancement assets, metadata files, and static images into `packages/web/out` or the framework's equivalent output directory.

3. Deployment uploads static output to S3 and serves it through CloudFront.

4. CloudFront serves static files only.

5. The generated HTML contains all SEO/AEO-critical content and structured data before any script runs.

### Primary page load

1. <!-- p-cmt thread_1783376778203_t6krab -->Browser requests `/grid` or a `/grid/...` route<!-- /p-cmt -->.

2. CloudFront returns static HTML.

3. Browser parses semantic sections, nav links, FAQ content, demo conversation messages, copy-to-agent prompt text, and empty grid frames.

4. CSS applies responsive layout and baseline anchor styling.

5. Optional enhancement script loads and may:

  - read `location.hash`;

  - derive URL-backed selection from slash-like hash paths;

  - add active classes/animation affordances;

  - wire optional copy buttons;

  - later mount live grids into static grid frame containers.

6. If scripts fail, users still have content, anchors, chatbox transcripts, and placeholder frames.

### <!-- p-cmt thread_1783407972174_l3xwa9 -->Hash micro-navigation<!-- /p-cmt -->

Use one hash fragment with a slash-like path. Do not use multiple `#` characters.

| Hash path | Meaning | URL-backed UI |
| --- | --- | --- |
| `#demos` | Demos section | Scroll/focus demos section. |
| `#demos/sales` | Sales demo | Sales demo tab/section active. |
| `#demos/finance` | Finance demo | Finance demo tab/section active. |
| `#features/pivot-table` | Pivot feature | Pivot feature highlighted/focused. |
| `#faq/install` | Install FAQ | Install FAQ focused/opened by enhancement. |

1. Each URL-backed micro-navigation target exists as a server-rendered section with a stable `id` or `data-hash-path`.

2. Links use normal anchors such as `<a href="#demos/sales">Sales</a>`.

3. Browser-native navigation works without JavaScript, though CSS selectors for slash paths may require escaping or data attributes.

4. Optional enhancement script parses `location.hash.slice(1)` and derives parent state from the slash path.

5. Last URL change wins. Unknown hash paths leave all static sections accessible and do not throw.

6. Demo conversation chatboxes are deliberately not URL-backed. <!-- p-cmt thread_1783376853777_ayeo92 -->Demo conversation disclosure is component-local state, not a hash target like `#prompt-sales`.<!-- /p-cmt -->

### Demo frames and future grid rendering

1. Build renders every demo frame as static HTML with a heading, theme label, summary, empty frame, fallback text, and `DemoConversationChatbox`.

2. Each frame includes a stable mount element such as `<div id="grid-demo-sales" data-grid-demo="sales">`.

3. In the initial implementation, no live grid is mounted; the frame remains empty by design.

4. Later, a client-side grid script can find `[data-grid-demo]`, load the necessary data/config, render the grid into the mount, and preserve fallback content if rendering fails.

### Demo conversation chatbox behavior

1. Each demo renders a `DemoConversationChatbox` below the grid frame.

2. The chatbox contains agent/human conversation history as static HTML.

3. It is collapsible via native `<details>`/`<summary>` or equivalent progressive enhancement.

4. Its open/closed state does not require URL changes.

5. Enhancement may animate open/close only; it must not fetch or inject the conversation text at runtime.

### FAQ behavior

1. FAQ question and answer text is emitted in HTML.

2. Use `<details>`/`<summary>` for native no-JS disclosure, or render every answer visibly if the design prefers an always-expanded AEO format.

3. Each FAQ item has a slash-like hash path such as `#faq/install`.

4. Optional enhancement can focus/open the hash-targeted FAQ and animate disclosure.

### Copy to your agent

1. The hero prompt is rendered as visible, selectable text.

2. Optional client script can copy the prompt text to the clipboard.

3. If clipboard access is unavailable, the user can select the visible prompt manually.

4. No server call occurs.

### <!-- p-cmt thread_1783408118824_wizol5 -->Navigation and routes<!-- /p-cmt -->

All routes below should exist as static pages. When final copy is not available, render dummy content that clearly states the page is a placeholder for the next content iteration.

| Route | Page file | Route type | Primary components | Initial content expectation |
| --- | --- | --- | --- | --- |
| `/grid` | `packages/web/app/grid/page.tsx` | Full route, in scope | `Hero`, `AgentStackBar`, `DemoTabs`, `DemoFrame`, `DemoConversationChatbox`, `PrinciplesSection`, `FeatureGrid`, `ComparisonScaffold`, `FaqSection`, `GetStartedSection` | Full homepage/product page. |
| `/grid/demos` | `packages/web/app/grid/demos/page.tsx` | Full route, in scope | `RouteHero`, `DemoTabs`, `DemoFrame`, `DemoConversationChatbox` | Static demo index with dummy frames if needed. |
| `/grid/samples` | `packages/web/app/grid/samples/page.tsx` | Full route, in scope with dummy content | `RouteHero`, `SampleIndex`, `PlaceholderContent` | Placeholder/sample catalog for later content. |
| `/grid/docs` | `packages/web/app/grid/docs/page.tsx` | Full route, in scope with dummy content | `RouteHero`, `DocsLandingPlaceholder`, `FeatureLinkList` | Independent grid docs surface, unrelated to legacy `/docs`. |
| `/grid/docs/features` | `packages/web/app/grid/docs/features/page.tsx` | Full route, in scope with dummy content | `FeatureGrid`, `PlaceholderContent` | Static features index. |
| `/grid/our-approach` | `packages/web/app/grid/our-approach/page.tsx` | Full route, in scope with dummy content | `RouteHero`, `PrinciplesSection`, `ApproachNarrative` | Agent-first philosophy page. |
| `/about` | `packages/web/app/about/page.tsx` | Full root route, in scope | `RouteHero`, `CompanyInfo`, `ContactCta` | Temporary company/about text. |
| `/contact` | `packages/web/app/contact/page.tsx` | Full root route, in scope | `RouteHero`, `ContactMethods`, `SocialLinks` | Contact email and social placeholders. |

Top nav and footer link to these full routes. `/` is not required for grid now; later it can be added as a separate root landing page.

## 7\. Key logic (pseudocode / trimmed code)

### Static web package scaffold

Anchor new package files under `packages/web`.

```json
// packages/web/package.json
{
  "name": "web",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3334",
    "build": "next build",
    "start": "serve out",
    "lint": "eslint"
  },
  "dependencies": {
    "next": "16.2.4",
    "react": "^19.2.5",
    "react-dom": "^19.2.5",
    "lucide-react": "^1.9.0"
  }
}
```

```js
// packages/web/next.config.mjs
/** @type {import('next').NextConfig} */
const config = {
  output: 'export',
  reactStrictMode: true,
};

export default config;
```

Root scripts should add web-specific commands because current scripts only include docs/playground/grid commands (`package.json:8`, `package.json:11`, `package.json:12`):

```json
// package.json scripts
{
  "web:start": "yarn workspace web dev",
  "web:build": "yarn workspace web build"
}
```

### Static `/grid` page structure

Anchor new route `packages/web/app/grid/page.tsx`.

```tsx
// packages/web/app/grid/page.tsx
import { demos, faqItems, features, principles, copyToAgentPrompt } from '@/lib/home-content';
import { githubUrl, discordUrl } from '@/lib/site-config';
import { JsonLd } from '@/components/seo/JsonLd';

export const metadata = {
  title: 'SuperPlot - JavaScript grid built for agents',
  description: 'Create advanced grids, pivots, and data views using prompts, typed APIs, and composable primitives.',
  alternates: { canonical: 'https://superplot.dev/grid' },
};

export default function GridPage() {
  return (
    <main>
      <JsonLd />
      <Hero prompt={copyToAgentPrompt} githubUrl={githubUrl} discordUrl={discordUrl} />
      <AgentStackBar />
      <DemoSections demos={demos} />
      <PrinciplesSection principles={principles} />
      <FeatureSection features={features} />
      <ComparisonScaffold />
      <FaqSection items={faqItems} />
      <GetStartedSection />
      <SiteFooter />
    </main>
  );
}
```

### Demo sections as HTML source of truth

Anchor new component `packages/web/components/home/DemoSections.tsx`.

```tsx
// packages/web/components/home/DemoSections.tsx
export function DemoSections({ demos }: { demos: DemoUseCase[] }) {
  return (
    <section id="demos" data-hash-path="demos" aria-labelledby="demos-heading">
      <h2 id="demos-heading">Demos</h2>
      <nav aria-label="Demo use cases" className="demo-tabs">
        {demos.map((demo) => (
          <a key={demo.key} href={`#${demo.hashPath}`}>
            See {demo.label} with {demo.theme}
          </a>
        ))}
      </nav>

      {demos.map((demo) => (
        <article key={demo.key} id={`demo-${demo.key}`} data-hash-path={demo.hashPath} className="demo-panel">
          <h3>{demo.label}</h3>
          <p>{demo.summary}</p>
          <DemoFrame demo={demo} />
          <DemoConversationChatbox conversation={demo.conversation} />
        </article>
      ))}
    </section>
  );
}
```

### Demo conversation chatbox

Anchor new component `packages/web/components/home/DemoConversationChatbox.tsx`.

```tsx
// packages/web/components/home/DemoConversationChatbox.tsx
export function DemoConversationChatbox({ conversation }: { conversation: DemoConversationMessage[] }) {
  return (
    <details className="demo-chatbox">
      <summary>See the conversation for this demo</summary>
      <ol>
        {conversation.map((message, index) => (
          <li key={index} data-role={message.role}>
            <strong>{message.role === 'human' ? 'Human' : 'Agent'}</strong>
            <p>{message.body}</p>
            {message.code ? <pre><code>{message.code}</code></pre> : null}
          </li>
        ))}
      </ol>
    </details>
  );
}
```

### FAQ as static AEO content

Anchor new component `packages/web/components/home/FaqSection.tsx`.

```tsx
// packages/web/components/home/FaqSection.tsx
export function FaqSection({ items }: { items: FaqItem[] }) {
  return (
    <section id="questions" aria-labelledby="questions-heading">
      <h2 id="questions-heading">Common questions</h2>
      {items.map((item) => (
        <section key={item.hashPath} data-hash-path={item.hashPath}>
          <details>
            <summary>{item.question}</summary>
            <p>{item.answer}</p>
          </details>
        </section>
      ))}
    </section>
  );
}
```

### <!-- p-cmt thread_1783408258828_jj5m2i -->Optional progressive enhancement capability<!-- /p-cmt -->

This is not a required app runtime and not React hydration. Use CSS first. If a small static script is added, it may:

- parse slash-like hash paths and set active styling;

- animate collapsible UI;

- provide optional copy-to-clipboard;

- coordinate future grid mounts into `[data-grid-demo]`.

Example capability only:

```ts
function syncHashState() {
  const hashPath = window.location.hash.slice(1);
  document.documentElement.dataset.activeHashPath = hashPath;
}

window.addEventListener('hashchange', syncHashState);
syncHashState();
```

The page must remain readable and navigable when this script is absent.

### Feature link mapping

Anchor new file `packages/web/lib/home-content.ts`, with grid-scoped links.

```ts
// packages/web/lib/home-content.ts
export const features: FeatureLink[] = [
  { hashPath: 'features/performance', title: 'Performance and virtualized rendering', href: '/grid/docs/features#features/performance', icon: 'gauge', body: 'Viewport-first rendering with cell reuse.' },
  { hashPath: 'features/standard-table', title: 'Standard table with grouping', href: '/grid/docs/features#features/standard-table', icon: 'layers', body: 'Flat rows, grouping paths, pagination, sorting, and filtering.' },
  { hashPath: 'features/tree-table', title: 'Tree table', href: '/grid/docs/features#features/tree-table', icon: 'tree', body: 'Grouped flat metadata supports depth, leaf, and expanded state.' },
  { hashPath: 'features/pivot-table', title: 'Pivot table', href: '/grid/docs/features#features/pivot-table', icon: 'table', body: 'Row and column facets with table algebra.' },
  { hashPath: 'features/server-codegen', title: 'Server-side code generation', href: '/grid/docs/features#features/server-codegen', icon: 'server', body: 'SQL-backed models generate executable datasource queries.' },
  { hashPath: 'features/filtering', title: 'Sorting, filtering and pagination', href: '/grid/docs/features#features/filtering', icon: 'filter', body: 'Transform inputs flow through DataModel and ViewModel.' },
  { hashPath: 'features/realtime', title: 'Real-time updates', href: '/grid/docs/features#features/realtime', icon: 'radio', body: 'Replace datasource/model layers and redraw on external events.' },
  { hashPath: 'features/interactions', title: 'Advanced row/column interactions', href: '/grid/docs/features#features/interactions', icon: 'move', body: 'Renderer events and custom cell renderers drive app behavior.' },
  { hashPath: 'features/theming', title: 'Custom theme and styling', href: '/grid/docs/features#features/theming', icon: 'palette', body: 'Theme config and renderer CSS customize visual output.' },
];
```

<!-- p-cmt thread_1783408468559_ingrq7 -->`/grid/docs`, `/grid/samples`, and `/grid/demos` are independent grid-product surfaces. They are unrelated to legacy `/docs` and can be implemented in `packages/web` or another future package; this iteration should create static dummy pages where nav/CTA links need them.<!-- /p-cmt -->

## 8\. File-by-file change plan

| File | Add/modify | Hook point | Details |
| --- | --- | --- | --- |
| `packages/web/package.json` | Add | New workspace package picked up by root `packages/*` glob | Define static web package scripts and dependencies. |
| `packages/web/next.config.mjs` | Add | Web build config | Set `output: 'export'` for CloudFront/S3 static hosting. |
| `packages/web/tsconfig.json` | Add | Web TypeScript config | Configure strict TS, JSX, aliases such as `@/*`, and Next type generation if using Next. |
| `packages/web/app/layout.tsx` | Add | Root HTML shell | Emit `html`, body, metadata defaults, viewport, canonical base, and global CSS import. |
| <!-- p-cmt thread_1783408635524_055bde -->`packages/web/app/grid/page.tsx`<!-- /p-cmt --> | Add | `/grid` product route | Render the full grid product homepage and all SEO/AEO content into HTML. |
| `packages/web/app/grid/demos/page.tsx` | Add | `/grid/demos` route | Static demo index with dummy frames and `DemoConversationChatbox` where final demo content is missing. |
| `packages/web/app/grid/samples/page.tsx` | Add | `/grid/samples` route | Static placeholder/sample catalog for later sample content. |
| `packages/web/app/grid/docs/page.tsx` | Add | `/grid/docs` route | Static dummy grid docs landing, independent from legacy `/docs`. |
| `packages/web/app/grid/docs/features/page.tsx` | Add | `/grid/docs/features` route | Static feature index used by homepage CTAs. |
| `packages/web/app/grid/our-approach/page.tsx` | Add | `/grid/our-approach` route | Static page with dummy approach content and principles. |
| `packages/web/app/about/page.tsx` | Add | `/about` route | Static about page with temporary company content. |
| `packages/web/app/contact/page.tsx` | Add | `/contact` route | Static contact page with temporary email/social links. |
| `packages/web/app/global.css` | Add | Global web styles | Define layout, responsive constraints, first-screen behavior, anchor offsets, hash states, no-JS fallback, and animations. |
| `packages/web/lib/site-config.ts` | Add | Imported by nav, CTAs, footer, metadata | Centralize temporary build-time route/social/email constants. |
| `packages/web/lib/home-content.ts` | Add | Imported by homepage sections | Store typed marketing content, demos, conversations, FAQs, features, comparison rows. |
| `packages/web/components/home/*.tsx` | Add | Imported by `/grid` and related pages | Static section components for hero, demos, chatbox, principles, features, comparison, FAQ, get-started, route placeholders. |
| `packages/web/components/site/*.tsx` | Add | Imported by layout/pages | `TopNav`, `SiteFooter`, `RouteHero`, common shell components. |
| `packages/web/components/seo/JsonLd.tsx` | Add | Imported by pages | Emit Organization, WebSite, SoftwareApplication/Product, BreadcrumbList, and FAQPage structured data. |
| `packages/web/public/enhance.js` or bundled equivalent | Optional add | Static enhancement only | Hash active states, animations, optional copy button, and future grid mount coordination. |
| `package.json` | Modify | Root scripts | Add `web:start` and `web:build`; do not change existing scripts. |

## <!-- p-cmt thread_1783409056309_v4tbrn -->8. Edge cases and failure modes<!-- /p-cmt -->

| Case | Risk | Handling |
| --- | --- | --- |
| Hash links for visually collapsed sections | Users can land on content that is present but visually collapsed. | Hash-targeted sections must be expanded/focused by CSS or optional enhancement; content remains in HTML. |
| Slash-like hash paths in CSS | `#demos/sales` is harder to target with raw CSS selectors. | Prefer `data-hash-path` attributes plus optional enhancement for active styling; keep browser anchor fallback. |
| Client enhancement fails | Active styling, animation, copy feedback, or grid mounts may not run. | Static HTML remains complete; demo frames and chatboxes remain usable. |
| Future grid render fails | Demo frame could look broken. | Keep static fallback inside every grid frame and show a non-blocking error inside the frame only. |
| Clipboard unavailable | Copy button cannot work in some browsers/contexts. | Prompt text is visible/selectable; copy is optional enhancement. |
| Missing dummy route content | A nav/CTA route could render an empty page. | Every planned route must include dummy content before release. |
| CloudFront stale static assets | Users could see older generated pages after deploy. | Use versioned assets and a clear invalidation/deploy process. |
| AEO FAQ overclaiming | FAQ answers could make unsupported claims. | Keep answers factual and mark production/support wording for final review. |
| Mobile text overflow | Tabs, chat messages, prompts, and code blocks can overflow. | Use responsive wrapping/scrolling and fixed frame dimensions. |

<!-- p-cmt thread_1783409089191_ma5rgp -->Static-site backend concerns are intentionally omitted from edge cases.<!-- /p-cmt --> This section only covers failures that can occur in generated pages, browser navigation, enhancement scripts, CloudFront caching, or future grid mounts.

## 9\. Open questions & risks

| Question/risk | Why it matters | Proposed default |
| --- | --- | --- |
| What is the final public GitHub org/repo for SuperPlot? | The checkout remote is `adotg/dataflow-nebula`, but final public repo may differ. | Use `https://github.com/adotg/dataflow-nebula` temporarily and list it below. |
| What is the real Discord invite URL? | Functional source requires "Join our Discord"; no current value exists. | Use `#` temporarily and list it below. |
| What is the real Twitter/X URL? | Footer asks for Twitter; no current value exists. | Use `#` temporarily and list it below. |
| How much content goes into `/grid/docs` in this iteration? | <!-- p-cmt thread_1783409138880_g69rtr -->Legacy `/docs` is unrelated and should be ignored for this scope.<!-- /p-cmt --> | Create a dummy `/grid/docs` landing and fill real content in a later iteration. |
| `/grid/our-approach` content depth | <!-- p-cmt thread_1783409188362_pgp0p8 -->All planned routes are full routes for this release, even if they initially contain dummy content.<!-- /p-cmt --> | Add placeholder approach copy now; replace with final content next iteration. |
| Demo conversation content volume | `DemoConversationChatbox` needs enough messages to show agent/human collaboration without overwhelming the page. | Add short dummy transcripts now and replace with final conversations later. |
| <!-- p-cmt thread_1783409303189_uflqd7 -->Production readiness FAQ copy<!-- /p-cmt --> | Final production/support language must be confirmed before release. | Use conservative dummy wording now and revisit before release. |
| Visual asset requirement | The functional source references a Univer.ai-like hero but no bitmap assets exist in the repo. | Use a rich code/grid bridge as the initial visual; add generated or real assets if required. |

## 10\. Temporary assumptions to revisit

| Assumption | Temporary value | Needs confirmation |
| --- | --- | --- |
| Marketing package | `packages/web` | Confirm package name remains `web`. |
| Static hosting target | S3 + CloudFront | Confirm bucket, distribution, cache policy, and invalidation flow. |
| Public site URL | `https://superplot.dev` | Confirm production domain and preview domains. |
| Current grid entry route | `/grid` | Review direction says grid always uses `/grid` now. |
| Future root route | `/` | Later iteration may introduce a broader root landing page. |
| GitHub repo URL | `https://github.com/adotg/dataflow-nebula` | Replace with final public SuperPlot repo/org. |
| Discord URL | `#` | Replace with real invite. |
| Twitter/X URL | `#` | Replace with real profile. |
| Contact email | `hello@superplot.dev` | Confirm mailbox. |
| Grid docs URL | `/grid/docs` | Dummy full route now; final content/package ownership later. |
| Grid samples URL | `/grid/samples` | Dummy full route now; final content/package ownership later. |
| Features URL | `/grid/docs/features` | Dummy full route now. |
| Demos URL | `/grid/demos` | Dummy/full demo index now. |
| Our Approach URL | `/grid/our-approach` | Dummy full route now. |
| About URL | `/about` | Keep as root route per review. |
| Contact URL | `/contact` | Keep as root route per review. |
