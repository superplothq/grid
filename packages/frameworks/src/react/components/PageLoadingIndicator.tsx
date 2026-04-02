import { type FC, type ReactNode, type CSSProperties } from "react";

interface IPageLoadingIndicator {
  icon: ReactNode;
  text: string;
  style: CSSProperties;
}

export type PageLoadingIndicatorProps = Partial<IPageLoadingIndicator>;

const spinnerKeyframes = "@keyframes df-page-loading-spin { to { transform: rotate(360deg); } }";

const DefaultSpinner: FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{animation: "df-page-loading-spin 1s linear infinite"}}>
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

export const PageLoadingIndicator: FC<PageLoadingIndicatorProps> = ({icon, text, style}) => {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        padding: "6px 0",
        fontSize: "12px",
        color: "#4c4f69",
        backgroundColor: "rgba(250, 250, 250, 0.95)",
        borderTop: "1px solid #e0e0e0",
        gap: "6px",
        zIndex: 1,
        ...style,
      }}
    >
      <style>{spinnerKeyframes}</style>
      {icon ?? <DefaultSpinner />}
      {text ?? "Loading more data..."}
    </div>
  );
};
