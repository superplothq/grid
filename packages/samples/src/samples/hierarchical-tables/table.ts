import Grid, { FlattenedDataViewModel, createRowMeta } from "@superplot/grid/renderer";
import type { FacetCellRenderer, FacetDataContext, FacetRendererContext, FacetCellContent, CellRenderer, RendererContext } from "@superplot/grid/renderer";
import { createGridMount } from "../../runtime/mount";
import { syncGridTheme } from "../../runtime/theme";

// A node in the source hierarchy. Leaves carry their own `values` (one per data
// column); group nodes leave `values` undefined and have their columns rolled up
// from descendants. `expanded` seeds the initial open/closed state.
export interface TreeNode {
  name: string;
  values?: number[];
  children?: TreeNode[];
  expanded?: boolean;
}

export interface ColumnDef {
  label: string;
  format: (value: number) => string;
  width?: number;
}

export interface TableConfig {
  facetLabel: string;
  columns: ColumnDef[];
  tree: TreeNode[];
  marker: "chevron" | "plusminus";
  facetWidth?: number;
  height?: number;
}

// Builds an interactive grouped/tree table from an in-memory hierarchy. The whole
// widget lives on the DataViewModel -> Renderer bridge: no DataSource, no
// DataModel. Expand and collapse are pure viewmodel refreshes - flatten the tree
// into new params, then `updateData` + `draw`.
export function buildHierarchicalTable(el: HTMLElement, config: TableConfig): () => void {
  const gridMount = createGridMount(el, config.height ?? 440);
  const grid = new Grid({}, gridMount, "flat");
  const disposeTheme = syncGridTheme(grid);
  el.append(gridMount);

  // Rebuilt on every expand/collapse so a facet click can map its row index back
  // to the node it should toggle.
  let visibleNodes: TreeNode[] = [];

  const options = {
    vTrackDefs: config.columns.map((column) => ({
      colSize: { strategy: "static" as const, width: column.width ?? 1, unit: "fr" as const },
      valueFormatter: (value: unknown) => (typeof value === "number" ? column.format(value) : ""),
      renderer: rightAlignValue,
    })),
    facetDefs: {
      row: [{ text: config.facetLabel, facetField: null, colSize: { strategy: "static" as const, width: config.facetWidth ?? 260, unit: "px" as const }, trackRenderer }],
      col: [{ text: "" }],
      axis: "col" as const,
    },
  };

  const first = flatten(config.tree, config.columns);
  visibleNodes = first.nodes;
  const viewModel = new FlattenedDataViewModel({ ...first.params, options });
  grid.data = viewModel;
  grid.draw();

  return () => {
    disposeTheme();
    el.removeChild(gridMount);
  };

  // A group node renders its marker (which toggles the branch); a leaf renders a
  // matching spacer so every label lines up under its parent.
  function trackRenderer(data: string, dataCtx: FacetDataContext, _ctx: FacetRendererContext): FacetCellContent {
    const meta = dataCtx.flatMeta!;
    const label = String(data ?? "");
    if (meta.isLeaf) return { left: spacer(), content: label };

    const marker = makeMarker(config.marker, meta.isExpanded);
    marker.addEventListener("click", (event) => {
      event.stopPropagation();
      const node = visibleNodes[dataCtx.index];
      node.expanded = !node.expanded;
      rebuild();
    });
    return { left: marker, content: label };
  }

  function rebuild(): void {
    const next = flatten(config.tree, config.columns);
    visibleNodes = next.nodes;
    viewModel.updateData(next.params);
    grid.draw();
  }
}

/* ===================================== utils ===================================== */

interface FlatResult {
  params: {
    data: (number | null)[][];
    columnFacets: string[][];
    rowFacet: (string | null)[];
    rowMeta: Uint8Array;
    totalRows: number;
  };
  nodes: TreeNode[];
}

