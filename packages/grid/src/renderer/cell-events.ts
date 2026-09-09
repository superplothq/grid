import { BaseViewModel } from "./layout-proto";
import { FacetData } from "./types";
import { resolveFacetSpan } from "./utils";

export type FixtureSide = "top" | "left" | "bottom" | "right";

/**
 * Identity of the cell a pointer event landed on. `cellType` mirrors the `data-cell-type` attribute the
 * layout stamps on every cell. Facet targets carry the full span of the facet value (`row..toRow`,
 * `col..toCol`) resolved against the viewmodel, not just the part visible in the viewport.
 */
export type CellTarget =
  | { cellType: "value"; row: number; col: number }
  | { cellType: "row-facet"; level: number; row: number; toRow: number }
  | { cellType: "column-facet"; level: number; col: number; toCol: number }
  | { cellType: "header"; level: number; trackIndex: number }
  | { cellType: "fixture"; side: FixtureSide; index: number; row?: number; col?: number };

export type CellEventPayload = CellTarget & { cell: HTMLElement; originalEvent: MouseEvent };

/** Stable, readable identity of a target: `value:3:1`, `row-facet:0:5`, `column-facet:1:7`, `header:0:2`, `fixture:left:0:12`. */
export function cellTargetKey(target: CellTarget): string {
  switch (target.cellType) {
  case "value": return `value:${target.row}:${target.col}`;
  case "row-facet": return `row-facet:${target.level}:${target.row}`;
  case "column-facet": return `column-facet:${target.level}:${target.col}`;
  case "header": return `header:${target.level}:${target.trackIndex}`;
  case "fixture": return `fixture:${target.side}:${target.index}:${target.row ?? target.col}`;
  }
}

/**
 * A rectangle of cells the transient hover style applies to: the intersection of its row span and column
 * span, both inclusive. An omitted axis means the whole axis, so `{ rows: [i, i] }` is a row, `{ cols: [j, j] }`
 * a column, and both together a single cell. A cross is two rectangles. `source` is the cell the hover
 * originated from when it came from a pointer event.
 */
export interface HoverRect {
  rows?: [from: number, to: number];
  cols?: [from: number, to: number];
  source?: CellTarget;
}

export interface HoverStyleContext {
  viewport: BaseViewModel;
  gridId: string;
  numRowFacetLevels: number;
  numColFacetLevels: number;
}

/** Produces the CSS text applied while `rects` are hovered. Selectors should be scoped by `[data-grid-id]`. */
export type HoverStyleRenderer = (rects: HoverRect[], ctx: HoverStyleContext) => string;

export type HoverEffect = "none" | "cell" | "row" | "column" | "cross";

interface FacetSource {
  rowFacets: FacetData;
  columnFacets: FacetData;
}

type CellLike = { dataset: Record<string, string | undefined> };

/** Reads a cell's identity from its data attributes, resolving facet spans against the viewmodel. */
export function resolveCellTarget(cell: CellLike, data: FacetSource): CellTarget {
  const d = cell.dataset;
  switch (d.cellType) {
  case "value":
    return { cellType: "value", row: Number(d.row), col: Number(d.col) };
  case "row-facet": {
    const level = Number(d.level);
    const [row, toRow] = resolveFacetSpan(data.rowFacets, level, Number(d.row));
    return { cellType: "row-facet", level, row, toRow };
  }
  case "column-facet": {
    const level = Number(d.level);
    const [col, toCol] = resolveFacetSpan(data.columnFacets, level, Number(d.col));
    return { cellType: "column-facet", level, col, toCol };
  }
  case "header":
    return { cellType: "header", level: Number(d.level), trackIndex: Number(d.trackIndex) };
  case "fixture":
    return {
      cellType: "fixture",
      side: d.fixtureSide as FixtureSide,
      index: Number(d.fixtureIndex),
      ...(d.row !== undefined && { row: Number(d.row) }),
      ...(d.col !== undefined && { col: Number(d.col) }),
    };
  default:
    throw new Error(`Unknown cell type ${d.cellType}`);
  }
}

