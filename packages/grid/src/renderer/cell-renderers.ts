import { scaleLinear } from "d3-scale";
import { line, curveCatmullRom } from "d3-shape";
import { FacetCellRenderer, FacetHeaderRenderer } from "./types";

export interface RendererContext {
  container: HTMLElement;
  key: string;
}

// when the renderer takes ownership of the container element (framework like react createRoot rendering)
// it returns undefined (void) from the renderer
export type CellRenderer<T> = (data: T, ctx: RendererContext) => string | HTMLElement | HTMLElement[] | void;

export const defaultFacetRenderer: FacetCellRenderer = (data) => {
  return data == null ? "" : String(data);
};

export const defaultFacetHeaderRenderer: FacetHeaderRenderer = (text) => {
  return text ?? "";
};

export const textRenderer: CellRenderer<unknown> = (data, ctx) => {
  ctx.container.style.display = "inline-block";
  ctx.container.style.overflow = "hidden";
  ctx.container.style.textOverflow = "ellipsis";
  ctx.container.style.whiteSpace = "nowrap";
  return data == null ? "" : String(data);
};

export interface CellConfig {}

export interface ChartConfig extends CellConfig {
  chartType: "line" | "bar";
  minWidth: number;
  minHeight: number;
  padding: number;
  color: string;
  strokeWidth: number;
}

export const defaultChartConfig: ChartConfig = {
  chartType: "line",
  minWidth: 80,
  minHeight: 20,
  padding: 4,
  color: "#1976d2",
  strokeWidth: 2,
};

export type CellWithConfigRenderer<C extends CellConfig, T> = (config: Partial<C>) => CellRenderer<T>;

export const createChartRenderer: CellWithConfigRenderer<ChartConfig, number[]> = (config) => {
  const mergedConfig = { ...defaultChartConfig, ...config };
  const { chartType, minWidth, minHeight, padding, color, strokeWidth } = mergedConfig;

  // Separate bar / line etc rendering
  return (data: number[]): string => {
    if (!data || data.length === 0) return "";

    const width = minWidth;
    const height = minHeight;
    const innerWidth = width - padding * 2;
    const innerHeight = height - padding * 2;

    const minVal = Math.min(...data);
    const maxVal = Math.max(...data);
    const range = maxVal - minVal || 1;

    const xScale = scaleLinear()
      .domain([0, data.length - 1])
      .range([padding, width - padding]);

    const yScale = scaleLinear()
      .domain([minVal - range * 0.1, maxVal + range * 0.1])
      .range([height - padding, padding]);

    let pathD = "";

    if (chartType === "line") {
      const lineGenerator = line<number>()
        .x((_, i) => xScale(i))
        .y((d) => yScale(d))
        .curve(curveCatmullRom);

      pathD = lineGenerator(data) || "";

      return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <path d="${pathD}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" />
      </svg>`;
    } else {
      const barWidth = innerWidth / data.length * 0.8;
      const barGap = innerWidth / data.length * 0.1;

      const bars = data.map((d, i) => {
        const x = padding + (innerWidth / data.length) * i + barGap;
        const barHeight = ((d - minVal) / range) * innerHeight || 1;
        const y = height - padding - barHeight;
        return `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" fill="${color}" />`;
      }).join("");

      return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        ${bars}
      </svg>`;
    }
  };
};

