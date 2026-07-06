import { registerSample } from "./registry";

const S = {
  page: { padding: "40px 24px", maxWidth: 760, margin: "0 auto", lineHeight: 1.7 } as const,
  h1: { fontSize: 26, fontWeight: 700, color: "#111827", marginBottom: 8 } as const,
  h2: { fontSize: 18, fontWeight: 600, color: "#111827", marginTop: 36, marginBottom: 8 } as const,
  h3: { fontSize: 15, fontWeight: 600, color: "#111827", marginTop: 24, marginBottom: 6 } as const,
  p: { fontSize: 14, color: "#374151", marginBottom: 14 } as const,
  subtle: { fontSize: 14, color: "#6b7280" } as const,
  mono: { fontFamily: "monospace", fontSize: 13, color: "#4338ca", background: "#f3f4f6", padding: "1px 5px", borderRadius: 3 } as const,
  diagram: { fontFamily: "monospace", fontSize: 13, color: "#374151", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: "16px 20px", margin: "16px 0 20px", lineHeight: 1.6, whiteSpace: "pre", overflowX: "auto" } as const,
  callout: { fontSize: 14, color: "#374151", background: "#eef2ff", border: "1px solid #c7d2fe", borderRadius: 8, padding: "14px 18px", margin: "20px 0", lineHeight: 1.65 } as const,
  li: { fontSize: 14, color: "#374151", marginBottom: 8, paddingLeft: 4 } as const,
};

