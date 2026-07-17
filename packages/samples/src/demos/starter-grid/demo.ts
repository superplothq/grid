import Grid, { FlattenedDataViewModel } from "grid/dist/renderer";
import type { ValueFormatter } from "grid/dist/renderer";
import { createGridMount } from "../../runtime/mount";
import { syncGridTheme } from "../../runtime/theme";
import type { SampleValue } from "../../types";

// Demos are self-contained: no dataset context, the data is generated below.
const GRID_HEIGHT = 460;

const COLUMNS: { label: string; get: (row: Row) => SampleValue; fr: number; numeric?: boolean }[] = [
  { label: "Name", get: (row) => row.name, fr: 1.6 },
  { label: "Department", get: (row) => row.department, fr: 1.3 },
  { label: "Level", get: (row) => row.level, fr: 0.7 },
  { label: "Base Salary", get: (row) => row.base, fr: 1, numeric: true },
  { label: "Bonus", get: (row) => row.bonus, fr: 1, numeric: true },
];

export function mount(el: HTMLElement): () => void {
  const gridMount = createGridMount(el, GRID_HEIGHT);
  const grid = new Grid({}, gridMount, "flat");
  const disposeTheme = syncGridTheme(grid);
  el.append(gridMount);

  const rows = generateRows(60);
  grid.data = new FlattenedDataViewModel({
    data: COLUMNS.map((column) => rows.map((row) => column.get(row))),
    columnFacets: [COLUMNS.map((column) => column.label)],
    totalRows: rows.length,
    options: {
      vTrackDefs: COLUMNS.map((column) => ({
        colSize: { strategy: "static", width: column.fr, unit: "fr" },
        ...(column.numeric ? { valueFormatter: money } : {}),
      })),
      facetDefs: { row: [], col: [{ text: "" }], axis: "col" },
    },
  });
  grid.draw();

  return () => {
    disposeTheme();
    el.removeChild(gridMount);
  };
}

/* ===================================== utils ===================================== */

interface Row {
  name: string;
  department: string;
  level: string;
  base: number;
  bonus: number;
}

const money: ValueFormatter<SampleValue> = (value) => (typeof value === "number" ? `$${value.toLocaleString("en-US")}` : "");

const FIRST = ["Amy", "Ravi", "Chen", "Maria", "Omar", "Sofia", "Liam", "Nina", "Diego", "Priya", "Noah", "Yuki"];
const LAST = ["Karp", "Okafor", "Nguyen", "Silva", "Haddad", "Rossi", "Walsh", "Petrov", "Mbeki", "Cohen", "Tanaka", "Reyes"];
const DEPARTMENTS = ["Engineering", "Design", "Sales", "Finance", "Operations", "Support"];
const LEVELS = ["L2", "L3", "L4", "L5", "L6"];

// Deterministic so the demo renders identically on every load: a seeded PRNG over
// realistic name pools, with pay correlated to level.
function generateRows(count: number): Row[] {
  const rand = mulberry32(0x51ed);
  const rows: Row[] = [];
  for (let i = 0; i < count; i++) {
    const level = pick(LEVELS, rand);
    const tier = LEVELS.indexOf(level);
    const base = 90000 + tier * 32000 + Math.floor(rand() * 18000);
    rows.push({
      name: `${pick(FIRST, rand)} ${pick(LAST, rand)}`,
      department: pick(DEPARTMENTS, rand),
      level,
      base,
      bonus: Math.round(base * (0.08 + rand() * 0.12)),
    });
  }
  return rows;
}

function pick<T>(values: T[], rand: () => number): T {
  return values[Math.floor(rand() * values.length)];
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
