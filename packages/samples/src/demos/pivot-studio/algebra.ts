import type { AxisExpr } from "@superplot/grid";
import { FIELDS } from "./data";

// The table-algebra editors let the user type expressions like
//   cross(hierarchy(region, country), concat(mrr, seats))
// which the grid consumes only as the object form { type, children | fields }.
// The grid ships no string parser or validator, so this module is that layer:
// tokenize -> recursive-descent parse -> AxisExpr, plus a serializer, a semantic
// validator, and a token-aware completion source for the autocomplete popup.

export const OPERATORS = ["cross", "concat", "hierarchy"] as const;
export type Operator = (typeof OPERATORS)[number];

const OPERATOR_HELP: Record<Operator, string> = {
  cross: "Cartesian product (×) — every combination becomes a facet level",
  concat: "Union (+) — values placed side by side on the same level",
  hierarchy: "Grouped drill-down (/) — nested dimension levels",
};

const FIELD_KIND = new Map(FIELDS.map(f => [f.name, f.kind]));

function isOperator(name: string): name is Operator {
  return (OPERATORS as readonly string[]).includes(name);
}

/* ===== tokenizer ===== */

interface Token {
  kind: "ident" | "lparen" | "rparen" | "comma";
  value: string;
  start: number;
}

class ParseError extends Error {}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === "(") {
      tokens.push({ kind: "lparen", value: ch, start: i });
      i++;
    } else if (ch === ")") {
      tokens.push({ kind: "rparen", value: ch, start: i });
      i++;
    } else if (ch === ",") {
      tokens.push({ kind: "comma", value: ch, start: i });
      i++;
    } else if (/[A-Za-z0-9_]/.test(ch)) {
      const start = i;
      while (i < input.length && /[A-Za-z0-9_]/.test(input[i])) i++;
      tokens.push({ kind: "ident", value: input.slice(start, i), start });
    } else {
      throw new ParseError(`Unexpected character "${ch}"`);
    }
  }
  return tokens;
}

/* ===== parser ===== */

export interface ParseOk {
  ok: true;
  expr: AxisExpr;
}
export interface ParseErr {
  ok: false;
  error: string;
}
export type ParseResult = ParseOk | ParseErr;

export function parseExpression(input: string): ParseResult {
  const trimmed = input.trim();
  if (trimmed === "") return { ok: false, error: "Expression is empty" };

  let tokens: Token[];
  try {
    tokens = tokenize(trimmed);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  let pos = 0;
  const peek = (): Token | undefined => tokens[pos];
  const next = (): Token => tokens[pos++];

  const parseExpr = (): AxisExpr => {
    const tok = peek();
    if (!tok) throw new ParseError("Unexpected end of expression");
    if (tok.kind !== "ident") throw new ParseError(`Expected a field or operator, found "${tok.value}"`);

    if (isOperator(tok.value)) {
      const following = tokens[pos + 1];
      if (!following || following.kind !== "lparen") {
        throw new ParseError(`"${tok.value}" is an operator — write ${tok.value}(...)`);
      }
      return parseCall(tok.value);
    }
    next();
    return tok.value;
  };

  const parseCall = (op: Operator): AxisExpr => {
    next(); // operator ident
    next(); // "("
    const args: AxisExpr[] = [];
    if (peek()?.kind === "rparen") {
      throw new ParseError(`${op}() needs at least one argument`);
    }
    for (;;) {
      args.push(parseExpr());
      const sep = peek();
      if (sep?.kind === "comma") {
        next();
        continue;
      }
      break;
    }
    const close = peek();
    if (!close || close.kind !== "rparen") {
      throw new ParseError(`Missing ")" to close ${op}(`);
    }
    next(); // ")"

    if (op === "hierarchy") {
      const fields: string[] = [];
      for (const arg of args) {
        if (typeof arg !== "string") {
          throw new ParseError("hierarchy() accepts only field names, not nested operators");
        }
        fields.push(arg);
      }
      return { type: "hierarchy", fields };
    }
    return { type: op, children: args };
  };

  try {
    const expr = parseExpr();
    if (pos < tokens.length) {
      throw new ParseError(`Unexpected "${tokens[pos].value}" after a complete expression`);
    }
    return { ok: true, expr };
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, error: e.message };
    throw e;
  }
}

/* ===== serializer ===== */

export function serializeExpression(expr: AxisExpr): string {
  if (typeof expr === "string") return expr;
  if (expr.type === "hierarchy") return `hierarchy(${expr.fields.join(", ")})`;
  return `${expr.type}(${expr.children.map(serializeExpression).join(", ")})`;
}

