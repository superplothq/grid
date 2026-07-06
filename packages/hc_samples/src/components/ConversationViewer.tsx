import { useEffect, useState } from "react";
import Markdown from "react-markdown";

interface ConversationEntry {
  user: string;
  claude: string;
  grid_state?: string;
  state_desc?: string;
  concept_used?: string;
}

interface ConversationViewerProps {
  dataUrl: string;
}

export function ConversationViewer({ dataUrl }: ConversationViewerProps) {
  const [entries, setEntries] = useState<ConversationEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(dataUrl)
      .then((r) => r.json())
      .then((data) => {
        setEntries(data);
        setLoading(false);
      });
  }, [dataUrl]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#6b7280" }}>
        Loading conversation…
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 24px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
        {entries.map((entry, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <MessageBlock
              role="user"
              label="Developer"
              content={entry.user}
            />
            <MessageBlock
              role="assistant"
              label="Agent"
              content={entry.claude}
              gridState={entry.grid_state}
              stateDesc={entry.state_desc}
              conceptUsed={entry.concept_used}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function UserIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function BotIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 8V4H8" />
      <rect width="16" height="12" x="4" y="8" rx="2" />
      <path d="M2 14h2" />
      <path d="M20 14h2" />
      <path d="M15 13v2" />
      <path d="M9 13v2" />
    </svg>
  );
}

interface MessageBlockProps {
  role: "user" | "assistant";
  label: string;
  content: string;
  gridState?: string;
  stateDesc?: string;
  conceptUsed?: string;
}

function GridStateImage({ id }: { id: string }) {
  const url = `/img/${id}.png`;

  return (
    <img
      src={url}
      alt={`Grid state ${id}`}
      title="Click to open full size image in new tab"
      onClick={() => window.open(url, "_blank")}
      style={{
        height: "auto",
        width: "100%",
        borderRadius: 8,
        border: "1px solid #e5e7eb",
        display: "block",
        cursor: "pointer",
        transition: "transform 0.2s ease",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.05)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
    />
  );
}

function ConceptPills({ concepts }: { concepts: string }) {
  const items = concepts.split(";").map((s) => s.trim()).filter(Boolean);
  if (items.length === 0) return null;

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 16, alignItems: "center" }}>
      <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 500, marginRight: 2 }}>Concepts:</span>
      {items.map((concept, i) => (
        <span
          key={i}
          style={{
            fontSize: 11,
            fontWeight: 500,
            padding: "2px 8px",
            borderRadius: 2,
            background: "#dbeafe",
            color: "#1e3a5f",
          }}
        >
          {concept}
        </span>
      ))}
    </div>
  );
}

function MessageBlock({ role, label, content, gridState, stateDesc, conceptUsed }: MessageBlockProps) {
  const isUser = role === "user";
  const borderColor = isUser ? "#d1d5db" : "#93c5fd";
  const images = gridState ? gridState.split(",").map((s) => s.trim()) : [];
  const hasImages = images.length > 0;

  return (
    <div
      style={{
        borderLeft: `3px solid ${borderColor}`,
        padding: "12px 16px",
        background: isUser ? "#f9fafb" : "#ffffff",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        {isUser ? <UserIcon /> : <BotIcon />}
        <span style={{ fontSize: 12, color: "#9ca3af", fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="cv-markdown" style={{ fontSize: 14, color: "#374151", lineHeight: 1.6 }}>
            <Markdown>{content}</Markdown>
          </div>
          {!isUser && conceptUsed && <ConceptPills concepts={conceptUsed} />}
        </div>
        {hasImages && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0, maxWidth: 360 }}>
            {stateDesc && (
              <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 400 }}>{stateDesc}</span>
            )}
            {images.map((id) => (
              <GridStateImage key={id} id={id} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
