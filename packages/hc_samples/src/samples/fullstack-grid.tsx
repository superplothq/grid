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

function FullstackGrid() {
  return (
    <div style={S.page}>
      <h1 style={S.h1}>Fullstack Grid - From Data to Display</h1>
      <p style={S.subtle}>
        Why the hard part of a grid was never the rendering - and how collapsing the frontend/backend boundary changes the equation.
      </p>

      <h2 style={S.h2}>The Blurring Line</h2>
      <p style={S.p}>
        Agent-driven programming is dissolving the traditional split between frontend and backend engineering. An agent writing a pivot table does not think in terms of "I'll build the UI, someone else will build the API." It thinks end-to-end: what data do I need, how should it be transformed, and how should it be rendered. The separation of concerns that made sense for human team coordination becomes friction when a single agent is responsible for the full path from data to pixels.
      </p>
      <p style={S.p}>
        This shift matters for grids more than most UI components, because grids are not self-contained. A grid is a view of data - but the transformations required to produce that view have historically lived on the backend, maintained by a separate team, often in a separate language.
      </p>

      <h2 style={S.h2}>The Transformation Problem</h2>
      <p style={S.p}>
        Consider what a pivot table actually requires from the data layer. The user configures rows, columns, measures, filters, sorts, expand/collapse state, and pagination. Every combination of these produces a different query. A single pivot config change - say, adding a nested row field - changes the GROUP BY, the SELECT projections, the ORDER BY, and potentially the pagination strategy.
      </p>
      <p style={S.p}>
        For a standard flat table the surface is different but equally complex: grouped rows with expand/collapse, multi-field sorting, set filters and range filters, column-level aggregations, and data shape changes as the user interacts. Each of these states needs to produce the correct transformation query - whether that's SQL, an in-memory operation, or an API call to a backend that speaks a different dialect.
      </p>
      <p style={S.p}>
        Traditionally, this is a significant backend effort. A backend developer writes and maintains query generation logic that maps every possible UI state to correct, performant queries across the target database. This is a combinatorial problem that grows with every new feature, every new filter type, every new aggregation. It is also entirely invisible to the frontend - the grid just receives JSON and renders it.
      </p>

      <h2 style={S.h2}>The DataModel as a Contract</h2>
      <p style={S.p}>
        Our grid's DataModel layer exists specifically to own this problem. It takes a declarative config - expressed in table algebra (cross, hierarchy, concat for pivots; groupBy, sort, filter for flat tables) - and generates the correct transformation query internally. The frontend does not write SQL. The backend does not need to know the grid's UI state.
      </p>
      <div style={S.diagram}>
{`UI State (pivot config, filters, sort, expand/collapse)
        |
        v
  Table Algebra Config
        |
        v
  DataModel (query generation)
        |
        v
  DataSource (execution against target DB / API)`}
      </div>
      <p style={S.p}>
        The DataModel generates queries for different targets. For in-browser use, it produces SQL that runs against DuckDB-WASM. For server-side deployments, the same table algebra config can generate queries for different ORMs and databases - PostgreSQL, MySQL, BigQuery, or any SQL-compliant backend. The transformation logic is written once in the DataModel; the DataSource handles execution against the specific target.
      </p>
      <p style={S.p}>
        This is not an abstraction for abstraction's sake. It directly addresses the combinatorial explosion: every possible state of pivot config, grouping, sorting, filtering, and pagination is handled by the DataModel's query generator, not by hand-written backend endpoints. Adding a new filter type or aggregation to the grid does not require a corresponding backend change - the DataModel already knows how to express it.
      </p>

      <h2 style={S.h2}>Reducing Integration Time</h2>
      <p style={S.p}>
        The practical impact is that the path from "I have data in a database" to "I have an interactive, feature-rich grid displaying it" collapses from a multi-sprint, multi-team effort to hours of work. An agent (or a developer) points the DataSource at a database, defines a schema, and writes a table algebra config. The DataModel handles query generation, the ViewModel prepares render-ready data, and the Renderer draws it. No backend API to design, no query builder to maintain, no translation layer between UI state and database queries.
      </p>
      <div style={S.callout}>
        <strong>The shift:</strong> Grids have always been frontend components that depend on backend infrastructure. When the grid itself owns the transformation layer - and that layer speaks the same algebra regardless of the target database - the grid becomes a fullstack component. The agent, or the developer, works at a single abstraction level from data to display.
      </div>
    </div>
  );
}

registerSample({
  id: "fullstack-grid",
  title: "Fullstack Grid",
  component: FullstackGrid,
});
