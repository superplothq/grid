import type { ReactNode } from 'react';
import Link from 'next/link';
import signalInboxConversation from 'samples/src/demos/signal-inbox/conversation.json';
import marketPulseConversation from 'samples/src/demos/market-pulse/conversation.json';
import serverMonitorConversation from 'samples/src/demos/server-monitor/conversation.json';
import revenueRecognitionConversation from 'samples/src/demos/revenue-recognition/conversation.json';
import pivotStudioConversation from 'samples/src/demos/pivot-studio/conversation.json';
import {
  contactPath,
  docsPath,
  githubUrl,
  gridBasePath,
  gridDocsPath,
  gridDemosPath,
  ourApproachPath,
  siteUrl,
} from './site-config';

export type DemoKey =
  | 'sales'
  | 'infrastructure'
  | 'finance'
  | 'billing'
  | 'pivot-analytics'
  | 'performance'
  | 'data-wrangling'
  | 'custom-filters';

// A conversation message is either a legacy text/code pair (used by the scaffold
// use cases below) or a list of rich blocks - text, code, a table, or the choices
// an agent surfaced - so the chatbox can replay the real transcript that built a demo.
export type ConversationBlock =
  | { type: 'text'; text: string }
  | { type: 'code'; code: string }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'choices'; items: { question: string; answer: string }[] };

export interface DemoConversationMessage {
  role: 'human' | 'agent';
  body?: string;
  code?: string;
  blocks?: ConversationBlock[];
}

export interface DemoUseCase {
  key: DemoKey;
  hashPath: `demos/${string}`;
  label: string;
  theme: string;
  summary: string;
  conversation: DemoConversationMessage[];
  gridMountId: `grid-demo-${string}`;
  // When set, the use case renders the live self-contained demo of this id from the
  // samples package instead of the placeholder frame.
  demoId?: string;
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
  icon: 'bot' | 'server' | 'table' | 'tree' | 'gauge' | 'chart' | 'filter' | 'accessibility' | 'palette';
  comingSoon?: boolean;
}

export interface FaqItem {
  hashPath: `faq/${string}`;
  question: string;
  answer: string;
  answerNode?: ReactNode;
}

export interface ComparisonRow {
  dimension: string;
  agent: string;
  human: string;
}


export const copyToAgentPrompt = `I want to set up @superplot/grid. Read
${siteUrl}${gridBasePath}/setup-skill.md
and follow its instructions.`;

export interface StackBarItem {
  name: string;
  icon?: string;
  darkInvert?: boolean;
}

export const agentItems: StackBarItem[] = [
  { name: 'Claude Code', icon: '/icons/claude-code.svg' },
  { name: 'Codex', icon: '/icons/codex.svg' },
  { name: 'Copilot', icon: '/icons/copilot.svg' },
  { name: 'Cursor', icon: '/icons/cursor.svg' },
  { name: 'Gemini', icon: '/icons/gemini.svg' },
  { name: 'Windsurf', icon: '/icons/windsurf.svg' },
  { name: 'Cline', icon: '/icons/cline.svg' },
  { name: 'Amp', icon: '/icons/amp.svg' },
  { name: 'Goose', icon: '/icons/goose.svg' },
  { name: 'Zed', icon: '/icons/zed.svg' },
  { name: 'VS Code', icon: '/icons/vscode.svg' },
  { name: 'OpenCode', icon: '/icons/opencode.svg' },
  { name: 'Roo', icon: '/icons/roo.svg' },
  { name: 'Kilo', icon: '/icons/kilo.svg' },
  { name: 'Kiro', icon: '/icons/kiro-cli.svg' },
  { name: 'Trae', icon: '/icons/trae.svg' },
  { name: 'Antigravity', icon: '/icons/antigravity.svg' },
];

export const stackItems: StackBarItem[] = [
  { name: 'JavaScript', icon: '/icons/javascript.svg' },
  { name: 'TypeScript', icon: '/icons/typescript.svg' },
  { name: 'React', icon: '/icons/react.svg' },
  { name: 'Next.js', icon: '/icons/nextjs.svg', darkInvert: true },
];

