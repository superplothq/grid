// #region loading-renderer
export interface LoadingRendererContext {
  /** The element the loading surface is drawn into. It fills the grid's mount point and carries the theme's CSS custom properties. */
  container: HTMLElement;
}

// when the renderer takes ownership of the container element (framework like react createRoot rendering)
// it returns undefined (void) from the renderer
export type LoadingRenderer = (ctx: LoadingRendererContext) => string | HTMLElement | HTMLElement[] | void;
// #endregion loading-renderer

const SVG_NS = "http://www.w3.org/2000/svg";
const HEADER_GRADIENT_ID = "grid-loading-shimmer-header";
const BODY_GRADIENT_ID = "grid-loading-shimmer-body";

// Cell text sits on a line box slightly taller than the font itself, so a pill of this height reads
// as a line of text rather than a rule.
const TEXT_LINE_RATIO = 1.75;
const SWEEP_DURATION = "1.4s";
// The pills are the theme's text colour held well below full strength - visible against both a light
// and a dark sheet, where two background tokens sit too close together to show anything.
const PILL_OPACITY = 0.1;
const SWEEP_OPACITY = 0.22;
const COLUMN_GAP = 48;
// The skeleton is a hint at a table, not a mock of one, so rows sit further apart than real cells do -
// this multiplies the theme's vertical cell padding rather than replacing it, keeping the theme in charge.
const ROW_SPACING = 2;
// `ratio` is a fraction of the usable width, so the skeleton reads as a table with uneven columns at
// any size. `vary` shortens body pills by up to WIDTH_VARIANCE so they read as text of varying length
// rather than identical bars, and `align` decides which edge stays put while the other frays - right
// for the trailing numeric column, matching how numbers are aligned in a real table.
const COLUMNS: { ratio: number; vary: boolean; align: "left" | "right" }[] = [
  { ratio: 0.3, vary: true, align: "left" },
  { ratio: 0.22, vary: false, align: "left" },
  { ratio: 0.28, vary: true, align: "left" },
  { ratio: 0.2, vary: true, align: "right" },
];
const WIDTH_VARIANCE = 0.2;

// One pill as a subpath: a rectangle with fully rounded left and right ends.
function pill(x: number, y: number, width: number, height: number): string {
  const r = height / 2;
  const straight = Math.max(0, width - height);
  return `M${x + r},${y} h${straight} a${r},${r} 0 0 1 0,${height} h-${straight} a${r},${r} 0 0 1 0,-${height} z`;
}

function makeSweepGradient(id: string, colorVar: string, width: number): SVGLinearGradientElement {
  const gradient = document.createElementNS(SVG_NS, "linearGradient");
  gradient.setAttribute("id", id);
  gradient.setAttribute("gradientUnits", "userSpaceOnUse");
  gradient.setAttribute("x1", String(-width / 2));
  gradient.setAttribute("y1", "0");
  gradient.setAttribute("x2", "0");
  gradient.setAttribute("y2", "0");

  const stops: [offset: string, opacity: number][] = [
    ["0", PILL_OPACITY],
    ["0.5", SWEEP_OPACITY],
    ["1", PILL_OPACITY],
  ];
  for (const [offset, opacity] of stops) {
    const stop = document.createElementNS(SVG_NS, "stop");
    stop.setAttribute("offset", offset);
    stop.style.stopColor = colorVar;
    stop.style.stopOpacity = String(opacity);
    gradient.appendChild(stop);
  }

  const animate = document.createElementNS(SVG_NS, "animateTransform");
  animate.setAttribute("attributeName", "gradientTransform");
  animate.setAttribute("type", "translate");
  animate.setAttribute("from", "0 0");
  animate.setAttribute("to", `${width * 1.5} 0`);
  animate.setAttribute("dur", SWEEP_DURATION);
  animate.setAttribute("repeatCount", "indefinite");
  gradient.appendChild(animate);

  return gradient;
}

