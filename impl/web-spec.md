# web-spec

# Home page

**Hero (like Univer.ai)**

*left - hero image content:*

**The JavaScript grid built for agents**

Create advanced grids, pivots, and data views using prompts, typed APIs, and composable primitives - without manually stitching frontend, backend, and query logic by hand. Build using a composable architecture, designed for coding agents.

- Option set

    - Option 1

        

        JavaScript data grid, reimagined, for Agents | JavaScript data grid for Agents 

        

        [para about our philosophy] / [para about grid, bringing some ]

        

        [second line about control - build features beyond what a standard grid offers - mention who it is for]

        

    - Option 2

        

        ## **The JavaScript grid built for agents.**

        

        Build advanced grids, pivots, and data views with a composable architecture designed for both developers and AI agents. Start with a powerful grid today — extend into richer data interfaces tomorrow.

        

    - Option 3

        

        ## **An agent-first JavaScript grid for complex data apps.**

        

        Create interactive tables, pivots, filters, summaries, and custom data views using prompts, typed APIs, and composable primitives - without stitching together frontend, backend, and query logic by hand.

        

    - Option 4

        

        ## **A smarter JavaScript grid for the agentic era.**

        

        Built on headless architecture, full-stack data transformation, and table algebra, our grid helps developers and agents create complex data experiences faster — starting with grids and expanding beyond them.

        

CTA for left side:

View Demos | Read about our approach

*right (the bridge):*

Exact “Copy to your agent” + content relevant to our grid (for users to use) + copy button

CTA for right side:

Github Repo | Join our Discord

**Post hero**, bar similar to Univer.ai: Built for any agent and stack

**Section: Demos** (use cases): 3-4 use-cases as tabs, with demo showing below

[para about how all these demos were built using agents, and how they can see the prompt required to build the demo]

Use cases [could either show as tab, or in drop down like ST along with theme option]: [See [demo] with [theme]?]

- Sales [Similar to https://www.simple-table.com/examples/crm?theme=custom-light]

- Infrastructure [Similar to https://www.simple-table.com/examples/infrastructure?theme=modern-light] - shows charts + real time capabilities+ grouped columns. If we can also have the column config box, as on right side, even better.

- Finance [as at https://www.ag-grid.com/example-finance/]

- Billing [Similar to https://www.simple-table.com/examples/billing?theme=modern-light] - to show the hierarchy

- HR [https://www.simple-table.com/examples/hr?theme=modern-light or https://www.ag-grid.com/example-hr/] - shows pinned columns on both sides + charts etc.

- Pivot analytics: https://rv-grid.com/demo/pivot/ (also shows conditional formatting). Also shows the row grouping feature as toggle button on top + custom panel to select pivot options. Pretty slick option to select the aggregation by click on the button.

- Performance demo, with the 3KPIs for performance (load time, render time, fps, heap size?) - similar to https://handsontable.com/demo

    - Data Wrangling demo - the current one we built for Torstein? With some fixes (UI, colors) and simpler prompts (without using internal API calls, which our user-developers wouldn’t know)

- [Optional] Custom filters & action menu - good example at https://tablecn.com - where there’s filters separate from grid, and then has separate advanced / command filters etc. Each filter also has a custom (and relevant UI) that opens. Also a clean rendering of grid with different badges+icons in cells. And an action hamburger menu in last cell, with context menu - to show extensibility

Below each demo: “See the prompt for this demo” > opens the step by prompt required for that particular grid demo (new tab, or overlay panel?)

Do we also give a “See on Github” link for each demo, like Ag-Grid does [https://github.com/ag-grid/ag-grid-demos/tree/main/inventory] - they’ve linked many of their demos by framework, at https://github.com/ag-grid/ag-grid-demos/tree/main

*For Later*: if we can create a simulation environment for users to change the prompt, and experience it live (like JSFiddle, StackBlitz etc.). 

Do we give a “See all grid features” here, below demos, which then takes to the docs page, where all feature based sample is present.

**Section: “Our guiding principles” [title]**

[Para summarizing our philosophy for agent first approach]

For the 3 key things - headless architecture, fullstack grid, and table algebra supported, we should add a dedicated section with 3 buttons + each linking to their page [or a single page with # links], which can also be linked from footer > “Our approach”.

**Section: Key Grid features / “Core features & capabilities”**

tabular structure of say 9 key features, with link to specific demos in docs

what features to list:

- performance and virtualized rendering

- standard table with grouping

- tree table

- pivot table

- server-side code generation [with icons of diff server side]

- Sorting, filtering and pagination + custom cell renderers (fixtures?)

- real-time updates

- advanced row/column interactions

- what on design?

CTA at bottom: “Explore all features” and link to docs

**Section**: should we have a section on “Why superplot” and compare against simple table libraries, batteries included, and then in-house etc. (like revo-grid does)?

**Section: Common questions**

for LLMs primarily, [https://www.simple-table.com has done it well]

- Who is SuperPlot grid for?

- How do I install and get started?

- What frameworks and versions are supported?

- How is it different from other grids out there?

- What features does SuperPlot grid include?

- How do it perform with large datasets?

- Is it mobile responsive?

- Can I customize the look and feel?

- Do you support accessibility?

- How does it compare to AG Grid?

- How does it compare to TanStack Table?

- What about MUX Grid?

- Is SuperPlot grid free to use?

- Is it production ready and actively maintained?

- What kind of support do you offer?

- Where can I find documentation and examples?

**Section: Get started**

Again, instructions for developers to get started [similar to info at top, in header]

# Site structure and links

- For common items, have at root

    - /our-approach

    - /blog/…

    - /contact/

    - /about/

- For everything grid, have superplot.dev**/grid/** [this allows us to have multi product approach, in future]

    - /demos

    - /docs

    - /docs/api/

    - /docs/features/

# Top Nav bar

- Home

- Our Approach → philosophy / manifesto page

- Demos [links to home page itself-> demo section]?

- Features [takes to docs page, the node where all features are grouped/sub-grouped]

- Docs [here, will the landing page be for humans, to navigate?]

- Reach us > Discord Support | Contact Us | Report issue (Github?)

- Github icon at right side > linked to repo

How do we show MIT open source? [or do we need to]?

# Footer

*left:*

SuperPlot >  (c) DataFlow Solutions Pte Ltd, 2026

About Us

MIT License

*right:*

hello@superplot.dev

Follow us:

- Twitter

- Github
