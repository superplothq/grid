import { registerSample } from "./registry";
import { StandardGrid } from "./standard-grid";
import { ConversationViewer } from "../components/ConversationViewer";

function StandardTable() {
  return (
    <div style={{ padding: "40px 24px", maxWidth: 960, margin: "0 auto" }}>
      <section style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "#111827", marginBottom: 4 }}>Data Wrangler - Citywide Payroll Data</h2>
        <p style={{ fontSize: 14, color: "#6b7280", textAlign: "left", maxWidth: 600 }}>
          A data wrangling showcase built on real payroll data from <a href="https://data.cityofnewyork.us/City-Government/Citywide-Payroll-Data-Fiscal-Year-/k397-673e/about_data" target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb", textDecoration: "underline" }}>NYC Open Data</a> (FY2025). The dataset is downsampled to 50K rows and null values are randomly injected (~1% of rows, ~30% of columns) to simulate dirty data. The grid visualizes data quality with distribution charts, quality indicators, and interactive filters.
        </p>
        <div style={{ width: "100%", height: 540 }}>
          <StandardGrid />
        </div>
      </section>

      <section style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "#111827", marginBottom: 4 }}>Video Demo</h2>
        <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 16, maxWidth: 600 }}>
          A walkthrough of the data wrangler grid - column distributions, null highlighting, histogram filtering, dimension bar filters, and the minimap - built entirely by an AI agent using our library.
        </p>
        <video
          src="/mov4.mp4"
          controls
          style={{ height: 240, width: "auto", borderRadius: 8, border: "1px solid #e5e7eb" }}
        />
      </section>

      <section style={{ marginTop: 30 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "#111827", marginBottom: 4, textAlign: "center" }}>Agent Conversation</h2>
        <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 0, maxWidth: 600, margin: "0 auto 16px" }}>
          Summary of the conversation with Claude to build the standard grid above - with grid state snapshots captured at key stages.
        </p>
        <ConversationViewer dataUrl="/standard-grid-conversation.json" />
      </section>
    </div>
  );
}

registerSample({
  id: "standard-table",
  title: "Standard Table",
  component: StandardTable,
});