export const demoUseCases: DemoUseCase[] = [
  {
    key: 'sales',
    hashPath: 'demos/sales',
    label: 'Sales',
    theme: 'signal inbox',
    summary:
      'A sleek B2B sales signal inbox: one row per prospect with rich contact cells, a heat score, category chips, a pipeline bar and a Fit toggle - sortable, selectable and paginated over 800 generated leads.',
    gridMountId: 'grid-demo-sales',
    demoId: 'signal-inbox',
    conversation: signalInboxConversation.messages as DemoConversationMessage[],
  },
  {
    key: 'infrastructure',
    hashPath: 'demos/infrastructure',
    label: 'Infrastructure',
    theme: 'fleet telemetry',
    summary:
      'A realtime server monitor: a host fleet ticks live every second with d3 area sparklines, heat-scaled metrics and status swatches, a custom terminal theme, and a column panel to show/hide, reorder and pin columns - plus per-column filters.',
    gridMountId: 'grid-demo-infrastructure',
    demoId: 'server-monitor',
    conversation: serverMonitorConversation.messages as DemoConversationMessage[],
  },
  {
    key: 'finance',
    hashPath: 'demos/finance',
    label: 'Finance',
    theme: 'realtime trading blotter',
    summary:
      'A live trading blotter: instruments grouped by asset class tick in real time, with in-cell d3 sparklines, a % change surfaced through the metadata layer, value pills that flash on update, sortable columns, value filters, and drag-to-group.',
    gridMountId: 'grid-demo-finance',
    demoId: 'market-pulse',
    conversation: marketPulseConversation.messages as DemoConversationMessage[],
  },
  {
    key: 'billing',
    hashPath: 'demos/billing',
    label: 'Billing',
    theme: 'revenue-recognition schedule',
    summary:
      'A compact revenue-recognition schedule: a collapsible Company > Contract > line-item tree with subtotal rows, inline recognition bars, and a month-by-month Balance/Revenue band - sortable and resizable, with the Name column pinned on scroll.',
    gridMountId: 'grid-demo-billing',
    demoId: 'revenue-recognition',
    conversation: revenueRecognitionConversation.messages as DemoConversationMessage[],
  },
  {
    key: 'pivot-analytics',
    hashPath: 'demos/pivot-analytics',
    label: 'Pivot analytics',
    theme: 'Tableau-style pivot builder',
    summary:
      'A full Tableau-style pivot builder: write cross / hierarchy / concat expressions for Rows and Columns, pick per-measure aggregations, toggle grouped rows with drill-down chevrons, and sort, filter and heatmap from the grid - aggregated live over 5,000 SaaS subscriptions.',
    gridMountId: 'grid-demo-pivot-analytics',
    demoId: 'pivot-studio',
    conversation: pivotStudioConversation.messages as DemoConversationMessage[],
  },
  /* Hidden for now - performance / data wrangling / custom filter demos
  {
    key: 'performance',
    hashPath: 'demos/performance',
    label: 'Performance',
    theme: 'one million rows',
    summary: 'A million-row table scrolling smoothly, because rendering only ever touches the visible slice.',
    gridMountId: 'grid-demo-performance',
    conversation: [
      { role: 'human', body: 'Load a million rows and prove scrolling stays smooth.' },
      {
        role: 'agent',
        body: 'The viewmodel exposes getSlice(), so the renderer draws only visible cells and reuses them while you scroll.',
        code: `grid.data = viewModel;`,
      },
      { role: 'agent', body: 'Row metadata is packed into typed arrays, so even grouped views stay allocation-light at this scale.' },
    ],
  },
  {
    key: 'data-wrangling',
    hashPath: 'demos/data-wrangling',
    label: 'Data wrangling',
    theme: 'messy CSV imports',
    summary: 'Raw CSV loaded into an embedded SQL engine, cleaned and reshaped with prompts.',
    gridMountId: 'grid-demo-data-wrangling',
    conversation: [
      { role: 'human', body: 'Here is a messy CSV export. Load it, dedupe by order id, and show it as a clean table.' },
      {
        role: 'agent',
        body: 'I loaded the columns into the DuckDB-backed datasource and expressed the cleanup as SQL the datamodel runs locally.',
        code: `await dataSource.loadData(columns);`,
      },
      { role: 'human', body: 'Now pivot the cleaned data by month.' },
      { role: 'agent', body: 'Same datasource, new pivot datamodel — no re-import needed.' },
    ],
  },
  {
    key: 'custom-filters',
    hashPath: 'demos/custom-filters',
    label: 'Custom filters',
    theme: 'custom filters and action menus',
    summary: 'App-defined filter controls and row action menus wired through renderer events.',
    gridMountId: 'grid-demo-custom-filters',
    conversation: [
      { role: 'human', body: 'Add a custom status filter above the grid and a per-row action menu with archive and duplicate.' },
      {
        role: 'agent',
        body: 'Filters are just transform inputs to the datamodel; the action menu is a custom cell renderer emitting app events.',
        code: `grid.on('cell:action', ({ row, action }) => handleRowAction(row, action));`,
      },
      { role: 'agent', body: 'Because the core is headless, your app owns the filter UI completely — the grid only receives the resulting query state.' },
    ],
  },
  */
];

