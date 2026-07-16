import signalInboxConversation from 'samples/src/demos/signal-inbox/conversation.json';
import marketPulseConversation from 'samples/src/demos/market-pulse/conversation.json';
import serverMonitorConversation from 'samples/src/demos/server-monitor/conversation.json';
import revenueRecognitionConversation from 'samples/src/demos/revenue-recognition/conversation.json';
import pivotStudioConversation from 'samples/src/demos/pivot-studio/conversation.json';
import { docsPath, gridDocsPath, ourApproachPath, siteUrl } from './site-config';

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
}

export interface FaqItem {
  hashPath: `faq/${string}`;
  question: string;
  answer: string;
}

export interface ComparisonRow {
  dimension: string;
  superplot: string;
  traditional: string;
}

export interface GetStartedStep {
  title: string;
  body: string;
  code?: string;
}

export const copyToAgentPrompt = `Add the SuperPlot grid to this project.

1. Install the packages: yarn add @superplot/grid @superplot/react
2. Create a SQL datasource for my data (DuckDB WASM in the browser, native DuckDB in Node.js) and load my dataset with loadData().
3. Wrap the app in DataSourceProvider and render a pivot table with usePivotGrid and the DataGrid component.
4. Express the pivot layout with table algebra operators: cross, hierarchy, and concat.
5. If I ask for a flat table instead, use useFlatGrid with row grouping.

Docs: ${siteUrl}${gridDocsPath}`;

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
  { hashPath: 'features/pivot-table', title: 'Pivot with table algebra', href: gridDocsPath, icon: 'table', body: 'Compose pivots from cross, hierarchy and concat operators instead of imperative config.' },
  { hashPath: 'features/tree-table', title: 'Grouped and tree tables', href: gridDocsPath, icon: 'tree', body: 'Flat grouping paths and multi-level tree tables with depth, leaf and expand state.' },
  { hashPath: 'features/performance', title: 'Fast and realtime', href: gridDocsPath, icon: 'gauge', body: 'Virtualized rendering with cell reuse that updates live as data streams in.' },
  { hashPath: 'features/in-cell-charts', title: 'In-cell charts', href: gridDocsPath, icon: 'chart', body: 'Render sparklines, bars and heatmaps inside cells with custom renderers.' },
  { hashPath: 'features/data-operations', title: 'Sort, filter, paginate, project', href: gridDocsPath, icon: 'filter', body: 'Sorting, filtering, pagination and dimensional projections handled at the data layer.' },
  { hashPath: 'features/accessibility', title: 'Accessible', href: gridDocsPath, icon: 'accessibility', body: 'Semantic, keyboard-reachable DOM with expanding ARIA and screen-reader support.' },
  { hashPath: 'features/theming', title: 'Themable', href: gridDocsPath, icon: 'palette', body: 'Theme tokens and renderer CSS to match any design, in light and dark.' },
];

export const comparisonRows: ComparisonRow[] = [
  { dimension: 'Primary consumer', superplot: 'Coding agents and developers, via prompts and typed APIs', traditional: 'Developers, via imperative configuration' },
  { dimension: 'Data pipeline', superplot: 'Fullstack: SQL datasource through datamodel to renderer', traditional: 'Frontend component fed by app-assembled data' },
  { dimension: 'Pivot layout definition', superplot: 'Table algebra expressions (cross, hierarchy, concat)', traditional: 'Nested option objects and callbacks' },
  { dimension: 'UI coupling', superplot: 'Headless core with framework bindings', traditional: 'Rendered component with framework lock-in' },
];

export const comparisonNote =
  'Draft scaffold. This comparison describes architectural intent, not benchmarked claims about specific products. A sourced feature and performance matrix will replace it in a later iteration.';

