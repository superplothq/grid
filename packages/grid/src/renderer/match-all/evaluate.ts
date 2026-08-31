import { CellRenderer } from "../cell-renderers";
import {
  FacetPredicate,
  FacetPredicateNode,
  FacetDef,
  MatchingRule,
  FacetCellRenderer,
  ValueFormatter,
} from "../types";

export function matchesFacetPredicate(
  predicate: FacetPredicate,
  facetPath: (string | null)[],
  facetDefs: FacetDef[]
): boolean {
  for (let level = 0; level < facetDefs.length; level++) {
    const def = facetDefs[level];
    const dimName = def.facetField ?? def.text;
    const dimVal = facetPath[level];

    const ancestorPath: [string, string | null][] = [];
    for (let l = 0; l < level; l++) {
      const ancestorDef = facetDefs[l];
      ancestorPath.push([ancestorDef.facetField ?? ancestorDef.text, facetPath[l]]);
    }

    if (predicate(dimName, dimVal, ancestorPath)) return true;
  }
  return false;
}

export function matchesAllFacetPredicates(
  predicates: FacetPredicateNode[],
  rowPath: (string | null)[] | undefined,
  colPath: (string | null)[] | undefined,
  rowFacetDefs: FacetDef[],
  colFacetDefs: FacetDef[]
): boolean {
  for (const node of predicates) {
    let matched = false;
    if (colPath && matchesFacetPredicate(node.predicate, colPath, colFacetDefs)) matched = true;
    if (!matched && rowPath && matchesFacetPredicate(node.predicate, rowPath, rowFacetDefs)) matched = true;
    if (!matched) return false;
  }
  return true;
}

export function evaluateRulesForDataCell(
  rules: readonly MatchingRule[],
  rowPath: (string | null)[],
  colPath: (string | null)[],
  rowFacetDefs: FacetDef[],
  colFacetDefs: FacetDef[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cellValue: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): { effectiveRenderer?: CellRenderer<any>; effectiveValueFormatter?: ValueFormatter; styleFns: ((el: HTMLElement) => void)[] } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let effectiveRenderer: CellRenderer<any> | undefined;
  let effectiveValueFormatter: ValueFormatter | undefined;
  const styleFns: ((el: HTMLElement) => void)[] = [];

  for (const rule of rules) {
    const facetPreds = rule.predicates.filter((p): p is FacetPredicateNode => p.type === "facet");
    const cellPreds = rule.predicates.filter(p => p.type === "cell");

    if (cellPreds.length === 0) continue;
    if (!matchesAllFacetPredicates(facetPreds, rowPath, colPath, rowFacetDefs, colFacetDefs)) continue;

    let cellMatch = true;
    for (const cp of cellPreds) {
      if (cp.type === "cell" && !cp.predicate(cellValue)) { cellMatch = false; break; }
    }
    if (!cellMatch) continue;

    if (rule.terminal.type === "prop") {
      if (rule.terminal.props.cellRenderer) effectiveRenderer = rule.terminal.props.cellRenderer;
      if (rule.terminal.props.valueFormatter) effectiveValueFormatter = rule.terminal.props.valueFormatter;
    } else if (rule.terminal.type === "style") {
      styleFns.push(rule.terminal.fn);
    }
  }
  return { effectiveRenderer, effectiveValueFormatter, styleFns };
}

export function evaluateRulesForFacetCell(
  rules: readonly MatchingRule[],
  facetPath: (string | null)[],
  facetDefs: FacetDef[]
): { effectiveTrackRenderer?: FacetCellRenderer; styleFns: ((el: HTMLElement) => void)[] } {
  let effectiveTrackRenderer: FacetCellRenderer | undefined;
  const styleFns: ((el: HTMLElement) => void)[] = [];

  for (const rule of rules) {
    if (rule.predicates.some(p => p.type === "cell")) continue;
    const facetPreds = rule.predicates as FacetPredicateNode[];

    let allMatch = true;
    for (const node of facetPreds) {
      if (!matchesFacetPredicate(node.predicate, facetPath, facetDefs)) { allMatch = false; break; }
    }
    if (!allMatch) continue;

    if (rule.terminal.type === "prop" && rule.terminal.props.trackRenderer)
      effectiveTrackRenderer = rule.terminal.props.trackRenderer;
    else if (rule.terminal.type === "style")
      styleFns.push(rule.terminal.fn);
  }
  return { effectiveTrackRenderer, styleFns };
}