/** Maps a hovered cell to the rectangles the built-in hover effect should cover. */
export function hoverRectsFor(target: CellTarget, effect: HoverEffect): HoverRect[] | null {
  switch (target.cellType) {
  case "value": {
    const rows: [number, number] = [target.row, target.row];
    const cols: [number, number] = [target.col, target.col];
    switch (effect) {
    case "cell": return [{ rows, cols, source: target }];
    case "row": return [{ rows, source: target }];
    case "column": return [{ cols, source: target }];
    case "cross": return [{ rows, source: target }, { cols, source: target }];
    case "none": return null;
    }
  }
  // eslint-disable-next-line no-fallthrough
  case "row-facet":
    return [{ rows: [target.row, target.toRow], source: target }];
  case "column-facet":
    return [{ cols: [target.col, target.toCol], source: target }];
  default:
    return null;
  }
}

const mix = (backgroundVar: string) =>
  `color-mix(in srgb, var(${backgroundVar}), var(--highlight-base-color) calc(var(--hover-color-mix-percentage) * 1%))`;

/**
 * Default hover rule generator. Attribute selectors cannot express numeric ranges, so one selector is
 * emitted per index, clipped to the viewport to keep the rule small for wide facet spans.
 *
 * A merged facet cell stores one index of its span (`data-row` its first visible row, `data-col` its last
 * visible column), so matching facets by index alone would tint an ancestor whenever an edge index is
 * hovered. Hence facets are matched per level: a hover that comes from a facet covers that facet's level
 * down to the leaf (its whole subtree lies inside the span, ancestors are excluded by level); a hover that
 * comes from a value cell covers only the leaf facets of the row / column.
 */
export const defaultHoverStyleRenderer: HoverStyleRenderer = (rects, ctx) => {
  const scope = `[data-grid-id="${ctx.gridId}"] .cell`;
  const value: string[] = [];
  const rowFacet: string[] = [];
  const colFacet: string[] = [];
  const { viewport } = ctx;

  for (const rect of rects) {
    const source = rect.source;
    const rowFrom = Math.max(rect.rows?.[0] ?? viewport.y0, viewport.y0);
    const rowTo = Math.min(rect.rows?.[1] ?? viewport.y1 - 1, viewport.y1 - 1);
    const colFrom = Math.max(rect.cols?.[0] ?? viewport.x0, viewport.x0);
    const colTo = Math.min(rect.cols?.[1] ?? viewport.x1 - 1, viewport.x1 - 1);
    if (rowFrom > rowTo || colFrom > colTo) continue;

    if (rect.rows && rect.cols) {
      for (let r = rowFrom; r <= rowTo; r++) {
        for (let c = colFrom; c <= colTo; c++) {
          value.push(`${scope}[data-cell-type="value"][data-row="${r}"][data-col="${c}"]`);
        }
      }
    } else if (rect.rows) {
      const fromLevel = source?.cellType === "row-facet" ? source.level : null;
      for (let r = rowFrom; r <= rowTo; r++) {
        value.push(`${scope}[data-cell-type="value"][data-row="${r}"]`, `${scope}[data-cell-type="fixture"][data-row="${r}"]`);
        if (fromLevel === null) {
          rowFacet.push(`${scope}.row-facet.facet-r-edge[data-row="${r}"]`);
        } else {
          for (let l = fromLevel; l < ctx.numRowFacetLevels; l++) {
            rowFacet.push(`${scope}[data-cell-type="row-facet"][data-level="${l}"][data-row="${r}"]`);
          }
        }
      }
    } else if (rect.cols) {
      const fromLevel = source?.cellType === "column-facet" ? source.level : null;
      for (let c = colFrom; c <= colTo; c++) {
        value.push(`${scope}[data-cell-type="value"][data-col="${c}"]`, `${scope}[data-cell-type="fixture"][data-col="${c}"]`);
        if (fromLevel === null) {
          colFacet.push(`${scope}.col-facet.facet-b-edge[data-col="${c}"]`);
        } else {
          for (let l = fromLevel; l < ctx.numColFacetLevels; l++) {
            colFacet.push(`${scope}[data-cell-type="column-facet"][data-level="${l}"][data-col="${c}"]`);
          }
        }
      }
    }
  }

  const rules: string[] = [];
  if (value.length) rules.push(`${value.join(",")}{background:${mix("--value-background-color")}}`);
  if (rowFacet.length) rules.push(`${rowFacet.join(",")}{background:${mix("--row-facet-background-color")}}`);
  if (colFacet.length) rules.push(`${colFacet.join(",")}{background:${mix("--column-facet-background-color")}}`);
  return rules.join("\n");
};

