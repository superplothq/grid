import { type FC, type ReactNode, type CSSProperties, useMemo } from "react";
import { getTheme, type Theme } from "@superplot/grid/renderer";

interface ISkeletonGrid {
  icon: ReactNode;
  body: ReactNode | string;
  style: CSSProperties;
  containerCls: string | string[];
  theme: string;
}

export type SkeletonGridProps = Partial<ISkeletonGrid>;

const spinnerKeyframes = "@keyframes df-skeleton-spin { to { transform: rotate(360deg); } }";

const DefaultSpinner: FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{animation: "df-skeleton-spin 1s linear infinite"}}>
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

export const SkeletonGrid: FC<SkeletonGridProps> = ({icon, body, style, containerCls, theme: themeName}) => {
  const resolved: Theme | null = useMemo(() => themeName ? getTheme(themeName) : null, [themeName]);

  const textColor = (resolved?.valueTextColor as string) ?? "#4c4f69";
  const bgColor = (resolved?.valueBackgroundColor as string) ?? "#FAFAFA";

  const cls = Array.isArray(containerCls) ? containerCls.join(" ") : containerCls;

  return (
    <div
      className={cls}
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        fontSize: "12px",
        color: textColor,
        backgroundColor: bgColor,
        gap: "8px",
        ...style,
      }}
    >
      <style>{spinnerKeyframes}</style>
      {icon ?? <DefaultSpinner />}
      {body ?? "Loading data..."}
    </div>
  );
};
