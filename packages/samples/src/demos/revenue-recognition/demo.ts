import Grid, { FlattenedDataViewModel, createRowMeta } from "@superplot/grid/renderer";
import type { CellRenderer, ColAutoSizeConfig, FacetCellRenderer, FacetDataContext } from "@superplot/grid/renderer";
import type { FlattenedDataViewModelParams } from "@superplot/grid/renderer/flattened-data-viewmodel";
import { createGridMount } from "../../runtime/mount";
import { syncGridTheme } from "../../runtime/theme";

// A compact revenue-recognition schedule. A three-level tree - Company > Contract >
// line item - collapses under chevrons; group rows carry summed subtotals. The
// column band is two-level: four flat measure columns (Total Amount, Deferred /
// Recognized Revenue, Recognized %) followed by a month-by-month schedule (December
// 2024 back to January 2024), each month spanning a Balance and a Revenue column.
// Recognized % is drawn as an inline green bar. Columns sort (default Total Amount
// desc, matching the reference) and resize; the Name column stays pinned on
// horizontal scroll.
//
// Self-contained - no DataSource / DataModel. Data is generated deterministically,
// shaped into ONE long-lived FlattenedDataViewModel, and every change (expand /
// collapse, sort) is pushed back through updateData().

const GREEN = "#16a34a"; // recognition bar / accent
const SURFACE = "var(--value-background-color)";
const MUTED = "color-mix(in srgb, currentColor 55%, transparent)";
const LEAF_MUTED = "color-mix(in srgb, currentColor 62%, transparent)";
const HAIRLINE = "color-mix(in srgb, currentColor 12%, transparent)";
const GRID_HEIGHT = 460;
const ROW_HEIGHT = 36;
const PAD_X = 12;

// Column widths in this grid come only from the (leaf) column-header cell - data
// cells never widen a column. So every column needs a real leaf header, and to make
// the table wider than its container (and thus scroll horizontally) we floor each
// width. clamped-width with ONLY a min bound is the scroll-safe way to do that: it
// sizes to content but never below `px`. Setting BOTH min and max would suppress the
// horizontal scrollbar; `static` would fit-to-container - both kill scroll.
const minW = (px: number): ColAutoSizeConfig => ({ strategy: "clamped-width", minWidthInPx: px });

interface MonthCell {
  balance: number;
  revenue: number;
}

interface Measures {
  total: number;
  deferred: number;
  recognized: number;
  // One entry per month in MONTHS (December 2024 back to January 2024).
  months: MonthCell[];
}

// One tree node = one display row. Companies (depth 0) and contracts (depth 1) are
// groups with children; line items (depth 2) are leaves. Measures on a group are the
// sum of its descendants.
interface Node {
  id: string;
  name: string;
  depth: number;
  kind: "group" | "leaf";
  children?: Node[];
  measures: Measures;
}

type Sort = { key: string; dir: "asc" | "desc" };

interface ColDef {
  key: string;
  label: string;
  group?: string;
  size: ColAutoSizeConfig;
  sortValue: (n: Node) => number;
  renderer: CellRenderer<Node>;
}

