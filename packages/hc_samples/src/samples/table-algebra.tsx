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
  img: { width: "100%", borderRadius: 8, border: "1px solid #e5e7eb", margin: "16px 0" } as const,
  caption: { fontSize: 12, color: "#9ca3af", textAlign: "center", marginTop: -8, marginBottom: 16 } as const,
};

function TableAlgebra() {
  return (
    <div style={S.page}>
      <h1 style={S.h1}>Table Algebra</h1>
      <p style={S.subtle}>
        A formal operator model for pivot table axis construction - and why it eliminates the combinatorial query generation problem.
      </p>

      <h2 style={S.h2}>Beyond Simple Pivots</h2>
      <p style={S.p}>
        Our grid handles standard flat tables with full sorting, filtering, grouping, and pagination. But where the architecture distinguishes itself is in pivot table configuration. Real-world pivot tables are not just "rows and columns with a measure" - they require nested hierarchies, side-by-side measure comparisons, cross-products of dimensions, and arbitrary combinations of all three. Most grid libraries either restrict what configurations are possible, or push the query generation problem to the backend developer.
      </p>
      <p style={S.p}>
        We take a different approach. The pivot table's row and column axes are defined using a small set of composable operators drawn from the table algebra formalized in the Polaris paper from Stanford.
      </p>

      <h2 style={S.h2}>The Operators</h2>
      <img src="/table-algebra-operators.png" alt="Table algebra operators from the Polaris paper" style={S.img} />
      <p style={S.caption as React.CSSProperties}>
        Figure from <a href="https://graphics.stanford.edu/papers/polaris/polaris.pdf" target="_blank" rel="noopener noreferrer" style={{ color: "#6b7280" }}>Polaris: A System for Query, Analysis, and Visualization of Multidimensional Databases</a> (Stolte, Tang, Hanrahan - Stanford)
      </p>

      <p style={S.p}>
        Three operators compose to define any axis of a pivot table:
      </p>
      <ul style={{ margin: "0 0 16px 20px", padding: 0 }}>
        <li style={S.li}><strong>Cross (<span style={S.mono}>cross</span>)</strong> - produces a cartesian product of two fields. Each value of the first field is paired with every value of the second. This is what creates nested headers - for example, each Quarter containing every Product underneath it.</li>
        <li style={S.li}><strong>Nest / Hierarchy (<span style={S.mono}>hierarchy</span>)</strong> - produces a hierarchical nesting where the second field's values are scoped to the first. Unlike cross, only the combinations that exist in the data appear. Quarter / Month produces Jan-Mar under Q1, Apr-Jun under Q2, and so on - no impossible combinations.</li>
        <li style={S.li}><strong>Concatenation (<span style={S.mono}>concat</span>)</strong> - places fields side by side along the same axis level. Profit + Sales puts both measures next to each other as peer columns, not nested. Cross with a dimension produces per-dimension measure columns: each Quarter gets its own Profit and Sales.</li>
      </ul>
      <p style={S.p}>
        These operators are fully composable. An axis definition like <span style={S.mono}>cross("Agency", concat("Salary", "Hours"))</span> produces a column axis where each agency has Salary and Hours side by side. Nesting this further with hierarchy or adding more concat levels creates arbitrarily complex configurations - all expressed declaratively.
      </p>

      <h2 style={S.h2}>The Query Generation Problem</h2>
      <p style={S.p}>
        This is where the real complexity lives. Each combination of these operators on rows and columns, combined with sort, filter, pagination, and expand/collapse state, produces a different transformation query. A cross on columns with a hierarchy on rows with two concatenated measures and a range filter requires a specific GROUP BY, specific SELECT projections, specific ORDER BY, and specific pagination logic. Change any part of the config and the query changes.
      </p>
      <p style={S.p}>
        Traditionally, backend developers write this query generation by hand. In practice, this means most implementations restrict the configurations they support - no nested cross-products, no mixed hierarchy/concat, no more than two levels - because the combinatorial surface of correct queries is too large to maintain manually. Bugs in this layer are subtle: wrong GROUP BY clauses produce silently incorrect aggregations, not errors.
      </p>
      <p style={S.p}>
        Our DataModel owns this entirely. The table algebra config is the input; the correct transformation query is the output. Every valid combination of cross, hierarchy, and concat on any number of levels, with any sort/filter/pagination state, produces a correct query. The developer (or agent) never writes SQL for pivot transformations - they compose operators.
      </p>

      <h2 style={S.h2}>Dimensional Projection</h2>
      <p style={S.p}>
        We extended the original Polaris model with our own dimensional projection semantics. This enables a pattern common in Excel but historically difficult to implement in database-backed grids: showing an aggregated summary row alongside its dimensional breakdown, with expand/collapse to toggle between the two.
      </p>
      <p style={S.p}>
        In a traditional pivot, collapsing a dimension level means removing it from the query entirely - you lose the breakdown. With dimensional projection, the collapsed state shows an aggregate computed at the database layer (not a client-side rollup), and expanding reveals the full breakdown underneath. The projection state is part of the table algebra config, so the DataModel generates the correct query for any combination of expanded and collapsed levels across both axes.
      </p>
      <p style={S.p}>
        This is significant because it moves Excel-style aggregate navigation into the database layer. The aggregates are correct by construction - they are computed by the same query engine that produces the detail rows, not by a separate client-side summation that can drift from the source data.
      </p>

      <div style={S.callout}>
        <strong>The result:</strong> A pivot table configuration that would traditionally require weeks of backend query engineering - nested hierarchies, cross-products, mixed measures, dimensional projection with database-level aggregates - is expressed as a single declarative config. The grid's DataModel generates the correct query for every state. The developer, or the agent, works at the level of operators, not SQL.
      </div>
    </div>
  );
}

registerSample({
  id: "table-algebra",
  title: "Table Algebra",
  component: TableAlgebra,
});
