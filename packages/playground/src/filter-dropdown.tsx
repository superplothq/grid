import React, {useState, useMemo} from "react";
import feather from "feather-icons";
import type {ScalarFilter} from "@superplot/grid";

export interface FilterDropdownProps {
  field: string;
  fieldType: "dimension" | "measure";
  distinctValues: string[] | null;
  currentFilters: ScalarFilter[];
  onApply: (field: string, filters: ScalarFilter[]) => void;
  onClear: (field: string) => void;
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

type DimensionTab = "set" | "text";

const TEXT_OPS = ["contains", "doesNotContain", "startsWith", "endsWith", "eq", "neq", "empty", "notEmpty"] as const;
const TEXT_OP_LABELS: Record<string, string> = {
  contains: "Contains",
  doesNotContain: "Does not contain",
  startsWith: "Starts with",
  endsWith: "Ends with",
  eq: "Equals",
  neq: "Not equals",
  empty: "Is empty",
  notEmpty: "Is not empty",
};

const NUM_OPS = ["gt", "gte", "lt", "lte", "eq", "neq", "between", "empty", "notEmpty"] as const;
const NUM_OP_LABELS: Record<string, string> = {
  gt: "Greater than",
  gte: "Greater than or equal",
  lt: "Less than",
  lte: "Less than or equal",
  eq: "Equals",
  neq: "Not equals",
  between: "Between",
  empty: "Is empty",
  notEmpty: "Is not empty",
};

const NO_VALUE_OPS = new Set(["empty", "notEmpty"]);

const selectStyle: React.CSSProperties = {
  border: `1px solid ${BORDER}`,
  borderRadius: 3,
  padding: "4px 6px",
  fontSize: 12,
  color: TEXT,
  background: BG,
  outline: "none",
  width: "100%",
};

const inputStyle: React.CSSProperties = {
  border: `1px solid ${BORDER}`,
  borderRadius: 3,
  padding: "4px 6px",
  fontSize: 12,
  color: TEXT,
  background: BG,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const FilterDropdown: React.FC<FilterDropdownProps> = ({field, fieldType, distinctValues, currentFilters, onApply, onClear, onClose}) => {
  const existingSetFilter = currentFilters.find(f => f.op === "in");
  const existingTextFilter = currentFilters.find(f => f.op !== "in");

  const [tab, setTab] = useState<DimensionTab>(() => existingSetFilter ? "set" : (existingTextFilter && fieldType === "dimension" ? "text" : "set"));

  const [selectedValues, setSelectedValues] = useState<Set<string>>(() => {
    if (existingSetFilter && Array.isArray(existingSetFilter.value)) {
      return new Set(existingSetFilter.value.map(String));
    }
    return new Set(distinctValues ?? []);
  });
  const [searchText, setSearchText] = useState("");

  const [textOp, setTextOp] = useState<string>(() => (existingTextFilter?.op as string) ?? "contains");
  const [textValue, setTextValue] = useState<string>(() => (existingTextFilter?.value as string) ?? "");

  const [numOp, setNumOp] = useState<string>(() => (existingTextFilter?.op as string) ?? "gt");
  const [numValue, setNumValue] = useState<string>(() => {
    if (existingTextFilter && existingTextFilter.op === "between" && Array.isArray(existingTextFilter.value)) {
      return String(existingTextFilter.value[0] ?? "");
    }
    return existingTextFilter?.value != null ? String(existingTextFilter.value) : "";
  });
  const [numValue2, setNumValue2] = useState<string>(() => {
    if (existingTextFilter && existingTextFilter.op === "between" && Array.isArray(existingTextFilter.value)) {
      return String(existingTextFilter.value[1] ?? "");
    }
    return "";
  });

  const filteredValues = useMemo(() => {
    if (!distinctValues) return [];
    if (!searchText) return distinctValues;
    const lower = searchText.toLowerCase();
    return distinctValues.filter(v => v.toLowerCase().includes(lower));
  }, [distinctValues, searchText]);

  const handleSelectAll = () => {
    setSelectedValues(new Set(filteredValues));
  };

  const handleDeselectAll = () => {
    setSelectedValues(new Set());
  };

  const handleToggleValue = (val: string) => {
    setSelectedValues(prev => {
      const next = new Set(prev);
      if (next.has(val)) {
        next.delete(val);
      } else {
        next.add(val);
      }
      return next;
    });
  };

  const handleApply = () => {
    if (fieldType === "measure") {
      if (NO_VALUE_OPS.has(numOp)) {
        onApply(field, [{type: "scalar", field, op: numOp as ScalarFilter["op"], value: null}]);
      } else if (numOp === "between") {
        onApply(field, [{type: "scalar", field, op: "between", value: [Number(numValue), Number(numValue2)]}]);
      } else {
        onApply(field, [{type: "scalar", field, op: numOp as ScalarFilter["op"], value: Number(numValue)}]);
      }
      return;
    }

    if (tab === "set") {
      const vals = Array.from(selectedValues);
      onApply(field, [{type: "scalar", field, op: "in", value: vals}]);
    } else {
      if (NO_VALUE_OPS.has(textOp)) {
        onApply(field, [{type: "scalar", field, op: textOp as ScalarFilter["op"], value: null}]);
      } else {
        onApply(field, [{type: "scalar", field, op: textOp as ScalarFilter["op"], value: textValue}]);
      }
    }
  };

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
        <span style={{fontWeight: 500, fontSize: 12, color: TEXT_SECONDARY}}>Filter {field}</span>
        <FeatherIcon name="x" size={14} strokeWidth={2} style={{cursor: "pointer", color: TEXT_SECONDARY}} onClick={onClose}/>
      </div>

      {/* Body */}
      <div style={{padding: "12px"}}>
        {fieldType === "dimension" && (
          <div style={{display: "flex", gap: 0, marginBottom: 10}}>
            {(["set", "text"] as DimensionTab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  flex: 1,
                  border: `1px solid ${BORDER}`,
                  borderRadius: t === "set" ? "3px 0 0 3px" : "0 3px 3px 0",
                  padding: "4px 8px",
                  fontSize: 12,
                  color: tab === t ? "#fff" : TEXT_SECONDARY,
                  background: tab === t ? TEXT_SECONDARY : BG,
                  cursor: "pointer",
                  fontWeight: 500,
                  marginLeft: t === "text" ? -1 : 0,
                }}
              >
                {t === "set" ? "Set" : "Text"}
              </button>
            ))}
          </div>
        )}

        {fieldType === "dimension" && tab === "set" && (
          <>
            <input
              type="text"
              placeholder="Search..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              style={{...inputStyle, marginBottom: 6}}
            />
            <div style={{display: "flex", gap: 8, marginBottom: 6}}>
              <span style={{cursor: "pointer", color: TEXT_SECONDARY, fontSize: 11, textDecoration: "underline"}} onClick={handleSelectAll}>Select All</span>
              <span style={{cursor: "pointer", color: TEXT_SECONDARY, fontSize: 11, textDecoration: "underline"}} onClick={handleDeselectAll}>Deselect All</span>
            </div>
            <div style={{maxHeight: 200, overflowY: "auto", border: `1px solid ${BORDER}`, borderRadius: 3, padding: 4}}>
              {distinctValues === null ? (
                <div style={{color: TEXT_MUTED, padding: 8, textAlign: "center"}}>Loading...</div>
              ) : filteredValues.map(val => (
                <label key={val} style={{display: "flex", alignItems: "center", gap: 6, padding: "2px 4px", cursor: "pointer"}}>
                  <input
                    type="checkbox"
                    checked={selectedValues.has(val)}
                    onChange={() => handleToggleValue(val)}
                    style={{accentColor: TEXT_SECONDARY, width: 14, height: 14, margin: 0}}
                  />
                  <span>{val}</span>
                </label>
              ))}
            </div>
          </>
        )}

        {fieldType === "dimension" && tab === "text" && (
          <>
            <select value={textOp} onChange={e => setTextOp(e.target.value)} style={{...selectStyle, marginBottom: 8}}>
              {TEXT_OPS.map(op => <option key={op} value={op}>{TEXT_OP_LABELS[op]}</option>)}
            </select>
            <input
              type="text"
              placeholder="Value..."
              value={textValue}
              onChange={e => setTextValue(e.target.value)}
              disabled={NO_VALUE_OPS.has(textOp)}
              style={{...inputStyle, color: NO_VALUE_OPS.has(textOp) ? TEXT_MUTED : TEXT}}
            />
          </>
        )}

        {fieldType === "measure" && (
          <>
            <select value={numOp} onChange={e => setNumOp(e.target.value)} style={{...selectStyle, marginBottom: 8}}>
              {NUM_OPS.map(op => <option key={op} value={op}>{NUM_OP_LABELS[op]}</option>)}
            </select>
            {!NO_VALUE_OPS.has(numOp) && (
              <div style={{display: "flex", gap: 6, alignItems: "center"}}>
                <input
                  type="number"
                  placeholder="Value..."
                  value={numValue}
                  onChange={e => setNumValue(e.target.value)}
                  style={inputStyle}
                />
                {numOp === "between" && (
                  <>
                    <span style={{color: TEXT_SECONDARY}}>and</span>
                    <input
                      type="number"
                      placeholder="Value..."
                      value={numValue2}
                      onChange={e => setNumValue2(e.target.value)}
                      style={inputStyle}
                    />
                  </>
                )}
              </div>
            )}
          </>
        )}

        {/* Footer */}
        <div style={{display: "flex", justifyContent: "space-between", marginTop: 12}}>
          <button
            onClick={() => onClear(field)}
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
            Clear
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

export default FilterDropdown;