export function mount(el: HTMLElement): () => void {
  const companies = generateCompanies();

  /* ---- view state (plain demo vars) ---- */
  const collapsed = new Set<string>();
  let sort: Sort = { key: "total", dir: "desc" };

  let vm: FlattenedDataViewModel | undefined;
  let displayRows: Node[] = [];

  const columns = buildColumns();
  const groupNames = new Set(columns.map((c) => c.group).filter((g): g is string => !!g));
  const colByKey = new Map(columns.map((c) => [c.key, c]));

  /* ---- chrome ---- */
  el.style.cssText = "display:flex;flex-direction:column;gap:12px;font:inherit;";
  const gridMount = createGridMount(el, GRID_HEIGHT);
  gridMount.style.borderRadius = "10px";
  el.append(gridMount);

  const grid = new Grid({ defaultCellHeight: ROW_HEIGHT, enableResizeUI: true }, gridMount, "flat");
  const disposeTheme = syncGridTheme(grid);

  /* ===== data shaping ===== */

  function sortSiblings(nodes: Node[]): Node[] {
    const col = colByKey.get(sort.key);
    const val = col ? col.sortValue : () => 0;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...nodes].sort((a, b) => (val(a) - val(b)) * dir);
  }

  // Flatten the tree to the currently visible rows, honouring the collapsed set and
  // the active sort at every level.
  function flatten(): Node[] {
    const out: Node[] = [];
    const walk = (nodes: Node[]): void => {
      for (const node of sortSiblings(nodes)) {
        out.push(node);
        if (node.children && !collapsed.has(node.id)) walk(node.children);
      }
    };
    walk(companies);
    return out;
  }

  function buildParams(): FlattenedDataViewModelParams {
    return {
      data: columns.map(() => displayRows),
      // Two header levels. The LEAF level (level 1) carries every column's unique key,
      // so each column has a real, non-merged leaf header cell (the only thing the grid
      // measures for width) and sorting can key off it. The top level (level 0) carries
      // the month group name for grouped columns and "" for the flat measures - adjacent
      // ""s merge into one empty band above them.
      columnFacets: [
        columns.map((c) => c.group ?? ""),
        columns.map((c) => c.key),
      ],
      rowFacet: displayRows.map((n) => n.name),
      rowMeta: new Uint8Array(
        displayRows.map((n) => createRowMeta(n.depth, n.kind === "leaf", !collapsed.has(n.id)))
      ),
      totalRows: displayRows.length,
      options: {
        vTrackDefs: columns.map((c) => ({ renderer: c.renderer, colSize: c.size, cellHeight: ROW_HEIGHT })),
        facetDefs: {
          row: [{ text: "Name", trackRenderer: nameFacet, colSize: minW(264) }],
          col: [{ text: "", trackRenderer: header }, { text: "", trackRenderer: header }],
          axis: "col",
        },
      },
    };
  }

  function render(): void {
    displayRows = flatten();
    const params = buildParams();
    if (!vm) vm = new FlattenedDataViewModel(params);
    else vm.updateData(params);
    grid.data = vm;
    grid.draw();
  }

  /* ===== header renderer (branches on facet level) ===== */
  const header: FacetCellRenderer = (val, dataCtx: FacetDataContext, ctx) => {
    delete ctx.cell.dataset.rrSort;
    if (dataCtx.level === 0) {
      // top band: month group over its two measures, empty over the flat measures
      if (val && groupNames.has(val)) return groupHeader(val);
      return "";
    }
    // leaf level: val is a column key -> sortable header showing the column's label
    const c = colByKey.get(val);
    if (c) return sortableHeader(c, ctx.cell);
    return "";
  };

  function groupHeader(text: string): HTMLElement {
    const node = document.createElement("div");
    node.style.cssText =
      `display:flex;align-items:center;justify-content:center;width:100%;height:100%;padding:0 ${PAD_X}px;` +
      `font-size:12px;font-weight:600;color:${MUTED};white-space:nowrap;`;
    node.textContent = text;
    return node;
  }

  function sortableHeader(c: ColDef, cell: HTMLElement): HTMLElement {
    const active = sort.key === c.key;
    const node = document.createElement("div");
    node.style.cssText =
      `display:flex;align-items:center;justify-content:flex-end;gap:5px;width:100%;height:100%;padding:0 ${PAD_X}px;` +
      "font-size:12px;font-weight:600;white-space:nowrap;cursor:pointer;" +
      `color:${active ? "currentColor" : MUTED};`;
    if (active) {
      const arrow = document.createElement("span");
      arrow.innerHTML = sort.dir === "desc" ? ARROW_DOWN : ARROW_UP;
      arrow.style.cssText = "display:inline-flex;color:inherit;";
      node.appendChild(arrow);
    }
    const label = document.createElement("span");
    label.textContent = c.label;
    node.appendChild(label);
    cell.dataset.rrSort = c.key; // toggled by the delegated pointerdown below
    return node;
  }

  /* ===== name facet renderer (tree: indent + chevron + label) ===== */
  const nameFacet: FacetCellRenderer = (_label, dataCtx: FacetDataContext, ctx) => {
    const node = displayRows[dataCtx.index];
    const cell = ctx.cell;
    if (!node) {
      delete cell.dataset.rrToggle;
      return "";
    }
    const isGroup = node.kind === "group";
    const expanded = !collapsed.has(node.id);
    cell.style.cursor = isGroup ? "pointer" : "default";
    if (isGroup) cell.dataset.rrToggle = node.id;
    else delete cell.dataset.rrToggle;

    const wrap = document.createElement("div");
    wrap.style.cssText =
      "display:flex;align-items:center;gap:6px;height:100%;white-space:nowrap;overflow:hidden;" +
      `padding-left:${PAD_X + node.depth * 20}px;padding-right:${PAD_X}px;`;

    const marker = document.createElement("span");
    marker.style.cssText = "display:inline-flex;flex:0 0 auto;width:14px;justify-content:center;";
    if (isGroup) {
      marker.innerHTML = CHEVRON;
      marker.style.color = MUTED;
      marker.style.transition = "transform 120ms ease";
      if (expanded) marker.style.transform = "rotate(90deg)";
    }

    const name = document.createElement("span");
    name.textContent = node.name;
    name.style.cssText =
      "overflow:hidden;text-overflow:ellipsis;font-size:12.5px;" +
      (isGroup ? "font-weight:600;color:currentColor;" : `color:${LEAF_MUTED};`);

    wrap.append(marker, name);
    return wrap;
  };

  /* ===== interaction (one delegated pointerdown for sort + toggle) ===== */
  function onPointerDown(e: PointerEvent): void {
    const t = e.target as HTMLElement | null;
    const sortCell = t?.closest?.<HTMLElement>("[data-rr-sort]");
    if (sortCell) {
      const key = sortCell.dataset.rrSort!;
      if (sort.key === key) sort = { key, dir: sort.dir === "desc" ? "asc" : "desc" };
      else sort = { key, dir: "desc" };
      render();
      return;
    }
    const toggleCell = t?.closest?.<HTMLElement>("[data-rr-toggle]");
    const id = toggleCell?.dataset.rrToggle;
    if (!id) return;
    if (collapsed.has(id)) collapsed.delete(id);
    else collapsed.add(id);
    render();
  }
  gridMount.addEventListener("pointerdown", onPointerDown);

  render();

  return () => {
    disposeTheme();
    gridMount.removeEventListener("pointerdown", onPointerDown);
    el.replaceChildren();
  };
}