export const principles: Principle[] = [
  {
    slug: 'headless-architecture',
    title: 'Headless architecture',
    body: 'The grid core has no UI framework dependency. Data modeling, viewmodel construction, and rendering are separate layers with typed contracts, so agents can compose them the same way in any stack.',
    href: `${ourApproachPath}#principles/headless-architecture`,
  },
  {
    slug: 'fullstack-grid',
    title: 'Fullstack grid',
    body: 'One pipeline runs from storage to pixels: DataSource, DataModel, DataViewModel, Renderer. SQL generation, aggregation, and virtualization are built in — no hand-stitched glue between frontend and backend.',
    href: `${ourApproachPath}#principles/fullstack-grid`,
  },
  {
    slug: 'table-algebra',
    title: 'Table algebra',
    body: 'Pivot layouts are expressions built from cross, hierarchy, and concat operators. A layout is data an agent can generate, inspect, and refine — not a pile of imperative configuration calls.',
    href: `${ourApproachPath}#principles/table-algebra`,
  },
];

export const features: FeatureLink[] = [
  { hashPath: 'features/agent-ready', title: 'Built for agents', href: `${docsPath}/built-for-agents`, icon: 'bot', body: 'A layered, open-code architecture with metadata plumbing that lets an agent reliably generate any grid.' },
  { hashPath: 'features/fullstack', title: 'Full-stack grid', href: `${docsPath}/fullstack-grid`, icon: 'server', body: 'One pipeline from SQL datasource to pixels, with server-side query generation and agent skills.' },
  { hashPath: 'features/pivot-table', title: 'Pivot with table algebra', href: `${docsPath}/pivot-table`, icon: 'table', body: 'Compose pivots from cross, hierarchy and concat operators instead of imperative config.' },
  { hashPath: 'features/tree-table', title: 'Grouped and tree tables', href: `${docsPath}/samples/hierarchical-tables`, icon: 'tree', body: 'Flat grouping paths and multi-level tree tables with depth, leaf and expand state.' },
  { hashPath: 'features/performance', title: 'Fast and realtime', href: `${gridDemosPath}/finance`, icon: 'gauge', body: 'Virtualized rendering with smooth scrolling and lightweight dom management that provides blazing fast rendering performance for realtime updates.' },
  { hashPath: 'features/in-cell-charts', title: 'In-cell charts', href: `${docsPath}/samples/custom-cell-renderers`, icon: 'chart', body: 'Render sparklines, bars and heatmaps inside cells with custom renderers.' },
  { hashPath: 'features/data-operations', title: 'Sort, filter, paginate, project', href: `${docsPath}/headless`, icon: 'filter', body: 'Sorting, filtering, pagination and dimensional projections handled at the data layer.' },
  { hashPath: 'features/accessibility', title: 'Accessible', href: gridDocsPath, icon: 'accessibility', body: 'Semantic, keyboard-reachable DOM with expanding ARIA and screen-reader support.', comingSoon: true },
  { hashPath: 'features/theming', title: 'Themable', href: `${gridDemosPath}/infrastructure`, icon: 'palette', body: 'Theme tokens and renderer CSS to match any design, in light and dark.' },
];

export const comparisonRows: ComparisonRow[] = [
  {
    dimension: 'Use cases & personalization',
    agent: 'Supports a far wider range of use cases and deeper personalization',
    human: 'Targets the common, high-value cases; the long tail is traded away for speed and simplicity',
  },
  {
    dimension: 'Abstraction',
    agent: 'Exposes the real abstractions the library is built on',
    human: "Wraps them in config options and layers of convenience abstraction - not because humans can't handle the real thing, but because it is optimized for fast value creation",
  },
  {
    dimension: 'Primitives',
    agent: 'Programmatic access with tight control at each extension point',
    human: 'Primitives that are quick and easy to implement, but lose extensibility',
  },
  {
    dimension: 'Surface area',
    agent: 'Once the abstraction is set, the surface stays small; the concepts you compose stay domain-specific',
    human: 'A combinatorial surface of options to cover every domain-specific case',
  },
];

