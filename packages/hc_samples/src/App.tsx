import { getSamples, getSampleById } from "./samples";
import { cn } from "./lib/utils";
import { LayoutGrid, Table, Grid3X3, MessageSquare, TableProperties } from "lucide-react";

function getActiveSampleId(): string {
  const hash = window.location.hash.replace(/^#\/?/, "").replace(/\/$/, "");
  if (hash && getSampleById(hash)) return hash;
  const samples = getSamples();
  const fallback = samples[0]?.id ?? "";
  if (fallback) window.location.replace(`#/${fallback}`);
  return fallback;
}

const sampleIcons: Record<string, typeof LayoutGrid> = {
  "pivot-table": TableProperties,
  "basic-pivot": LayoutGrid,
  "basic-flat-table": Table,
  "pivot-grid-conversation": MessageSquare,
};

const firstTabIds = new Set(["pivot-table"]);

function SidebarLink({ sample, activeSampleId }: { sample: { id: string; title: string }; activeSampleId: string }) {
  const Icon = sampleIcons[sample.id] ?? LayoutGrid;
  const isActive = activeSampleId === sample.id;
  return (
    <a
      key={sample.id}
      href={`#/${sample.id}`}
      onClick={() => {
        window.location.hash = `#/${sample.id}`;
        window.location.reload();
      }}
      className="flex items-center no-underline"
      style={{
        gap: 10,
        height: 36,
        padding: "0 12px",
        borderRadius: 6,
        fontSize: 14,
        fontWeight: isActive ? 500 : 400,
        color: isActive ? "#1d4ed8" : "#374151",
        background: isActive ? "#dbeafe" : "transparent",
        marginBottom: 2,
      }}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.background = "#e5e7eb";
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.background = "transparent";
      }}
    >
      <Icon style={{ width: 16, height: 16, flexShrink: 0, color: isActive ? "#2563eb" : "#6b7280" }} />
      <span className="truncate">{sample.title}</span>
    </a>
  );
}

export function App() {
  const samples = getSamples();
  const activeSampleId = getActiveSampleId();
  const activeSample = getSampleById(activeSampleId);
  const ActiveComponent = activeSample?.component;

  return (
    <div className="flex h-full">
      <aside className="flex flex-col shrink-0 border-r border-gray-200" style={{ width: 240, background: "#f3f4f6" }}>
        <div className="flex items-center gap-3" style={{ padding: "16px 20px", height: 56 }}>
          <div className="flex items-center justify-center rounded-lg" style={{ width: 30, height: 30, background: "#4338ca" }}>
            <Grid3X3 style={{ width: 16, height: 16, color: "#fff" }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: "#111827" }}>Grid Samples</span>
        </div>

        <div style={{ height: 1, background: "#d1d5db", margin: "0 16px" }} />

        <nav className="flex-1 overflow-y-auto" style={{ padding: "16px 12px" }}>
          {samples.filter((s) => firstTabIds.has(s.id)).map((sample) => (
            <SidebarLink key={sample.id} sample={sample} activeSampleId={activeSampleId} />
          ))}
          <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", letterSpacing: "0.05em", padding: "12px 12px 6px", textTransform: "uppercase" }}>
            In Progress
          </div>
          {samples.filter((s) => !firstTabIds.has(s.id)).map((sample) => (
            <SidebarLink key={sample.id} sample={sample} activeSampleId={activeSampleId} />
          ))}
        </nav>
      </aside>

      <div className="flex-1 min-w-0 h-full" style={{ background: "#fff", overflowY: "auto" }}>
        {ActiveComponent && <ActiveComponent />}
      </div>
    </div>
  );
}