/* ===================================== utils ===================================== */

function buildColumns(): ColDef[] {
  const cols: ColDef[] = [
    { key: "total", label: "Total Amount", size: minW(140), sortValue: (n) => n.measures.total, renderer: money((n) => n.measures.total) },
    { key: "deferred", label: "Deferred Revenue", size: minW(150), sortValue: (n) => n.measures.deferred, renderer: money((n) => n.measures.deferred, true) },
    { key: "recognized", label: "Recognized Revenue", size: minW(160), sortValue: (n) => n.measures.recognized, renderer: money((n) => n.measures.recognized) },
    { key: "recognizedPct", label: "Recognized %", size: minW(140), sortValue: recognizedFrac, renderer: pctBar },
  ];
  // One Balance + Revenue column per month, grouped under the month name.
  MONTHS.forEach((month, i) => {
    cols.push({ key: `m${i}-bal`, label: "Balance", group: month, size: minW(120), sortValue: (n) => n.measures.months[i].balance, renderer: money((n) => n.measures.months[i].balance) });
    cols.push({ key: `m${i}-rev`, label: "Revenue", group: month, size: minW(120), sortValue: (n) => n.measures.months[i].revenue, renderer: money((n) => n.measures.months[i].revenue) });
  });
  return cols;
}

function recognizedFrac(n: Node): number {
  return n.measures.total ? n.measures.recognized / n.measures.total : 0;
}

// Right-aligned currency cell. Group rows are bold; a zero value renders as an
// em-dash when `emDashZero` is set (matches the reference's empty Deferred column).
function money(get: (n: Node) => number, emDashZero = false): CellRenderer<Node> {
  return (node, _dataCtx, ctx) => {
    const s = ctx.container.style;
    s.display = "flex";
    s.alignItems = "center";
    s.justifyContent = "flex-end";
    s.height = "100%";
    s.boxSizing = "border-box";
    s.overflow = "hidden";
    s.padding = `0 ${PAD_X}px`;
    s.background = SURFACE;

    const v = get(node);
    const span = document.createElement("span");
    span.style.cssText =
      "font-variant-numeric:tabular-nums;white-space:nowrap;font-size:12.5px;" +
      (node.kind === "group" ? "font-weight:600;" : "");
    span.textContent = emDashZero && Math.abs(v) < 0.005 ? "—" : fmtMoney(v);
    if (emDashZero && Math.abs(v) < 0.005) span.style.color = MUTED;
    return span;
  };
}

// Recognized %: a muted percentage label over a green progress bar - the fraction is
// recognized / total, so group rows show their aggregate recognition.
const pctBar: CellRenderer<Node> = (node, _dataCtx, ctx) => {
  const s = ctx.container.style;
  s.display = "flex";
  s.flexDirection = "column";
  s.justifyContent = "center";
  s.gap = "3px";
  s.height = "100%";
  s.boxSizing = "border-box";
  s.overflow = "hidden";
  s.padding = `0 ${PAD_X}px`;
  s.background = SURFACE;

  const frac = recognizedFrac(node);
  const label = document.createElement("span");
  label.textContent = `${Math.round(frac * 100)}%`;
  label.style.cssText = `font-size:10.5px;line-height:1;color:${MUTED};font-variant-numeric:tabular-nums;`;

  const track = document.createElement("div");
  track.style.cssText = `width:100%;height:5px;border-radius:3px;overflow:hidden;background:${HAIRLINE};`;
  const fill = document.createElement("div");
  fill.style.cssText = `height:100%;width:${Math.round(frac * 100)}%;background:${GREEN};border-radius:3px;`;
  track.appendChild(fill);

  return [label, track];
};

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
function fmtMoney(n: number): string {
  return usd.format(n);
}