function HeadlessArchitecture() {
  return (
    <div style={S.page}>
      <h1 style={S.h1}>Headless Architecture for Agentic Code Generation</h1>
      <p style={S.subtle}>
        How a layered, pattern-consistent grid core makes AI agents effective collaborators - not just consumers of an API.
      </p>

      <h2 style={S.h2}>The Pipeline</h2>
      <p style={S.p}>
        The grid is structured as a strict four-stage pipeline. Each stage has a single responsibility, a well-defined contract with the next, and no knowledge of the layers above or below it beyond that contract.
      </p>
      <div style={S.diagram}>
        {`DataSource  ->  DataModel  ->  DataViewModel  ->  Renderer
(storage)      (transform)    (bridge)           (pixels)`}
      </div>
      <ul style={{ margin: "0 0 16px 20px", padding: 0 }}>
        <li style={S.li}><strong>DataSource</strong> - raw data storage and query execution. Loads data from URLs, runs SQL against an in-browser SQL compliant DB instance, or connects to an API backend with a payload defining the transformations. No knowledge of what the data means.</li>
        <li style={S.li}><strong>DataModel</strong> - transforms data for a specific use case. Handles pivot aggregation, flat table grouping, sorting, filtering, and pagination. Produces a ready-to-render structure.</li>
        <li style={S.li}><strong>DataViewModel</strong> - render-ready data plus rendering-dependent metadata. Can hold the full dataset if it fits in memory, or is aware of paged rendering when more-than-memory data is present. Carries facet hierarchies, column metadata, and cell-level annotations. The renderer slices into it for the visible viewport.</li>
        <li style={S.li}><strong>Renderer</strong> - turns the view model into DOM. Manages the CSS grid layout, fixture placement, cell recycling, and scroll handling. Consumes the view model without interpreting it.</li>
      </ul>
      <p style={S.p}>
        Each boundary is a typed interface. <span style={S.mono}>DataSource&lt;T&gt;</span> knows nothing about pivots. <span style={S.mono}>DataModel</span> knows nothing about rendering. <span style={S.mono}>DataViewModel</span> is a thin, ready-to-render structure that the renderer consumes without transforming. This separation is not incidental - it is the primary mechanism that makes the grid agent-friendly.
      </p>

      <h2 style={S.h2}>Why Agents Thrive on This</h2>

      <h3 style={S.h3}>1. Agents can operate on a single layer without understanding the rest</h3>
      <p style={S.p}>
        An agent asked to "add a sort dropdown" only needs to understand the DataModel contract: pass a sort config into the data model. It never touches SQL generation, viewport slicing, or DOM layout. The blast radius of any change is bounded by the layer it lives in.
      </p>

      <h3 style={S.h3}>2. Open-closed architecture at every layer</h3>
      <p style={S.p}>
        Each layer exposes extension points without requiring modification of the core. The renderer accepts custom renderers for facets and value cells and multiple extension points (fixtures), while it manages everything else - virtualization, updates, smooth scrolling, events, and layout. The DataModel accepts a table-algebra-driven config to drive transformations and a separate layer for metadata management, while it manages pagination, reshaping, and query generation internally.
      </p>
      <p style={S.p}>
        This is critical for agents. An agent does not need to fork the grid or understand its internals - it works within the extension points. The guardrails are tight enough that structurally valid code is almost certainly functionally correct, which is exactly the kind of constraint agents work well around.
      </p>

      <h3 style={S.h3}>3. Patterns repeat across the entire surface area</h3>
      <p style={S.p}>
        The same structural patterns show up everywhere in the grid. Every layer follows the same open-closed contract: a core that manages complexity internally and a small set of typed extension points for customization. Fixtures, renderers, metadata plumbing, and data model configs all follow this shape. The resolver/reshaper pattern appears in both global and page-scoped metadata. Cell renderers share a single signature regardless of content.
      </p>
      <p style={S.p}>
        This consistency compounds for agents. Once an agent has learned one contract boundary - one fixture, one metadata resolver, one renderer - it can produce any variation. The few-shot surface is small because the combinatorial surface is generated from a handful of repeating patterns. An agent does not need to learn the grid; it needs to learn the pattern, and then the grid is just instances of it.
      </p>

      <h3 style={S.h3}>4. A metadata layer built into the core</h3>
      <p style={S.p}>
        Grids are fundamentally for data display. But a complex grid needs more than raw values - it needs to render data in the context of computed metadata: column-level statistics, per-cell quality flags, distribution summaries, aggregated indicators. Without a first-class metadata layer, this logic ends up scattered across ad-hoc state, manual SQL queries, and brittle plumbing between the data fetch and the renderer.
      </p>
      <p style={S.p}>
        Our grid builds this metadata layer into the core. It touches both the data model (where metadata is computed alongside the data fetch) and the renderer (where metadata is available to every cell, fixture, and header). This is what allows an agent to build features like "highlight cells above column average" or "show per-column null distributions" without stitching together disconnected pieces. The metadata flows through the same pipeline as the data itself, opening up complex, interactive grids on top of the existing architecture with no core modifications.
      </p>

      <h2 style={S.h2}>Concrete Example: The Data Wrangler</h2>
      <p style={S.p}>
        The Standard Table demo on this site was built entirely through a conversation with an AI agent. At no point did the agent modify the grid core. Every feature - the quality bars, histograms, drag-to-filter overlays, the minimap, the dimension filter popover - was built by composing the existing extension points:
      </p>
      <ul style={{ margin: "0 0 16px 20px", padding: 0 }}>
        <li style={S.li}><strong>5 custom fixtures</strong> (RowNumberFixture, QualityBarFixture, HistogramFixture, QualityDotFixture, MinimapFixture, SummaryFixture) - all subclasses of <span style={S.mono}>PVerticalFixture</span> or <span style={S.mono}>PHorizontalFixture</span></li>
        <li style={S.li}><strong>1 metadata plumber</strong> with global and page-wise resolvers - computing missing counts, distributions, minimap buckets, and per-cell null flags via SQL</li>
        <li style={S.li}><strong>1 custom cell renderer</strong> handling null highlighting, alignment, formatting, and unit prefixes</li>
        <li style={S.li}><strong>1 facet track renderer</strong> adding filter icons to column headers</li>
        <li style={S.li}><strong>Interactive filtering</strong> via <span style={S.mono}>ScalarFilter</span> predicates passed to the IR - histogram range selection and dimension bar toggling, both combining through the same filter pipeline</li>
      </ul>
      <p style={S.p}>
        The grid core received zero modifications. Every feature was an extension, not a patch.
      </p>

      <div style={S.callout}>
        <strong>The key insight:</strong> The grid does not need an "agent mode" or a simplified API surface for AI consumption. The same open-closed architecture that makes the library extensible for human developers makes it composable for agents. Tight contracts, repeating patterns, and layered isolation are not agent-specific features - they are good architecture that happens to be exactly what agents need.
      </div>

    </div>
  );
}

registerSample({
  id: "headless-architecture",
  title: "Headless Architecture",
  component: HeadlessArchitecture,
});
