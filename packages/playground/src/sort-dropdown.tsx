import React, {useState} from "react";
import feather from "feather-icons";

type SortDirection = "asc" | "desc";
type SortMode = "alphabetical" | "measure";

export interface SortEntryConfig {
  field: string;
  direction: SortDirection;
  by?: string;
}

export interface SortDropdownProps {
  field: string;
  measures: string[];
  multiSortEntries: SortEntryConfig[];
  onApply: (entries: SortEntryConfig[]) => void;
  onMultiSortChange: (entries: SortEntryConfig[]) => void;
  onClose: () => void;
}

const BORDER = "#ccd0da";
const TEXT = "#4c4f69";
const TEXT_SECONDARY = "#5c5f77";
const TEXT_MUTED = "#8c8fa1";
const BG = "#eff1f5";
const BG_HEADER = "#e6e9ef";

const FeatherIcon: React.FC<{name: string; size?: number; strokeWidth?: number; style?: React.CSSProperties; onClick?: () => void}> = ({name, size = 14, strokeWidth = 2, style, onClick}) => {
  const svg = feather.icons[name as keyof typeof feather.icons].toSvg({width: size, height: size, "stroke-width": strokeWidth});
  return <span dangerouslySetInnerHTML={{__html: svg}} style={{display: "inline-flex", alignItems: "center", ...style}} onClick={onClick}/>;
};

function describeSortEntry(entry: SortEntryConfig): string {
  if (entry.by) {
    return `${entry.field} by ${entry.by}`;
  }
  return `${entry.field} alphabetically`;
}

const MIN_MULTI_SORT_HEIGHT = 60;