function makeRect(x: number, y: number, width: number, height: number, fill: string): SVGRectElement {
  const rect = document.createElementNS(SVG_NS, "rect");
  rect.setAttribute("x", String(x));
  rect.setAttribute("y", String(y));
  rect.setAttribute("width", String(width));
  rect.setAttribute("height", String(height));
  rect.style.fill = fill;
  return rect;
}

function makePath(d: string, gradientId: string): SVGPathElement {
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("fill", `url(#${gradientId})`);
  path.setAttribute("d", d);
  return path;
}

/**
 * Default [`LoadingRenderer`](/docs/api-references/type-references#loadingrenderer). Draws a table skeleton - a column facet band over
 * body rows - as two SVG paths of pill subpaths, each swept by an animated gradient. Every colour and
 * dimension comes from the theme via the container's CSS custom properties, so the skeleton matches the
 * density and palette of the grid that will replace it. Rows are drawn past the bottom edge and clipped,
 * so the surface never ends in dead space.
 */
export const blankGridLoadingRenderer: LoadingRenderer = ({ container }) => {
  const width = container.clientWidth;
  const height = container.clientHeight;

  const styles = getComputedStyle(container);
  const token = (name: string): number => parseFloat(styles.getPropertyValue(name));

  const padX = token("--cell-padding-x");
  const padY = token("--cell-padding-y");
  const pillHeight = token("--font-size") * TEXT_LINE_RATIO;
  const headerPillHeight = token("--facet-header-font-size") * TEXT_LINE_RATIO;
  const rowHeight = pillHeight + padY * 2 * ROW_SPACING;
  const headerHeight = headerPillHeight + padY * 2 * ROW_SPACING;

  const usableWidth = width - padX * 2;
  const gapTotal = COLUMN_GAP * (COLUMNS.length - 1);
  const columnWidths = COLUMNS.map(column => (usableWidth - gapTotal) * column.ratio);

  const rowPills = (top: number, bandHeight: number, varyWidths: boolean): string => {
    const y = top + (bandHeight - pillHeight) / 2;
    const subpaths: string[] = [];
    let x = padX;
    for (let col = 0; col < COLUMNS.length; col++) {
      const columnWidth = columnWidths[col];
      const vary = varyWidths && COLUMNS[col].vary;
      const pillWidth = vary ? columnWidth * (1 - Math.random() * WIDTH_VARIANCE) : columnWidth;
      const pillX = COLUMNS[col].align === "right" ? x + columnWidth - pillWidth : x;
      subpaths.push(pill(pillX, y, pillWidth, pillHeight));
      x += columnWidth + COLUMN_GAP;
    }
    return subpaths.join(" ");
  };

  container.style.backgroundColor = "var(--value-background-color)";

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("preserveAspectRatio", "none");

  const defs = document.createElementNS(SVG_NS, "defs");
  defs.appendChild(makeSweepGradient(HEADER_GRADIENT_ID, "var(--column-facet-text-color)", width));
  defs.appendChild(makeSweepGradient(BODY_GRADIENT_ID, "var(--value-text-color)", width));
  svg.appendChild(defs);

  svg.appendChild(makeRect(0, 0, width, headerHeight, "var(--column-facet-background-color)"));
  svg.appendChild(makeRect(0, headerHeight - token("--horizontal-border-width"), width,
    token("--horizontal-border-width"), "var(--horizontal-border-color)"));
  svg.appendChild(makePath(rowPills(0, headerHeight, false), HEADER_GRADIENT_ID));

  // Deliberately runs past `height` - the last row is clipped by the viewBox, which reads as content
  // continuing rather than as the skeleton stopping short of the bottom.
  const bodyRows: string[] = [];
  for (let top = headerHeight; top < height; top += rowHeight) {
    bodyRows.push(rowPills(top, rowHeight, true));
  }
  svg.appendChild(makePath(bodyRows.join(" "), BODY_GRADIENT_ID));

  container.appendChild(svg);
};
