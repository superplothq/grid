import React, { useState, useMemo } from "react";
import type { DataSchema, ScalarFilter, DatePartScalarFilter, ColumnRangeValues, DatePart } from "@superplot/grid";
import { getTheme, type Theme } from "@superplot/grid/renderer";

export interface FilterDropdownProps {
  schema: DataSchema;
  domain: ColumnRangeValues | null;
  currentFilters: ScalarFilter[];
  onApply: (filters: ScalarFilter[]) => void;
  onClear: () => void;
  onClose: () => void;
  theme?: string;
}

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

const DATE_OPS = ["before", "after", "between", "empty", "notEmpty"] as const;
const DATE_OP_LABELS: Record<string, string> = {
  before: "Before",
  after: "After",
  between: "Between",
  empty: "Is empty",
  notEmpty: "Is not empty",
};

const DATE_PART_OPS = ["eq", "neq", "gt", "gte", "lt", "lte", "between"] as const;
const DATE_PART_OP_LABELS: Record<string, string> = {
  eq: "Equals",
  neq: "Not equals",
  gt: "Greater than",
  gte: "Greater than or equal",
  lt: "Less than",
  lte: "Less than or equal",
  between: "Between",
};

const DATE_PARTS: DatePart[] = ["year", "month", "day", "hour", "minute", "second", "quarter", "week"];
const DATE_PART_LABELS: Record<string, string> = {
  year: "Year", month: "Month", day: "Day", hour: "Hour",
  minute: "Minute", second: "Second", quarter: "Quarter", week: "Week",
};

const NO_VALUE_OPS = new Set(["empty", "notEmpty"]);

type DimensionTab = "set" | "text";
type DateTab = "date" | "datePart";

function resolveTheme(themeName?: string): { textColor: string; mutedColor: string; bgColor: string; borderColor: string; fontSize: number; accentColor: string } {
  const resolved: Theme | null = themeName ? getTheme(themeName) : null;
  return {
    textColor: (resolved?.valueTextColor as string) ?? "#4c4f69",
    mutedColor: (resolved?.columnFacetTextColor as string) ?? "#5c5f77",
    bgColor: (resolved?.valueBackgroundColor as string) ?? "#eff1f5",
    borderColor: (resolved?.horizontalBorderColor as string) ?? "#ccd0da",
    fontSize: (resolved?.fontSize as number) ?? 12,
    accentColor: (resolved?.columnFacetTextColor as string) ?? "#5c5f77",
  };
}