const CHEVRON =
  "<svg width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M9 6l6 6-6 6\"/></svg>";
const ARROW_DOWN =
  "<svg width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 5v14M6 13l6 6 6-6\"/></svg>";
const ARROW_UP =
  "<svg width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 19V5M6 11l6-6 6 6\"/></svg>";

/* ===================================== data ===================================== */

// Monthly schedule columns, most-recent first: December 2024 back to January 2024.
const MONTHS = [
  "December 2024", "November 2024", "October 2024", "September 2024",
  "August 2024", "July 2024", "June 2024", "May 2024",
  "April 2024", "March 2024", "February 2024", "January 2024",
];

const COMPANIES = [
  "Dharma Initiative",
  "Tyrell Corporation",
  "Weyland-Yutani",
  "Cyberdyne Systems",
  "Aperture Science",
  "Soylent Corp",
  "Umbrella Health",
  "Massive Dynamic",
];

const SIZES = ["Small", "Medium", "Large", "Enterprise", "Standard", "Premium"];
const CATEGORIES = ["Access", "Storage", "Setup", "Installation", "Processing", "Usage", "Support", "Service", "Maintenance"];
// Recognition fractions - weighted toward fully recognised (like the reference) with
// a spread of partials so the green bars and Deferred column vary.
const RECOGNIZED_FRACS = [1, 1, 1, 0.94, 0.87, 0.78, 0.66, 0.55, 0.42];

function generateCompanies(): Node[] {
  const rand = mulberry32(0x5eed21);
  const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];

  const companies: Node[] = [];
  for (let ci = 0; ci < COMPANIES.length; ci++) {
    // Gently descending magnitude by company so the default Total Amount desc sort
    // leads with Dharma Initiative (first generated), matching the reference.
    const scale = 1 - ci * 0.07;
    const contracts: Node[] = [];
    const contractCount = 3 + Math.floor(rand() * 3); // 3-5 contracts
    for (let k = 0; k < contractCount; k++) {
      const contractId = `I-${100 + Math.floor(rand() * 900)}`;

      const leaves: Node[] = [];
      const leafCount = 3 + Math.floor(rand() * 4); // 3-6 line items
      const used = new Set<string>();
      for (let li = 0; li < leafCount; li++) {
        let name = `${pick(SIZES)} - ${pick(CATEGORIES)}`;
        let guard = 0;
        while (used.has(name) && guard++ < 20) name = `${pick(SIZES)} - ${pick(CATEGORIES)}`;
        used.add(name);

        const total = round2((300 + rand() * 8700) * scale);
        const frac = pick(RECOGNIZED_FRACS);
        const recognized = round2(total * frac);
        const deferred = round2(total - recognized);
        // Each month recognises a slice of the contract; the deferred balance carried
        // that month is a fraction of the slice.
        const months: MonthCell[] = MONTHS.map(() => {
          const revenue = round2(total * (0.04 + rand() * 0.04));
          const balance = round2(revenue * (0.08 + rand() * 0.08));
          return { balance, revenue };
        });

        leaves.push({
          id: `${ci}-${k}-${li}`,
          name,
          depth: 2,
          kind: "leaf",
          measures: { total, deferred, recognized, months },
        });
      }

      contracts.push({
        id: `${ci}-${k}`,
        name: contractId,
        depth: 1,
        kind: "group",
        children: leaves,
        measures: sumMeasures(leaves),
      });
    }

    companies.push({
      id: `${ci}`,
      name: COMPANIES[ci],
      depth: 0,
      kind: "group",
      children: contracts,
      measures: sumMeasures(contracts),
    });
  }
  return companies;
}

function sumMeasures(nodes: Node[]): Measures {
  const months: MonthCell[] = MONTHS.map(() => ({ balance: 0, revenue: 0 }));
  const acc: Measures = { total: 0, deferred: 0, recognized: 0, months };
  for (const n of nodes) {
    acc.total += n.measures.total;
    acc.deferred += n.measures.deferred;
    acc.recognized += n.measures.recognized;
    n.measures.months.forEach((m, i) => {
      months[i].balance += m.balance;
      months[i].revenue += m.revenue;
    });
  }
  acc.total = round2(acc.total);
  acc.deferred = round2(acc.deferred);
  acc.recognized = round2(acc.recognized);
  for (const m of months) {
    m.balance = round2(m.balance);
    m.revenue = round2(m.revenue);
  }
  return acc;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
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
