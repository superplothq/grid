import { type FC, type ReactNode, type CSSProperties, useMemo } from "react";
import { getTheme, type Theme } from "@superplot/grid/renderer";

interface IGridErrOverlay {
  icon: ReactNode;
  errTitle: ReactNode | string;
  errBody: ReactNode | string;
  style: CSSProperties;
  containerCls: string | string[];
  theme: string;
}

export type GridErrOverlayProps = Partial<IGridErrOverlay>;

const DefaultErrIcon: FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

export const GridErrOverlay: FC<GridErrOverlayProps> = ({icon, errTitle, errBody, style, containerCls, theme: themeName}) => {
  const resolved: Theme | null = useMemo(() => themeName ? getTheme(themeName) : null, [themeName]);

  const textColor = (resolved?.errOverlayTextColor as string) ?? "#d20f39";
  const bgColor = (resolved?.errOverlayBackgroundColor as string) ?? "rgba(255, 255, 255, 0.9)";

  const cls = Array.isArray(containerCls) ? containerCls.join(" ") : containerCls;

  return (
    <div
      className={cls}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        color: textColor,
        backgroundColor: bgColor,
        fontSize: "12px",
        gap: "8px",
        ...style,
      }}
    >
      <div style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
        fontWeight: "500",
      }}>
        {icon ?? <DefaultErrIcon />}
        {errTitle !== undefined ? errTitle : <span style={{fontWeight: 600}}>Error:</span>}
      </div>
      <div>
        {errBody !== undefined ? errBody : null}
      </div>
    </div>
  );
};
