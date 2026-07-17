import React, { useMemo } from "react";
import { getTheme, type Theme } from "grid/dist/renderer";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export interface PageViewProps {
  currentPage: number;
  totalPages: number;
  displayPageSize: number;
  datasetTotalRows: number;
  loading: boolean;
  goToPage: (page: number) => Promise<void>;
  setDisplayPageSize: (size: number) => void;
  theme?: string;
}

const ChevronLeft: React.FC<{ size?: number }> = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 12 12" style={{ display: "block" }}>
    <path d="M8 2 L4 6 L8 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ChevronRight: React.FC<{ size?: number }> = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 12 12" style={{ display: "block" }}>
    <path d="M4 2 L8 6 L4 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ChevronFirst: React.FC<{ size?: number }> = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 12 12" style={{ display: "block" }}>
    <line x1="3" y1="2" x2="3" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M9 2 L5 6 L9 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ChevronLast: React.FC<{ size?: number }> = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 12 12" style={{ display: "block" }}>
    <path d="M3 2 L7 6 L3 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="9" y1="2" x2="9" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const PageView: React.FC<PageViewProps> = ({
  currentPage,
  totalPages,
  displayPageSize,
  datasetTotalRows,
  loading,
  goToPage,
  setDisplayPageSize,
  theme: themeName,
}) => {
  const resolved: Theme | null = useMemo(() => themeName ? getTheme(themeName) : null, [themeName]);
  const textColor = (resolved?.valueTextColor as string) ?? "#4c4f69";
  const mutedColor = (resolved?.columnFacetTextColor as string) ?? "#5c5f77";
  const bgColor = (resolved?.valueBackgroundColor as string) ?? "#FAFAFA";
  const borderColor = (resolved?.horizontalBorderColor as string) ?? "#ccd0da";
  const fontSize = (resolved?.fontSize as number) ?? 12;

  const empty = datasetTotalRows === 0;
  const startItem = empty ? 0 : currentPage * displayPageSize + 1;
  const endItem = Math.min((currentPage + 1) * displayPageSize, datasetTotalRows);
  const isFirst = currentPage === 0;
  const isLast = currentPage >= totalPages - 1;

  const btnStyle = (disabled: boolean): React.CSSProperties => ({
    background: "none",
    border: "none",
    cursor: disabled ? "default" : "pointer",
    color: disabled ? mutedColor : textColor,
    opacity: disabled ? 0.4 : 0.9,
    padding: "4px 0px",
    lineHeight: 1,
    display: "inline-flex",
    alignItems: "center",
  });

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: "12px",
      padding: "6px 12px",
      fontSize,
      color: textColor,
      backgroundColor: bgColor,
      borderTop: `1px solid ${borderColor}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
        <span style={{ color: mutedColor }}>Page Size:</span>
        <select
          value={displayPageSize}
          onChange={(e) => setDisplayPageSize(Number(e.target.value))}
          disabled={loading}
          style={{
            padding: "2px 4px",
            fontSize,
            color: textColor,
            backgroundColor: bgColor,
            border: `1px solid ${borderColor}`,
            borderRadius: 3,
          }}
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>{size}</option>
          ))}
        </select>
      </div>

      { /* <span style={{ color: mutedColor }}>
        {startItem} to <b style={{ color: textColor }}>{endItem}</b> of <b style={{ color: textColor }}>{datasetTotalRows}</b>
      </span> */ }

      <div style={{ display: "flex", alignItems: "center", gap: "0px" }}>
        <button disabled={isFirst || loading} onClick={() => goToPage(0)} style={btnStyle(isFirst || loading)}>
          <ChevronFirst />
        </button>
        <button disabled={isFirst || loading} onClick={() => goToPage(currentPage - 1)} style={btnStyle(isFirst || loading)}>
          <ChevronLeft />
        </button>
        <span style={{ margin: "0 8px", color: mutedColor }}>
          Page <b style={{ color: textColor }}>{currentPage + 1}</b> of <b style={{ color: textColor }}>{totalPages}</b>
        </span>
        <button disabled={isLast || loading} onClick={() => goToPage(currentPage + 1)} style={btnStyle(isLast || loading)}>
          <ChevronRight />
        </button>
        <button disabled={isLast || loading} onClick={() => goToPage(totalPages - 1)} style={btnStyle(isLast || loading)}>
          <ChevronLast />
        </button>
      </div>
    </div>
  );
};