export interface CellPointerTrackerOpts {
  resolve: (cell: HTMLElement) => CellTarget;
  cellFromTarget: (target: EventTarget | null) => HTMLElement | null;
  elementAt: (x: number, y: number) => Element | null;
  // Whether hover / click should be resolved right now. The owner decides from listener presence and
  // from grid activity (scrolling, rendering). While hover is inactive, moves only record the pointer
  // position; `refresh()` once it is active again re-resolves under that position, which also covers
  // cells that moved under a stationary cursor or were recycled by the cell pool.
  hoverActive: () => boolean;
  clickActive: () => boolean;
  onOver: (payload: CellEventPayload) => void;
  onOut: (payload: CellEventPayload) => void;
  onClick: (payload: CellEventPayload) => void;
}

/** Turns raw pointer events on the grid container into per-cell enter / leave / click. */
export class CellPointerTracker {
  #opts: CellPointerTrackerOpts;
  #current: { cell: HTMLElement; target: CellTarget; key: string } | null = null;
  #lastPointer: { x: number; y: number } | null = null;
  #lastEvent: MouseEvent | null = null;
  #suppressClick = false;

  constructor(opts: CellPointerTrackerOpts) {
    this.#opts = opts;
  }

  attach(container: HTMLElement): void {
    container.addEventListener("mousemove", (e) => this.handleMove(e));
    container.addEventListener("mouseleave", (e) => this.handleLeave(e));
    container.addEventListener("click", (e) => this.handleClick(e));
  }

  handleMove(e: MouseEvent): void {
    this.#lastPointer = { x: e.clientX, y: e.clientY };
    this.#lastEvent = e;
    this.#suppressClick = false;
    if (!this.#opts.hoverActive()) return;
    const cell = this.#opts.cellFromTarget(e.target);
    // Between renders a node keeps its key, so the same element is the same cell. Only refresh() after a
    // render has to resolve again, since that is when the pool may have reused the node for another key.
    if (cell !== null && cell === this.#current?.cell) return;
    this.#transitionTo(cell, e);
  }

  handleLeave(e: MouseEvent): void {
    this.#lastPointer = null;
    this.#transitionTo(null, e);
  }

  handleClick(e: MouseEvent): void {
    if (this.#suppressClick) {
      this.#suppressClick = false;
      return;
    }
    if (!this.#opts.clickActive()) return;
    const cell = this.#opts.cellFromTarget(e.target);
    if (!cell) return;
    this.#opts.onClick({ ...this.#opts.resolve(cell), cell, originalEvent: e });
  }

  // The drag's mouseup fires a click on whatever the pointer is over. Swallow it so a resize never reads
  // as a cell click; a mousemove after the click clears the flag in case no click follows.
  suppressNextClick(): void {
    this.#suppressClick = true;
  }

  /** Re-resolves the cell under the last known pointer position and emits leave / enter if it changed. */
  refresh(): void {
    if (!this.#opts.hoverActive() || !this.#lastPointer || !this.#lastEvent) return;
    const el = this.#opts.elementAt(this.#lastPointer.x, this.#lastPointer.y);
    this.#transitionTo(this.#opts.cellFromTarget(el), this.#lastEvent);
  }

  #transitionTo(cell: HTMLElement | null, e: MouseEvent): void {
    let next: { cell: HTMLElement; target: CellTarget; key: string } | null = null;
    if (cell) {
      const target = this.#opts.resolve(cell);
      next = { cell, target, key: cellTargetKey(target) };
    }
    if (next?.key === this.#current?.key && next?.cell === this.#current?.cell) return;

    const prev = this.#current;
    this.#current = next;
    if (prev) this.#opts.onOut({ ...prev.target, cell: prev.cell, originalEvent: e });
    if (next) this.#opts.onOver({ ...next.target, cell: next.cell, originalEvent: e });
  }
}