/* ===== semantic validation ===== */

interface Presence {
  dimension: boolean;
  measure: boolean;
}

function presenceOf(expr: AxisExpr): Presence {
  if (typeof expr === "string") {
    const kind = FIELD_KIND.get(expr);
    return { dimension: kind === "dimension", measure: kind === "measure" };
  }
  if (expr.type === "hierarchy") {
    return { dimension: expr.fields.length > 0, measure: false };
  }
  const acc: Presence = { dimension: false, measure: false };
  for (const child of expr.children) {
    const p = presenceOf(child);
    acc.dimension = acc.dimension || p.dimension;
    acc.measure = acc.measure || p.measure;
  }
  return acc;
}

export function countMeasures(expr: AxisExpr): number {
  if (typeof expr === "string") return FIELD_KIND.get(expr) === "measure" ? 1 : 0;
  if (expr.type === "hierarchy") return 0;
  return expr.children.reduce((sum, c) => sum + countMeasures(c), 0);
}

// Returns a human-readable error string, or null when the axis expression is
// semantically valid on its own (cross-axis rules are checked by the caller).
export function validateAxis(expr: AxisExpr): string | null {
  if (typeof expr === "string") {
    if (!FIELD_KIND.has(expr)) return `Unknown field "${expr}"`;
    return null;
  }

  if (expr.type === "hierarchy") {
    if (expr.fields.length === 0) return "hierarchy() needs at least one field";
    for (const field of expr.fields) {
      const kind = FIELD_KIND.get(field);
      if (kind === undefined) return `Unknown field "${field}"`;
      if (kind === "measure") return `hierarchy() cannot contain the measure "${field}"`;
    }
    return null;
  }

  // cross / concat: validate children, then enforce measures-after-dimensions.
  let seenMeasure = false;
  for (const child of expr.children) {
    const childError = validateAxis(child);
    if (childError) return childError;
    const p = presenceOf(child);
    if (p.dimension && seenMeasure) {
      return "A dimension cannot follow a measure — put measures last";
    }
    if (p.measure) seenMeasure = true;
  }
  return null;
}

/* ===== autocomplete completions ===== */

export interface Completion {
  label: string;
  insert: string;
  kind: "operator" | "dimension" | "measure";
  detail: string;
  caretOffset: number; // where to drop the caret relative to the inserted text
}

export interface CompletionQuery {
  items: Completion[];
  from: number;
  to: number;
}

const WORD = /[A-Za-z0-9_]/;

// Walk backwards to find the operator that directly encloses the caret, so we can
// restrict suggestions to dimensions inside hierarchy(...).
function enclosingOperator(text: string, from: number): Operator | null {
  let depth = 0;
  let i = from - 1;
  while (i >= 0) {
    const ch = text[i];
    if (ch === ")") depth++;
    else if (ch === "(") {
      if (depth === 0) {
        let j = i - 1;
        while (j >= 0 && /\s/.test(text[j])) j--;
        let end = j + 1;
        while (j >= 0 && WORD.test(text[j])) j--;
        const name = text.slice(j + 1, end);
        return isOperator(name) ? name : null;
      }
      depth--;
    }
    i--;
  }
  return null;
}

export function getCompletions(text: string, caret: number): CompletionQuery {
  let from = caret;
  while (from > 0 && WORD.test(text[from - 1])) from--;
  const prefix = text.slice(from, caret).toLowerCase();

  const insideHierarchy = enclosingOperator(text, from) === "hierarchy";

  const candidates: Completion[] = [];
  if (!insideHierarchy) {
    for (const op of OPERATORS) {
      candidates.push({
        label: `${op}(…)`,
        insert: `${op}()`,
        kind: "operator",
        detail: OPERATOR_HELP[op],
        caretOffset: op.length + 1,
      });
    }
  }
  for (const field of FIELDS) {
    if (insideHierarchy && field.kind !== "dimension") continue;
    candidates.push({
      label: field.name,
      insert: field.name,
      kind: field.kind,
      detail: field.kind === "measure" ? `${field.label} · measure` : `${field.label} · dimension`,
      caretOffset: field.name.length,
    });
  }

  const items = candidates
    .filter(c => prefix === "" || c.label.toLowerCase().startsWith(prefix) || c.insert.toLowerCase().startsWith(prefix))
    .sort((a, b) => {
      const rank = (c: Completion) => (c.kind === "operator" ? 0 : c.kind === "dimension" ? 1 : 2);
      return rank(a) - rank(b) || a.label.localeCompare(b.label);
    });

  return { items, from, to: caret };
}