export const comparisonNote =
  'Building for agents changes three things: the primitives a library exposes, the architecture choices it supports, and how the work around the library is done - its documentation, tests, and evals.';

export const comparisonCloser =
  'A library built for agents can be used just as well by humans. In fact, given time and patience, a human will use it even better than an agent.';

const setupSkillUrl = `${siteUrl}${gridBasePath}/setup-skill.md`;
const installationPath = `${gridDocsPath}/installation/`;

export const faqItems: FaqItem[] = [
  {
    hashPath: 'faq/who-is-it-for',
    question: 'Who is SuperPlot grid for?',
    answer:
      'SuperPlot exposes primitives for agents and is deliberate about what goes into its core. A human developer can work with it just as well, but it is built for agents first.',
  },
  {
    hashPath: 'faq/install',
    question: 'How do I install and get started?',
    answer: `Ask your agent to follow ${setupSkillUrl}. For more detail, see the installation guide at ${installationPath}.`,
    answerNode: (
      <>
        Ask your agent to follow{' '}
        <a href={setupSkillUrl} target="_blank" rel="noopener noreferrer">
          {setupSkillUrl.replace('https://', '')}
        </a>
        . For more detail, see the <Link href={installationPath}>installation guide</Link>.
      </>
    ),
  },
  {
    hashPath: 'faq/frameworks',
    question: 'What frameworks and versions are supported?',
    answer:
      'We ship React bindings out of the box. Thanks to our architecture, agents can build throwaway adapters for any other framework.',
  },
  {
    hashPath: 'faq/how-different',
    question: 'How is it different from other grids out there?',
    answer:
      'It is highly performant, deeply extensible, and extremely flexible, and it handles the full stack of a grid implementation, from data to pixels.',
  },
  {
    hashPath: 'faq/performance',
    question: 'How does it perform with large datasets?',
    answer:
      "With virtualization and our DOM management, over 3M rows render in the browser. When the data comes from a backend, our data model's page cache and eviction mean there is practically no limit.",
  },
  {
    hashPath: 'faq/mobile-responsive',
    question: 'Is it mobile responsive?',
    answer: 'Yes. Our layouts are built on CSS primitives, so they adapt responsively.',
  },
  {
    hashPath: 'faq/customize',
    question: 'Can I customize the look and feel?',
    answer:
      'We feed agents metadata from our theming system, so you can customize practically anything. Take a look at our demos to see what is possible.',
    answerNode: (
      <>
        We feed agents metadata from our theming system, so you can customize practically anything.
        Take a look at our <Link href={gridDemosPath}>demos</Link> to see what is possible.
      </>
    ),
  },
  // {
  //   hashPath: 'faq/accessibility',
  //   question: 'Do you support accessibility?',
  //   answer:
  //     'Accessibility is a priority and an area of active development. The grid renders semantic, keyboard-reachable DOM, and we are expanding ARIA roles, keyboard navigation, and screen-reader support as the library matures.',
  // },
  {
    hashPath: 'faq/pricing',
    question: 'Is SuperPlot grid free to use?',
    answer: 'Yes. It is free and open source under the MIT license. See the GitHub repository.',
    answerNode: (
      <>
        Yes. It is free and open source under the MIT license. See the{' '}
        <a href={githubUrl} target="_blank" rel="noopener noreferrer">
          GitHub repository
        </a>
        .
      </>
    ),
  },
  {
    hashPath: 'faq/production-ready',
    question: 'Is it production ready and actively maintained?',
    answer: 'Yes. An active and experienced team works behind it.',
  },
  {
    hashPath: 'faq/support',
    question: 'What kind of support do you offer?',
    answer: 'Yes. Reach out through our contact page and we will help.',
    answerNode: (
      <>
        Yes. Reach out through our <Link href={contactPath}>contact page</Link> and we will help.
      </>
    ),
  },
  {
    hashPath: 'faq/docs-examples',
    question: 'Where can I find documentation and examples?',
    answer: 'Explore our live demos and browse the documentation.',
    answerNode: (
      <>
        Explore our live <Link href={gridDemosPath}>demos</Link> and browse the{' '}
        <Link href={docsPath}>documentation</Link>.
      </>
    ),
  },
];