// Depth-first walk that emits one row per node, descending into a group only when
// it is expanded. Each row gets a packed metadata byte (depth, isLeaf, isExpanded)
// and its data columns - a leaf's own values, or the column-wise sum for a group.
function flatten(tree: TreeNode[], columns: ColumnDef[]): FlatResult {
  const numCols = columns.length;
  const rowFacet: (string | null)[] = [];
  const meta: number[] = [];
  const data: (number | null)[][] = Array.from({ length: numCols }, () => []);
  const nodes: TreeNode[] = [];

  const walk = (node: TreeNode, depth: number): void => {
    const isLeaf = !node.children || node.children.length === 0;
    rowFacet.push(node.name);
    meta.push(createRowMeta(depth, isLeaf, Boolean(node.expanded)));
    const values = rollup(node, numCols);
    for (let i = 0; i < numCols; i++) data[i].push(values[i]);
    nodes.push(node);
    if (!isLeaf && node.expanded) {
      for (const child of node.children!) walk(child, depth + 1);
    }
  };
  for (const root of tree) walk(root, 0);

  return {
    params: {
      data,
      columnFacets: [columns.map((column) => column.label)],
      rowFacet,
      rowMeta: new Uint8Array(meta),
      totalRows: rowFacet.length,
    },
    nodes,
  };
}

function rollup(node: TreeNode, numCols: number): number[] {
  if (!node.children || node.children.length === 0) return node.values ?? new Array(numCols).fill(0);
  const sums = new Array(numCols).fill(0);
  for (const child of node.children) {
    const childValues = rollup(child, numCols);
    for (let i = 0; i < numCols; i++) sums[i] += childValues[i];
  }
  return sums;
}

// Pins alignment and the theme padding explicitly so the already-formatted value
// sits flush right with tabular figures, independent of the cell's stylesheet defaults.
const rightAlignValue: CellRenderer<string> = (data, _dataCtx, ctx: RendererContext) => {
  const cell = ctx.container;
  cell.style.justifyContent = "flex-end";
  cell.style.paddingLeft = "calc(var(--cell-padding-x) * 1px)";
  cell.style.paddingRight = "calc(var(--cell-padding-x) * 1px)";
  cell.style.paddingTop = "calc(var(--cell-padding-y) * 1px)";
  cell.style.paddingBottom = "calc(var(--cell-padding-y) * 1px)";
  cell.style.fontVariantNumeric = "tabular-nums";
  return data == null ? "" : String(data);
};

function spacer(): HTMLElement {
  const el = document.createElement("span");
  el.style.cssText = "display:inline-block;width:14px;flex-shrink:0;";
  return el;
}

function makeMarker(kind: "chevron" | "plusminus", expanded: boolean): HTMLElement {
  const el = document.createElement("span");
  el.style.cssText = "display:inline-flex;align-items:center;justify-content:center;width:14px;flex-shrink:0;cursor:pointer;opacity:0.7;";
  el.innerHTML = kind === "chevron" ? chevronSvg(expanded) : plusMinusSvg(expanded);
  return el;
}

function chevronSvg(expanded: boolean): string {
  const path = expanded ? "M1 3 L5 7 L9 3" : "M3 1 L7 5 L3 9";
  return `<svg width="10" height="10" viewBox="0 0 10 10" style="display:block"><path d="${path}" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function plusMinusSvg(expanded: boolean): string {
  const vertical = expanded ? "" : `<line x1="6" y1="3" x2="6" y2="9" stroke="currentColor" stroke-width="1.4"/>`;
  return `<svg width="12" height="12" viewBox="0 0 12 12" style="display:block"><rect x="0.6" y="0.6" width="10.8" height="10.8" rx="2" fill="none" stroke="currentColor" stroke-width="1" opacity="0.6"/><line x1="3" y1="6" x2="9" y2="6" stroke="currentColor" stroke-width="1.4"/>${vertical}</svg>`;
}
