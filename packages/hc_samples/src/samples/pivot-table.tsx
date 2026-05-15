import { registerSample } from "./registry";
import { PivotGrid } from "./pivot-grid";
import { ConversationViewer } from "../components/ConversationViewer";

function PivotTable() {
  return (
    <div style={{ padding: "40px 24px", maxWidth: 960, margin: "0 auto" }}>
      <section style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "#111827", marginBottom: 4 }}>Citywide Payroll Data (Fiscal Year)</h2>
        <p style={{ fontSize: 14, color: "#6b7280", textAlign: "left", maxWidth: 600 }}>
          Pivot analysis of payroll data published by the Office of Payroll Administration on <a href="https://data.cityofnewyork.us/City-Government/Citywide-Payroll-Data-Fiscal-Year-/k397-673e/about_data" target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb", textDecoration: "underline" }}>NYC Open Data</a> — covering salary, hours, and overtime for every city employee, grouped by borough, leave status, and agency. Uses FY2025 data.
        </p>
        <div style={{ width: "100%", height: 540 }}>
          <PivotGrid />
        </div>
      </section>

      <section style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "#111827", marginBottom: 4 }}>Video Demo</h2>
        <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 16, maxWidth: 600 }}>
          A walkthrough of all the interactions in the grid - sorting, filtering, expand/collapse, and metadata overlays - built entirely by an AI agent using our library.
        </p>
        <video
          src="/mov3.mp4"
          controls
          style={{ height: 240, width: "auto", borderRadius: 8, border: "1px solid #e5e7eb" }}
        />
      </section>

      <section style={{ marginTop: 30 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "#111827", marginBottom: 4, textAlign: "center" }}>Agent Conversation</h2>
        <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 0, maxWidth: 600, margin: "0 auto 16px" }}>
          Summary of the conversation with Claude to build the pivot grid above - with grid state snapshots captured at key stages.
        </p>
        <ConversationViewer dataUrl="/pivot-grid-conversation.json" />
      </section>
    </div>
  );
}

registerSample({
  id: "pivot-table",
  title: "Pivot Table",
  component: PivotTable,
});
