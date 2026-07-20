import Grid, { FlattenedDataViewModel, Selection } from "@superplot/grid/renderer";
import type { FacetCellRenderer, ValueFormatter } from "@superplot/grid/renderer";
import { createGridMount } from "../../runtime/mount";
import { syncGridTheme } from "../../runtime/theme";
import type { SampleContext, SampleRow, SampleValue } from "../../types";

// The group banner whose columns are reformatted, and which hosts the switcher.
const PAY_GROUP = "Pay";

const COLUMNS: { field: string; label: string; group: string }[] = [
  { field: "agency_name", label: "Agency", group: "Employee" },
  { field: "title_description", label: "Title", group: "Employee" },
  { field: "base_salary", label: "Base Salary", group: PAY_GROUP },
  { field: "regular_gross_paid", label: "Regular Gross", group: PAY_GROUP },
  { field: "total_ot_paid", label: "Overtime", group: PAY_GROUP },
];

const GRID_HEIGHT = 420;
const COL_FR = [2, 2, 1, 1, 1];

// The locales the header dropdown switches between. Each builds a currency
// formatter; the choice drives the selection override applied on the next draw.
const LOCALES = [
  { id: "en-US", label: "USD", currency: "USD" },
  { id: "de-DE", label: "EUR", currency: "EUR" },
  { id: "ja-JP", label: "JPY", currency: "JPY" },
  { id: "en-IN", label: "INR", currency: "INR" },
];

export function mount(el: HTMLElement, ctx: SampleContext): () => void {
  const gridMount = createGridMount(el, GRID_HEIGHT);
  const grid = new Grid({}, gridMount, "flat");
  const disposeTheme = syncGridTheme(grid);
  let disposed = false;
  let localeId = LOCALES[0].id;
  el.append(gridMount);

  // Re-target the Pay columns' data cells with the chosen locale's formatter.
  // `selectAll` matches the Pay group header, `selectAllCell` extends onto its
  // data cells, and `prop` overrides their formatter. It is just a rule the
  // renderer reads on the next draw, so switching locales swaps one rule and
  // redraws - the viewmodel is never rebuilt.
  let active: Selection | null = null;
  const applyLocale = (): void => {
    active?.undo();
    active = grid.selectAll((_dim, value) => value === PAY_GROUP);
    active.selectAllCell(() => true).prop({ valueFormatter: localeFormatter(localeId) });
    grid.draw();
  };

  // Only the Pay banner gets the dropdown; every other group facet renders plain.
  const payHeader: FacetCellRenderer = (label) => {
    if (label !== PAY_GROUP) return label;
    const select = localeSelect(localeId, (next) => {
      localeId = next;
      applyLocale();
    });
    return { content: label, right: select };
  };

  ctx.loadDataset("payroll").then((rows: SampleRow[]) => {
    if (disposed) return;
    grid.data = new FlattenedDataViewModel({
      data: COLUMNS.map((column) => rows.map((row) => row[column.field] ?? null)),
      columnFacets: [COLUMNS.map((column) => column.group), COLUMNS.map((column) => column.label)],
      totalRows: rows.length,
      options: {
        vTrackDefs: COLUMNS.map((_, i) => ({ colSize: { strategy: "static", width: COL_FR[i], unit: "fr" } })),
        facetDefs: {
          row: [],
          col: [{ text: "", trackRenderer: payHeader }, { text: "" }],
          axis: "col",
        },
      },
    });
    grid.draw();
    // Format with the initial locale on first render.
    applyLocale();
  });

  return () => {
    disposed = true;
    disposeTheme();
    active?.undo();
    el.removeChild(gridMount);
  };
}

/* ===================================== utils ===================================== */

// A currency formatter for the given locale. Only the Pay columns' numeric data
// cells receive it, so nulls fall back to an empty cell.
function localeFormatter(localeId: string): ValueFormatter<SampleValue> {
  const locale = LOCALES.find((l) => l.id === localeId)!;
  const fmt = new Intl.NumberFormat(locale.id, {
    style: "currency",
    currency: locale.currency,
    maximumFractionDigits: 0,
  });
  return (value) => (typeof value === "number" ? fmt.format(value) : "");
}

// The mini locale dropdown drawn into the Pay banner's right slot. `mousedown`
// is stopped so clicking it drives the select rather than any header behaviour.
function localeSelect(current: string, onChange: (next: string) => void): HTMLSelectElement {
  const select = document.createElement("select");
  select.style.cssText =
    "font:inherit;font-size:11px;line-height:1;height:20px;padding:0 4px;cursor:pointer;" +
    "color:inherit;background:transparent;border-radius:5px;" +
    "border:1px solid color-mix(in srgb, currentColor 30%, transparent);";
  for (const locale of LOCALES) {
    const option = document.createElement("option");
    option.value = locale.id;
    option.textContent = locale.label;
    select.appendChild(option);
  }
  select.value = current;
  select.addEventListener("mousedown", (event) => event.stopPropagation());
  select.addEventListener("change", () => onChange(select.value));
  return select;
}
