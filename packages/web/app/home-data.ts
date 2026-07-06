import { contactEmail, githubUrl, siteLinks } from "@/lib/site";

export type HomeLink = {
  label: string;
  href: string;
  external?: boolean;
  ariaLabel?: string;
};

export type HeroContent = {
  eyebrow: string;
  headline: string;
  body: string;
  primaryCtas: HomeLink[];
  secondaryCtas: HomeLink[];
  agentPromptTitle: string;
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

export type ComparisonRow = {
  capability: string;
  superplot: string;
  simple: string;
  inHouse: string;
};

export type FAQ = {
  id: string;
  question: string;
  answer: string;
};

export type GetStartedStep = {
  id: string;
  title: string;
  body: string;
  code: string;
};

export const heroContent: HeroContent = {
  eyebrow: "JavaScript data grid, reimagined for agents",
  headline: "The JavaScript grid built for agents.",
  body: "Create advanced grids, pivots, and data views with typed APIs, composable primitives, and prompts that coding agents can actually follow. Start with a fast grid today; extend it into richer data interfaces tomorrow.",
  primaryCtas: [
    { label: "View demos", href: siteLinks.demos },
    { label: "Read our approach", href: siteLinks.approach },
  ],
  secondaryCtas: [
    {
      label: "GitHub repo",
      href: githubUrl,
      external: true,
      ariaLabel: "View SuperPlot on GitHub",
    },
    {
      label: "Contact us",
      href: `mailto:${contactEmail}`,
      ariaLabel: "Email the SuperPlot team",
    },
  ],
  agentPromptTitle: "Copy to your agent",
  agentPrompt:
    "Build a SuperPlot Grid for a revenue operations dashboard. Use a virtualized table with grouped accounts, pinned opportunity columns, sortable ARR, set filters for region and owner, an expandable account hierarchy, and a prompt panel that explains every generated grid decision.",
};

export const agentStackItems: string[] = [
  "Claude Code",
  "Codex",
  "Cursor",
  "React",
  "Next.js",
  "DuckDB / WASM",
  "Typed APIs",
];

export const demosIntro =
  "Every preview below is written as an agent-ready build brief: the UI pattern, data shape, and grid behaviors are explicit enough for an engineer or coding agent to implement without reverse-engineering intent.";

export const demos: HomeDemo[] = [
  {
    id: "sales",
    title: "Sales",
    eyebrow: "Revenue operations",
    description:
      "A grouped account table with pinned opportunity columns, sortable ARR, and set filters for region and owner.",
    prompt:
      "Build a SuperPlot Grid CRM view. Group rows by account, pin the account name and stage columns, make ARR and next-step columns sortable, and add set filters for region and owner. Show a running ARR total per account group and expand/collapse per group.",
    docsHref: "/docs/datamodel/",
    githubHref: `${githubUrl}/tree/main/packages/hc_samples`,
    columns: [
      { key: "account", label: "Account" },
      { key: "owner", label: "Owner" },
      { key: "stage", label: "Stage" },
      { key: "arr", label: "ARR", align: "right" },
      { key: "close", label: "Close", align: "right" },
    ],
    rows: [
      { account: "Northwind Traders", owner: "A. Rivera", stage: "Negotiation", arr: "$182,400", close: "Q3" },
      { account: "Contoso Cloud", owner: "M. Okafor", stage: "Proposal", arr: "$96,000", close: "Q3" },
      { account: "Fabrikam Labs", owner: "L. Chen", stage: "Discovery", arr: "$54,200", close: "Q4" },
      { account: "Tailspin Toys", owner: "A. Rivera", stage: "Closed Won", arr: "$210,900", close: "Q2" },
      { account: "Adventure Works", owner: "S. Patel", stage: "Negotiation", arr: "$143,750", close: "Q3" },
    ],
    kpis: [
      { label: "Pipeline ARR", value: "$4.9M", trend: "+12%" },
      { label: "Open deals", value: "148" },
      { label: "Win rate", value: "31%", trend: "+3pt" },
    ],
    badges: ["Row grouping", "Pinned columns", "Set filters"],
  },
  {
    id: "infrastructure",
    title: "Infrastructure",
    eyebrow: "Real-time observability",
    description:
      "Grouped columns, live status badges, and streaming metrics with a column-config side panel.",
    prompt:
      "Build a SuperPlot Grid infrastructure monitor. Group columns under Compute and Network headers, render status as colored badges, stream CPU and latency metrics with real-time updates, and expose a column-config panel to toggle and reorder columns.",
    docsHref: "/docs/renderer/",
    columns: [
      { key: "host", label: "Host" },
      { key: "region", label: "Region" },
      { key: "cpu", label: "CPU", align: "right" },
      { key: "latency", label: "Latency", align: "right" },
      { key: "status", label: "Status" },
    ],
    rows: [
      { host: "edge-01", region: "us-east", cpu: "62%", latency: "18ms", status: "Healthy" },
      { host: "edge-02", region: "us-west", cpu: "88%", latency: "41ms", status: "Degraded" },
      { host: "core-11", region: "eu-central", cpu: "47%", latency: "12ms", status: "Healthy" },
      { host: "core-12", region: "ap-south", cpu: "95%", latency: "77ms", status: "Critical" },
      { host: "edge-07", region: "us-east", cpu: "54%", latency: "22ms", status: "Healthy" },
    ],
    kpis: [
      { label: "Nodes online", value: "312" },
      { label: "p95 latency", value: "41ms", trend: "-6ms" },
      { label: "Alerts", value: "3", trend: "+1" },
    ],
    badges: ["Grouped columns", "Real-time updates", "Cell renderers"],
  },
  {
    id: "finance",
    title: "Finance",
    eyebrow: "Trading blotter",
    description:
      "High-density financial grid with sparklines, conditional formatting, and sub-cent numeric alignment.",
    prompt:
      "Build a SuperPlot Grid finance blotter. Right-align all numeric columns, apply conditional formatting for positive and negative change, add an inline sparkline column for the intraday trend, and keep the header row pinned while virtualizing thousands of instruments.",
    docsHref: "/docs/viewmodel/",
    columns: [
      { key: "symbol", label: "Symbol" },
      { key: "last", label: "Last", align: "right" },
      { key: "change", label: "Change", align: "right" },
      { key: "vol", label: "Volume", align: "right" },
      { key: "trend", label: "Trend" },
    ],
    rows: [
      { symbol: "NBLA", last: "142.08", change: "+2.14%", vol: "3.2M", trend: "▁▃▅▆█" },
      { symbol: "DFLW", last: "88.51", change: "-0.92%", vol: "1.1M", trend: "█▆▅▃▁" },
      { symbol: "PLOT", last: "301.77", change: "+4.60%", vol: "5.8M", trend: "▂▄▅▇█" },
      { symbol: "GRID", last: "56.20", change: "-1.35%", vol: "902K", trend: "▆▅▄▃▂" },
      { symbol: "AGNT", last: "417.90", change: "+0.31%", vol: "2.4M", trend: "▄▄▅▅▆" },
    ],
    kpis: [
      { label: "Instruments", value: "12,480" },
      { label: "Day P&L", value: "+$1.2M", trend: "+3.1%" },
      { label: "Ticks/sec", value: "9.4K" },
    ],
    badges: ["Virtualization", "Conditional formatting", "Sorting"],
  },
  {
    id: "pivot",
    title: "Pivot analytics",
    eyebrow: "Aggregation & drill-down",
    description:
      "Multi-level row and column facets with aggregated measures, row grouping toggles, and a pivot-config panel.",
    prompt:
      "Build a SuperPlot pivot grid over sales data. Put region then segment on rows, quarter on columns, and sum of revenue as the measure. Add a toggle to switch aggregation between sum and average, expandable row groups, and a config panel to reorder pivot fields.",
    docsHref: "/docs/datamodel/",
    columns: [
      { key: "region", label: "Region / Segment" },
      { key: "q1", label: "Q1", align: "right" },
      { key: "q2", label: "Q2", align: "right" },
      { key: "q3", label: "Q3", align: "right" },
      { key: "total", label: "Total", align: "right" },
    ],
    rows: [
      { region: "Americas", q1: "$1.9M", q2: "$2.1M", q3: "$2.4M", total: "$6.4M" },
      { region: "   Enterprise", q1: "$1.2M", q2: "$1.3M", q3: "$1.6M", total: "$4.1M" },
      { region: "   Mid-market", q1: "$0.7M", q2: "$0.8M", q3: "$0.8M", total: "$2.3M" },
      { region: "EMEA", q1: "$1.4M", q2: "$1.5M", q3: "$1.7M", total: "$4.6M" },
      { region: "APAC", q1: "$0.9M", q2: "$1.1M", q3: "$1.3M", total: "$3.3M" },
    ],
    kpis: [
      { label: "Total revenue", value: "$14.3M", trend: "+9%" },
      { label: "Pivot fields", value: "3 × 1" },
      { label: "Grouped rows", value: "42" },
    ],
    badges: ["Pivot facets", "Aggregation", "Row grouping"],
  },
];

export const approachIntro =
  "SuperPlot is designed for agentic development: a headless rendering core, full-stack data transformations, and table algebra that make grid behavior describable, testable, and composable.";

export const principles: Principle[] = [
  {
    id: "headless",
    title: "Headless architecture",
    body: "A framework-agnostic core exposes typed APIs for data modeling, viewmodel construction, and rendering. Bring your own framework — React bindings ship today, and the layered DataSource → DataModel → DataViewModel → Renderer pipeline stays stupid-fast to reason about.",
    href: "/docs/renderer/",
  },
  {
    id: "fullstack",
    title: "Full-stack grid",
    body: "Data storage, SQL query execution, and view transformations live in one pipeline. DuckDB (WASM in the browser, native in Node) powers grouping, pivoting, and pagination so you don't stitch frontend, backend, and query logic by hand.",
    href: "/docs/datamodel/",
  },
  {
    id: "table-algebra",
    title: "Table algebra",
    body: "Pivots are described with composable operators — cross, hierarchy, and concat — that generate SQL via an intermediate representation. Grid behavior becomes an algebra an agent can compose, test, and explain.",
    href: "/docs/viewmodel/",
  },
];

export const featuresIntro =
  "Core capabilities cover the grid behaviors teams usually rebuild by hand: virtualization, grouping, pivots, tree data, sorting, filtering, pagination, custom renderers, real-time updates, and advanced row/column interaction.";

export const features: Feature[] = [
  {
    id: "virtualization",
    title: "Performance & virtualized rendering",
    body: "The renderer draws only the visible viewport via getSlice(), so large datasets scroll smoothly with a constant DOM footprint.",
    href: "/docs/renderer/",
  },
  {
    id: "grouping",
    title: "Standard table with grouping",
    body: "Group rows with expand/collapse, packed row metadata, and paginated fetches through the flat-table data model.",
    href: "/docs/datamodel/",
  },
  {
    id: "tree",
    title: "Tree table",
    body: "Model hierarchical data with expandable parent/child rows and depth-aware row facets.",
    href: "/docs/datamodel/",
  },
  {
    id: "pivot",
    title: "Pivot table",
    body: "Multi-level row and column facets with aggregated measures, generated from composable table-algebra operators.",
    href: "/docs/viewmodel/",
  },
  {
    id: "codegen",
    title: "Server-side code generation",
    body: "SQL is generated from pivot and flat configs via an IR — the same primitives serve hand-written TypeScript and agent-generated code.",
    href: "/docs/datamodel/",
  },
  {
    id: "sfp",
    title: "Sorting, filtering & pagination",
    body: "Runtime sort, filter, and page operations plus custom cell renderers for badges, fixtures, and inline visualizations.",
    href: "/docs/datamodel/",
  },
  {
    id: "realtime",
    title: "Real-time updates",
    body: "Refresh viewmodel data asynchronously and reschedule a draw, so streaming metrics land without a full rebuild.",
    href: "/docs/renderer/",
  },
  {
    id: "interactions",
    title: "Advanced row/column interactions",
    body: "Pinned columns, grouped column headers, and expandable hierarchies compose cleanly on the same viewmodel contract.",
    href: "/docs/viewmodel/",
  },
  {
    id: "custom-renderers",
    title: "Custom cell renderers",
    body: "The DataViewModel → Renderer step is deliberately thin, making bespoke cell content easy to reason about and cheap to draw.",
    href: "/docs/renderer/",
  },
];

export const comparisonIntro =
  "Where a lightweight table library stops and an in-house build starts, SuperPlot keeps the full data pipeline composable and agent-describable.";

export const comparison: ComparisonRow[] = [
  {
    capability: "Data pipeline",
    superplot: "DataSource → DataModel → ViewModel → Renderer, all typed",
    simple: "Render-only; you own data shaping",
    inHouse: "Bespoke glue you maintain forever",
  },
  {
    capability: "Pivots & aggregation",
    superplot: "Table algebra generates SQL via an IR",
    simple: "Rarely included",
    inHouse: "Hand-rolled and hard to test",
  },
  {
    capability: "Query engine",
    superplot: "DuckDB WASM in-browser, native in Node",
    simple: "None",
    inHouse: "Roll your own",
  },
  {
    capability: "Agent-readiness",
    superplot: "Composable primitives + prompts agents follow",
    simple: "Ad hoc",
    inHouse: "Undocumented internals",
  },
];

export const faqs: FAQ[] = [
  {
    id: "who",
    question: "Who is SuperPlot Grid for?",
    answer:
      "Developers building data-dense applications — dashboards, admin consoles, analytics tools — and the coding agents that increasingly write that UI. The typed APIs and composable primitives are meant to be driven by hand or by prompt.",
  },
  {
    id: "install",
    question: "How do I install and get started?",
    answer:
      "Add the grid core and the React bindings, pick a data model (flat table or pivot), describe the view you want, and wire the generated configuration into your app. The Get started section below and the docs walk through the DataSource → DataModel → ViewModel → Renderer flow.",
  },
  {
    id: "frameworks",
    question: "What frameworks and versions are supported?",
    answer:
      "The core is fully headless with no UI-framework dependency. React 18 bindings ship today via the frameworks package (DataGrid, usePivotGrid, useFlatGrid, useDataSource). Any framework can call the same headless APIs.",
  },
  {
    id: "different",
    question: "How is it different from other grids?",
    answer:
      "Most grids render data you have already shaped. SuperPlot owns the whole pipeline — storage, SQL query execution via DuckDB, and view transformations — behind a small composable API, so pivots, grouping, and pagination are first-class rather than bolted on.",
  },
  {
    id: "features",
    question: "What features does SuperPlot Grid include?",
    answer:
      "Virtualized rendering, row grouping, tree data, pivot tables, sorting, filtering, pagination, custom cell renderers, real-time updates, and advanced row/column interactions such as pinned and grouped columns.",
  },
  {
    id: "large-data",
    question: "How does it perform with large datasets?",
    answer:
      "The renderer draws only the visible viewport through getSlice(), and paging fetches load rows on demand. DuckDB handles aggregation and querying close to the data, so the DOM footprint stays constant as datasets grow.",
  },
  {
    id: "customize",
    question: "Can I customize the look and feel?",
    answer:
      "Yes. The DataViewModel → Renderer step is intentionally thin, so custom cell renderers, badges, and inline visualizations are easy to add and cheap to draw. Styling is yours to own.",
  },
  {
    id: "free",
    question: "Is SuperPlot Grid free to use?",
    answer:
      "SuperPlot Grid is open source and developed in the open. Licensing details are published in the repository.",
  },
  {
    id: "production",
    question: "Is it production ready and actively maintained?",
    answer:
      "The grid is under active development in a public monorepo with a documented pipeline and test coverage on the core data models. Track progress and releases in the repository.",
  },
  {
    id: "docs",
    question: "Where can I find documentation and examples?",
    answer:
      "The docs cover the DataSource, DataModel, ViewModel, and Renderer layers with API references. The demos on this page double as agent-ready build briefs you can copy into your own project.",
  },
];

export const getStartedIntro =
  "Install the grid, choose a data model, describe the view you want, and wire the generated configuration into your app. The same primitives work for hand-written TypeScript and agent-generated code.";

export const getStartedSteps: GetStartedStep[] = [
  {
    id: "install",
    title: "Install the packages",
    body: "Add the headless grid core and the React bindings to your workspace.",
    code: "yarn add @superplot/grid @superplot/frameworks",
  },
  {
    id: "datasource",
    title: "Point at your data",
    body: "Load column-major data into a DuckDB-backed SQL data source, shared across grids by ref counting.",
    code: "const source = new DuckDBWasmDataSource();\nawait source.loadData(table, columns);",
  },
  {
    id: "render",
    title: "Describe the view and render",
    body: "Pick a flat or pivot data model, then drop the DataGrid component in and let it draw.",
    code: "const grid = useFlatGrid({ source, columns });\nreturn <DataGrid {...grid} />;",
  },
];

export const footerLinks: {
  brand: string;
  legal: string;
  email: string;
  columns: { title: string; links: HomeLink[] }[];
} = {
  brand: "SuperPlot",
  legal: "© DataFlow Solutions Pte Ltd, 2026",
  email: contactEmail,
  columns: [
    {
      title: "Product",
      links: [
        { label: "Demos", href: siteLinks.demos },
        { label: "Features", href: siteLinks.features },
        { label: "Docs", href: siteLinks.docs },
      ],
    },
    {
      title: "Company",
      links: [
        { label: "Our approach", href: siteLinks.approach },
        { label: "Contact us", href: `mailto:${contactEmail}` },
      ],
    },
    {
      title: "Community",
      links: [
        { label: "GitHub", href: githubUrl, external: true },
        { label: "Report an issue", href: `${githubUrl}/issues`, external: true },
      ],
    },
  ],
};