export const faqItems: FaqItem[] = [
  {
    hashPath: 'faq/who-is-it-for',
    question: 'Who is SuperPlot grid for?',
    answer: 'SuperPlot is for developers and coding agents who need advanced data grids — pivot tables, tree tables, and large flat tables — without hand-building the data layer. It suits analytics dashboards, internal tools, and data-heavy applications, and it is designed so an AI coding agent can generate and refine grids directly from prompts.',
  },
  {
    hashPath: 'faq/install',
    question: 'How do I install and get started?',
    answer: 'Install the headless core and the React bindings with your package manager, for example: yarn add @superplot/grid @superplot/react. Then create a datasource, load your data, and render with the DataGrid component and a hook such as usePivotGrid or useFlatGrid. The fastest path is to copy the prompt in the hero section of this page and let your agent scaffold all three steps.',
  },
  {
    hashPath: 'faq/frameworks',
    question: 'What frameworks and versions are supported?',
    answer: 'The grid core is headless and framework-independent, with no UI framework dependency. First-party bindings currently target React 18 and expose a DataGrid component plus hooks like usePivotGrid, useFlatGrid, and useDataSource. Data runs on DuckDB — WASM in the browser or native DuckDB in Node.js. Because the core exposes plain typed APIs, bindings for other frameworks can wrap the same contracts.',
  },
  {
    hashPath: 'faq/how-different',
    question: 'How is it different from other grids out there?',
    answer: 'Most grids are frontend components that expect you to bring pre-shaped data. SuperPlot owns the full pipeline — from a SQL datasource, through data modeling, to a virtualized renderer — and expresses pivot layouts as composable table algebra (cross, hierarchy, concat). That makes it fullstack and declarative, and its tight, repeating contracts make it especially easy for coding agents to work with.',
  },
  {
    hashPath: 'faq/features',
    question: 'What features does SuperPlot grid include?',
    answer: 'SuperPlot includes virtualized rendering, standard flat tables with grouping, tree tables, pivot tables built on table algebra, SQL-backed query generation, sorting, filtering and pagination, real-time updates, custom cell and header renderers, a built-in metadata layer, and theming. See the features page for the full list and guides.',
  },
  {
    hashPath: 'faq/performance',
    question: 'How does it perform with large datasets?',
    answer: 'Rendering is virtualized: the view model exposes a getSlice() contract so the renderer only draws cells in the visible viewport, and row metadata is packed into typed arrays. Aggregation, filtering, and pagination happen at the SQL layer — DuckDB in the browser or a server database — so the volume of data reaching the renderer stays small even for very large sources.',
  },
  {
    hashPath: 'faq/mobile-responsive',
    question: 'Is it mobile responsive?',
    answer: 'Yes. The grid renders with a CSS grid layout and virtualized scrolling that works on touch devices, and it exposes sizing and layout configuration so you can adjust column and row density for smaller screens. As with any dense data grid, the best mobile experience comes from choosing which columns and facets to surface at narrow widths.',
  },
  {
    hashPath: 'faq/customize',
    question: 'Can I customize the look and feel?',
    answer: 'Yes. The renderer accepts custom cell renderers, header and facet renderers, and fixtures, and the visual output is driven by theme configuration and renderer CSS. Because the core is headless, your application owns the surrounding UI entirely — SuperPlot does not impose a design system.',
  },
  {
    hashPath: 'faq/accessibility',
    question: 'Do you support accessibility?',
    answer: 'Accessibility is a priority and an area of active development. The grid renders semantic, keyboard-reachable DOM, and we are expanding ARIA roles, keyboard navigation, and screen-reader support as the library matures. If you have specific accessibility requirements, reach out — it helps us prioritize.',
  },
  {
    hashPath: 'faq/vs-ag-grid',
    question: 'How does it compare to AG Grid?',
    answer: 'AG Grid is a mature, feature-rich grid focused on the frontend: you supply the data and it handles display and interactions. SuperPlot differs by owning the data pipeline too — generating queries from a declarative table-algebra config against a SQL datasource — and by being headless and agent-first. AG Grid is the more established, broadly adopted option today; SuperPlot trades that maturity for a fullstack, composable architecture.',
  },
  {
    hashPath: 'faq/vs-tanstack-table',
    question: 'How does it compare to TanStack Table?',
    answer: 'TanStack Table is a headless table library that gives you row and column models and leaves rendering entirely to you; it does not fetch or transform data. SuperPlot is also headless but goes further down the stack — it includes a datasource and data model that generate SQL and produce render-ready view models, plus a renderer for virtualization and pivots. Choose TanStack if you want maximum rendering freedom and will own the data layer yourself; choose SuperPlot if you want the data-to-pixels path handled.',
  },
  {
    hashPath: 'faq/vs-mui-grid',
    question: 'What about MUI X Data Grid?',
    answer: 'MUI X Data Grid is a polished React grid tightly integrated with Material UI’s design system, strong for flat tables and form-style data. SuperPlot is design-system-agnostic and headless, centered on pivots and a SQL-backed data pipeline rather than a fixed component look. Pick MUI X if you are standardized on Material UI and want turnkey styling; pick SuperPlot for composable pivots and fullstack data handling.',
  },
  {
    hashPath: 'faq/pricing',
    question: 'Is SuperPlot grid free to use?',
    answer: 'SuperPlot is in early preview and developed in the open. Final licensing and any pricing tiers are being confirmed before release — check the GitHub repository for the current status.',
  },
  {
    hashPath: 'faq/production-ready',
    question: 'Is it production ready and actively maintained?',
    answer: 'SuperPlot is actively developed, and this site is an early preview, so APIs may change between releases. It is not yet recommended for critical production use without pinning versions and reviewing current status. Follow the repository for release milestones and stability updates.',
  },
  {
    hashPath: 'faq/support',
    question: 'What kind of support do you offer?',
    answer: 'During the preview, support is community-based through the GitHub repository (issues and discussions) and our Discord. Formal or commercial support options may be introduced as the project matures.',
  },
  {
    hashPath: 'faq/docs-examples',
    question: 'Where can I find documentation and examples?',
    answer: 'Documentation lives under /grid/docs, with feature guides and a sample catalog under /grid/docs/samples. The demos section on this page shows how agents build each grid conversationally, and the source repository contains additional examples.',
  },
];

export const getStartedSteps: GetStartedStep[] = [
  {
    title: 'Install the packages',
    body: 'Add the headless core and the React bindings to your project.',
    code: 'yarn add @superplot/grid @superplot/react',
  },
  {
    title: 'Load your data',
    body: 'Create a datasource and ingest your dataset in column-major form. It runs on DuckDB WASM in the browser and native DuckDB in Node.js.',
    code: `const dataSource = new DuckDBWasmDataSource('orders');
await dataSource.loadData(columns);`,
  },
  {
    title: 'Render a grid',
    body: 'Describe the layout with table algebra and hand the viewmodel to the grid — or let your agent do all three steps from a prompt.',
    code: `const grid = usePivotGrid(dataSource, {
  rows: hierarchy('region'),
  columns: hierarchy('year', 'quarter'),
  values: [sum('revenue')],
});`,
  },
];