const SortDropdown: React.FC<SortDropdownProps> = ({field, measures, multiSortEntries, onApply, onMultiSortChange, onClose}) => {
  const [mode, setMode] = useState<SortMode>("alphabetical");
  const [direction, setDirection] = useState<SortDirection>("asc");
  const [selectedMeasure, setSelectedMeasure] = useState(measures[0] ?? "");
  const [entries, setEntries] = useState<SortEntryConfig[]>(multiSortEntries);

  const buildCurrentEntry = (): SortEntryConfig => ({
    field,
    direction,
    ...(mode === "measure" ? {by: selectedMeasure} : {}),
  });

  const upsertEntry = (list: SortEntryConfig[], entry: SortEntryConfig): SortEntryConfig[] => {
    const idx = list.findIndex(e => e.field === entry.field);
    if (idx >= 0) {
      const existing = list[idx];
      if (existing.direction === entry.direction && existing.by === entry.by) return list;
      const updated = [...list];
      updated[idx] = entry;
      return updated;
    }
    return [...list, entry];
  };

  const handleAddToMultiSort = () => {
    const entry = buildCurrentEntry();
    const newEntries = upsertEntry(entries, entry);
    setEntries(newEntries);
    onMultiSortChange(newEntries);
  };

  const handleRemoveEntry = (index: number) => {
    const newEntries = entries.filter((_, i) => i !== index);
    setEntries(newEntries);
    onMultiSortChange(newEntries);
  };

  const handleApply = () => {
    const entry = buildCurrentEntry();
    const newEntries = upsertEntry(entries, entry);
    setEntries(newEntries);
    onApply(newEntries);
  };

  const toggleDirection = () => {
    setDirection(d => d === "asc" ? "desc" : "asc");
  };

  const directionIcon = direction === "asc" ? "arrow-up" : "arrow-down";

  return (
    <div style={{
      border: `1px solid ${BORDER}`,
      borderRadius: 4,
      width: 280,
      fontSize: 12,
      fontWeight: "normal",
      color: TEXT,
      background: BG,
      boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: BG_HEADER, borderBottom: `1px solid ${BORDER}`, borderRadius: "4px 4px 0 0"}}>
        <span style={{fontWeight: 500, fontSize: 12, color: TEXT_SECONDARY}}>Sort {field}</span>
        <FeatherIcon name="x" size={14} strokeWidth={2} style={{cursor: "pointer", color: TEXT_SECONDARY}} onClick={onClose}/>
      </div>

      {/* Body */}
      <div style={{padding: "12px"}}>
        {/* Alphabetical radio */}
        <label style={{display: "flex", alignItems: "center", gap: 6, marginBottom: 6, cursor: "pointer"}}>
          <input
            type="radio"
            checked={mode === "alphabetical"}
            onChange={() => setMode("alphabetical")}
            style={{accentColor: TEXT_SECONDARY, width: 14, height: 14, margin: 0}}
          />
          <span>Alphabetically</span>
        </label>

        {/* Measure radio */}
        <label style={{display: "flex", alignItems: "center", gap: 6, marginBottom: 10, cursor: "pointer"}}>
          <input
            type="radio"
            checked={mode === "measure"}
            onChange={() => setMode("measure")}
            style={{accentColor: TEXT_SECONDARY, width: 14, height: 14, margin: 0}}
          />
          <span>by</span>
          <select
            value={selectedMeasure}
            onChange={e => {
              setSelectedMeasure(e.target.value);
              setMode("measure");
            }}
            disabled={mode !== "measure"}
            style={{
              border: `1px solid ${BORDER}`,
              borderRadius: 3,
              padding: "2px 6px",
              fontSize: 12,
              color: mode === "measure" ? TEXT : TEXT_MUTED,
              background: mode === "measure" ? BG : BG_HEADER,
              outline: "none",
              cursor: mode === "measure" ? "pointer" : "default",
            }}
          >
            {measures.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>

        {/* Direction toggle */}
        <div style={{display: "flex", alignItems: "center", gap: 6, marginBottom: 14}}>
          <span style={{color: TEXT_SECONDARY}}>in</span>
          <button
            onClick={toggleDirection}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              border: `1px solid ${BORDER}`,
              borderRadius: 3,
              padding: "2px 8px",
              fontSize: 12,
              color: TEXT_SECONDARY,
              background: BG,
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            <FeatherIcon name={directionIcon} size={11} strokeWidth={2.5} style={{color: TEXT_SECONDARY}}/>
            {direction === "asc" ? "Ascending" : "Descending"}
          </button>
          <span style={{color: TEXT_SECONDARY}}>order</span>
        </div>

        {/* Multi sort section */}
        <div style={{marginBottom: 12}}>
          <div style={{fontWeight: 500, fontSize: 12, color: TEXT_SECONDARY, marginBottom: 4}}>Multi sort</div>
          <div style={{minHeight: MIN_MULTI_SORT_HEIGHT}}>
            {entries.length === 0 ? (
              <div style={{color: TEXT_MUTED, fontSize: 11}}>Add multiple fields to sort</div>
            ) : (
              <div style={{display: "flex", flexDirection: "column", gap: 4, marginTop: 6}}>
                {entries.map((entry, i) => (
                  <div key={i} style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    border: `1px solid ${BORDER}`,
                    borderRadius: 14,
                    padding: "4px 10px",
                    fontSize: 12,
                    background: BG_HEADER,
                  }}>
                    <FeatherIcon name={entry.direction === "asc" ? "arrow-up" : "arrow-down"} size={11} strokeWidth={2.5} style={{color: TEXT_SECONDARY}}/>
                    <span style={{flex: 1, color: TEXT}}>{describeSortEntry(entry)}</span>
                    <FeatherIcon name="edit-2" size={11} strokeWidth={2} style={{cursor: "pointer", color: TEXT_MUTED}}/>
                    <FeatherIcon name="x" size={11} strokeWidth={2} style={{cursor: "pointer", color: TEXT_MUTED}} onClick={() => handleRemoveEntry(i)}/>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer buttons */}
        <div style={{display: "flex", justifyContent: "flex-end", gap: 8}}>
          <button
            onClick={handleAddToMultiSort}
            style={{
              border: `1px solid ${BORDER}`,
              borderRadius: 3,
              padding: "4px 10px",
              fontSize: 12,
              color: TEXT_SECONDARY,
              background: BG,
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            Add to Multi Sort
          </button>
          <button
            onClick={handleApply}
            style={{
              border: `1px solid ${BORDER}`,
              borderRadius: 3,
              padding: "4px 14px",
              fontSize: 12,
              color: "#fff",
              background: TEXT_SECONDARY,
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};

export default SortDropdown;