export const FilterDropdown: React.FC<FilterDropdownProps> = ({ schema, domain, currentFilters, onApply, onClear, onClose, theme: themeName }) => {
  const { textColor, mutedColor, bgColor, borderColor, fontSize, accentColor } = resolveTheme(themeName);

  const isTemporal = schema.subtype === "temporal";
  const isMeasure = schema.type === "measure";
  const isDimension = schema.type === "dimension" && !isTemporal;
  const isLowCardinality = isDimension && schema.cardinality === "low";

  const existingSetFilter = currentFilters.find((f) => f.op === "in");
  const existingScalarFilter = currentFilters.find((f) => f.op !== "in");
  const existingDatePartFilter = currentFilters.find((f) => (f as DatePartScalarFilter).subtype === "date") as DatePartScalarFilter | undefined;

  // dimension state
  const [dimTab, setDimTab] = useState<DimensionTab>(() => existingSetFilter ? "set" : (existingScalarFilter && isDimension ? "text" : "set"));
  const [selectedValues, setSelectedValues] = useState<Set<string>>(() => {
    if (existingSetFilter && Array.isArray(existingSetFilter.value)) return new Set(existingSetFilter.value.map(String));
    if (domain?.type === "categorical") return new Set(domain.values);
    return new Set();
  });
  const [searchText, setSearchText] = useState("");
  const [textOp, setTextOp] = useState<string>(() => existingScalarFilter?.op ?? "contains");
  const [textValue, setTextValue] = useState<string>(() => (existingScalarFilter?.value as string) ?? "");

  // measure state
  const [numOp, setNumOp] = useState<string>(() => existingScalarFilter?.op ?? "gt");
  const [numValue, setNumValue] = useState<string>(() => {
    if (existingScalarFilter?.op === "between" && Array.isArray(existingScalarFilter.value)) return String(existingScalarFilter.value[0] ?? "");
    return existingScalarFilter?.value != null ? String(existingScalarFilter.value) : "";
  });
  const [numValue2, setNumValue2] = useState<string>(() => {
    if (existingScalarFilter?.op === "between" && Array.isArray(existingScalarFilter.value)) return String(existingScalarFilter.value[1] ?? "");
    return "";
  });

  // date state
  const [dateTab, setDateTab] = useState<DateTab>(() => existingDatePartFilter ? "datePart" : "date");
  const [dateOp, setDateOp] = useState<string>(() => {
    const nonPartFilter = currentFilters.find((f) => !(f as DatePartScalarFilter).subtype && (f.op === "before" || f.op === "after" || f.op === "between" || f.op === "empty" || f.op === "notEmpty"));
    return nonPartFilter?.op ?? "after";
  });
  const [dateValue, setDateValue] = useState<string>(() => {
    const nonPartFilter = currentFilters.find((f) => !(f as DatePartScalarFilter).subtype);
    if (nonPartFilter?.op === "between" && Array.isArray(nonPartFilter.value)) return String(nonPartFilter.value[0] ?? "");
    return nonPartFilter?.value != null ? String(nonPartFilter.value) : "";
  });
  const [dateValue2, setDateValue2] = useState<string>(() => {
    const nonPartFilter = currentFilters.find((f) => !(f as DatePartScalarFilter).subtype);
    if (nonPartFilter?.op === "between" && Array.isArray(nonPartFilter.value)) return String(nonPartFilter.value[1] ?? "");
    return "";
  });
  const [datePart, setDatePart] = useState<DatePart>(() => existingDatePartFilter?.part ?? "year");
  const [datePartOp, setDatePartOp] = useState<string>(() => existingDatePartFilter?.op ?? "eq");
  const [datePartValue, setDatePartValue] = useState<string>(() => {
    if (existingDatePartFilter?.op === "between" && Array.isArray(existingDatePartFilter.value)) return String(existingDatePartFilter.value[0] ?? "");
    return existingDatePartFilter?.value != null ? String(existingDatePartFilter.value) : "";
  });
  const [datePartValue2, setDatePartValue2] = useState<string>(() => {
    if (existingDatePartFilter?.op === "between" && Array.isArray(existingDatePartFilter.value)) return String(existingDatePartFilter.value[1] ?? "");
    return "";
  });

  const filteredValues = useMemo(() => {
    if (domain?.type !== "categorical") return [];
    if (!searchText) return domain.values;
    const lower = searchText.toLowerCase();
    return domain.values.filter((v) => v.toLowerCase().includes(lower));
  }, [domain, searchText]);

  const selectStyle: React.CSSProperties = {
    border: `1px solid ${borderColor}`,
    borderRadius: 3,
    padding: "4px 6px",
    fontSize,
    color: textColor,
    background: bgColor,
    outline: "none",
    width: "100%",
  };

  const inputStyle: React.CSSProperties = {
    border: `1px solid ${borderColor}`,
    borderRadius: 3,
    padding: "4px 6px",
    fontSize,
    color: textColor,
    background: bgColor,
    outline: "none",
    width: "100%",
    boxSizing: "border-box" as const,
  };

  const tabBtnStyle = (active: boolean, position: "left" | "right"): React.CSSProperties => ({
    flex: 1,
    border: `1px solid ${borderColor}`,
    borderRadius: position === "left" ? "3px 0 0 3px" : "0 3px 3px 0",
    padding: "4px 8px",
    fontSize,
    color: active ? "#fff" : mutedColor,
    background: active ? accentColor : bgColor,
    cursor: "pointer",
    fontWeight: 500,
    marginLeft: position === "right" ? -1 : 0,
  });

  const handleApply = () => {
    if (isMeasure) {
      if (NO_VALUE_OPS.has(numOp)) {
        onApply([{ type: "scalar", field: schema.name, op: numOp as ScalarFilter["op"], value: null }]);
      } else if (numOp === "between") {
        onApply([{ type: "scalar", field: schema.name, op: "between", value: [Number(numValue), Number(numValue2)] }]);
      } else {
        onApply([{ type: "scalar", field: schema.name, op: numOp as ScalarFilter["op"], value: Number(numValue) }]);
      }
      return;
    }

    if (isTemporal) {
      if (dateTab === "date") {
        if (NO_VALUE_OPS.has(dateOp)) {
          onApply([{ type: "scalar", field: schema.name, op: dateOp as ScalarFilter["op"], value: null }]);
        } else if (dateOp === "between") {
          onApply([{ type: "scalar", field: schema.name, op: "between", value: [dateValue, dateValue2] as unknown as string[] }]);
        } else {
          onApply([{ type: "scalar", field: schema.name, op: dateOp as ScalarFilter["op"], value: dateValue }]);
        }
      } else {
        const filter: DatePartScalarFilter = {
          type: "scalar",
          field: schema.name,
          subtype: "date",
          part: datePart,
          op: datePartOp as ScalarFilter["op"],
          value: datePartOp === "between" ? [Number(datePartValue), Number(datePartValue2)] : Number(datePartValue),
        };
        onApply([filter]);
      }
      return;
    }

    // dimension
    if (isLowCardinality && dimTab === "set") {
      onApply([{ type: "scalar", field: schema.name, op: "in", value: Array.from(selectedValues) }]);
    } else {
      if (NO_VALUE_OPS.has(textOp)) {
        onApply([{ type: "scalar", field: schema.name, op: textOp as ScalarFilter["op"], value: null }]);
      } else {
        onApply([{ type: "scalar", field: schema.name, op: textOp as ScalarFilter["op"], value: textValue }]);
      }
    }
  };

  const renderSetTab = () => (
    <>
      <input
        type="text"
        placeholder="Search..."
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        style={{ ...inputStyle, marginBottom: 6 }}
      />
      <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
        <span style={{ cursor: "pointer", color: mutedColor, fontSize: fontSize - 1, textDecoration: "underline" }} onClick={() => setSelectedValues(new Set(filteredValues))}>Select All</span>
        <span style={{ cursor: "pointer", color: mutedColor, fontSize: fontSize - 1, textDecoration: "underline" }} onClick={() => setSelectedValues(new Set())}>Deselect All</span>
      </div>
      <div style={{ maxHeight: 200, overflowY: "auto", border: `1px solid ${borderColor}`, borderRadius: 3, padding: 4 }}>
        {domain === null ? (
          <div style={{ color: mutedColor, padding: 8, textAlign: "center" }}>Loading...</div>
        ) : filteredValues.map((val) => (
          <label key={val} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 4px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={selectedValues.has(val)}
              onChange={() => {
                setSelectedValues((prev) => {
                  const next = new Set(prev);
                  if (next.has(val)) next.delete(val); else next.add(val);
                  return next;
                });
              }}
              style={{ accentColor, width: 14, height: 14, margin: 0 }}
            />
            <span>{val}</span>
          </label>
        ))}
      </div>
    </>
  );

  const renderTextTab = () => (
    <>
      <select value={textOp} onChange={(e) => setTextOp(e.target.value)} style={{ ...selectStyle, marginBottom: 8 }}>
        {TEXT_OPS.map((op) => <option key={op} value={op}>{TEXT_OP_LABELS[op]}</option>)}
      </select>
      {!NO_VALUE_OPS.has(textOp) && (
        <input type="text" placeholder="Value..." value={textValue} onChange={(e) => setTextValue(e.target.value)} style={inputStyle} />
      )}
    </>
  );

  const renderMeasure = () => (
    <>
      <select value={numOp} onChange={(e) => setNumOp(e.target.value)} style={{ ...selectStyle, marginBottom: 8 }}>
        {NUM_OPS.map((op) => <option key={op} value={op}>{NUM_OP_LABELS[op]}</option>)}
      </select>
      {!NO_VALUE_OPS.has(numOp) && (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="number" placeholder="Value..." value={numValue} onChange={(e) => setNumValue(e.target.value)} style={inputStyle} />
          {numOp === "between" && (
            <>
              <span style={{ color: mutedColor }}>and</span>
              <input type="number" placeholder="Value..." value={numValue2} onChange={(e) => setNumValue2(e.target.value)} style={inputStyle} />
            </>
          )}
        </div>
      )}
    </>
  );

  const renderDateTab = () => (
    <>
      <select value={dateOp} onChange={(e) => setDateOp(e.target.value)} style={{ ...selectStyle, marginBottom: 8 }}>
        {DATE_OPS.map((op) => <option key={op} value={op}>{DATE_OP_LABELS[op]}</option>)}
      </select>
      {!NO_VALUE_OPS.has(dateOp) && (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="datetime-local" value={dateValue} onChange={(e) => setDateValue(e.target.value)} style={inputStyle} />
          {dateOp === "between" && (
            <>
              <span style={{ color: mutedColor }}>and</span>
              <input type="datetime-local" value={dateValue2} onChange={(e) => setDateValue2(e.target.value)} style={inputStyle} />
            </>
          )}
        </div>
      )}
    </>
  );

  const renderDatePartTab = () => (
    <>
      <select value={datePart} onChange={(e) => setDatePart(e.target.value as DatePart)} style={{ ...selectStyle, marginBottom: 8 }}>
        {DATE_PARTS.map((p) => <option key={p} value={p}>{DATE_PART_LABELS[p]}</option>)}
      </select>
      <select value={datePartOp} onChange={(e) => setDatePartOp(e.target.value)} style={{ ...selectStyle, marginBottom: 8 }}>
        {DATE_PART_OPS.map((op) => <option key={op} value={op}>{DATE_PART_OP_LABELS[op]}</option>)}
      </select>
      {!NO_VALUE_OPS.has(datePartOp) && (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="number" placeholder="Value..." value={datePartValue} onChange={(e) => setDatePartValue(e.target.value)} style={inputStyle} />
          {datePartOp === "between" && (
            <>
              <span style={{ color: mutedColor }}>and</span>
              <input type="number" placeholder="Value..." value={datePartValue2} onChange={(e) => setDatePartValue2(e.target.value)} style={inputStyle} />
            </>
          )}
        </div>
      )}
    </>
  );

  return (
    <div style={{
      border: `1px solid ${borderColor}`,
      borderRadius: 4,
      width: 280,
      fontSize,
      fontWeight: "normal",
      color: textColor,
      background: bgColor,
      boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderBottom: `1px solid ${borderColor}`, borderRadius: "4px 4px 0 0" }}>
        <span style={{ fontWeight: 500, fontSize, color: mutedColor }}>Filter: {schema.displayName ?? schema.name}</span>
        <svg onClick={onClose} width="14" height="14" viewBox="0 0 14 14" style={{ cursor: "pointer", color: mutedColor }}>
          <path d="M3 3 L11 11 M11 3 L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>

      {/* Body */}
      <div style={{ padding: 12 }}>
        {/* Dimension tabs */}
        {isDimension && isLowCardinality && (
          <div style={{ display: "flex", gap: 0, marginBottom: 10 }}>
            <button onClick={() => setDimTab("set")} style={tabBtnStyle(dimTab === "set", "left")}>Set</button>
            <button onClick={() => setDimTab("text")} style={tabBtnStyle(dimTab === "text", "right")}>Text</button>
          </div>
        )}

        {isDimension && isLowCardinality && dimTab === "set" && renderSetTab()}
        {isDimension && ((!isLowCardinality) || dimTab === "text") && renderTextTab()}
        {isMeasure && renderMeasure()}

        {/* Date tabs */}
        {isTemporal && (
          <div style={{ display: "flex", gap: 0, marginBottom: 10 }}>
            <button onClick={() => setDateTab("date")} style={tabBtnStyle(dateTab === "date", "left")}>Date</button>
            <button onClick={() => setDateTab("datePart")} style={tabBtnStyle(dateTab === "datePart", "right")}>Date Part</button>
          </div>
        )}
        {isTemporal && dateTab === "date" && renderDateTab()}
        {isTemporal && dateTab === "datePart" && renderDatePartTab()}

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
          <button
            onClick={onClear}
            style={{
              border: `1px solid ${borderColor}`,
              borderRadius: 3,
              padding: "4px 10px",
              fontSize,
              color: mutedColor,
              background: bgColor,
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            Clear
          </button>
          <button
            onClick={handleApply}
            style={{
              border: `1px solid ${borderColor}`,
              borderRadius: 3,
              padding: "4px 14px",
              fontSize,
              color: "#fff",
              background: accentColor,
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
